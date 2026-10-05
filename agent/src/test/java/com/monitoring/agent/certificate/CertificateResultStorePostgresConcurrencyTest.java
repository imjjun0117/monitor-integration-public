package com.monitoring.agent.certificate;

import java.sql.Connection;
import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers
class CertificateResultStorePostgresConcurrencyTest {
    private static final long ADVISORY_LOCK_KEY = 73090301L;
    private static final Duration DB_WAIT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration TRANSACTION_TIMEOUT = Duration.ofSeconds(5);

    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("certificate_result_race")
                    .withUsername("hermes")
                    .withPassword("test-password")
                    .withStartupTimeout(Duration.ofSeconds(60));

    private final ExecutorService transactions = Executors.newFixedThreadPool(2);
    private DriverManagerDataSource dataSource;
    private JdbcTemplate db;
    private TransactionTemplate transaction;

    @BeforeEach
    void migrateAndInstallInsertBarrier() {
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .cleanDisabled(false)
                .load()
                .clean();
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        dataSource =
                new DriverManagerDataSource(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        db = new JdbcTemplate(dataSource);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        db.update("insert into projects(project_id,display_name) values('sample-a','Sample A')");
        db.execute(
                """
            create or replace function block_certificate_latest_insert() returns trigger
            language plpgsql as $$
            begin
              perform pg_advisory_xact_lock(73090301);
              return new;
            end $$
            """);
        db.execute(
                """
            create trigger certificate_latest_insert_barrier
            before insert on certificate_latest
            for each row execute function block_certificate_latest_insert()
            """);
    }

    @AfterEach
    void stopTransactions() throws InterruptedException {
        transactions.shutdownNow();
        assertTrue(
                transactions.awaitTermination(TRANSACTION_TIMEOUT.toSeconds(), TimeUnit.SECONDS));
    }

    @Test
    void targetEditWaitsForInFlightOldVersionStoreThenDeletesItWithoutAStaleLatest()
            throws Exception {
        long targetId = insertTarget();
        CertificateCheckService.Target oldTarget = target(targetId, "old.example", 0L);
        CertificateCheckService.Target newTarget = target(targetId, "new.example", 1L);
        CertificateResultStore store = new CertificateResultStore(db, Clock.systemUTC());
        CountDownLatch storeTransactionStarted = new CountDownLatch(1);
        CountDownLatch editTransactionStarted = new CountDownLatch(1);
        AtomicInteger storeBackend = new AtomicInteger();
        AtomicInteger editBackend = new AtomicInteger();

        try (Connection barrier = dataSource.getConnection()) {
            barrier.setAutoCommit(false);
            try (var statement = barrier.prepareStatement("select pg_advisory_xact_lock(?)")) {
                statement.setLong(1, ADVISORY_LOCK_KEY);
                statement.execute();
            }

            Future<Boolean> stored =
                    transactions.submit(
                            () ->
                                    transaction.execute(
                                            status -> {
                                                setBoundedDatabaseTimeouts();
                                                storeBackend.set(
                                                        db.queryForObject(
                                                                "select pg_backend_pid()",
                                                                Integer.class));
                                                storeTransactionStarted.countDown();
                                                return store.failure(oldTarget);
                                            }));
            assertTrue(
                    storeTransactionStarted.await(
                            DB_WAIT_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS));
            awaitDatabaseWait(storeBackend.get(), "advisory");

            Future<int[]> edited =
                    transactions.submit(
                            () ->
                                    transaction.execute(
                                            status -> {
                                                setBoundedDatabaseTimeouts();
                                                editBackend.set(
                                                        db.queryForObject(
                                                                "select pg_backend_pid()",
                                                                Integer.class));
                                                editTransactionStarted.countDown();
                                                int updated =
                                                        db.update(
                                                                """
                    update certificate_targets set hostname=?,sni_hostname=?,
                      target_version=target_version+1 where certificate_target_id=?
                    """,
                                                                newTarget.hostname(),
                                                                newTarget.sniHostname(),
                                                                targetId);
                                                int deleted =
                                                        db.update(
                                                                "delete from certificate_latest where certificate_target_id=?",
                                                                targetId);
                                                return new int[] {updated, deleted};
                                            }));
            assertTrue(
                    editTransactionStarted.await(
                            DB_WAIT_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS));
            awaitDatabaseWait(editBackend.get(), "transactionid");
            assertFalse(edited.isDone(), "target edit must remain blocked by the store row lock");

            barrier.commit();

            assertTrue(stored.get(TRANSACTION_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS));
            int[] editResult = edited.get(TRANSACTION_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            assertEquals(1, editResult[0]);
            assertEquals(1, editResult[1]);
            assertEquals(0, latestCount(targetId));
            assertEquals(
                    1L,
                    db.queryForObject(
                            """
                select target_version from certificate_targets where certificate_target_id=?
                """,
                            Long.class,
                            targetId));
            assertEquals(
                    "new.example",
                    db.queryForObject(
                            """
                select hostname from certificate_targets where certificate_target_id=?
                """,
                            String.class,
                            targetId));
        }

        assertFalse(
                store.failure(oldTarget),
                "the old target version must stay rejected after edit commit");
        assertTrue(store.failure(newTarget));
        assertEquals(1, latestCount(targetId));
    }

    private void setBoundedDatabaseTimeouts() {
        db.execute("set local lock_timeout = '3s'");
        db.execute("set local statement_timeout = '4s'");
    }

    private void awaitDatabaseWait(int backendPid, String expectedWaitEvent)
            throws InterruptedException {
        long deadline = System.nanoTime() + DB_WAIT_TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            String waitEvent =
                    db.query(
                            """
                select wait_event from pg_stat_activity where pid=?
                """,
                            result -> result.next() ? result.getString(1) : null,
                            backendPid);
            if (expectedWaitEvent.equals(waitEvent)) {
                return;
            }
            TimeUnit.MILLISECONDS.sleep(10);
        }
        throw new AssertionError(
                "backend "
                        + backendPid
                        + " did not wait on "
                        + expectedWaitEvent
                        + " within "
                        + DB_WAIT_TIMEOUT.toMillis()
                        + "ms");
    }

    private long insertTarget() {
        return db.queryForObject(
                """
            insert into certificate_targets(project_id,hostname,port,sni_hostname)
            values('sample-a','old.example',443,'old.example') returning certificate_target_id
            """,
                Long.class);
    }

    private int latestCount(long targetId) {
        return db.queryForObject(
                """
            select count(*) from certificate_latest where certificate_target_id=?
            """,
                Integer.class,
                targetId);
    }

    private CertificateCheckService.Target target(long id, String hostname, long version) {
        return new CertificateCheckService.Target(id, "sample-a", hostname, 443, hostname, version);
    }
}
