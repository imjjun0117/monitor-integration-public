package com.monitoring.agent.check;

import java.time.Duration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@Testcontainers
class ApiCheckSchedulerPostgresTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withStartupTimeout(Duration.ofSeconds(60));

    private JdbcTemplate db;
    private CheckRunService checks;

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
        db =
                new JdbcTemplate(
                        new DriverManagerDataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword()));
        checks = mock(CheckRunService.class);
        db.update("insert into projects(project_id,display_name) values('market','Market')");
        for (String instance : new String[] {"a", "b"}) {
            db.update(
                    """
                insert into instances(project_id,instance_id,display_name,agent_base_url,
                  token_ciphertext,token_iv,api_checks_enabled)
                values('market',?,?,?,decode('00','hex'),decode('00','hex'),true)
                """,
                    instance,
                    instance,
                    "http://127.0.0.1/" + instance);
        }
    }

    @Test
    void defaultIntervalsUseLastResultRatherThanSchedulerTick() {
        definition("a", "new-external", "API", "EXTERNAL");
        definition("a", "old-external", "API", "EXTERNAL");
        definition("a", "recent-external", "API", "EXTERNAL");
        definition("a", "internal-api", "API", "INTERNAL");
        definition("a", "folder", "INTERNAL", null);
        result("old-external", "25 hours");
        result("recent-external", "23 hours");
        result("internal-api", "6 minutes");
        new ApiCheckScheduler(db, checks, 86_400_000L).runChecks();
        verify(checks).submitAutomatic("market", "a", "new-external");
        verify(checks).submitAutomatic("market", "a", "old-external");
        verify(checks).submitAutomatic("market", "a", "internal-api");
        verifyNoMoreInteractions(checks);
    }

    @Test
    void individualSchedulesRespectInstanceMasterAndProjectSwitches() {
        definition("a", "disabled", "API", "EXTERNAL");
        db.update("update check_definitions set enabled=false where check_id='disabled'");
        definition("b", "secondary", "API", "EXTERNAL");
        var visible =
                new CheckQuery(db, new CheckHistoryQuery(db))
                        .apiChecks(0, 50, "name,asc", null, null, null, null, null);
        assertEquals(1, visible.total());
        assertEquals("secondary", visible.items().get(0).get("check_id"));
        db.update("update instances set api_checks_enabled=false where instance_id='b'");
        new ApiCheckScheduler(db, checks, 86_400_000L).runChecks();
        verifyNoInteractions(checks);
        db.update("update instances set api_checks_enabled=true where instance_id='b'");
        new ApiCheckScheduler(db, checks, 86_400_000L).runChecks();
        verify(checks).submitAutomatic("market", "b", "secondary");
        clearInvocations(checks);
        db.update("update projects set enabled=false");
        new ApiCheckScheduler(db, checks, 86_400_000L).runChecks();
        verifyNoInteractions(checks);
    }

    private void definition(String instance, String id, String category, String direction) {
        db.update(
                """
            insert into check_definitions(project_id,instance_id,check_id,name,category,direction,automatic_enabled,discovered_at,last_seen_at)
            values('market',?,?,?, ?,?,?,now(),now())
            """,
                instance,
                id,
                id,
                category,
                direction,
                "API".equals(category));
    }

    @Test
    void unusedApisCanBeListedAndReenabledWithoutLosingResultsOrHistory() {
        definition("a", "unused", "API", "EXTERNAL");
        result("unused", "25 hours");
        db.update(
                "insert into check_result_samples(project_id,instance_id,check_id,status,checked_at,central_received_at) values ('market','a','unused','DOWN',now(),now())");
        var actions = new CheckActionsController(db, checks);
        assertEquals(
                204,
                actions.usage("market", "a", "unused", new CheckActionsController.Usage(false))
                        .getStatusCode()
                        .value());
        assertEquals(
                "API_CHECK_UNUSED", actions.run("market", "a", "unused").getBody().get("code"));
        new ApiCheckScheduler(db, checks, 86_400_000L).runChecks();
        verifyNoInteractions(checks);
        var query = new CheckQuery(db, new CheckHistoryQuery(db));
        assertEquals(
                0, query.apiChecks(0, 50, "name,asc", null, null, null, null, null, true).total());
        var unused = query.apiChecks(0, 50, "name,asc", null, null, null, null, null, false);
        assertEquals(1, unused.total());
        assertEquals(false, unused.items().getFirst().get("monitoring_enabled"));
        assertEquals(1, ((java.util.List<?>) unused.items().getFirst().get("history")).size());
        assertEquals(
                1, db.queryForObject("select count(*) from check_results_latest", Integer.class));
        assertEquals(
                204,
                actions.usage("market", "a", "unused", new CheckActionsController.Usage(true))
                        .getStatusCode()
                        .value());
        new ApiCheckScheduler(db, checks, 86_400_000L).runChecks();
        verify(checks).submitAutomatic("market", "a", "unused");
        when(checks.submit("market", "a", "unused"))
                .thenReturn(CheckRunService.Submission.ACCEPTED);
        assertEquals(202, actions.run("market", "a", "unused").getStatusCode().value());
    }

    @Test
    void usageRejectsInvalidTargetsAndManualInfrastructureChecksStillWork() {
        definition("a", "folder", "INTERNAL", null);
        var actions = new CheckActionsController(db, checks);
        assertEquals(
                400,
                actions.usage("market", "a", "missing", new CheckActionsController.Usage(false))
                        .getStatusCode()
                        .value());
        assertEquals(
                204,
                actions.usage("market", "a", "folder", new CheckActionsController.Usage(false))
                        .getStatusCode()
                        .value());
        assertEquals("CHECK_UNUSED", actions.run("market", "a", "folder").getBody().get("code"));
        assertEquals(
                1,
                new CheckQuery(db, new CheckHistoryQuery(db))
                        .internalChecks("market", "a", 0, 50, "checked_at,desc", null, false)
                        .total());
        assertEquals(
                204,
                actions.usage("market", "a", "folder", new CheckActionsController.Usage(true))
                        .getStatusCode()
                        .value());
        assertEquals(
                400,
                actions.usage("market", "a", "folder", new CheckActionsController.Usage(null))
                        .getStatusCode()
                        .value());
        when(checks.submit("market", "a", "folder"))
                .thenReturn(CheckRunService.Submission.ACCEPTED);
        assertEquals(202, actions.run("market", "a", "folder").getStatusCode().value());
    }

    @Test
    void queuedCheckRechecksUsageBeforeSendingAnythingToAgent() throws Exception {
        definition("a", "unused", "API", "EXTERNAL");
        db.update("update check_definitions set monitoring_enabled=false where check_id='unused'");
        var cipher = mock(com.monitoring.agent.security.TokenCipher.class);
        var store = mock(CheckResultStore.class);
        var service =
                new CheckRunService(
                        db,
                        cipher,
                        store,
                        new tools.jackson.databind.ObjectMapper(),
                        "127.0.0.1/32",
                        1,
                        1,
                        0,
                        1);
        try {
            var execute =
                    CheckRunService.class.getDeclaredMethod(
                            "execute", String.class, String.class, String.class);
            execute.setAccessible(true);
            execute.invoke(service, "market", "a", "unused");
            verifyNoInteractions(cipher, store);
            assertFalse(
                    db.queryForObject(
                            "select exists(select 1 from check_results_latest)", Boolean.class));
        } finally {
            service.destroy();
        }
    }

    @Test
    void settingsControlBothCategoriesAndCustomDueTimesWithoutDisablingManualRuns() {
        definition("a", "fast", "API", "EXTERNAL");
        definition("a", "slow", "API", "INTERNAL");
        definition("a", "folder", "INTERNAL", null);
        var actions = new CheckActionsController(db, checks);
        for (int invalid : new int[] {59, 604801}) {
            assertEquals(
                    400,
                    actions.settings(
                                    "market",
                                    "a",
                                    "fast",
                                    new CheckActionsController.Settings(true, true, invalid))
                            .getStatusCode()
                            .value());
        }
        assertEquals(
                204,
                actions.settings(
                                "market",
                                "a",
                                "fast",
                                new CheckActionsController.Settings(true, true, 60))
                        .getStatusCode()
                        .value());
        assertEquals(
                204,
                actions.settings(
                                "market",
                                "a",
                                "slow",
                                new CheckActionsController.Settings(true, true, 3600))
                        .getStatusCode()
                        .value());
        assertEquals(
                204,
                actions.settings(
                                "market",
                                "a",
                                "folder",
                                new CheckActionsController.Settings(true, true, 300))
                        .getStatusCode()
                        .value());
        result("fast", "2 minutes");
        result("slow", "10 minutes");
        result("folder", "6 minutes");
        var scheduler = new ApiCheckScheduler(db, checks, 86_400_000L);
        scheduler.runChecks();
        verify(checks).submitAutomatic("market", "a", "fast");
        verify(checks).submitAutomatic("market", "a", "folder");
        verifyNoMoreInteractions(checks);
        clearInvocations(checks);
        actions.settings(
                "market", "a", "fast", new CheckActionsController.Settings(true, false, 60));
        db.update("update instances set api_checks_enabled=false");
        scheduler.runChecks();
        verify(checks).submitAutomatic("market", "a", "folder");
        verifyNoMoreInteractions(checks);
        when(checks.submit("market", "a", "fast")).thenReturn(CheckRunService.Submission.ACCEPTED);
        assertEquals(202, actions.run("market", "a", "fast").getStatusCode().value());
        var api =
                new CheckQuery(db, new CheckHistoryQuery(db))
                        .apiChecks(0, 50, "name,asc", null, null, null, null, null);
        assertEquals(
                60,
                api.items().stream()
                        .filter(c -> "fast".equals(c.get("check_id")))
                        .findFirst()
                        .orElseThrow()
                        .get("check_interval_seconds"));
    }

    @Test
    void queuedAutomaticRunRechecksAutomaticSwitchBeforeAgentRequest() throws Exception {
        definition("a", "off", "INTERNAL", null);
        var cipher = mock(com.monitoring.agent.security.TokenCipher.class);
        var store = mock(CheckResultStore.class);
        var service =
                new CheckRunService(
                        db,
                        cipher,
                        store,
                        new tools.jackson.databind.ObjectMapper(),
                        "127.0.0.1/32",
                        1,
                        1,
                        0,
                        1);
        try {
            var execute =
                    CheckRunService.class.getDeclaredMethod(
                            "execute", String.class, String.class, String.class, boolean.class);
            execute.setAccessible(true);
            execute.invoke(service, "market", "a", "off", true);
            verifyNoInteractions(cipher, store);
        } finally {
            service.destroy();
        }
    }

    @Test
    void migrationPreservesOldRepresentativeApiScheduleAndLeavesInternalManual() {
        var flyway =
                Flyway.configure()
                        .dataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword())
                        .locations("classpath:db/migration")
                        .cleanDisabled(false)
                        .target("11")
                        .load();
        flyway.clean();
        flyway.migrate();
        db.update("insert into projects(project_id,display_name) values('market','Market')");
        for (String id : new String[] {"a", "b"}) {
            db.update(
                    "insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv,api_checks_enabled) values('market',?,?,?,decode('00','hex'),decode('00','hex'),true)",
                    id,
                    id,
                    "http://127.0.0.1/" + id);
            for (String category : new String[] {"API", "INTERNAL"}) {
                db.update(
                        "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at) values('market',?,?,?, ?,?,now(),now())",
                        id,
                        category,
                        category,
                        category,
                        "API".equals(category) ? "EXTERNAL" : null);
            }
        }
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        assertEquals(
                java.util.List.of("a/API"),
                db.queryForList(
                        "select instance_id||'/'||check_id from check_definitions where automatic_enabled",
                        String.class));
    }

    private void result(String id, String age) {
        db.update(
                """
            insert into check_results_latest(project_id,instance_id,check_id,status,checked_at,central_received_at)
            values('market','a',?,'UP',now()-(?::interval),now()-(?::interval))
            """,
                id,
                age,
                age);
    }
}
