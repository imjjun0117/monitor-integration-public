package com.hermes.monitoring.center.check;

import com.hermes.monitoring.center.metric.ThresholdResolver;
import java.sql.Connection;
import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers
class CheckResultDeletionRacePostgresTest {
    private static final long BARRIER_KEY = 73090302L;
    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("check_result_delete_race")
                    .withUsername("hermes")
                    .withPassword("test-password")
                    .withStartupTimeout(Duration.ofSeconds(60));

    private final ExecutorService workers = Executors.newSingleThreadExecutor();
    private DriverManagerDataSource dataSource;
    private JdbcTemplate db;
    private CheckResultStore store;

    @BeforeEach
    void migrateAndSeed() {
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
        dataSource =
                new DriverManagerDataSource(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        db = new JdbcTemplate(dataSource);
        TransactionTemplate transaction =
                new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        store = new CheckResultStore(db, transaction, new ThresholdResolver(db));
        seed("target", "target-instance", "target-check");
        seed("collateral", "collateral-instance", "collateral-check");
        db.execute(
                """
            create function block_late_check_result() returns trigger language plpgsql as $$
            begin
              perform pg_advisory_xact_lock(73090302);
              return new;
            end $$
            """);
        db.execute(
                """
            create trigger late_check_result_barrier before insert on check_results_latest
            for each row execute function block_late_check_result()
            """);
    }

    @AfterEach
    void stopWorkers() throws InterruptedException {
        workers.shutdownNow();
        assertTrue(workers.awaitTermination(TIMEOUT.toSeconds(), TimeUnit.SECONDS));
    }

    @Test
    void lateFailureAfterPermanentInstanceDeletionCannotRecreateOrphans() throws Exception {
        raceDeletion(
                false,
                () -> {
                    db.update(
                            "delete from check_definitions where project_id='target' and instance_id='target-instance'");
                    db.update(
                            "delete from instances where project_id='target' and instance_id='target-instance'");
                });
        assertEquals(1, count("check_definitions", "collateral"));
        assertEquals(1, count("instances", "collateral"));
    }

    @Test
    void lateSuccessAfterPermanentProjectDeletionCannotRecreateOrphans() throws Exception {
        raceDeletion(
                true,
                () -> {
                    db.update("delete from check_definitions where project_id='target'");
                    db.update("delete from instances where project_id='target'");
                    db.update("delete from projects where project_id='target'");
                });
        assertEquals(1, count("projects", "collateral"));
        assertEquals(1, count("check_definitions", "collateral"));
    }

    private void raceDeletion(boolean success, Runnable deletion) throws Exception {
        tools.jackson.databind.JsonNode result =
                new tools.jackson.databind.ObjectMapper()
                        .readTree(
                                """
            {"check_id":"target-check","status":"UP","duration_ms":1,
             "result_code":"200","message":"ok","checked_at":"2026-09-08T00:00:00Z"}
            """);
        try (Connection barrier = dataSource.getConnection()) {
            barrier.setAutoCommit(false);
            try (var statement = barrier.prepareStatement("select pg_advisory_xact_lock(?)")) {
                statement.setLong(1, BARRIER_KEY);
                statement.execute();
            }
            Future<?> lateWrite =
                    workers.submit(
                            () -> {
                                if (success) {
                                    store.save("target", "target-instance", "target-check", result);
                                } else {
                                    store.failed("target", "target-instance", "target-check");
                                }
                            });
            awaitWait();
            deletion.run();
            barrier.commit();
            try {
                lateWrite.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            } catch (ExecutionException error) {
                assertTrue(
                        error.getCause() instanceof DataIntegrityViolationException,
                        error.toString());
            }
        }
        assertEquals(0, count("check_results_latest", "target"));
        assertEquals(0, count("check_result_samples", "target"));
        assertEquals(0, count("check_definitions", "target"));
    }

    private void awaitWait() throws InterruptedException {
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            Integer waiters =
                    db.queryForObject(
                            """
                select count(*) from pg_stat_activity
                where wait_event='advisory' and query like 'insert into check_results_latest%'
                """,
                            Integer.class);
            if (waiters != null && waiters > 0) {
                return;
            }
            TimeUnit.MILLISECONDS.sleep(10);
        }
        throw new AssertionError("late result write did not reach database barrier");
    }

    private void seed(String project, String instance, String check) {
        db.update("insert into projects(project_id,display_name) values(?,?)", project, project);
        db.update(
                """
            insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv)
            values(?,?,?, ?,decode('00','hex'),decode('00','hex'))
            """,
                project,
                instance,
                instance,
                "http://" + project + ".example");
        db.update(
                """
            insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at)
            values(?,?,?,?,'API','EXTERNAL',now(),now())
            """,
                project,
                instance,
                check,
                check);
    }

    private int count(String table, String project) {
        return db.queryForObject(
                "select count(*) from " + table + " where project_id=?", Integer.class, project);
    }
}
