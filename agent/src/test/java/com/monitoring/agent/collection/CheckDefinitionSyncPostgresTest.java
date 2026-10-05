package com.monitoring.agent.collection;

import com.monitoring.agent.metric.ThresholdResolver;
import java.time.Duration;
import java.time.Instant;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class CheckDefinitionSyncPostgresTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withStartupTimeout(Duration.ofSeconds(60));

    private JdbcTemplate db;
    private SnapshotPersistence persistence;

    @BeforeEach
    void seed() {
        Flyway flyway =
                Flyway.configure()
                        .dataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword())
                        .locations("classpath:db/migration")
                        .cleanDisabled(false)
                        .load();
        flyway.clean();
        flyway.migrate();
        var dataSource =
                new DriverManagerDataSource(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        db = new JdbcTemplate(dataSource);
        persistence =
                new SnapshotPersistence(
                        db,
                        new TransactionTemplate(new DataSourceTransactionManager(dataSource)),
                        new ThresholdResolver(db));
        db.update("insert into projects(project_id,display_name) values('market','Market')");
        db.update(
                """
            insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv)
            values('market','dev','Dev','http://127.0.0.1',decode('00','hex'),decode('00','hex'))
            """);
    }

    @Test
    void disabledAgentChecksStopAppearingAndCanBeReenabledWithoutLosingHistory() {
        collect("one", "two");
        db.update(
                """
            insert into check_results_latest(project_id,instance_id,check_id,status,checked_at)
            values('market','dev','two','DOWN',now())
            """);
        collect("one");
        assertTrue(enabled("one"));
        assertFalse(enabled("two"));
        assertEquals(
                1, db.queryForObject("select count(*) from check_results_latest", Integer.class));
        collect("one", "two");
        assertTrue(enabled("two"));
        collect();
        assertFalse(enabled("one"));
        assertFalse(enabled("two"));
    }

    private boolean enabled(String id) {
        return Boolean.TRUE.equals(
                db.queryForObject(
                        "select enabled from check_definitions where check_id=?",
                        Boolean.class,
                        id));
    }

    @Test
    void centralUsagePreferenceSurvivesAgentRefreshRemovalAndRediscovery() {
        collect("one", "two");
        db.update(
                "update check_definitions set monitoring_enabled=false,automatic_enabled=true,check_interval_seconds=3600 where check_id='two'");
        String profile =
                "{\"title\":\"다른 업체\",\"dashboard\":false,\"fields\":[{\"key\":\"left\",\"label\":\"잔여 건수\",\"source\":\"DETAILS\",\"path\":\"$.remaining\",\"kind\":\"NUMBER\"}]}";
        db.update(
                "update check_definitions set service_profile_json=cast(? as jsonb) where check_id='two'",
                profile);
        collect("one", "two");
        collect("one");
        collect("one", "two");
        assertTrue(enabled("two"));
        assertFalse(
                db.queryForObject(
                        "select monitoring_enabled from check_definitions where check_id='two'",
                        Boolean.class));
        assertTrue(
                db.queryForObject(
                        "select monitoring_enabled from check_definitions where check_id='one'",
                        Boolean.class));
        assertTrue(
                db.queryForObject(
                        "select automatic_enabled from check_definitions where check_id='two'",
                        Boolean.class));
        assertEquals(
                3600,
                db.queryForObject(
                        "select check_interval_seconds from check_definitions where check_id='two'",
                        Integer.class));
        assertEquals(
                new ObjectMapper().readTree(profile),
                new ObjectMapper()
                        .readTree(
                                db.queryForObject(
                                        "select service_profile_json::text from check_definitions where check_id='two'",
                                        String.class)));
    }

    @Test
    void unusedDownResultsAreRetainedButDoNotKeepInstanceInOutage() {
        var json = new ObjectMapper();
        var info = json.createObjectNode();
        info.putArray("checks")
                .addObject()
                .put("check_id", "one")
                .put("name", "API")
                .put("category", "API")
                .put("direction", "EXTERNAL");
        Instant now = Instant.now();
        var snapshot =
                json.createObjectNode().put("observed_at", now.toString()).put("partial", false);
        snapshot.putObject("jvm").put("heap_used_bytes", 10).put("heap_max_bytes", 100);
        var system =
                snapshot.putObject("system")
                        .put("system_cpu_ratio", 0.1)
                        .put("physical_memory_used_bytes", 10)
                        .put("physical_memory_total_bytes", 100);
        system.putArray("disks");
        snapshot.putArray("db_pools");
        snapshot.putArray("collection_errors");
        snapshot.putArray("recent_checks")
                .addObject()
                .put("check_id", "one")
                .put("status", "DOWN")
                .put("message", "HTTP_TIMEOUT")
                .put("checked_at", now.toString());
        persistence.save("market", "dev", info, snapshot, now);
        assertEquals(
                "DOWN",
                db.queryForObject("select status from instance_snapshot_latest", String.class));
        db.update("update check_definitions set monitoring_enabled=false where check_id='one'");
        persistence.save("market", "dev", info, snapshot, now.plusSeconds(1));
        assertEquals(
                "UP",
                db.queryForObject("select status from instance_snapshot_latest", String.class));
        assertEquals(
                "DOWN", db.queryForObject("select status from check_results_latest", String.class));
        assertEquals(
                1, db.queryForObject("select count(*) from check_result_samples", Integer.class));
    }

    @Test
    void snapshotResultsRetainEvidenceAndDoNotOverwriteNewerDirectResults() {
        var json = new ObjectMapper();
        var info = json.createObjectNode();
        info.putObject("attributes").put("host_name", "test-host");
        info.putArray("checks")
                .addObject()
                .put("check_id", "one")
                .put("name", "API")
                .put("category", "API")
                .put("direction", "EXTERNAL");
        Instant now = Instant.now();
        var snapshot =
                json.createObjectNode().put("observed_at", now.toString()).put("partial", true);
        snapshot.putObject("jvm");
        snapshot.putObject("system").putArray("disks");
        snapshot.putArray("db_pools");
        var result =
                snapshot.putArray("recent_checks")
                        .addObject()
                        .put("check_id", "one")
                        .put("status", "UP")
                        .put("duration_ms", 12)
                        .put("message", "ok")
                        .put("checked_at", now.toString());
        result.putObject("http").put("status_code", 200).put("response_body", "actual response");
        persistence.save("market", "dev", info, snapshot, now);
        String evidence =
                db.queryForObject(
                        "select evidence_json::text from check_results_latest", String.class);
        assertTrue(evidence.contains("actual response"));
        result.put("checked_at", now.minusSeconds(1).toString());
        result.remove("http");
        persistence.save("market", "dev", info, snapshot, now.plusSeconds(1));
        assertEquals(
                evidence,
                db.queryForObject(
                        "select evidence_json::text from check_results_latest", String.class));
        result.put("checked_at", now.plusSeconds(2).toString());
        persistence.save("market", "dev", info, snapshot, now.plusSeconds(2));
        assertNull(
                db.queryForObject(
                        "select evidence_json::text from check_results_latest", String.class));
    }

    private void collect(String... ids) {
        var json = new ObjectMapper();
        var info = json.createObjectNode();
        info.putObject("attributes").put("host_name", "test-host");
        var checks = info.putArray("checks");
        for (String id : ids) {
            checks.addObject()
                    .put("check_id", id)
                    .put("name", id)
                    .put("category", "API")
                    .put("direction", "EXTERNAL");
        }
        var snapshot = json.createObjectNode();
        Instant now = Instant.now();
        snapshot.put("observed_at", now.toString()).put("partial", true);
        snapshot.putObject("jvm");
        snapshot.putObject("system").putArray("disks");
        snapshot.putArray("db_pools");
        snapshot.putArray("recent_checks");
        persistence.save("market", "dev", info, snapshot, now);
    }
}
