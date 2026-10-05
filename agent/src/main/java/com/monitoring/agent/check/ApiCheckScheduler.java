package com.monitoring.agent.check;

import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// 자동 실행을 사용하는 점검의 주기 확인 및 작업 등록
@Component
public final class ApiCheckScheduler {
    private final JdbcTemplate db;
    private final CheckRunService checks;
    private final long externalIntervalMs;

    ApiCheckScheduler(
            JdbcTemplate db,
            CheckRunService checks,
            @Value("${hermes.check.external-interval-ms:86400000}") long externalIntervalMs) {
        this.db = db;
        this.checks = checks;
        if (externalIntervalMs < 300_000L) {
            throw new IllegalArgumentException("EXTERNAL_CHECK_INTERVAL_TOO_SHORT");
        }
        this.externalIntervalMs = externalIntervalMs;
    }

    // 자동 실행 설정과 점검 주기를 확인하여 실행 작업 등록
    @Scheduled(fixedDelay = 10_000L)
    public void runChecks() {
        List<Map<String, Object>> rows =
                db.queryForList(
                        """
            select i.project_id,i.instance_id,d.check_id
            from instances i join check_definitions d using(project_id,instance_id)
            join projects p using(project_id)
            left join check_results_latest r using(project_id,instance_id,check_id)
            where p.enabled and i.enabled and d.enabled and d.monitoring_enabled
              and d.automatic_enabled and (d.category <> 'API' or i.api_checks_enabled)
              and (r.central_received_at is null or r.central_received_at <= now() -
                (coalesce(d.check_interval_seconds,
                  case when d.category='API' and d.direction='EXTERNAL' then ? else 300 end)
                 * interval '1 second'))
            order by i.project_id,d.check_id
            """,
                        externalIntervalMs / 1000L);
        for (Map<String, Object> row : rows) {
            checks.submitAutomatic(
                    (String) row.get("project_id"),
                    (String) row.get("instance_id"),
                    (String) row.get("check_id"));
        }
    }
}
