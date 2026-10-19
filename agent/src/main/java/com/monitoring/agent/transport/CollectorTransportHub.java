package com.monitoring.agent.transport;

import com.monitoring.agent.collection.CollectorClient;
import com.monitoring.agent.collection.CollectorPayloadValidator;
import com.monitoring.agent.collection.SnapshotPersistence;
import com.monitoring.agent.collection.SsrfGuard;
import com.monitoring.agent.security.TokenCipher;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// 일회용 시작 승인으로 Collector 연결 인증 및 제한된 수신·명령 처리
@Component
public final class CollectorTransportHub extends TextWebSocketHandler
        implements HandshakeInterceptor, DisposableBean {
    private final JdbcTemplate db;
    private final TokenCipher cipher;
    private final ObjectMapper json;
    private final SnapshotPersistence snapshots;
    private final CollectorClient http;
    private final Map<String, Permit> permits = new ConcurrentHashMap<>();
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();
    private final Map<String, String> states = new ConcurrentHashMap<>();
    private final Map<String, String> reasons = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor writes =
            new ThreadPoolExecutor(
                    2,
                    2,
                    0L,
                    TimeUnit.MILLISECONDS,
                    new ArrayBlockingQueue<>(100),
                    new ThreadPoolExecutor.AbortPolicy());

    public CollectorTransportHub(
            JdbcTemplate db,
            TokenCipher cipher,
            ObjectMapper json,
            SnapshotPersistence snapshots,
            @Value("${hermes.agent-allowed-cidrs:}") String cidrs,
            @Value("${hermes.agent-allowed-hosts:}") String hosts,
            @Value("${hermes.agent-allowlist-file:}") String allowlist) {
        this.db = db;
        this.cipher = cipher;
        this.json = json;
        this.snapshots = snapshots;
        http = new CollectorClient(new SsrfGuard(cidrs, hosts, allowlist));
    }

    public synchronized Map<String, Object> start(String project, String instance)
            throws Exception {
        Map<String, Object> config = config(project, instance);
        if (!"WSS".equals(config.get("transport_mode"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "WSS_MODE_REQUIRED");
        }
        String key = key(project, instance);
        Connection current = connections.get(key);
        if (current != null && current.session.isOpen()) {
            return Map.of("state", "CONNECTED");
        }
        if (permits.values().stream()
                .anyMatch(p -> p.key.equals(key) && p.expires > System.currentTimeMillis())) {
            return Map.of("state", "CONNECTING");
        }
        if (connections.size() + permits.size() >= 64) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "CONNECTION_LIMIT");
        }
        String token =
                cipher.decrypt(
                        (byte[]) config.get("token_ciphertext"), (byte[]) config.get("token_iv"));
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String ticket = HexFormat.of().formatHex(bytes);
        permits.put(ticket, new Permit(key, token, System.currentTimeMillis() + 30000));
        states.put(key, "CONNECTING");
        reasons.remove(key);
        try {
            http.startConnection(
                    config.get("agent_base_url").toString(),
                    token,
                    json.writeValueAsString(Map.of("ticket", ticket)));
        } catch (Exception failed) {
            permits.remove(ticket);
            states.put(key, "FAILED");
            reasons.put(key, com.monitoring.agent.collection.ConnectionErrorCode.classify(failed));
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "COLLECTOR_START_FAILED");
        }
        return Map.of("state", "CONNECTING");
    }

    public void stop(String project, String instance) {
        String key = key(project, instance);
        permits.entrySet().removeIf(entry -> entry.getValue().key.equals(key));
        Connection current = connections.remove(key);
        states.put(key, "CLOSED");
        reasons.put(key, "MANUAL_STOP");
        if (current != null) {
            close(current, CloseStatus.NORMAL);
        }
    }

    public Map<String, Object> status(String project, String instance) {
        Map<String, Object> config = config(project, instance);
        String key = key(project, instance);
        Connection connection = connections.get(key);
        boolean pending =
                permits.values().stream()
                        .anyMatch(p -> p.key.equals(key) && p.expires > System.currentTimeMillis());
        return Map.of(
                "mode",
                config.get("transport_mode"),
                "state",
                connection != null && connection.session.isOpen()
                        ? "CONNECTED"
                        : pending ? "CONNECTING" : states.getOrDefault(key, "IDLE"),
                "xlog_enabled",
                config.get("xlog_enabled"),
                "dropped",
                connection == null ? 0L : connection.dropped,
                "last_received_at",
                connection == null ? "" : Instant.ofEpochMilli(connection.lastReceived).toString(),
                "reason",
                reasons.getOrDefault(key, ""));
    }

    public boolean isConnected(String project, String instance) {
        Connection connection = connections.get(key(project, instance));
        return connection != null && connection.session.isOpen();
    }

    public boolean usesWebsocket(String base) {
        return Boolean.TRUE.equals(
                db.queryForObject(
                        """
                select exists(
                    select 1
                    from instances
                    where agent_base_url = ?
                        and transport_mode = 'WSS'
                )
                """,
                        Boolean.class,
                        base));
    }

    public byte[] request(String base, String endpoint, String query, byte[] body)
            throws Exception {
        var instances =
                db.queryForList(
                        """
                select
                    project_id
                    ,instance_id
                from instances
                where agent_base_url = ?
                    and transport_mode = 'WSS'
                    and enabled
                """,
                        base);
        if (instances.size() != 1) {
            throw new IllegalStateException("TRANSPORT_INSTANCE_AMBIGUOUS");
        }
        var instance = instances.getFirst();
        JsonNode payload = body == null ? json.readTree("{}") : json.readTree(body);
        if (query != null && endpoint.equals("checks/results")) {
            payload =
                    json.valueToTree(
                            Map.of(
                                    "job_id",
                                    java.net.URLDecoder.decode(
                                            query.substring(query.indexOf('=') + 1),
                                            StandardCharsets.UTF_8)));
        }
        String key =
                key(instance.get("project_id").toString(), instance.get("instance_id").toString());
        JsonNode result = rpc(key, endpoint, payload);
        if ("logs/read".equals(endpoint)
                && result.has("text")
                && !result.path("text").asString().isEmpty()) {
            JsonNode saved = result;
            writes.execute(() -> store(key, "LOG", saved));
        }
        return json.writeValueAsBytes(result);
    }

    public void configure(String project, String instance) throws Exception {
        Map<String, Object> config = config(project, instance);
        if (connections.containsKey(key(project, instance))) {
            rpc(
                    key(project, instance),
                    "configure",
                    json.valueToTree(
                            Map.of(
                                    "xlog_enabled", config.get("xlog_enabled"),
                                    "interval_seconds", config.get("poll_interval_seconds"))));
        }
    }

    private JsonNode rpc(String key, String endpoint, JsonNode payload) throws Exception {
        Connection current = connections.get(key);
        if (current == null || !current.session.isOpen()) {
            throw new IllegalStateException("COLLECTOR_DISCONNECTED");
        }
        String id = UUID.randomUUID().toString();
        CompletableFuture<JsonNode> answer = new CompletableFuture<>();
        synchronized (current.pending) {
            if (current.pending.size() >= 16) {
                throw new IllegalStateException("COLLECTOR_BUSY");
            }
            current.pending.put(id, answer);
        }
        try {
            current.session.sendMessage(
                    new TextMessage(
                            json.writeValueAsString(
                                    Map.of("id", id, "endpoint", endpoint, "body", payload))));
        } catch (Exception failed) {
            current.pending.remove(id);
            throw failed;
        }
        return await(current, id, answer);
    }

    private JsonNode await(Connection current, String id, CompletableFuture<JsonNode> answer)
            throws Exception {
        try {
            return answer.get(5, TimeUnit.SECONDS);
        } finally {
            current.pending.remove(id);
        }
    }

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler handler,
            Map<String, Object> attributes) {
        String ticket = request.getHeaders().getFirst("X-Monitor-Ticket");
        String supplied = request.getHeaders().getFirst("X-Monitor-Token");
        Permit permit = ticket == null ? null : permits.remove(ticket);
        boolean valid =
                permit != null
                        && permit.expires > System.currentTimeMillis()
                        && supplied != null
                        && MessageDigest.isEqual(
                                permit.token.getBytes(StandardCharsets.UTF_8),
                                supplied.getBytes(StandardCharsets.UTF_8));
        if (!valid) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        String[] parts = permit.key.split("/", 2);
        try {
            if (!"WSS".equals(config(parts[0], parts[1]).get("transport_mode"))) {
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
        } catch (ResponseStatusException unavailable) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        attributes.put("instance", permit.key);
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler handler,
            Exception exception) {}

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String key = session.getAttributes().get("instance").toString();
        session.setTextMessageSizeLimit(1024 * 1024);
        Connection current =
                new Connection(new ConcurrentWebSocketSessionDecorator(session, 5000, 1024 * 1024));
        if (connections.size() >= 64) {
            states.put(key, "FAILED");
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        if (connections.putIfAbsent(key, current) != null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        states.put(key, "CONNECTED");
        reasons.remove(key);
        try {
            writes.execute(
                    () -> {
                        try {
                            String[] parts = key.split("/", 2);
                            configure(parts[0], parts[1]);
                        } catch (Exception failure) {
                            close(current, CloseStatus.SERVER_ERROR);
                        }
                    });
        } catch (RuntimeException full) {
            close(current, CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message)
            throws Exception {
        String key = session.getAttributes().get("instance").toString();
        Connection current = connections.get(key);
        if (current == null || !current.session.getId().equals(session.getId())) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        current.lastReceived = System.currentTimeMillis();
        JsonNode value = json.readTree(message.getPayload());
        String type = value.path("type").asString();
        if ("heartbeat".equals(type)) {
            return;
        }
        if ("result".equals(type)) {
            CompletableFuture<JsonNode> answer =
                    current.pending.remove(value.path("id").asString());
            if (answer != null) {
                answer.complete(value.path("body"));
            }
            return;
        }
        try {
            writes.execute(
                    () -> {
                        try {
                            String[] parts = key.split("/", 2);
                            Map<String, Object> config = config(parts[0], parts[1]);
                            if ("snapshot".equals(type)) {
                                CollectorPayloadValidator validator =
                                        new CollectorPayloadValidator();
                                validator.validateInfo(
                                        json.writeValueAsBytes(value.path("info")),
                                        parts[0],
                                        parts[1]);
                                validator.validateSnapshot(
                                        json.writeValueAsBytes(value.path("snapshot")),
                                        parts[0],
                                        parts[1]);
                                snapshots.save(
                                        parts[0],
                                        parts[1],
                                        value.path("info"),
                                        value.path("snapshot"),
                                        Instant.now());
                            } else if ("xlog".equals(type)) {
                                if (!Boolean.TRUE.equals(config.get("xlog_enabled"))) {
                                    return;
                                }
                                JsonNode items = value.path("items");
                                if (!items.isArray() || items.size() > 50) {
                                    throw new IllegalArgumentException("INVALID_XLOG_BATCH");
                                }
                                current.dropped += Math.max(0, value.path("dropped").asLong());
                                for (JsonNode item : items) {
                                    if (item.path("path").asString().length() > 512
                                            || !item.path("path").asString().startsWith("/")
                                            || !item.path("method")
                                                    .asString()
                                                    .matches("[A-Z]{1,16}")
                                            || !item.path("status").isIntegralNumber()
                                            || !item.path("duration_ms").isIntegralNumber()
                                            || !item.path("started_at").isIntegralNumber()
                                            || item.path("status").asInt() < 100
                                            || item.path("status").asInt() > 599
                                            || item.path("duration_ms").asLong() < 0) {
                                        throw new IllegalArgumentException("INVALID_XLOG");
                                    }
                                    if (item.path("started_at").asLong() <= 0) {
                                        throw new IllegalArgumentException("INVALID_XLOG_TIME");
                                    }
                                    store(
                                            key,
                                            "XLOG",
                                            json.valueToTree(
                                                    Map.of(
                                                            "started_at",
                                                                    item.path("started_at")
                                                                            .asLong(),
                                                            "path", item.path("path").asString(),
                                                            "method",
                                                                    item.path("method").asString(),
                                                            "status", item.path("status").asInt(),
                                                            "duration_ms",
                                                                    item.path("duration_ms")
                                                                            .asLong())));
                                }
                            } else {
                                throw new IllegalArgumentException("UNKNOWN_MESSAGE");
                            }
                        } catch (Exception invalid) {
                            close(current, CloseStatus.SERVER_ERROR);
                        }
                    });
        } catch (RuntimeException full) {
            close(current, CloseStatus.SERVER_ERROR);
        }
    }

    private void store(String key, String kind, JsonNode value) {
        String[] parts = key.split("/", 2);
        db.update(
                """
                insert into collector_events(
                    project_id
                    ,instance_id
                    ,kind
                    ,payload
                )
                values(?, ?, ?, ?::jsonb)
                """,
                parts[0],
                parts[1],
                kind,
                json.writeValueAsString(value));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String key = session.getAttributes().get("instance").toString();
        Connection current = connections.get(key);
        if (current != null && current.session.getId().equals(session.getId())) {
            connections.remove(key, current);
            states.put(key, "CLOSED");
            reasons.putIfAbsent(key, "CONNECTION_CLOSED");
            current.pending
                    .values()
                    .forEach(
                            f ->
                                    f.completeExceptionally(
                                            new IllegalStateException("COLLECTOR_DISCONNECTED")));
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception)
            throws Exception {
        session.close(CloseStatus.SERVER_ERROR);
    }

    @Scheduled(fixedDelay = 30000)
    public void cleanup() {
        permits.entrySet()
                .removeIf(
                        entry -> {
                            if (entry.getValue().expires < System.currentTimeMillis()) {
                                if (!connections.containsKey(entry.getValue().key)) {
                                    states.put(entry.getValue().key, "FAILED");
                                    reasons.put(entry.getValue().key, "NO_CONNECTION_RECEIVED");
                                }
                                return true;
                            }
                            return false;
                        });
        var registered =
                db.queryForList(
                        """
                select i.project_id || '/' || i.instance_id
                from instances i
                join projects p using(project_id)
                where i.enabled
                    and p.enabled
                    and i.transport_mode = 'WSS'
                """,
                        String.class);
        states.keySet().retainAll(registered);
        reasons.keySet().retainAll(registered);
        connections.forEach(
                (key, current) -> {
                    if (!registered.contains(key)
                            || System.currentTimeMillis() - current.lastReceived > 75000) {
                        close(current, CloseStatus.SESSION_NOT_RELIABLE);
                    }
                });
        db.update(
                """
                delete from collector_events
                where received_at < now() - interval '1 day'
                """);
        db.update(
                """
                delete from collector_events where id in (
                    select id from (
                        select id, kind, row_number() over (
                            partition by project_id, instance_id, kind order by id desc
                        ) as position
                        from collector_events
                    ) ranked
                    where position > case when kind = 'XLOG' then 5000 else 100 end
                )
                """);
    }

    private Map<String, Object> config(String project, String instance) {
        var rows =
                db.queryForList(
                        """
                select
                    i.*
                    ,p.xlog_enabled
                from instances i
                join projects p using(project_id)
                where i.project_id = ?
                    and i.instance_id = ?
                    and i.enabled
                    and p.enabled
                """,
                        project,
                        instance);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "INSTANCE_NOT_FOUND");
        }
        return rows.getFirst();
    }

    private static String key(String project, String instance) {
        return project + "/" + instance;
    }

    private void close(Connection connection, CloseStatus status) {
        try {
            connection.session.close(status);
        } catch (Exception ignored) {
            // 종료 실패와 관계없이 대기 명령 해제
        }
        connection
                .pending
                .values()
                .forEach(
                        f ->
                                f.completeExceptionally(
                                        new IllegalStateException("COLLECTOR_DISCONNECTED")));
    }

    public void destroy() {
        connections.values().forEach(connection -> close(connection, CloseStatus.GOING_AWAY));
        permits.clear();
        writes.shutdownNow();
    }

    private record Permit(String key, String token, long expires) {}

    private static final class Connection {
        final WebSocketSession session;
        final Map<String, CompletableFuture<JsonNode>> pending = new ConcurrentHashMap<>();
        volatile long lastReceived = System.currentTimeMillis();
        volatile long dropped;

        Connection(WebSocketSession session) {
            this.session = session;
        }
    }
}
