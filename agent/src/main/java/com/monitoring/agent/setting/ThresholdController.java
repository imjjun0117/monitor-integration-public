package com.monitoring.agent.setting;

import com.monitoring.agent.security.ProjectAccess;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 프로젝트 및 인스턴스의 임계값 설정 처리
@RestController
@RequestMapping("/api/v1/settings/thresholds")
public class ThresholdController {
    private static final Set<String> METRICS =
            Set.of(
                    "SYSTEM_CPU",
                    "PHYSICAL_MEMORY",
                    "JVM_HEAP",
                    "DISK",
                    "DB_POOL",
                    "API_LATENCY_MS",
                    "CERTIFICATE_DAYS");
    private final JdbcTemplate db;

    ThresholdController(JdbcTemplate db) {
        this.db = db;
    }

    @GetMapping
    List<Threshold> list() {
        return rows();
    }

    @PutMapping
    @Transactional
    List<Threshold> put(@RequestBody List<Threshold> values) {
        if (values == null || values.isEmpty() || values.size() > 100) {
            throw new IllegalArgumentException("THRESHOLD_INVALID");
        }
        for (Threshold value : values) {
            validate(value);
            db.update(
                    """
                insert into thresholds(
                  scope,project_id,instance_id,metric_key,warning_value,critical_value)
                values(?,?,?,?,?,?)
                on conflict(scope,project_id,instance_id,metric_key) do update set
                  warning_value=excluded.warning_value,
                  critical_value=excluded.critical_value,updated_at=now()
                """,
                    value.scope(),
                    value.projectId(),
                    value.instanceId(),
                    value.metricKey(),
                    value.warningValue(),
                    value.criticalValue());
        }
        return rows();
    }

    private List<Threshold> rows() {
        return db.query(
                """
            select scope,project_id,instance_id,metric_key,warning_value,critical_value
            from thresholds where scope='GLOBAL' or __ACCESS__ order by metric_key,scope,project_id,instance_id
            """
                        .replace("__ACCESS__", ProjectAccess.sql("thresholds.project_id")),
                (result, row) ->
                        new Threshold(
                                result.getString("scope"), result.getString("project_id"),
                                result.getString("instance_id"), result.getString("metric_key"),
                                result.getDouble("warning_value"),
                                        result.getDouble("critical_value")));
    }

    private void validate(Threshold value) {
        if (value == null) {
            throw new IllegalArgumentException("THRESHOLD_INVALID");
        }
        boolean finite =
                Double.isFinite(value.warningValue()) && Double.isFinite(value.criticalValue());
        boolean valuesValid = finite && value.warningValue() >= 0 && value.criticalValue() >= 0;
        boolean orderingValid =
                "CERTIFICATE_DAYS".equals(value.metricKey())
                        ? value.warningValue() >= value.criticalValue()
                        : value.warningValue() <= value.criticalValue();
        boolean scopeValid =
                value.scope() != null
                        && switch (value.scope()) {
                            case "GLOBAL" ->
                                    value.projectId() == null && value.instanceId() == null;
                            case "PROJECT" ->
                                    validId(value.projectId()) && value.instanceId() == null;
                            case "INSTANCE" ->
                                    validId(value.projectId()) && validId(value.instanceId());
                            default -> false;
                        };
        if (!METRICS.contains(value.metricKey()) || !valuesValid || !orderingValid || !scopeValid) {
            throw new IllegalArgumentException("THRESHOLD_INVALID");
        }
    }

    private boolean validId(String value) {
        return value != null && value.matches("[a-z0-9][a-z0-9._-]{1,63}");
    }

    record Threshold(
            String scope,
            String projectId,
            String instanceId,
            String metricKey,
            double warningValue,
            double criticalValue) {}
}
