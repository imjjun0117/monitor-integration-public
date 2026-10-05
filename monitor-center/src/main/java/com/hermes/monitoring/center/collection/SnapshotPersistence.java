package com.hermes.monitoring.center.collection;

import com.hermes.monitoring.center.metric.StatusEvaluator;
import com.hermes.monitoring.center.metric.ThresholdResolver;
import com.hermes.monitoring.center.check.CheckEvidence;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

// 자원 수집 결과와 점검 정의를 트랜잭션으로 저장
@Component
public final class SnapshotPersistence {
    private final JdbcTemplate db;
    private final TransactionTemplate transaction;
    private final StatusEvaluator evaluator = new StatusEvaluator();
    private final ThresholdResolver thresholds;

    SnapshotPersistence(
            JdbcTemplate db, TransactionTemplate transaction, ThresholdResolver thresholds) {
        this.db = db;
        this.transaction = transaction;
        this.thresholds = thresholds;
    }

    // 자원 및 점검 결과를 하나의 트랜잭션으로 저장
    public void save(
            String projectId,
            String instanceId,
            JsonNode info,
            JsonNode snapshot,
            Instant receivedAt) {
        transaction.executeWithoutResult(
                status -> saveTransaction(projectId, instanceId, info, snapshot, receivedAt));
    }

    // 점검 정의·최신 상태·분 단위 이력 저장 후 수집 실패 정보 초기화
    private void saveTransaction(
            String projectId,
            String instanceId,
            JsonNode info,
            JsonNode snapshot,
            Instant receivedAt) {
        Instant observedAt = Instant.parse(snapshot.path("observed_at").asString());
        Instant minute = receivedAt.truncatedTo(ChronoUnit.MINUTES);
        JsonNode jvm = snapshot.path("jvm");
        JsonNode system = snapshot.path("system");
        ThresholdResolver.Resolved limits = thresholds.resolve(projectId, instanceId);
        saveDefinitions(projectId, instanceId, info.path("checks"), receivedAt);
        Set<String> inactiveChecks =
                Set.copyOf(
                        db.queryForList(
                                """
            select check_id from check_definitions where project_id=? and instance_id=?
              and (not enabled or not monitoring_enabled)
            """,
                                String.class,
                                projectId,
                                instanceId));
        StatusAndReason evaluated =
                evaluate(snapshot, observedAt, receivedAt, limits, inactiveChecks);

        saveSnapshotLatest(projectId, instanceId, jvm, system, observedAt, receivedAt, evaluated);
        saveMetricHistory(projectId, instanceId, jvm, system, minute);
        saveDisks(projectId, instanceId, system.path("disks"), minute, limits);
        savePools(projectId, instanceId, snapshot.path("db_pools"), minute, limits);
        saveChecks(projectId, instanceId, snapshot.path("recent_checks"), receivedAt);
        db.update(
                "update instances set host_name=?,last_seen_at=?,consecutive_failures=0,"
                        + "last_collection_error_code=null,updated_at=now() where project_id=? and instance_id=?",
                info.path("attributes").path("host_name").asString(""),
                timestamp(receivedAt),
                projectId,
                instanceId);
    }

    private void saveSnapshotLatest(
            String projectId,
            String instanceId,
            JsonNode jvm,
            JsonNode system,
            Instant observedAt,
            Instant receivedAt,
            StatusAndReason evaluated) {
        db.update(
                """
            insert into instance_snapshot_latest(
              project_id,instance_id,central_received_at,agent_observed_at,status,status_reason,
              pid,jvm_start_time,uptime_ms,system_cpu_ratio,process_cpu_ratio,heap_used_bytes,
              heap_max_bytes,non_heap_used_bytes,thread_live_count,thread_peak_count,gc_count,
              gc_time_ms,physical_memory_used_bytes,physical_memory_total_bytes,extra_json)
            values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,cast(? as jsonb))
            on conflict(project_id,instance_id) do update set
              central_received_at=excluded.central_received_at,
              agent_observed_at=excluded.agent_observed_at,status=excluded.status,
              status_reason=excluded.status_reason,pid=excluded.pid,
              jvm_start_time=excluded.jvm_start_time,uptime_ms=excluded.uptime_ms,
              system_cpu_ratio=excluded.system_cpu_ratio,
              process_cpu_ratio=excluded.process_cpu_ratio,
              heap_used_bytes=excluded.heap_used_bytes,heap_max_bytes=excluded.heap_max_bytes,
              non_heap_used_bytes=excluded.non_heap_used_bytes,
              thread_live_count=excluded.thread_live_count,
              thread_peak_count=excluded.thread_peak_count,gc_count=excluded.gc_count,
              gc_time_ms=excluded.gc_time_ms,
              physical_memory_used_bytes=excluded.physical_memory_used_bytes,
              physical_memory_total_bytes=excluded.physical_memory_total_bytes,
              extra_json=excluded.extra_json
            """,
                projectId,
                instanceId,
                timestamp(receivedAt),
                timestamp(observedAt),
                evaluated.status().name(),
                evaluated.reason(),
                nullableLong(jvm, "pid"),
                nullableTimestamp(jvm, "start_time"),
                nullableLong(jvm, "uptime_ms"),
                nullableDouble(system, "system_cpu_ratio"),
                nullableDouble(jvm, "process_cpu_ratio"),
                nullableLong(jvm, "heap_used_bytes"),
                nullableLong(jvm, "heap_max_bytes"),
                nullableLong(jvm, "non_heap_used_bytes"),
                nullableInt(jvm, "thread_live_count"),
                nullableInt(jvm, "thread_peak_count"),
                nullableLong(jvm, "gc_count"),
                nullableLong(jvm, "gc_time_ms"),
                nullableLong(system, "physical_memory_used_bytes"),
                nullableLong(system, "physical_memory_total_bytes"),
                "{}");
    }

    // 동일 분의 중복 저장을 막고 자원 이력 등록
    private void saveMetricHistory(
            String projectId, String instanceId, JsonNode jvm, JsonNode system, Instant minute) {
        db.update(
                """
            insert into instance_metric_samples(
              sampled_at,project_id,instance_id,system_cpu_ratio,process_cpu_ratio,
              heap_used_bytes,heap_max_bytes,non_heap_used_bytes,physical_memory_used_bytes,
              physical_memory_total_bytes,thread_live_count,thread_peak_count,gc_count,gc_time_ms)
            values(?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict do nothing
            """,
                timestamp(minute),
                projectId,
                instanceId,
                nullableDouble(system, "system_cpu_ratio"),
                nullableDouble(jvm, "process_cpu_ratio"),
                nullableLong(jvm, "heap_used_bytes"),
                nullableLong(jvm, "heap_max_bytes"),
                nullableLong(jvm, "non_heap_used_bytes"),
                nullableLong(system, "physical_memory_used_bytes"),
                nullableLong(system, "physical_memory_total_bytes"),
                nullableInt(jvm, "thread_live_count"),
                nullableInt(jvm, "thread_peak_count"),
                nullableLong(jvm, "gc_count"),
                nullableLong(jvm, "gc_time_ms"));
    }

    // 현재 디스크 목록 갱신 및 사용률 기준 상태 저장
    private void saveDisks(
            String projectId,
            String instanceId,
            JsonNode disks,
            Instant minute,
            ThresholdResolver.Resolved limits) {
        db.update(
                "delete from disk_latest where project_id=? and instance_id=?",
                projectId,
                instanceId);
        for (JsonNode disk : disks) {
            Long used = nullableLong(disk, "used_bytes");
            Long total = nullableLong(disk, "total_bytes");
            String status = metric(ratio(used, total), limits.get("DISK")).name();
            db.update(
                    """
                insert into disk_latest(project_id,instance_id,path_id,path_display,used_bytes,total_bytes,status)
                values(?,?,?,?,?,?,?)
                """,
                    projectId,
                    instanceId,
                    disk.path("path_id").asString(),
                    disk.path("path_display").asString(),
                    used,
                    total,
                    status);
            db.update(
                    """
                insert into disk_samples(sampled_at,project_id,instance_id,path_id,used_bytes,total_bytes,status)
                values(?,?,?,?,?,?,?) on conflict do nothing
                """,
                    timestamp(minute),
                    projectId,
                    instanceId,
                    disk.path("path_id").asString(),
                    used,
                    total,
                    status);
        }
    }

    // 현재 DB 풀 목록 및 사용량 이력 저장
    private void savePools(
            String projectId,
            String instanceId,
            JsonNode pools,
            Instant minute,
            ThresholdResolver.Resolved limits) {
        db.update(
                "delete from db_pool_latest where project_id=? and instance_id=?",
                projectId,
                instanceId);
        for (JsonNode pool : pools) {
            Integer active = nullableInt(pool, "active");
            Integer max = nullableInt(pool, "max");
            String status = metric(ratio(active, max), limits.get("DB_POOL")).name();
            db.update(
                    """
                insert into db_pool_latest(
                  project_id,instance_id,pool_id,name,active,idle,max_size,min_idle,waiters,
                  max_wait_ms,validation_latency_ms,status)
                values(?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                    projectId,
                    instanceId,
                    pool.path("pool_id").asString(),
                    pool.path("name").asString(),
                    active,
                    nullableInt(pool, "idle"),
                    max,
                    nullableInt(pool, "min_idle"),
                    nullableInt(pool, "waiters"),
                    nullableLong(pool, "max_wait_ms"),
                    nullableLong(pool, "validation_latency_ms"),
                    status);
            db.update(
                    """
                insert into db_pool_samples(
                  sampled_at,project_id,instance_id,pool_id,active,idle,max_size,min_idle,
                  waiters,max_wait_ms,validation_latency_ms,status)
                values(?,?,?,?,?,?,?,?,?,?,?,?) on conflict do nothing
                """,
                    timestamp(minute),
                    projectId,
                    instanceId,
                    pool.path("pool_id").asString(),
                    active,
                    nullableInt(pool, "idle"),
                    max,
                    nullableInt(pool, "min_idle"),
                    nullableInt(pool, "waiters"),
                    nullableLong(pool, "max_wait_ms"),
                    nullableLong(pool, "validation_latency_ms"),
                    status);
        }
    }

    private void saveDefinitions(
            String projectId, String instanceId, JsonNode definitions, Instant receivedAt) {
        for (JsonNode definition : definitions) {
            db.update(
                    """
                insert into check_definitions(
                  project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at)
                values(?,?,?,?,?,?,?,?)
                on conflict(project_id,instance_id,check_id) do update set
                  name=excluded.name,category=excluded.category,direction=excluded.direction,enabled=true,
                  last_seen_at=excluded.last_seen_at
                """,
                    projectId,
                    instanceId,
                    definition.path("check_id").asString(),
                    definition.path("name").asString(),
                    definition.path("category").asString(),
                    nullableText(definition, "direction"),
                    timestamp(receivedAt),
                    timestamp(receivedAt));
        }
        // 에이전트는 사용 중인 점검만 제공. 제거·미사용 점검은 이력을 유지하고 실행 중단
        db.update(
                """
            update check_definitions set enabled=false
            where project_id=? and instance_id=? and last_seen_at is distinct from ?
            """,
                projectId,
                instanceId,
                timestamp(receivedAt));
    }

    private void saveChecks(
            String projectId, String instanceId, JsonNode checks, Instant receivedAt) {
        for (JsonNode check : checks) {
            Instant checkedAt = Instant.parse(check.path("checked_at").asString());
            Object[] arguments =
                    new Object[] {
                        projectId,
                        instanceId,
                        check.path("check_id").asString(),
                        check.path("status").asString(),
                        nullableLong(check, "duration_ms"),
                        nullableText(check, "result_code"),
                        check.path("message").asString(),
                        timestamp(checkedAt),
                        timestamp(receivedAt)
                    };
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
                    check.path("check_id").asString(),
                    check.path("status").asString(),
                    nullableLong(check, "duration_ms"),
                    nullableText(check, "result_code"),
                    check.path("message").asString(),
                    timestamp(checkedAt),
                    timestamp(receivedAt),
                    CheckEvidence.encode(check));
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
        }
    }

    private StatusAndReason evaluate(
            JsonNode snapshot,
            Instant observedAt,
            Instant receivedAt,
            ThresholdResolver.Resolved limits,
            Set<String> inactiveChecks) {
        List<StatusEvaluator.Status> values = new ArrayList<>();
        JsonNode jvm = snapshot.path("jvm");
        JsonNode system = snapshot.path("system");
        values.add(metric(nullableDouble(system, "system_cpu_ratio"), limits.get("SYSTEM_CPU")));
        values.add(
                metric(
                        ratio(
                                nullableLong(jvm, "heap_used_bytes"),
                                nullableLong(jvm, "heap_max_bytes")),
                        limits.get("JVM_HEAP")));
        values.add(
                metric(
                        ratio(
                                nullableLong(system, "physical_memory_used_bytes"),
                                nullableLong(system, "physical_memory_total_bytes")),
                        limits.get("PHYSICAL_MEMORY")));
        for (JsonNode disk : system.path("disks")) {
            values.add(
                    metric(
                            ratio(
                                    nullableLong(disk, "used_bytes"),
                                    nullableLong(disk, "total_bytes")),
                            limits.get("DISK")));
        }
        for (JsonNode pool : snapshot.path("db_pools")) {
            values.add(
                    metric(
                            ratio(nullableInt(pool, "active"), nullableInt(pool, "max")),
                            limits.get("DB_POOL")));
        }
        for (JsonNode check : snapshot.path("recent_checks")) {
            if (inactiveChecks.contains(check.path("check_id").asString())) {
                continue;
            }
            values.add(StatusEvaluator.Status.valueOf(check.path("status").asString()));
        }
        String reason = "METRICS";
        if (Math.abs(Duration.between(observedAt, receivedAt).toMinutes()) >= 5L) {
            values.add(StatusEvaluator.Status.WARN);
            reason = "CLOCK_SKEW";
        }
        if (snapshot.path("partial").asBoolean() || !snapshot.path("collection_errors").isEmpty()) {
            values.add(StatusEvaluator.Status.WARN);
            reason = "PARTIAL_COLLECTION";
        }
        return new StatusAndReason(
                evaluator.worst(values.toArray(StatusEvaluator.Status[]::new)), reason);
    }

    private StatusEvaluator.Status metric(Double value, ThresholdResolver.Limits limits) {
        return evaluator.metric(value, limits.warning(), limits.critical());
    }

    private Double ratio(Number used, Number total) {
        if (used == null || total == null || total.doubleValue() <= 0d) {
            return null;
        }
        return used.doubleValue() / total.doubleValue();
    }

    private Long nullableLong(JsonNode node, String key) {
        return node.path(key).isNumber() ? node.path(key).longValue() : null;
    }

    private Integer nullableInt(JsonNode node, String key) {
        return node.path(key).isNumber() ? node.path(key).intValue() : null;
    }

    private Double nullableDouble(JsonNode node, String key) {
        return node.path(key).isNumber() ? node.path(key).doubleValue() : null;
    }

    private Timestamp nullableTimestamp(JsonNode node, String key) {
        return node.path(key).isString()
                ? timestamp(Instant.parse(node.path(key).asString()))
                : null;
    }

    private String nullableText(JsonNode node, String key) {
        return node.path(key).isString() ? node.path(key).asString() : null;
    }

    private Timestamp timestamp(Instant value) {
        return Timestamp.from(value);
    }

    private record StatusAndReason(StatusEvaluator.Status status, String reason) {}
}
