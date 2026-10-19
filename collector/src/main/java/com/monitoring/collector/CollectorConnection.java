package com.monitoring.collector;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.neovisionaries.ws.client.WebSocket;
import com.neovisionaries.ws.client.WebSocketAdapter;
import com.neovisionaries.ws.client.WebSocketFactory;
import com.neovisionaries.ws.client.WebSocketFrame;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

// 시작 API 요청당 연결 1회만 시도하고 단절 시 수집·전송 중단
public final class CollectorConnection {
    public static final String CONTEXT_KEY = CollectorConnection.class.getName();
    private final MonitorRuntime runtime;
    private final LogReader logs;
    private final String url;
    private final Gson json = new GsonBuilder().serializeNulls().create();
    private final ArrayBlockingQueue<Map<String, Object>> xlogs =
            new ArrayBlockingQueue<Map<String, Object>>(500);
    private final Map<String, Object> replies =
            Collections.synchronizedMap(
                    new LinkedHashMap<String, Object>() {
                        protected boolean removeEldestEntry(Map.Entry<String, Object> entry) {
                            return size() > 128;
                        }
                    });
    private final AtomicLong dropped = new AtomicLong();
    private volatile String state = "IDLE";
    private volatile boolean xlogEnabled;
    private volatile WebSocket socket;
    private volatile ScheduledExecutorService timer;
    private volatile ThreadPoolExecutor commands;
    private boolean destroyed;
    private long connectedAt;
    private volatile long lastReceived;
    private volatile long lastWritten;
    private volatile int intervalSeconds = 60;
    private volatile long xlogGeneration;
    private long nextSnapshot;
    private long nextPing;

    public CollectorConnection(MonitorRuntime runtime, LogReader logs, String url) {
        this.runtime = runtime;
        this.logs = logs;
        this.url = url;
    }

    public synchronized Map<String, Object> start(final String ticket) {
        if (destroyed || url.length() == 0) {
            throw new IllegalStateException("TRANSPORT_NOT_CONFIGURED");
        }
        if ("CONNECTING".equals(state) || "CONNECTED".equals(state)) {
            return status();
        }
        if (ticket == null || !ticket.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("INVALID_CONNECTION_TICKET");
        }
        replies.clear();
        state = "CONNECTING";
        xlogEnabled = false;
        xlogs.clear();
        timer = Executors.newScheduledThreadPool(2, threads());
        commands =
                new ThreadPoolExecutor(
                        1,
                        1,
                        0L,
                        TimeUnit.MILLISECONDS,
                        new ArrayBlockingQueue<Runnable>(16),
                        threads(),
                        new ThreadPoolExecutor.AbortPolicy());
        final ScheduledExecutorService attemptTimer = timer;
        attemptTimer.schedule(
                new Runnable() {
                    public void run() {
                        synchronized (CollectorConnection.this) {
                            if (timer == attemptTimer) {
                                terminate("FAILED");
                            }
                        }
                    }
                },
                10,
                TimeUnit.SECONDS);
        commands.execute(
                new Runnable() {
                    public void run() {
                        connect(ticket, attemptTimer);
                    }
                });
        return status();
    }

    private void connect(String ticket, final ScheduledExecutorService attemptTimer) {
        try {
            WebSocketFactory factory =
                    new WebSocketFactory().setConnectionTimeout(3000).setSocketTimeout(5000);
            if (url.startsWith("wss://")) {
                // Java 7에서도 TLS 1.2를 사용하고 기본 인증서 신뢰 검증 유지
                javax.net.ssl.SSLContext tls = javax.net.ssl.SSLContext.getInstance("TLSv1.2");
                tls.init(null, null, null);
                factory.setSSLContext(tls);
            }
            final WebSocket candidate =
                    factory.createSocket(url)
                            .setFrameQueueSize(8)
                            .addHeader("X-Monitor-Token", runtime.authenticationToken())
                            .addHeader("X-Monitor-Ticket", ticket);
            synchronized (this) {
                if (timer != attemptTimer || !"CONNECTING".equals(state)) {
                    if (candidate.getSocket() != null) {
                        candidate.getSocket().close();
                    }
                    return;
                }
                socket = candidate;
            }
            candidate.addListener(
                    new WebSocketAdapter() {
                        public void onConnected(WebSocket ws, Map<String, List<String>> headers) {
                            synchronized (CollectorConnection.this) {
                                if (socket == ws && timer == attemptTimer) {
                                    state = "CONNECTED";
                                    connectedAt = System.currentTimeMillis();
                                    lastReceived = connectedAt;
                                    lastWritten = connectedAt;
                                }
                            }
                        }

                        public void onTextMessage(final WebSocket ws, final String text) {
                            if (socket != ws) {
                                return;
                            }
                            lastReceived = System.currentTimeMillis();
                            if (text.length() > 16 * 1024) {
                                terminate("CLOSED");
                                return;
                            }
                            try {
                                commands.execute(
                                        new Runnable() {
                                            public void run() {
                                                if (socket == ws) {
                                                    command(text, ws);
                                                }
                                            }
                                        });
                            } catch (RuntimeException full) {
                                terminate("CLOSED");
                            }
                        }

                        public void onPongFrame(WebSocket ws, WebSocketFrame frame) {
                            lastReceived = System.currentTimeMillis();
                        }

                        public void onDisconnected(
                                WebSocket ws,
                                WebSocketFrame server,
                                WebSocketFrame client,
                                boolean byServer) {
                            if (socket == ws) {
                                terminate("CLOSED");
                            }
                        }

                        public void onFrameSent(WebSocket ws, WebSocketFrame frame) {
                            lastWritten = System.currentTimeMillis();
                        }
                    });
            candidate.connect();
            synchronized (this) {
                if (timer != attemptTimer
                        || !("CONNECTED".equals(state) || "CONNECTING".equals(state))) {
                    candidate.getSocket().close();
                    return;
                }
                candidate.getSocket().setSoTimeout(65000);
                connectedAt = System.currentTimeMillis();
                lastReceived = connectedAt;
                lastWritten = connectedAt;
                state = "CONNECTED";
                nextSnapshot = 0;
            }
            // 첫 10초 제한은 연결된 상태에서는 종료하지 않도록 별도 작업으로 대체
            attemptTimer.scheduleAtFixedRate(
                    new Runnable() {
                        public void run() {
                            if (timer == attemptTimer && "CONNECTED".equals(state)) {
                                if (System.currentTimeMillis() - lastReceived > 65000
                                        || System.currentTimeMillis() - lastWritten > 65000) {
                                    terminate("CLOSED");
                                }
                            }
                        }
                    },
                    30,
                    10,
                    TimeUnit.SECONDS);
            attemptTimer.scheduleWithFixedDelay(
                    new Runnable() {
                        public void run() {
                            if (timer == attemptTimer) {
                                publish(candidate);
                            }
                        }
                    },
                    0,
                    1,
                    TimeUnit.SECONDS);
        } catch (Exception failed) {
            if (timer == attemptTimer) {
                terminate("CONNECTING".equals(state) ? "FAILED" : "CLOSED");
            }
        }
    }

    private void command(String text, WebSocket expected) {
        String id = "";
        try {
            JsonObject request = new JsonParser().parse(text).getAsJsonObject();
            id = request.get("id").getAsString();
            if (!id.matches("[a-f0-9-]{36}")) {
                throw new IllegalArgumentException("INVALID_COMMAND_ID");
            }
            if (replies.containsKey(id)) {
                reply(id, replies.get(id), expected);
                return;
            }
            String endpoint = request.get("endpoint").getAsString();
            JsonObject body =
                    request.has("body") && request.get("body").isJsonObject()
                            ? request.getAsJsonObject("body")
                            : new JsonObject();
            Object result;
            if ("configure".equals(endpoint)) {
                synchronized (this) {
                    if (socket != expected) {
                        return;
                    }
                    xlogEnabled = body.get("xlog_enabled").getAsBoolean();
                    xlogGeneration++;
                    intervalSeconds =
                            Math.max(
                                    5,
                                    Math.min(715827882, body.get("interval_seconds").getAsInt()));
                    if (!xlogEnabled) {
                        xlogs.clear();
                    }
                }
                result = status();
            } else if ("info".equals(endpoint)) {
                result = runtime.info();
            } else if ("snapshot".equals(endpoint)) {
                result = runtime.snapshot();
            } else if ("checks/run".equals(endpoint)) {
                List<String> ids = new ArrayList<String>();
                for (com.google.gson.JsonElement item : body.getAsJsonArray("check_ids")) {
                    ids.add(item.getAsString());
                }
                if (ids.isEmpty() || ids.size() > 20) {
                    throw new IllegalArgumentException("INVALID_REQUEST");
                }
                result = runtime.startChecks(ids);
            } else if ("checks/results".equals(endpoint)) {
                result = runtime.results(body.get("job_id").getAsString(), null);
            } else if ("logs/read".equals(endpoint)) {
                Map<String, Object> log =
                        logs.read(
                                body.get("path").getAsString(),
                                body.get("encoding").getAsString(),
                                body.has("cursor") && !body.get("cursor").isJsonNull()
                                        ? body.get("cursor").getAsString()
                                        : null);
                log.put("identity", runtime.info().get("identity"));
                result = log;
            } else {
                throw new IllegalArgumentException("UNKNOWN_COMMAND");
            }
            replies.put(id, result);
            reply(id, result, expected);
        } catch (Exception invalid) {
            String code = "COMMAND_FAILED";
            if (invalid instanceof java.io.IOException) {
                String message = invalid.getMessage();
                code =
                        message != null && message.matches("[A-Z_]{3,40}")
                                ? message
                                : "LOG_FILE_UNAVAILABLE";
            }
            reply(id, Collections.singletonMap("code", code), expected);
        }
    }

    private void publish(WebSocket expected) {
        if (socket != expected || !"CONNECTED".equals(state)) {
            return;
        }
        try {
            long now = System.currentTimeMillis();
            if (now >= nextSnapshot) {
                nextSnapshot = now + intervalSeconds * 1000L;
                Map<String, Object> snapshot = new LinkedHashMap<String, Object>();
                snapshot.put("type", "snapshot");
                snapshot.put("info", runtime.info());
                snapshot.put("snapshot", runtime.snapshot());
                send(snapshot, expected);
            }
            if (xlogEnabled) {
                List<Map<String, Object>> batch = new ArrayList<Map<String, Object>>();
                xlogs.drainTo(batch, 50);
                if (!batch.isEmpty() || dropped.get() > 0) {
                    Map<String, Object> message = new LinkedHashMap<String, Object>();
                    message.put("type", "xlog");
                    message.put("items", batch);
                    message.put("dropped", Long.valueOf(dropped.getAndSet(0)));
                    send(message, expected);
                }
            }
            if (now >= nextPing) {
                nextPing = now + 30000L;
                send(Collections.singletonMap("type", "heartbeat"), expected);
                expected.sendPing();
            }
        } catch (RuntimeException failure) {
            terminate("CLOSED");
        }
    }

    private void reply(String id, Object body, WebSocket expected) {
        Map<String, Object> response = new LinkedHashMap<String, Object>();
        response.put("type", "result");
        response.put("id", id);
        response.put("body", body);
        send(response, expected);
    }

    private void send(Object body, WebSocket expected) {
        WebSocket current = socket;
        if (current == expected && current != null && "CONNECTED".equals(state)) {
            String text = json.toJson(body);
            if (text.length() > 1024 * 1024) {
                terminate("CLOSED");
                return;
            }
            current.sendText(text);
        }
    }

    public boolean isXlogEnabled() {
        return xlogEnabled && "CONNECTED".equals(state);
    }

    public long xlogGeneration() {
        return xlogGeneration;
    }

    // 업무 요청에서는 전송을 기다리지 않고 상한 초과 기록 폐기
    public synchronized void record(long generation, Map<String, Object> record) {
        if (generation == xlogGeneration && isXlogEnabled() && !xlogs.offer(record)) {
            dropped.incrementAndGet();
        }
    }

    public synchronized Map<String, Object> status() {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("state", state);
        result.put("xlog_enabled", Boolean.valueOf(isXlogEnabled()));
        result.put("queue_size", Integer.valueOf(xlogs.size()));
        result.put("connected_at", Long.valueOf(connectedAt));
        return result;
    }

    public synchronized void stop() {
        terminate("CLOSED");
    }

    public synchronized void destroy() {
        destroyed = true;
        terminate("CLOSED");
    }

    private synchronized void terminate(String finalState) {
        if ("FAILED".equals(finalState) && !"CONNECTING".equals(state)) {
            return;
        }
        state = finalState;
        xlogEnabled = false;
        xlogGeneration++;
        xlogs.clear();
        WebSocket previous = socket;
        socket = null;
        if (previous != null) {
            try {
                if (previous.getSocket() != null) {
                    previous.getSocket().close();
                }
            } catch (java.io.IOException ignored) {
                // 연결 종료 실패 시에도 재접속 없이 실행 자원 정리
            }
        }
        if (timer != null) {
            timer.shutdownNow();
            timer = null;
        }
        if (commands != null) {
            commands.shutdownNow();
        }
    }

    private static ThreadFactory threads() {
        return new ThreadFactory() {
            public Thread newThread(Runnable task) {
                Thread thread = new Thread(task, "monitor-collector-wss");
                thread.setDaemon(true);
                return thread;
            }
        };
    }
}
