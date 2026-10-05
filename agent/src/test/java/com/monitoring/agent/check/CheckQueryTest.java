package com.monitoring.agent.check;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CheckQueryTest {
    @Test
    void apiCheckHistoryUsesOneBatchQueryForTheWholePage() {
        CountingJdbcTemplate db = new CountingJdbcTemplate();
        CheckQuery query = new CheckQuery(db, new CheckHistoryQuery(db));

        var result = query.apiChecks(0, 50, "checked_at,desc", null, null, null, null, null);

        assertEquals(
                2,
                db.listQueries,
                "one query should load the page and one query should batch-load all histories");
        assertEquals(
                1,
                result.items().get(0).get("history") instanceof List<?> history
                        ? history.size()
                        : -1);
        assertEquals(
                0,
                result.items().get(1).get("history") instanceof List<?> history
                        ? history.size()
                        : -1);
    }

    private static final class CountingJdbcTemplate extends JdbcTemplate {
        private int listQueries;

        @Override
        public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
            return requiredType.cast(2L);
        }

        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... args) {
            listQueries++;
            if (sql.contains("from check_result_samples")) {
                return List.of(
                        Map.of(
                                "project_id", "sample-a",
                                "instance_id", "local-01",
                                "check_id", "first-api",
                                "checked_at", "2026-09-03T01:30:00Z",
                                "duration_ms", 10L,
                                "status", "UP",
                                "result_code", "200"));
            }
            return List.of(item("first-api"), item("second-api"));
        }

        private Map<String, Object> item(String checkId) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("project_id", "sample-a");
            item.put("instance_id", "local-01");
            item.put("check_id", checkId);
            return item;
        }
    }
}
