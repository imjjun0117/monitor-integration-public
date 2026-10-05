package com.hermes.monitoring.center.dashboard;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.hermes.monitoring.center.metric.ThresholdResolver;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

final class DashboardStatusCauseQueryTest {
    @Test
    void certificateKeepsPersistedWarnWhenDaysAreUp() {
        assertEquals("WARN", certificate("WARN", 90d).get("status"));
    }

    @Test
    void certificateWithNullDaysKeepsPersistedDown() {
        assertEquals("DOWN", certificate("DOWN", null).get("status"));
    }

    @Test
    void nonExpiryCertificateCauseClearsMisleadingDays() {
        Map<String, Object> cause = certificate("WARN", 90d, "CERT_SHA1_DETECTED");
        assertEquals("CERT_SHA1_DETECTED", cause.get("result_code"));
        assertEquals(null, cause.get("metric_key"));
        assertEquals(null, cause.get("value"));
        assertEquals(null, cause.get("warning_value"));
        assertEquals(null, cause.get("critical_value"));
    }

    @Test
    void apiCheckCarriesLatencyMetricCategoryAndResolvedLimits() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        ThresholdResolver resolver = mock(ThresholdResolver.class);
        Map<String, Object> row = new java.util.HashMap<>();
        row.put("project_id", "p");
        row.put("instance_id", "i");
        row.put("kind", "CHECK");
        row.put("metric_key", "API_LATENCY_MS");
        row.put("check_category", "API");
        row.put("subject_id", "c");
        row.put("value", 850d);
        row.put("status", "WARN");
        row.put("result_code", null);
        when(db.queryForList(anyString())).thenReturn(List.of(row));
        var scope = new ThresholdResolver.Scope("p", "i");
        when(resolver.resolveBatch(any()))
                .thenReturn(
                        Map.of(
                                scope,
                                new ThresholdResolver.Resolved(
                                        Map.of(
                                                "API_LATENCY_MS",
                                                new ThresholdResolver.Limits(500, 1000)))));
        Map<String, Object> cause =
                new DashboardStatusCauseQuery(db, resolver).find(List.of()).getFirst();
        assertEquals("API", cause.get("check_category"));
        assertEquals("API_LATENCY_MS", cause.get("metric_key"));
        assertEquals(850d, cause.get("value"));
        assertEquals(500d, cause.get("warning_value"));
        assertEquals(1000d, cause.get("critical_value"));
    }

    private Map<String, Object> certificate(String status, Double days) {
        return certificate(status, days, null);
    }

    private Map<String, Object> certificate(String status, Double days, String resultCode) {
        JdbcTemplate db = mock(JdbcTemplate.class);
        ThresholdResolver resolver = mock(ThresholdResolver.class);
        Map<String, Object> row = new java.util.HashMap<>();
        row.put("project_id", "p");
        row.put("instance_id", null);
        row.put("kind", "CERTIFICATE");
        row.put("metric_key", "CERTIFICATE_DAYS");
        row.put("subject_id", "c");
        row.put("subject_name", "host");
        row.put("value", days);
        row.put("status", status);
        row.put("result_code", resultCode);
        row.put("observed_at", OffsetDateTime.now());
        when(db.queryForList(anyString())).thenReturn(List.of(row));
        var scope = new ThresholdResolver.Scope("p", null);
        when(resolver.resolveBatch(any()))
                .thenReturn(
                        Map.of(
                                scope,
                                new ThresholdResolver.Resolved(
                                        Map.of(
                                                "CERTIFICATE_DAYS",
                                                new ThresholdResolver.Limits(30, 7)))));
        return new DashboardStatusCauseQuery(db, resolver).find(List.of()).getFirst();
    }
}
