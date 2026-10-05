package com.monitoring.agent.check;

import com.monitoring.agent.metric.ThresholdResolver;
import java.time.Duration;
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
class CheckEvidencePostgresTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withStartupTimeout(Duration.ofSeconds(60));

    private JdbcTemplate db;
    private CheckResultStore store;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void seed() {
        var flyway =
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
        var source =
                new DriverManagerDataSource(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        db = new JdbcTemplate(source);
        store =
                new CheckResultStore(
                        db,
                        new TransactionTemplate(new DataSourceTransactionManager(source)),
                        new ThresholdResolver(db));
        db.update("insert into projects(project_id,display_name) values ('market','Market')");
        db.update(
                "insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv) values ('market','dev','Dev','https://agent.example','cipher','iv')");
        db.update(
                "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at) values ('market','dev','api-test','API','API','EXTERNAL',now(),now())");
    }

    @Test
    void evidenceRoundTripsAndOlderResponsesCannotReplaceIt() {
        String time = java.time.Instant.now().toString();
        var result =
                json.createObjectNode()
                        .put("status", "DOWN")
                        .put("message", "HTTP_STATUS_MISMATCH")
                        .put("duration_ms", 15)
                        .put("checked_at", time);
        result.putObject("http")
                .put("method", "GET")
                .put("url", "https://api.example/")
                .put("status_code", 503)
                .put("response_body", "unavailable");
        result.putObject("details").put("balance", 1200);
        store.save("market", "dev", "api-test", result);
        var row =
                new CheckQuery(db, new CheckHistoryQuery(db))
                        .apiChecks(0, 20, "checked_at,desc", "market", "dev", null, null, null)
                        .items()
                        .getFirst();
        assertEquals(
                503,
                ((tools.jackson.databind.JsonNode) row.get("http")).path("status_code").asInt());
        assertEquals(
                1200,
                ((tools.jackson.databind.JsonNode) row.get("details")).path("balance").asInt());
        assertFalse(row.containsKey("evidence_json"));
        result.put("checked_at", "2020-01-01T00:00:00Z");
        result.remove("http");
        result.remove("details");
        store.save("market", "dev", "api-test", result);
        assertNotNull(
                db.queryForObject(
                        "select evidence_json::text from check_results_latest", String.class));
        result.put("checked_at", java.time.Instant.now().plusSeconds(1).toString());
        store.save("market", "dev", "api-test", result);
        assertNull(
                db.queryForObject(
                        "select evidence_json::text from check_results_latest", String.class));
        assertEquals(
                3, db.queryForObject("select count(*) from check_result_samples", Integer.class));
    }

    @Test
    void serviceSettingsAreIsolatedByProjectAndDoNotExecuteChecks() {
        db.update("insert into projects(project_id,display_name) values ('other','Other')");
        db.update(
                "insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv) values ('other','dev','Dev','https://other.example','cipher','iv')");
        db.update(
                "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at) values ('other','dev','api-test','API','API','EXTERNAL',now(),now())");
        var checks = org.mockito.Mockito.mock(CheckRunService.class);
        var actions = new CheckActionsController(db, checks);
        var profile =
                json.readTree(
                        """
            {"title":"다른 업체 잔여량","dashboard":true,"fields":[{"key":"left","label":"잔여 건수",
            "source":"DETAILS","path":"$.remaining","kind":"NUMBER","unit":"건","required":true,"critical":0}]}
            """);
        assertEquals(
                204,
                actions.service(
                                "other",
                                "dev",
                                "api-test",
                                new CheckActionsController.ServiceWrite(profile))
                        .getStatusCode()
                        .value());
        assertNull(
                db.queryForObject(
                        "select service_profile_json::text from check_definitions where project_id='market'",
                        String.class));
        var result =
                json.createObjectNode()
                        .put("status", "UP")
                        .put("checked_at", java.time.Instant.now().toString());
        result.putObject("details").put("remaining", 0);
        store.save("other", "dev", "api-test", result);
        var row =
                new CheckQuery(db, new CheckHistoryQuery(db))
                        .apiChecks(0, 20, "checked_at,desc", "other", "dev", null, null, null)
                        .items()
                        .getFirst();
        assertEquals("UP", row.get("status"));
        assertEquals("DOWN", ((java.util.Map<?, ?>) row.get("service_info")).get("status"));
        assertFalse(row.containsKey("service_profile_json"));
        assertEquals(
                204,
                actions.service(
                                "other",
                                "dev",
                                "api-test",
                                new CheckActionsController.ServiceWrite(null))
                        .getStatusCode()
                        .value());
        row =
                new CheckQuery(db, new CheckHistoryQuery(db))
                        .apiChecks(0, 20, "checked_at,desc", "other", "dev", null, null, null)
                        .items()
                        .getFirst();
        assertFalse(row.containsKey("service_info"));
        org.mockito.Mockito.verifyNoInteractions(checks);
    }

    @Test
    void serviceSettingsRejectUnknownChecksAndInvalidProfilesWithoutReplacingSavedSettings() {
        var actions =
                new CheckActionsController(db, org.mockito.Mockito.mock(CheckRunService.class));
        var invalid = new CheckActionsController.ServiceWrite(json.readTree("{\"title\":\"bad\"}"));
        assertEquals(
                400, actions.service("market", "dev", "api-test", invalid).getStatusCode().value());
        assertEquals(
                400,
                actions.service(
                                "market",
                                "dev",
                                "missing",
                                new CheckActionsController.ServiceWrite(null))
                        .getStatusCode()
                        .value());
        db.update("update check_definitions set category='INTERNAL',direction=null");
        assertEquals(
                400,
                actions.service(
                                "market",
                                "dev",
                                "api-test",
                                new CheckActionsController.ServiceWrite(null))
                        .getStatusCode()
                        .value());
        assertNull(
                db.queryForObject(
                        "select service_profile_json::text from check_definitions", String.class));
    }
}
