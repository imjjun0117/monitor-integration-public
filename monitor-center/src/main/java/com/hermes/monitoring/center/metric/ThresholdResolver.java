package com.hermes.monitoring.center.metric;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 프로젝트 및 인스턴스의 적용 임계값 조회
@Component
public final class ThresholdResolver {
    private static final Map<String, Limits> DEFAULTS =
            Map.of(
                    "SYSTEM_CPU",
                    new Limits(.80d, .90d),
                    "PHYSICAL_MEMORY",
                    new Limits(.80d, .90d),
                    "JVM_HEAP",
                    new Limits(.80d, .90d),
                    "DISK",
                    new Limits(.80d, .90d),
                    "DB_POOL",
                    new Limits(.80d, .95d),
                    "API_LATENCY_MS",
                    new Limits(2_000d, 5_000d),
                    "CERTIFICATE_DAYS",
                    new Limits(30d, 7d));
    private final JdbcTemplate db;

    public ThresholdResolver(JdbcTemplate db) {
        this.db = db;
    }

    // 프로젝트 기본값과 인스턴스 설정을 합쳐 적용 임계값 반환
    public Resolved resolve(String projectId, String instanceId) {
        Map<String, Limits> values = new LinkedHashMap<>(DEFAULTS);
        List<Map<String, Object>> rows =
                db.queryForList(
                        """
            select distinct on(metric_key) metric_key,warning_value,critical_value
            from thresholds
            where (scope='GLOBAL' and project_id is null and instance_id is null)
               or (scope='PROJECT' and project_id=? and instance_id is null)
               or (scope='INSTANCE' and project_id=? and instance_id=?)
            order by metric_key,
              case scope when 'INSTANCE' then 1 when 'PROJECT' then 2 else 3 end
            """,
                        projectId,
                        projectId,
                        instanceId);
        for (Map<String, Object> row : rows) {
            Number warning = (Number) row.get("warning_value");
            Number critical = (Number) row.get("critical_value");
            values.put(
                    (String) row.get("metric_key"),
                    new Limits(warning.doubleValue(), critical.doubleValue()));
        }
        return new Resolved(values);
    }

    // 한 번의 임계값 조회로 여러 프로젝트 및 인스턴스의 적용값 반환
    public Map<Scope, Resolved> resolveBatch(Collection<Scope> scopes) {
        List<Map<String, Object>> rows =
                db.queryForList(
                        "select scope,project_id,instance_id,metric_key,warning_value,critical_value from thresholds");
        Map<Scope, Resolved> result = new LinkedHashMap<>();
        for (Scope requested : scopes) {
            Map<String, Limits> values = new LinkedHashMap<>(DEFAULTS);
            for (String level : List.of("GLOBAL", "PROJECT", "INSTANCE")) {
                for (Map<String, Object> row : rows) {
                    if (!level.equals(row.get("scope")) || !applies(level, row, requested)) {
                        continue;
                    }
                    Number warning = (Number) row.get("warning_value");
                    Number critical = (Number) row.get("critical_value");
                    values.put(
                            (String) row.get("metric_key"),
                            new Limits(warning.doubleValue(), critical.doubleValue()));
                }
            }
            result.put(requested, new Resolved(values));
        }
        return result;
    }

    private boolean applies(String level, Map<String, Object> row, Scope requested) {
        if ("GLOBAL".equals(level)) {
            return true;
        }
        if (!requested.projectId().equals(row.get("project_id"))) {
            return false;
        }
        return "PROJECT".equals(level)
                || Objects.equals(requested.instanceId(), row.get("instance_id"));
    }

    public record Scope(String projectId, String instanceId) {}

    public record Limits(double warning, double critical) {}

    public record Resolved(Map<String, Limits> values) {
        public Limits get(String metric) {
            Limits value = values.get(metric);
            if (value == null) {
                throw new IllegalArgumentException("THRESHOLD_METRIC_INVALID");
            }
            return value;
        }
    }
}
