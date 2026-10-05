package com.hermes.monitoring.center.collection;

import com.hermes.monitoring.center.security.TokenCipher;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// 인스턴스별 수집 주기에 따라 에이전트 정보와 자원 조회
@Component
public final class SnapshotCollector implements DisposableBean {
    private final JdbcTemplate db;
    private final TokenCipher cipher;
    private final AgentClient client;
    private final ObjectMapper json;
    private final SnapshotPersistence persistence;
    private final CollectionFailureService failures;
    private final AgentPayloadValidator validator = new AgentPayloadValidator();
    private final BoundedInstanceExecutor executor;

    @Autowired
    SnapshotCollector(
            JdbcTemplate db,
            TokenCipher cipher,
            ObjectMapper json,
            SnapshotPersistence persistence,
            CollectionFailureService failures,
            @Value("${hermes.agent-allowed-cidrs:}") String allowedCidrs,
            @Value("${hermes.agent-allowed-hosts:}") String allowedHosts,
            @Value("${hermes.collection.threads:10}") int threads,
            @Value("${hermes.collection.queue-capacity:100}") int queueCapacity,
            @Value("${hermes.agent-allowlist-file:}") String allowlistFile) {
        this.db = db;
        this.cipher = cipher;
        this.json = json;
        this.persistence = persistence;
        this.failures = failures;
        this.client = new AgentClient(new SsrfGuard(allowedCidrs, allowedHosts, allowlistFile));
        this.executor = new BoundedInstanceExecutor(threads, queueCapacity);
    }

    SnapshotCollector(
            JdbcTemplate db,
            TokenCipher cipher,
            ObjectMapper json,
            SnapshotPersistence persistence,
            CollectionFailureService failures,
            String allowedCidrs,
            String allowedHosts,
            int threads,
            int queueCapacity) {
        this(
                db,
                cipher,
                json,
                persistence,
                failures,
                allowedCidrs,
                allowedHosts,
                threads,
                queueCapacity,
                "");
    }

    SnapshotCollector(
            JdbcTemplate db,
            TokenCipher cipher,
            ObjectMapper json,
            SnapshotPersistence persistence,
            CollectionFailureService failures,
            String allowedCidrs,
            int threads,
            int queueCapacity) {
        this(db, cipher, json, persistence, failures, allowedCidrs, "", threads, queueCapacity);
    }

    // 수집 주기가 지난 인스턴스 조회 및 수집 작업 등록
    @Scheduled(fixedDelay = 15_000L)
    public void collect() {
        List<Map<String, Object>> instances =
                db.queryForList(
                        """
            with due as (
              select project_id,instance_id from instances
              where enabled and (last_polled_at is null
                or last_polled_at <= now()-(poll_interval_seconds * interval '1 second'))
              order by project_id,instance_id
              for update skip locked
            )
            update instances i set last_polled_at=now()
            from due
            where i.project_id=due.project_id and i.instance_id=due.instance_id
            returning i.project_id,i.instance_id,i.agent_base_url,i.token_ciphertext,i.token_iv
            """);
        for (Map<String, Object> instance : instances) {
            String key = instance.get("project_id") + "/" + instance.get("instance_id");
            BoundedInstanceExecutor.Submission submission =
                    executor.submit(key, () -> collectOne(instance));
            if (submission == BoundedInstanceExecutor.Submission.QUEUE_FULL) {
                failures.record(
                        (String) instance.get("project_id"),
                        (String) instance.get("instance_id"),
                        "COLLECTOR_BUSY");
            }
        }
    }

    // 에이전트 정보와 자원을 조회하고 응답 검증 후 저장
    private void collectOne(Map<String, Object> instance) {
        String projectId = (String) instance.get("project_id");
        String instanceId = (String) instance.get("instance_id");
        try {
            String token =
                    cipher.decrypt(
                            (byte[]) instance.get("token_ciphertext"),
                            (byte[]) instance.get("token_iv"));
            String baseUrl = (String) instance.get("agent_base_url");
            byte[] infoBody = client.get(baseUrl, "info", token);
            validator.validateInfo(infoBody, projectId, instanceId);
            byte[] snapshotBody = client.get(baseUrl, "snapshot", token);
            validator.validateSnapshot(snapshotBody, projectId, instanceId);
            JsonNode info = json.readTree(infoBody);
            JsonNode snapshot = json.readTree(snapshotBody);
            persistence.save(projectId, instanceId, info, snapshot, Instant.now());
        } catch (Exception error) {
            failures.record(projectId, instanceId, classify(error));
        }
    }

    // 수집 실패 원인을 공통 오류 코드로 변환
    private String classify(Exception error) {
        if (error instanceof AgentPayloadException) {
            return error.getMessage();
        }
        String message = error.getMessage();
        if ("TOKEN_DECRYPT_FAILED".equals(message)) {
            return "TOKEN_DECRYPT_FAILED";
        }
        return ConnectionErrorCode.classify(error);
    }

    int queueDepth() {
        return executor.queueDepth();
    }

    int activeCount() {
        return executor.activeCount();
    }

    @Override
    public void destroy() {
        executor.shutdown();
    }
}
