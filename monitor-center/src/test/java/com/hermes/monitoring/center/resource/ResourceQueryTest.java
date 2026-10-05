package com.hermes.monitoring.center.resource;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ResourceQueryTest {
    @Test
    void supportsRequestedRangesAndRejectsInvalidPeriods() {
        assertEquals(Duration.ofDays(1), ResourceQuery.duration("24h"));
        assertEquals(Duration.ofDays(7), ResourceQuery.duration("7d"));
        assertEquals(Duration.ofDays(30), ResourceQuery.duration("30d"));
        assertEquals(Duration.ofDays(365), ResourceQuery.duration("365d"));
        assertThrows(IllegalArgumentException.class, () -> ResourceQuery.duration("all"));
    }

    @Test
    void samplesAcrossTheEntireYearForEachDiskInsteadOfLimitingToRecentRows() {
        var sqls = new ArrayList<String>();
        var arguments = new ArrayList<Object[]>();
        JdbcTemplate db =
                new JdbcTemplate() {
                    @Override
                    public List<Map<String, Object>> queryForList(String sql, Object... args) {
                        sqls.add(sql);
                        arguments.add(args);
                        return List.of();
                    }

                    @Override
                    public <T> T queryForObject(String sql, Class<T> type, Object... args) {
                        return type.cast(false);
                    }
                };
        new ResourceQuery(db).resources("test", "dev", "365d", 1000);
        int disk =
                java.util.stream.IntStream.range(0, sqls.size())
                        .filter(i -> sqls.get(i).contains("from disk_samples"))
                        .findFirst()
                        .orElseThrow();
        assertTrue(sqls.get(disk).contains("distinct on (path_id,"));
        assertFalse(sqls.get(disk).contains("limit ?"));
        assertEquals(Duration.ofDays(365).toSeconds(), arguments.get(disk)[3]);
        assertThrows(
                IllegalArgumentException.class,
                () -> new ResourceQuery(db).resources("test", "dev", "365d", 1001));
    }
}
