package com.monitoring.agent.resource;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 최신 자원 사용량과 기간별 이력 조회
@Component
public final class ResourceQuery {
    private static final List<String> HISTORY_TABLES =
            List.of("instance_metric_samples", "disk_samples", "db_pool_samples");
    private final JdbcTemplate db;

    ResourceQuery(JdbcTemplate db) {
        this.db = db;
    }

    Map<String, Object> resources(
            String projectId, String instanceId, String period, int maxPoints) {
        Duration duration = duration(period);
        validatePoints(maxPoints);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put(
                "latest",
                one(
                        """
            select project_id,instance_id,central_received_at,agent_observed_at,status,
              status_reason,pid,jvm_start_time,uptime_ms,system_cpu_ratio,
              process_cpu_ratio,heap_used_bytes,heap_max_bytes,non_heap_used_bytes,
              thread_live_count,thread_peak_count,gc_count,gc_time_ms,
              physical_memory_used_bytes,physical_memory_total_bytes
            from instance_snapshot_latest where project_id=? and instance_id=?
            """,
                        projectId,
                        instanceId));
        result.put(
                "history",
                history("instance_metric_samples", projectId, instanceId, duration, maxPoints));
        result.put(
                "disks",
                db.queryForList(
                        """
            select * from disk_latest
            where project_id=? and instance_id=? order by path_id
            """,
                        projectId,
                        instanceId));
        result.put(
                "disk_history",
                history("disk_samples", projectId, instanceId, duration, maxPoints));
        result.put("stale", stale(projectId, instanceId));
        return result;
    }

    Map<String, Object> pools(String projectId, String instanceId, String period, int maxPoints) {
        Duration duration = duration(period);
        validatePoints(maxPoints);
        return Map.of(
                "items",
                        db.queryForList(
                                """
                select * from db_pool_latest
                where project_id=? and instance_id=? order by pool_id
                """,
                                projectId,
                                instanceId),
                "history", history("db_pool_samples", projectId, instanceId, duration, maxPoints),
                "stale", stale(projectId, instanceId));
    }

    // 전체 조회 기간에서 디스크·풀별 표시 개수를 제한하여 이력 조회
    private List<Map<String, Object>> history(
            String table, String projectId, String instanceId, Duration period, int maxPoints) {
        if (!HISTORY_TABLES.contains(table)) {
            throw new IllegalArgumentException("HISTORY_TABLE_INVALID");
        }
        String partition =
                switch (table) {
                    case "disk_samples" -> "path_id,";
                    case "db_pool_samples" -> "pool_id,";
                    default -> "";
                };
        // 최근 구간에 치우치지 않도록 전체 조회 기간의 디스크·풀별 표시 개수 제한
        long bucketSeconds = Math.max(1, (period.toSeconds() + maxPoints - 1) / maxPoints);
        return db.queryForList(
                """
            select distinct on (%s history_bucket) * from (
            select *, floor(extract(epoch from (now()-sampled_at))/?) as history_bucket
            from %s where project_id=? and instance_id=?
              and sampled_at>=now()-(? * interval '1 second') and sampled_at<=now()
            ) history order by %s history_bucket, sampled_at desc
            """
                        .formatted(partition, table, partition),
                bucketSeconds,
                projectId,
                instanceId,
                period.toSeconds());
    }

    // 설정된 수집 주기에 비해 마지막 성공 결과가 오래됐는지 확인
    private boolean stale(String projectId, String instanceId) {
        Boolean value =
                db.queryForObject(
                        """
            select coalesce(l.central_received_at < now()-
              (greatest(i.poll_interval_seconds::bigint*3,60)*interval '1 second'),true)
            from instances i
            left join instance_snapshot_latest l using(project_id,instance_id)
            where i.project_id=? and i.instance_id=?
            """,
                        Boolean.class,
                        projectId,
                        instanceId);
        return Boolean.TRUE.equals(value);
    }

    private Map<String, Object> one(String sql, Object... arguments) {
        List<Map<String, Object>> rows = db.queryForList(sql, arguments);
        return rows.isEmpty() ? Map.of() : rows.get(0);
    }

    public static Duration duration(String period) {
        return switch (period) {
            case "24h" -> Duration.ofHours(24);
            case "7d" -> Duration.ofDays(7);
            case "30d" -> Duration.ofDays(30);
            case "365d" -> Duration.ofDays(365);
            default -> throw new IllegalArgumentException("PERIOD_INVALID");
        };
    }

    private void validatePoints(int maxPoints) {
        if (maxPoints < 1 || maxPoints > 1000) {
            throw new IllegalArgumentException("POINTS_INVALID");
        }
    }
}
