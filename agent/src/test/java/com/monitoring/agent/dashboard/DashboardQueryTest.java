package com.monitoring.agent.dashboard;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DashboardQueryTest {
    @Test
    void loadsAllInstancesInOneBatchRegardlessOfProjectCount() {
        CountingJdbcTemplate db = new CountingJdbcTemplate();

        var thresholds = new com.monitoring.agent.metric.ThresholdResolver(db);
        Map<String, Object> result =
                new DashboardQuery(db, new DashboardStatusCauseQuery(db, thresholds)).dashboard();

        assertEquals(7, db.listQueries);
        assertEquals(100, ((List<?>) result.get("projects")).size());
        assertEquals(0L, result.get("expiring_certificate_count"));
        assertEquals(0, db.objectQueries);
    }

    private static final class CountingJdbcTemplate extends JdbcTemplate {
        private int listQueries;
        private int objectQueries;

        @Override
        public List<Map<String, Object>> queryForList(String sql) {
            return queryForList(sql, new Object[0]);
        }

        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... arguments) {
            listQueries++;
            if (sql.contains("from projects")) {
                return java.util.stream.IntStream.range(0, 100)
                        .mapToObj(index -> project("project-" + index))
                        .toList();
            }
            if (sql.contains("from instances")) {
                return java.util.stream.IntStream.range(0, 100)
                        .mapToObj(index -> instance("project-" + index))
                        .toList();
            }
            return List.of();
        }

        @Override
        public <T> T queryForObject(String sql, Class<T> type) {
            objectQueries++;
            return type.cast(0L);
        }

        private Map<String, Object> project(String id) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("project_id", id);
            return value;
        }

        private Map<String, Object> instance(String projectId) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("project_id", projectId);
            value.put("status", "UP");
            return value;
        }
    }
}
