package com.hermes.monitoring.center.metric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

final class ThresholdResolverTest {
    @Test
    void resolveKeepsScopedDistinctOnQuery() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForList(
                        anyString(),
                        org.mockito.ArgumentMatchers.eq("p"),
                        org.mockito.ArgumentMatchers.eq("p"),
                        org.mockito.ArgumentMatchers.eq("i")))
                .thenReturn(List.of());
        new ThresholdResolver(db).resolve("p", "i");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(db)
                .queryForList(
                        sql.capture(),
                        org.mockito.ArgumentMatchers.eq("p"),
                        org.mockito.ArgumentMatchers.eq("p"),
                        org.mockito.ArgumentMatchers.eq("i"));
        org.junit.jupiter.api.Assertions.assertTrue(
                sql.getValue().contains("distinct on(metric_key)"));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getValue().contains("project_id=?"));
    }

    @Test
    void batchAppliesGlobalThenProjectThenInstanceForMultipleTargets() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForList(anyString()))
                .thenReturn(
                        List.of(
                                row("GLOBAL", null, null, .10, .20),
                                        row("PROJECT", "p", null, .30, .40),
                                row("INSTANCE", "p", "i1", .50, .60),
                                        row("PROJECT", "q", null, .70, .80)));
        var result =
                new ThresholdResolver(db)
                        .resolveBatch(
                                List.of(
                                        new ThresholdResolver.Scope("p", "i1"),
                                        new ThresholdResolver.Scope("p", "i2"),
                                        new ThresholdResolver.Scope("q", "i3")));
        assertEquals(
                .50,
                result.get(new ThresholdResolver.Scope("p", "i1")).get("SYSTEM_CPU").warning());
        assertEquals(
                .30,
                result.get(new ThresholdResolver.Scope("p", "i2")).get("SYSTEM_CPU").warning());
        assertEquals(
                .70,
                result.get(new ThresholdResolver.Scope("q", "i3")).get("SYSTEM_CPU").warning());
    }

    private static Map<String, Object> row(
            String scope, String project, String instance, double warning, double critical) {
        return Map.of(
                "scope",
                scope,
                "project_id",
                project == null ? "" : project,
                "instance_id",
                instance == null ? "" : instance,
                "metric_key",
                "SYSTEM_CPU",
                "warning_value",
                warning,
                "critical_value",
                critical);
    }
}
