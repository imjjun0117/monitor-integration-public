package com.monitoring.agent.incident;

import static org.junit.jupiter.api.Assertions.*;

import com.monitoring.agent.dashboard.DashboardStatusCauseQuery;
import com.monitoring.agent.metric.ThresholdResolver;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

@Testcontainers
class IncidentPostgresTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm");

    JdbcTemplate db;
    TransactionTemplate transaction;
    IncidentMonitor monitor;
    IncidentQuery query;

    @BeforeEach
    void setup() {
        SecurityContextHolder.clearContext();
        var source =
                new DriverManagerDataSource(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        var flyway = Flyway.configure().dataSource(source).cleanDisabled(false).load();
        flyway.clean();
        flyway.migrate();
        db = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        var json = new ObjectMapper();
        monitor =
                new IncidentMonitor(
                        db, new DashboardStatusCauseQuery(db, new ThresholdResolver(db)), json);
        query = new IncidentQuery(db, json);
        db.update("insert into projects(project_id, display_name) values ('p', 'Project')");
        db.update(
                """
                insert into instances(
                    project_id, instance_id, display_name, agent_base_url,
                    token_ciphertext, token_iv, last_seen_at)
                values ('p', 'i', 'Instance', 'https://test.invalid', '\\x00', '\\x00', now())
                """);
        db.update(
                """
                insert into check_definitions(
                    project_id, instance_id, check_id, name, category,
                    discovered_at, last_seen_at)
                values ('p', 'i', 'batch', 'Batch', 'INTERNAL', now(), now())
                """);
        db.update(
                """
                insert into check_results_latest(
                    project_id, instance_id, check_id, status, message, checked_at, central_received_at)
                values ('p', 'i', 'batch', 'WARN', 'secret raw payload', now(), now())
                """);
    }

    @Test
    void deduplicatesPreservesUnknownAndClosesOnlyAfterRecovery() {
        reconcile();
        reconcile();
        assertEquals(1, count("incidents"));
        assertEquals(1, count("incident_events"));
        long firstId = id();
        assertFalse(
                query.get(firstId, false).get("first_observation").toString().contains("secret"));

        status("DOWN");
        reconcile();
        status("UNKNOWN");
        reconcile();
        var active = query.get(firstId, false);
        assertEquals("OPEN", active.get("state"));
        assertEquals("DOWN", active.get("severity"));
        assertNull(active.get("closed_at"));
        assertTrue(active.get("first_observation").toString().contains("WARN"));

        status("UP");
        reconcile();
        reconcile();
        assertEquals("RECOVERED", query.get(firstId, false).get("state"));
        assertEquals(
                1L,
                db.queryForObject(
                        "select count(*) from incident_events where event_type = 'RECOVERED'",
                        Long.class));
        status("DOWN");
        reconcile();
        assertEquals(2, count("incidents"));
        assertEquals(1, query.list(null, "ACTIVE", 0, 50).total());
    }

    @Test
    void disabledMonitoringIsNotReportedAsRecovery() {
        reconcile();
        long id = id();
        db.update("update check_definitions set monitoring_enabled = false");
        reconcile();
        assertEquals("MONITORING_STOPPED", query.get(id, false).get("state"));
        assertNotNull(query.get(id, false).get("closed_at"));
        assertEquals(0, query.list(null, "ACTIVE", 0, 50).total());
    }

    @Test
    void certificateCauseChangesKeepTheSameIncident() {
        status("UP");
        db.update(
                """
                insert into certificate_targets(
                    certificate_target_id, project_id, hostname, port, sni_hostname)
                values (1, 'p', 'cert.invalid', 443, 'cert.invalid')
                """);
        db.update(
                """
                insert into certificate_latest(
                    certificate_target_id, days_remaining, chain_valid, hostname_valid,
                    signature_algorithm, status, checked_at)
                values (1, 90, false, true, 'SHA256withRSA', 'DOWN', now())
                """);
        reconcile();
        long id = id();
        db.update("update certificate_latest set chain_valid = true, days_remaining = 1");
        reconcile();
        assertEquals(1, count("incidents"));
        assertEquals("OPEN", query.get(id, false).get("state"));
        db.update("update certificate_latest set days_remaining = 90, status = 'UP'");
        reconcile();
        assertEquals("RECOVERED", query.get(id, false).get("state"));
    }

    @Test
    void concurrentPollsRecordOneOpening() throws Exception {
        var start = new CountDownLatch(1);
        try (var threads = Executors.newFixedThreadPool(2)) {
            var first =
                    threads.submit(
                            () -> {
                                start.await();
                                reconcile();
                                return null;
                            });
            var second =
                    threads.submit(
                            () -> {
                                start.await();
                                reconcile();
                                return null;
                            });
            start.countDown();
            first.get();
            second.get();
        }
        assertEquals(1, count("incidents"));
        assertEquals(1, count("incident_events"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void evidenceBoundsWindowKeepsGapsAndHonorsSensitiveDataFlags() {
        reconcile();
        Instant anchor = Instant.parse("2026-10-01T12:00:00Z");
        db.update(
                """
                insert into instance_metric_samples(
                    project_id, instance_id, sampled_at, system_cpu_ratio,
                    heap_used_bytes, heap_max_bytes, physical_memory_used_bytes, physical_memory_total_bytes)
                values ('p', 'i', '2026-10-01T12:00:05Z', .2, 20, 100, 10, 0),
                    ('p', 'i', '2026-10-01T12:00:35Z', .9, 70, 100, 10, 0),
                    ('p', 'i', '2026-10-01T12:16:00Z', 1, 100, 100, 10, 100)
                """);
        db.update(
                """
                insert into disk_samples(project_id, instance_id, sampled_at, path_id, used_bytes, total_bytes)
                values ('p', 'i', '2026-10-01T12:00:05Z', 'data', 90, 100)
                """);
        db.update(
                """
                insert into db_pool_samples(project_id, instance_id, sampled_at, pool_id, active, max_size)
                values ('p', 'i', '2026-10-01T12:00:05Z', 'db', 4, 10)
                """);
        db.update(
                """
                insert into check_result_samples(
                    project_id, instance_id, check_id, checked_at, central_received_at, status, message)
                values ('p', 'i', 'batch', '2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z', 'DOWN', 'secret')
                """);
        db.update(
                """
                insert into collector_events(project_id, instance_id, kind, received_at, payload)
                select 'p', 'i', 'LOG', ?::timestamptz, jsonb_build_object('text', repeat('x', 10000))
                from generate_series(1, 25)
                """,
                Timestamp.from(anchor));
        db.update(
                """
                insert into audit_log(actor, action, entity_type, project_id, target_id, occurred_at, before_values)
                values ('admin', 'UPDATE', 'thresholds', 'p', 'cpu', ?::timestamptz, '{"hidden":"secret"}')
                """,
                Timestamp.from(anchor));
        var incident = query.get(id(), false);
        var restricted = query.evidence(incident, anchor, false, false);
        assertEquals(List.of(), restricted.get("logs"));
        assertEquals(List.of(), restricted.get("changes"));
        var resources = (List<Map<String, Object>>) restricted.get("resources");
        assertEquals(31, resources.size());
        var peak = resources.get(15);
        assertEquals(.9, ((Number) peak.get("system_cpu_ratio")).doubleValue(), .001);
        assertEquals(.7, ((Number) peak.get("heap_ratio")).doubleValue(), .001);
        assertEquals(.9, ((Number) peak.get("disk_ratio")).doubleValue(), .001);
        assertEquals(.4, ((Number) peak.get("db_pool_ratio")).doubleValue(), .001);
        assertNull(peak.get("memory_ratio"));
        assertNull(resources.getFirst().get("system_cpu_ratio"));
        assertEquals(1, ((List<?>) restricted.get("checks")).size());
        assertFalse(restricted.toString().contains("secret"));
        var full = query.evidence(incident, anchor, true, true);
        var logs = (List<Map<String, Object>>) full.get("logs");
        assertEquals(20, logs.size());
        assertEquals(8192, logs.getFirst().get("text").toString().length());
        assertEquals(1, ((List<?>) full.get("changes")).size());
        assertFalse(full.toString().contains("secret"));
    }

    private void reconcile() {
        transaction.executeWithoutResult(ignored -> monitor.reconcile());
    }

    private void status(String value) {
        db.update("update check_results_latest set status = ?, checked_at = now()", value);
    }

    private long id() {
        return db.queryForObject("select min(incident_id) from incidents", Long.class);
    }

    private long count(String table) {
        return db.queryForObject("select count(*) from " + table, Long.class);
    }
}
