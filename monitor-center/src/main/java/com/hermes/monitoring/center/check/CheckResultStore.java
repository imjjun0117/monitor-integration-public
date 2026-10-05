package com.hermes.monitoring.center.check;

import com.hermes.monitoring.center.metric.StatusEvaluator;
import com.hermes.monitoring.center.metric.ThresholdResolver;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

// 점검 결과와 실패 상태 저장
@Component
final class CheckResultStore {
    private final JdbcTemplate db;
    private final TransactionTemplate transaction;
    private final ThresholdResolver thresholds;
    private final StatusEvaluator evaluator = new StatusEvaluator();

    CheckResultStore(
            JdbcTemplate db, TransactionTemplate transaction, ThresholdResolver thresholds) {
        this.db = db;
        this.transaction = transaction;
        this.thresholds = thresholds;
    }

    void save(String projectId, String instanceId, String checkId, JsonNode result) {
        Long duration =
                result.path("duration_ms").isNumber()
                        ? result.path("duration_ms").longValue()
                        : null;
        String status = result.path("status").asString();
        if (!"DOWN".equals(status) && duration != null) {
            ThresholdResolver.Limits limits =
                    thresholds.resolve(projectId, instanceId).get("API_LATENCY_MS");
            status =
                    evaluator
                            .worst(
                                    StatusEvaluator.Status.valueOf(status),
                                    evaluator.metric(
                                            duration.doubleValue(),
                                            limits.warning(),
                                            limits.critical()))
                            .name();
        }
        save(
                projectId,
                instanceId,
                checkId,
                status,
                duration,
                result.path("result_code").isString()
                        ? result.path("result_code").asString()
                        : null,
                result.path("message").asString(""),
                Instant.parse(result.path("checked_at").asString()),
                CheckEvidence.encode(result));
    }

    void timeout(String projectId, String instanceId, String checkId) {
        save(
                projectId,
                instanceId,
                checkId,
                "UNKNOWN",
                null,
                "TIMEOUT",
                "TIMEOUT",
                Instant.now(),
                null);
    }

    void failed(String projectId, String instanceId, String checkId) {
        save(
                projectId,
                instanceId,
                checkId,
                "UNKNOWN",
                null,
                "API_CHECK_ERROR",
                "API_CHECK_ERROR",
                Instant.now(),
                null);
    }

    private void save(
            String projectId,
            String instanceId,
            String checkId,
            String status,
            Long durationMs,
            String resultCode,
            String message,
            Instant checkedAt,
            String evidence) {
        Timestamp checked = Timestamp.from(checkedAt);
        Timestamp received = Timestamp.from(Instant.now());
        Object[] arguments =
                new Object[] {
                    projectId,
                    instanceId,
                    checkId,
                    status,
                    durationMs,
                    resultCode,
                    message,
                    checked,
                    received
                };
        transaction.executeWithoutResult(
                transactionStatus -> {
                    db.update(
                            """
                insert into check_results_latest(
                  project_id,instance_id,check_id,status,duration_ms,result_code,message,
                  checked_at,central_received_at,evidence_json) values(?,?,?,?,?,?,?,?,?,cast(? as jsonb))
                on conflict(project_id,instance_id,check_id) do update set
                  status=excluded.status,duration_ms=excluded.duration_ms,
                  result_code=excluded.result_code,message=excluded.message,
                  checked_at=excluded.checked_at,central_received_at=excluded.central_received_at,
                  evidence_json=excluded.evidence_json
                where check_results_latest.checked_at is null
                  or excluded.checked_at > check_results_latest.checked_at
                """,
                            projectId,
                            instanceId,
                            checkId,
                            status,
                            durationMs,
                            resultCode,
                            message,
                            checked,
                            received,
                            evidence);
                    db.update(
                            """
                insert into check_result_samples(
                  project_id,instance_id,check_id,status,duration_ms,result_code,message,
                  checked_at,central_received_at) values(?,?,?,?,?,?,?,?,?)
                on conflict(project_id,instance_id,check_id,checked_at) do update set
                  status=excluded.status,duration_ms=excluded.duration_ms,
                  result_code=excluded.result_code,message=excluded.message,
                  central_received_at=excluded.central_received_at
                """,
                            arguments);
                });
    }
}
