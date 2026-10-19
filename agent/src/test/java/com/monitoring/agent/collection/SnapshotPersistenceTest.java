package com.monitoring.agent.collection;

import com.monitoring.agent.metric.ThresholdResolver;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

class SnapshotPersistenceTest {
    @Test
    void retainsEachResourceDiskAndPoolSampleWithinTheSameMinute() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        TransactionTemplate transaction = mock(TransactionTemplate.class);
        doAnswer(invocation -> {
            Consumer<TransactionStatus> write = invocation.getArgument(0);
            write.accept(null);
            return null;
        }).when(transaction).executeWithoutResult(any());
        List<Sample> saved = new ArrayList<>();
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("insert into instance_metric_samples")
                    || sql.contains("insert into disk_samples")
                    || sql.contains("insert into db_pool_samples")) {
                Timestamp time = invocation.getArgument(1);
                saved.add(new Sample(sql, time.toInstant()));
            }
            return 1;
        }).when(db).update(anyString(), any(Object[].class));
        SnapshotPersistence persistence =
                new SnapshotPersistence(db, transaction, new ThresholdResolver(db));
        ObjectMapper json = new ObjectMapper();
        var info = json.readTree("{\"checks\":[]}");
        var snapshot = json.readTree("""
                {
                    "observed_at":"2026-10-11T00:00:00Z",
                    "jvm":{},
                    "system":{"system_cpu_ratio":0.95,"disks":[
                        {"path_id":"data","path_display":"Data","used_bytes":10,"total_bytes":100}
                    ]},
                    "db_pools":[{"pool_id":"main","name":"Main","active":1,"max":10}],
                    "recent_checks":[],
                    "collection_errors":[]
                }
                """);
        Instant first = Instant.parse("2026-10-11T00:00:00.123Z");
        Instant second = first.plusSeconds(30);
        persistence.save("sample", "prod", info, snapshot, first);
        persistence.save("sample", "prod", info, snapshot, second);

        for (String table : List.of("instance_metric_samples", "disk_samples", "db_pool_samples")) {
            assertEquals(
                    List.of(first, second),
                    saved.stream()
                            .filter(sample -> sample.sql().contains("insert into " + table))
                            .map(Sample::time)
                            .toList(),
                    table);
        }
    }

    private record Sample(String sql, Instant time) {}
}
