package com.hermes.monitoring.center.dashboard;

import com.hermes.monitoring.center.security.ProjectAccess;
import com.hermes.monitoring.center.metric.ThresholdResolver;
import com.hermes.monitoring.center.metric.ThresholdResolver.Limits;
import com.hermes.monitoring.center.metric.ThresholdResolver.Scope;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 제한된 두 번의 일괄 조회로 대시보드 상태 원인 구성
@Component
final class DashboardStatusCauseQuery {
    private final JdbcTemplate db;
    private final ThresholdResolver thresholds;

    DashboardStatusCauseQuery(JdbcTemplate db, ThresholdResolver thresholds) {
        this.db = db;
        this.thresholds = thresholds;
    }

    List<Map<String, Object>> find(List<Map<String, Object>> dashboardInstances) {
        Set<Scope> scopes = new LinkedHashSet<>();
        for (Map<String, Object> i : dashboardInstances) {
            scopes.add(new Scope(text(i, "project_id"), text(i, "instance_id")));
        }
        List<Map<String, Object>> raw =
                db.queryForList(
                        "select * from ("
                                + SQL
                                + ") scoped_causes where "
                                + ProjectAccess.sql("scoped_causes.project_id"));
        for (Map<String, Object> row : raw) {
            scopes.add(new Scope(text(row, "project_id"), text(row, "instance_id")));
        }
        Map<Scope, ThresholdResolver.Resolved> resolved = thresholds.resolveBatch(scopes);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : raw) {
            String kind = text(row, "kind");
            String metric = text(row, "metric_key");
            Double value = number(row.get("value"));
            ThresholdResolver.Resolved scopeLimits =
                    resolved.get(new Scope(text(row, "project_id"), text(row, "instance_id")));
            Limits limits = metric == null || scopeLimits == null ? null : scopeLimits.get(metric);
            String persisted = text(row, "status");
            String status =
                    "METRIC".equals(kind)
                            ? metricStatus(value, limits)
                            : "CHECK".equals(kind)
                                            && "API".equals(text(row, "check_category"))
                                            && value != null
                                    ? worstStatus(persisted, metricStatus(value, limits))
                                    : "CERTIFICATE".equals(kind) && value != null
                                            ? worstStatus(
                                                    persisted, certificateStatus(value, limits))
                                            : persisted;
            if (status == null || "UP".equals(status) || ("METRIC".equals(kind) && value == null)) {
                continue;
            }
            boolean nonExpiryCertificate =
                    "CERTIFICATE".equals(kind) && text(row, "result_code") != null;
            Map<String, Object> cause = new LinkedHashMap<>();
            for (String key :
                    List.of(
                            "project_id",
                            "instance_id",
                            "kind",
                            "metric_key",
                            "check_category",
                            "subject_id",
                            "subject_name",
                            "value",
                            "result_code",
                            "observed_at")) {
                cause.put(
                        key,
                        nonExpiryCertificate && ("metric_key".equals(key) || "value".equals(key))
                                ? null
                                : row.get(key));
            }
            cause.put("status", status);
            cause.put(
                    "warning_value",
                    limits == null || nonExpiryCertificate ? null : limits.warning());
            cause.put(
                    "critical_value",
                    limits == null || nonExpiryCertificate ? null : limits.critical());
            result.add(cause);
        }
        result.sort(
                java.util.Comparator.comparingInt(
                                (Map<String, Object> row) ->
                                        List.of("DOWN", "WARN", "UNKNOWN")
                                                .indexOf(text(row, "status")))
                        .thenComparing(
                                row -> text(row, "project_id"),
                                java.util.Comparator.nullsLast(String::compareTo))
                        .thenComparing(
                                row -> text(row, "instance_id"),
                                java.util.Comparator.nullsLast(String::compareTo))
                        .thenComparing(
                                row -> text(row, "kind"),
                                java.util.Comparator.nullsLast(String::compareTo)));
        return result;
    }

    private String metricStatus(Double value, Limits limits) {
        if (value == null || limits == null) {
            return "UNKNOWN";
        }
        if (value >= limits.critical()) {
            return "DOWN";
        }
        if (value >= limits.warning()) {
            return "WARN";
        }
        return "UP";
    }

    private String certificateStatus(Double days, Limits limits) {
        if (limits == null) {
            return "UNKNOWN";
        }
        if (days <= limits.critical()) {
            return "DOWN";
        }
        if (days <= limits.warning()) {
            return "WARN";
        }
        return "UP";
    }

    private String worstStatus(String left, String right) {
        if (left == null) {
            return right;
        }
        if (right == null) {
            return left;
        }
        return statusRank(left) <= statusRank(right) ? left : right;
    }

    private int statusRank(String status) {
        int rank = List.of("DOWN", "WARN", "UNKNOWN", "UP").indexOf(status);
        return rank < 0 ? 2 : rank;
    }

    private static String text(Map<String, Object> row, String key) {
        Object v = row.get(key);
        return v == null ? null : v.toString();
    }

    private static Double number(Object v) {
        return v instanceof Number n ? n.doubleValue() : null;
    }

    private static final String SQL =
            """
      select i.project_id,i.instance_id,'COLLECTION' kind,null::varchar metric_key,null::varchar check_category,null::varchar subject_id,
        i.display_name subject_name,null::numeric value,
        case when i.last_seen_at is null then 'UNKNOWN' when i.consecutive_failures>=3 or i.last_seen_at<now()-(greatest(i.poll_interval_seconds::bigint*3,60)*interval '1 second') then 'DOWN' when i.consecutive_failures>0 then 'WARN' else 'UP' end status,
        i.last_collection_error_code result_code,i.last_seen_at observed_at
      from instances i join projects p using(project_id) where i.enabled and p.enabled
      union all
      select i.project_id,i.instance_id,'METRIC','SYSTEM_CPU',null,null,null,l.system_cpu_ratio,null,null,l.agent_observed_at
      from instances i join projects p using(project_id) join instance_snapshot_latest l using(project_id,instance_id) where i.enabled and p.enabled
      union all
      select i.project_id,i.instance_id,'METRIC','JVM_HEAP',null,null,null,case when l.heap_max_bytes>0 then l.heap_used_bytes::numeric/l.heap_max_bytes end,null,null,l.agent_observed_at
      from instances i join projects p using(project_id) join instance_snapshot_latest l using(project_id,instance_id) where i.enabled and p.enabled
      union all
      select i.project_id,i.instance_id,'METRIC','PHYSICAL_MEMORY',null,null,null,case when l.physical_memory_total_bytes>0 then l.physical_memory_used_bytes::numeric/l.physical_memory_total_bytes end,null,null,l.agent_observed_at
      from instances i join projects p using(project_id) join instance_snapshot_latest l using(project_id,instance_id) where i.enabled and p.enabled
      union all
      select d.project_id,d.instance_id,'METRIC','DISK',null,d.path_id,d.path_display,case when d.total_bytes>0 then d.used_bytes::numeric/d.total_bytes end,d.status,null,l.agent_observed_at
      from disk_latest d join instances i using(project_id,instance_id) join projects p using(project_id) left join instance_snapshot_latest l using(project_id,instance_id) where i.enabled and p.enabled
      union all
      select d.project_id,d.instance_id,'METRIC','DB_POOL',null,d.pool_id,d.name,case when d.max_size>0 then d.active::numeric/d.max_size end,d.status,null,l.agent_observed_at
      from db_pool_latest d join instances i using(project_id,instance_id) join projects p using(project_id) left join instance_snapshot_latest l using(project_id,instance_id) where i.enabled and p.enabled
      union all
      select r.project_id,r.instance_id,'CHECK',case when d.category='API' then 'API_LATENCY_MS' end,d.category,r.check_id,d.name,r.duration_ms::numeric,r.status,
        coalesce(r.result_code,case when r.message in ('INTERNAL_CHECK_FAILED','TCP_TIMEOUT','TCP_CONNECTION_FAILED',
          'DIRECTORY_MISSING','DIRECTORY_UNREADABLE','BATCH_STALE','BATCH_HISTORY_MISSING','DB_RESULT_MISSING',
          'DISK_UNAVAILABLE','DISK_CAPACITY_LOW','FILE_MISSING','FILE_TOO_OLD','HTTP_TIMEOUT','HTTP_REQUEST_FAILED',
          'HTTP_TLS_ERROR','HTTP_CONNECTION_FAILED','HTTP_DNS_ERROR','HTTP_STATUS_MISMATCH','CONFIGURATION_MISSING',
          'POPBILL_BALANCE_LOW','POPBILL_BALANCE_EMPTY','POPBILL_BALANCE_QUERY_FAILED','CHECK_DEADLINE_EXCEEDED')
          then r.message end),r.checked_at
      from check_results_latest r join check_definitions d using(project_id,instance_id,check_id) join instances i using(project_id,instance_id) join projects p using(project_id) where d.enabled and i.enabled and p.enabled and d.monitoring_enabled
      union all
      select t.project_id,null,'CERTIFICATE','CERTIFICATE_DAYS',null,t.certificate_target_id::varchar,t.hostname,c.days_remaining::numeric,c.status,
        case when c.chain_valid=false then 'CERT_CHAIN_INVALID' when c.hostname_valid=false then 'CERT_HOSTNAME_INVALID'
          when lower(coalesce(c.signature_algorithm,'')) like '%sha1%' then 'CERT_SHA1_DETECTED'
          when c.days_remaining is null or c.chain_valid is null or c.hostname_valid is null then 'TLS_CHECK_FAILED' end,c.checked_at
      from certificate_latest c join certificate_targets t using(certificate_target_id) join projects p using(project_id) where t.enabled and p.enabled
      union all
      select l.project_id,l.instance_id,case l.status_reason when 'CLOCK_SKEW' then 'CLOCK_SKEW' else 'PARTIAL_COLLECTION' end,null,null,null,null,null,'WARN',l.status_reason,l.agent_observed_at
      from instance_snapshot_latest l join instances i using(project_id,instance_id) join projects p using(project_id) where i.enabled and p.enabled and l.status_reason in ('CLOCK_SKEW','PARTIAL_COLLECTION')
      """;
}
