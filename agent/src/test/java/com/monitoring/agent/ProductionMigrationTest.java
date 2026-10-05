package com.monitoring.agent;

import java.time.Duration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Testcontainers
class ProductionMigrationTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("hermes_production_migration")
                    .withUsername("hermes")
                    .withPassword("test-password")
                    .withStartupTimeout(Duration.ofSeconds(60));

    @Test
    void upgradesTheHistoricalFixtureV2WithoutChecksumRepair() {
        Flyway legacy =
                Flyway.configure()
                        .dataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword())
                        .locations("classpath:db/migration")
                        .target("2")
                        .cleanDisabled(false)
                        .load();
        legacy.clean();
        legacy.migrate();
        DriverManagerDataSource dataSource =
                new DriverManagerDataSource(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        JdbcTemplate db = new JdbcTemplate(dataSource);
        assertEquals(2, db.queryForObject("select count(*) from projects", Integer.class));
        db.update(
                """
            insert into check_results_latest(project_id,instance_id,check_id,status,checked_at)
            values('orphan-project','orphan-instance','orphan-check','UNKNOWN',now())
            """);
        db.update(
                """
            insert into check_result_samples(project_id,instance_id,check_id,status,checked_at)
            values('orphan-project','orphan-instance','orphan-check','UNKNOWN',now())
            """);

        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();

        assertEquals(0, db.queryForObject("select count(*) from projects", Integer.class));
        assertEquals(0, db.queryForObject("select count(*) from instances", Integer.class));
        assertEquals(
                0, db.queryForObject("select count(*) from check_results_latest", Integer.class));
        assertEquals(
                0, db.queryForObject("select count(*) from check_result_samples", Integer.class));
        assertEquals(
                2,
                db.queryForObject(
                        """
            select count(*) from pg_constraint
            where conname in ('check_results_latest_instance_fk',
              'check_result_samples_instance_fk') and convalidated
            """,
                        Integer.class));
        assertEquals(7, db.queryForObject("select count(*) from thresholds", Integer.class));
    }

    @Test
    void freshProductionMigrationContainsNoSampleProjectsOrInstances() {
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        DriverManagerDataSource dataSource =
                new DriverManagerDataSource(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        JdbcTemplate db = new JdbcTemplate(dataSource);

        assertEquals(0, db.queryForObject("select count(*) from projects", Integer.class));
        assertEquals(0, db.queryForObject("select count(*) from instances", Integer.class));
        assertEquals(
                0, db.queryForObject("select count(*) from check_results_latest", Integer.class));
        assertEquals(
                0, db.queryForObject("select count(*) from check_result_samples", Integer.class));
        assertEquals(
                2,
                db.queryForObject(
                        """
            select count(*) from pg_constraint
            where conname in ('check_results_latest_instance_fk',
              'check_result_samples_instance_fk') and convalidated
            """,
                        Integer.class));
        assertEquals(7, db.queryForObject("select count(*) from thresholds", Integer.class));
        assertEquals(
                1,
                db.queryForObject(
                        """
            select count(*) from information_schema.columns
            where table_name='certificate_targets' and column_name='target_version'
            """,
                        Integer.class));

        db.update(
                "insert into projects(project_id,display_name) values('direction-test','Direction test')");
        db.update(
                """
            insert into instances(
              project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv)
            values('direction-test','instance-01','Instance','http://agent.example',
              decode('00','hex'),decode('00','hex'))
            """);
        db.update(
                """
            insert into check_definitions(
              project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at)
            values
              ('direction-test','instance-01','internal-check','Internal','INTERNAL',null,now(),now()),
              ('direction-test','instance-01','private-api','Private API','API','INTERNAL',now(),now()),
              ('direction-test','instance-01','public-api','Public API','API','EXTERNAL',now(),now())
            """);
        assertEquals(
                3,
                db.queryForObject(
                        "select count(*) from check_definitions where project_id='direction-test'",
                        Integer.class));
        assertThrows(
                org.springframework.dao.DataIntegrityViolationException.class,
                () ->
                        db.update(
                                """
            insert into check_definitions(
              project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at)
            values('direction-test','instance-01','invalid-internal','Invalid',
              'INTERNAL','EXTERNAL',now(),now())
            """));
        assertThrows(
                org.springframework.dao.DataIntegrityViolationException.class,
                () ->
                        db.update(
                                """
            insert into check_definitions(
              project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at)
            values('direction-test','instance-01','invalid-api','Invalid','API',null,now(),now())
            """));
    }
}
