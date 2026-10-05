package com.monitoring.agent.collection;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

// 수집 실패 횟수 및 최신 상태 갱신
@Component
public final class CollectionFailureService {
    private final JdbcTemplate db;
    private final TransactionTemplate transaction;

    CollectionFailureService(JdbcTemplate db, TransactionTemplate transaction) {
        this.db = db;
        this.transaction = transaction;
    }

    // 실패 횟수 증가 및 연속 실패·마지막 수집 시각에 따라 상태 갱신
    public void record(String projectId, String instanceId, String code) {
        record(projectId, instanceId, code, Instant.now());
    }

    // 실패 횟수 증가 및 연속 실패·마지막 수집 시각에 따라 상태 갱신
    public void record(String projectId, String instanceId, String code, Instant failedAt) {
        transaction.executeWithoutResult(
                status -> {
                    db.update(
                            """
                update instances set consecutive_failures=consecutive_failures+1,
                  last_collection_error_code=?,updated_at=now()
                where project_id=? and instance_id=?
                """,
                            code,
                            projectId,
                            instanceId);
                    db.update(
                            """
                update instance_snapshot_latest set
                  status=case when (select consecutive_failures from instances
                    where project_id=? and instance_id=?)>=3
                    or central_received_at < cast(? as timestamptz) - ((select greatest(poll_interval_seconds::bigint*3,60)
                      from instances where project_id=? and instance_id=?) * interval '1 second')
                    then 'DOWN' else 'WARN' end,
                  status_reason=?
                where project_id=? and instance_id=?
                """,
                            projectId,
                            instanceId,
                            Timestamp.from(failedAt),
                            projectId,
                            instanceId,
                            code,
                            projectId,
                            instanceId);
                });
    }
}
