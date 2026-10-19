package com.monitoring.agent.resource;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;

@Testcontainers
class ResourceHistoryPostgresTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("resource_history")
                    .withUsername("hermes")
                    .withPassword("test-password")
                    .withStartupTimeout(Duration.ofSeconds(60));
    private JdbcTemplate db;
    private Instant first;

    @BeforeEach
    void seed() {
        var flyway =
                Flyway.configure()
                        .dataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword())
                        .cleanDisabled(false)
                        .load();
        flyway.clean();
        flyway.migrate();
        db =
                new JdbcTemplate(
                        new DriverManagerDataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword()));
        db.update("insert into projects(project_id,display_name) values ('sample','Sample')");
        db.update("""
                insert into instances(
                    project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv)
                values ('sample','prod','Prod','https://sample.example',decode('00','hex'),decode('00','hex'))
                """);
        first =
                db.queryForObject(
                                "select date_trunc('minute',now()) - interval '2 minutes'",
                                Timestamp.class)
                        .toInstant();
        for (int index = 0; index < 3; index++) {
            Timestamp time = Timestamp.from(first.plusSeconds(index * 15L));
            db.update("""
                    insert into instance_metric_samples(sampled_at,project_id,instance_id,system_cpu_ratio)
                    values (?,'sample','prod',?)
                    """, time, index == 1 ? .95 : .1);
            for (String path : List.of("data", "webapp")) {
                db.update("""
                        insert into disk_samples(sampled_at,project_id,instance_id,path_id,used_bytes,total_bytes)
                        values (?,'sample','prod',?, ?,100)
                        """, time, path, 10 + index);
            }
            for (String pool : List.of("main", "report")) {
                db.update("""
                        insert into db_pool_samples(sampled_at,project_id,instance_id,pool_id,active,max_size)
                        values (?,'sample','prod',?,?,10)
                        """, time, pool, index);
            }
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void dailyChartKeepsAllActualTimesAndPeakValuesWithinOneMinute() {
        var result = new ResourceQuery(db).resources("sample", "prod", "24h", 20000);
        var history = (List<Map<String, Object>>) result.get("history");
        assertEquals(3, history.size());
        assertEquals(.95, ((Number) history.get(1).get("system_cpu_ratio")).doubleValue());
        assertEquals(first, ((Timestamp) history.get(0).get("sampled_at")).toInstant());
        assertEquals(
                first.plusSeconds(15),
                ((Timestamp) history.get(1).get("sampled_at")).toInstant());
        assertEquals(
                first.plusSeconds(30),
                ((Timestamp) history.get(2).get("sampled_at")).toInstant());
        assertEquals(6, ((List<?>) result.get("disk_history")).size());
        var pools = new ResourceQuery(db).pools("sample", "prod", "24h", 20000);
        assertEquals(6, ((List<?>) pools.get("history")).size());
    }

    @Test
    void liveRangesKeepActualResourceDiskAndPoolSamples() {
        for (String period : List.of("5m", "15m", "1h")) {
            var result = new ResourceQuery(db).resources("sample", "prod", period, 20000);
            assertEquals(3, ((List<?>) result.get("history")).size());
            assertEquals(6, ((List<?>) result.get("disk_history")).size());
            var pools = new ResourceQuery(db).pools("sample", "prod", period, 20000);
            assertEquals(6, ((List<?>) pools.get("history")).size());
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void responseLimitAppliesToEachDiskAndPoolSeparately() {
        var result = new ResourceQuery(db).resources("sample", "prod", "24h", 2);
        assertEquals(2, ((List<?>) result.get("history")).size());
        var disks = (List<Map<String, Object>>) result.get("disk_history");
        assertEquals(4, disks.size());
        assertEquals(2, disks.stream().filter(row -> "data".equals(row.get("path_id"))).count());
        var pools = new ResourceQuery(db).pools("sample", "prod", "24h", 2);
        assertEquals(4, ((List<?>) pools.get("history")).size());
    }

    @Test
    void longRangeKeepsExistingDisplayLimitWithoutDeletingRawSamples() {
        var result = new ResourceQuery(db).resources("sample", "prod", "365d", 1000);
        assertEquals(1, ((List<?>) result.get("history")).size());
        assertEquals(2, ((List<?>) result.get("disk_history")).size());
        assertEquals(
                3,
                db.queryForObject("select count(*) from instance_metric_samples", Integer.class));
    }
}
