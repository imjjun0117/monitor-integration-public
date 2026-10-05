package com.hermes.monitoring.center.log;

import com.hermes.monitoring.center.collection.AgentClient;
import com.hermes.monitoring.center.collection.ConnectionErrorCode;
import com.hermes.monitoring.center.collection.SsrfGuard;
import com.hermes.monitoring.center.security.TokenCipher;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

// 조회 주기에 따라 로그를 읽고 여러 사용자가 임시 결과 공유
@Service
public final class LogService {
    private final AgentClient client;
    private final ObjectMapper json;
    private final TokenCipher cipher;
    private final Semaphore slots = new Semaphore(4);
    private final Map<Long, Stream> streams = new LinkedHashMap<>();

    @Autowired
    LogService(
            TokenCipher cipher,
            ObjectMapper json,
            @Value("${hermes.agent-allowed-cidrs:}") String cidrs,
            @Value("${hermes.agent-allowed-hosts:}") String hosts,
            @Value("${hermes.agent-allowlist-file:}") String allowlistFile) {
        this(cipher, json, new AgentClient(new SsrfGuard(cidrs, hosts, allowlistFile)));
    }

    LogService(TokenCipher cipher, ObjectMapper json, AgentClient client) {
        this.cipher = cipher;
        this.json = json;
        this.client = client;
    }

    // 조회가 중단된 임시 로그 버퍼 정리
    @Scheduled(fixedDelay = 60_000)
    void discardIdleViews() {
        long now = System.currentTimeMillis();
        synchronized (streams) {
            streams.entrySet()
                    .removeIf(
                            e ->
                                    now - e.getValue().lastAccess > 300_000
                                            && !e.getValue().lock.isLocked());
        }
    }

    // 사용 여부 확인 후 조회 결과 공유 및 파일 읽기 횟수 제한
    LogBuffer.View read(Map<String, Object> config, String cursor) {
        long id = ((Number) config.get("log_id")).longValue();
        if (!Boolean.TRUE.equals(config.get("enabled"))
                || !Boolean.TRUE.equals(config.get("instance_enabled"))
                || !Boolean.TRUE.equals(config.get("project_enabled"))) {
            synchronized (streams) {
                streams.remove(id);
            }
            return new LogBuffer.View("", "", false, false, "LOG_DISABLED", 0);
        }
        int interval = ((Number) config.get("poll_interval_seconds")).intValue();
        long now = System.currentTimeMillis();
        // 인증 정보·URL·경로·인코딩·주기 변경 시 기존 공유 결과 초기화
        String signature =
                config.get("path")
                        + "\n"
                        + config.get("encoding")
                        + "\n"
                        + config.get("agent_base_url")
                        + "\n"
                        + interval
                        + "\n"
                        + Base64.getEncoder()
                                .encodeToString((byte[]) config.get("token_ciphertext"))
                        + "\n"
                        + Base64.getEncoder().encodeToString((byte[]) config.get("token_iv"));
        Stream state;
        synchronized (streams) {
            streams.entrySet()
                    .removeIf(
                            e ->
                                    now - e.getValue().lastAccess > 300_000
                                            && !e.getValue().lock.isLocked());
            state = streams.get(id);
            if (state == null || !state.signature.equals(signature)) {
                if (streams.size() >= 64 && state == null) {
                    return new LogBuffer.View("", "", false, false, "LOG_VIEW_LIMIT", 60);
                }
                state = new Stream(signature);
                streams.put(id, state);
            }
            state.lastAccess = now;
        }
        if (state.lock.tryLock()) {
            try {
                if (now >= state.nextRead) {
                    if (!slots.tryAcquire()) {
                        return state.buffer.view(cursor, "LOG_READER_BUSY", 5);
                    }
                    try {
                        Map<String, Object> request = new LinkedHashMap<>();
                        request.put("path", config.get("path"));
                        request.put("encoding", config.get("encoding"));
                        request.put("cursor", state.agentCursor);
                        String token =
                                cipher.decrypt(
                                        (byte[]) config.get("token_ciphertext"),
                                        (byte[]) config.get("token_iv"));
                        var response =
                                json.readTree(
                                        client.readLog(
                                                config.get("agent_base_url").toString(),
                                                token,
                                                json.writeValueAsString(request)));
                        if (response.has("code")) {
                            String code = response.path("code").asString();
                            state.code =
                                    code.matches("[A-Z_]{3,40}") ? code : "LOG_RESPONSE_INVALID";
                        } else if (!config.get("project_id")
                                        .equals(
                                                response.path("identity")
                                                        .path("project_id")
                                                        .asString())
                                || !config.get("instance_id")
                                        .equals(
                                                response.path("identity")
                                                        .path("instance_id")
                                                        .asString())) {
                            state.code = "IDENTITY_MISMATCH";
                        } else if (!response.path("text").isString()
                                || !response.path("cursor").isString()
                                || response.path("text").asString().length() > 128 * 1024
                                || response.path("cursor").asString().length() > 180) {
                            state.code = "LOG_RESPONSE_INVALID";
                        } else {
                            synchronized (state.buffer) {
                                state.buffer.append(
                                        response.path("text").asString(),
                                        response.path("reset").asBoolean(),
                                        response.path("limited").asBoolean());
                            }
                            state.agentCursor = response.path("cursor").asString();
                            state.code = null;
                        }
                    } catch (Exception failure) {
                        state.code = ConnectionErrorCode.classify(failure);
                    } finally {
                        slots.release();
                    }
                    state.nextRead =
                            System.currentTimeMillis()
                                    + Math.max(interval, state.code == null ? interval : 60)
                                            * 1000L;
                }
            } finally {
                state.lock.unlock();
            }
        }
        return state.buffer.view(
                cursor,
                state.code,
                Math.max(
                        0,
                        (int) Math.ceil((state.nextRead - System.currentTimeMillis()) / 1000.0)));
    }

    void invalidate(long id) {
        synchronized (streams) {
            streams.remove(id);
        }
    }

    private static final class Stream {
        final String signature;
        final LogBuffer buffer = new LogBuffer();
        final ReentrantLock lock = new ReentrantLock();
        volatile long lastAccess, nextRead;
        volatile String code;
        String agentCursor;

        Stream(String signature) {
            this.signature = signature;
        }
    }
}
