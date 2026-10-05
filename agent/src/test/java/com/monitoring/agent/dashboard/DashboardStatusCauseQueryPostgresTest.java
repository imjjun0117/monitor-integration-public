package com.monitoring.agent.dashboard;

import static org.junit.jupiter.api.Assertions.*;

import com.monitoring.agent.metric.ThresholdResolver;
import java.time.Duration;
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

@Testcontainers
final class DashboardStatusCauseQueryPostgresTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("dashboard_causes")
                    .withUsername("hermes")
                    .withPassword("test-password")
                    .withStartupTimeout(Duration.ofSeconds(60));

    private JdbcTemplate db;

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
        db =
                new JdbcTemplate(
                        new DriverManagerDataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword()));
        db.update("insert into projects(project_id,display_name) values ('p1','P1'),('p2','P2')");
        db.update(
                "insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv,last_seen_at) values ('p1','i1','I1','https://i1',decode('00','hex'),decode('00','hex'),now()),('p2','i2','I2','https://i2',decode('00','hex'),decode('00','hex'),now())");
        db.update(
                "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at) values ('p1','i1','api','API','API','EXTERNAL',now(),now()),('p2','i2','api','API','API','EXTERNAL',now(),now()),('p1','i1','internal','Internal','INTERNAL',null,now(),now())");
        db.update(
                "insert into check_results_latest values ('p1','i1','api','WARN',800,null,'secret raw message',now(),now()),('p2','i2','api','UP',800,null,'secret',now(),now()),('p1','i1','internal','DOWN',4,'API_CHECK_ERROR','secret',now(),now())");
        db.update(
                "insert into thresholds(scope,project_id,metric_key,warning_value,critical_value) values ('PROJECT','p1','API_LATENCY_MS',500,1000)");
        db.update(
                "insert into certificate_targets(certificate_target_id,project_id,hostname,port,sni_hostname) values (1,'p1','sha1.example',443,'sha1.example')");
        db.update(
                "insert into certificate_latest(certificate_target_id,days_remaining,chain_valid,hostname_valid,signature_algorithm,status,message,checked_at) values (1,90,true,true,'SHA1withRSA','WARN','secret tls detail',now())");
    }

    @Test
    void serviceCardsUseEachProjectsVendorProfileAndRespectVisibilityAndUsage() {
        String profile =
                "{\"title\":\"다른 업체\",\"dashboard\":true,\"fields\":[{\"key\":\"left\",\"label\":\"잔여 건수\",\"source\":\"DETAILS\",\"path\":\"$.remaining\",\"kind\":\"NUMBER\",\"required\":true}]}";
        db.update(
                "update check_definitions set service_profile_json=cast(? as jsonb) where category='API'",
                profile);
        db.update(
                "update check_results_latest set evidence_json='{\"details\":{\"remaining\":37}}'::jsonb where check_id='api'");
        var query =
                new DashboardQuery(
                        db, new DashboardStatusCauseQuery(db, new ThresholdResolver(db)));
        @SuppressWarnings("unchecked")
        var cards = (List<Map<String, Object>>) query.dashboard().get("service_balances");
        assertEquals(2, cards.size());
        assertTrue(cards.stream().noneMatch(card -> card.containsKey("service_profile_json")));
        assertEquals("다른 업체", ((Map<?, ?>) cards.getFirst().get("service_info")).get("title"));
        db.update(
                "update check_definitions set service_profile_json=jsonb_set(service_profile_json,'{dashboard}','false') where project_id='p1' and category='API'");
        cards = (List<Map<String, Object>>) query.dashboard().get("service_balances");
        assertEquals(1, cards.size());
        assertEquals("p2", cards.getFirst().get("project_id"));
        db.update("update check_definitions set monitoring_enabled=false where project_id='p2'");
        assertTrue(((List<?>) query.dashboard().get("service_balances")).isEmpty());
    }

    @Test
    @SuppressWarnings("unchecked")
    void projectHistoryKeepsHourlyPeaksSeparateAndMissingCapacitiesUnknown() {
        db.update(
                "insert into projects(project_id,display_name,enabled) values ('disabled','Disabled',false)");
        db.update(
                """
            insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv,enabled)
            values ('p1','i3','I3','https://i3',decode('00','hex'),decode('00','hex'),true),
              ('p1','disabled','Disabled','https://disabled',decode('00','hex'),decode('00','hex'),false),
              ('disabled','i','Disabled','https://disabled-project',decode('00','hex'),decode('00','hex'),true)
            """);
        db.update(
                """
            insert into instance_metric_samples(project_id,instance_id,sampled_at,system_cpu_ratio,
              heap_used_bytes,heap_max_bytes,physical_memory_used_bytes,physical_memory_total_bytes)
            values ('p1','i1',date_trunc('hour',now())-interval '3 hours'+interval '5 minutes',.2,20,100,60,100),
              ('p1','i3',date_trunc('hour',now())-interval '3 hours'+interval '10 minutes',.8,40,200,100,200),
              ('p1','i1',date_trunc('hour',now())-interval '3 hours'+interval '15 minutes',.6,50,100,90,100),
              ('p2','i2',date_trunc('hour',now())-interval '3 hours'+interval '5 minutes',.1,3,100,50,0),
              ('p2','i2',now()-interval '25 hours',.95,100,100,100,100),
              ('p1','disabled',date_trunc('hour',now())-interval '3 hours'+interval '20 minutes',1,100,100,100,100),
              ('disabled','i',date_trunc('hour',now())-interval '3 hours'+interval '20 minutes',1,100,100,100,100)
            """);
        db.update(
                """
            insert into disk_samples(project_id,instance_id,sampled_at,path_id,used_bytes,total_bytes,status)
            values ('p1','i1',date_trunc('hour',now())-interval '3 hours'+interval '5 minutes','data',20,100,'UP'),
              ('p1','i3',date_trunc('hour',now())-interval '3 hours'+interval '10 minutes','logs',90,100,'UP'),
              ('p2','i2',date_trunc('hour',now())-interval '3 hours'+interval '5 minutes','unknown',99,0,'UNKNOWN'),
              ('p1','disabled',date_trunc('hour',now())-interval '3 hours'+interval '20 minutes','data',100,100,'UP')
            """);
        var result =
                new DashboardQuery(db, new DashboardStatusCauseQuery(db, new ThresholdResolver(db)))
                        .dashboard("24h");
        var rows = (List<Map<String, Object>>) ((Map<?, ?>) result.get("history")).get("resources");
        assertEquals(50, rows.size());
        assertTrue(rows.stream().noneMatch(row -> "disabled".equals(row.get("project_id"))));
        var first =
                rows.stream()
                        .filter(
                                row ->
                                        "p1".equals(row.get("project_id"))
                                                && row.get("system_cpu_ratio") != null)
                        .findFirst()
                        .orElseThrow();
        var second =
                rows.stream()
                        .filter(
                                row ->
                                        "p2".equals(row.get("project_id"))
                                                && row.get("system_cpu_ratio") != null)
                        .findFirst()
                        .orElseThrow();
        assertEquals(.8, ((Number) first.get("system_cpu_ratio")).doubleValue(), .00001);
        assertEquals(.5, ((Number) first.get("heap_ratio")).doubleValue(), .00001);
        assertEquals(.9, ((Number) first.get("physical_memory_ratio")).doubleValue(), .00001);
        assertEquals(.9, ((Number) first.get("disk_ratio")).doubleValue(), .00001);
        assertEquals(.1, ((Number) second.get("system_cpu_ratio")).doubleValue(), .00001);
        assertNull(second.get("physical_memory_ratio"));
        assertNull(second.get("disk_ratio"));
        assertEquals(48, rows.stream().filter(row -> row.get("system_cpu_ratio") == null).count());
    }

    @Test
    void resolvesScopedApiAndSafeCertificateCausesWithoutMessages() {
        List<Map<String, Object>> rows =
                new DashboardStatusCauseQuery(db, new ThresholdResolver(db)).find(List.of());
        Map<String, Object> api =
                rows.stream()
                        .filter(r -> "api".equals(r.get("subject_id")))
                        .findFirst()
                        .orElseThrow();
        assertEquals("API", api.get("check_category"));
        assertEquals("API_LATENCY_MS", api.get("metric_key"));
        assertEquals(800d, ((Number) api.get("value")).doubleValue());
        assertEquals(500d, ((Number) api.get("warning_value")).doubleValue());
        assertFalse(
                rows.stream()
                        .anyMatch(
                                r ->
                                        "p2".equals(r.get("project_id"))
                                                && "api".equals(r.get("subject_id"))));
        Map<String, Object> internal =
                rows.stream()
                        .filter(r -> "internal".equals(r.get("subject_id")))
                        .findFirst()
                        .orElseThrow();
        assertEquals("INTERNAL", internal.get("check_category"));
        assertNull(internal.get("metric_key"));
        Map<String, Object> cert =
                rows.stream()
                        .filter(r -> "CERTIFICATE".equals(r.get("kind")))
                        .findFirst()
                        .orElseThrow();
        assertEquals("CERT_SHA1_DETECTED", cert.get("result_code"));
        assertNull(cert.get("value"));
        assertTrue(rows.stream().noneMatch(r -> r.containsKey("message")));
    }

    @Test
    void failedApiCountUsesEnabledOperationalStatusCausesOnly() {
        db.update(
                "update check_results_latest set status='DOWN' where project_id='p1' and instance_id='i1' and check_id='api'");
        db.update(
                "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,enabled,discovered_at,last_seen_at) values ('p1','i1','disabled-api','Disabled API','API','EXTERNAL',false,now(),now())");
        db.update(
                "insert into check_results_latest values ('p1','i1','disabled-api','DOWN',1,null,'secret',now(),now())");
        db.update(
                "insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv,enabled,last_seen_at) values ('p1','disabled-instance','Disabled','https://disabled-instance',decode('00','hex'),decode('00','hex'),false,now())");
        db.update(
                "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at) values ('p1','disabled-instance','api','API','API','EXTERNAL',now(),now())");
        db.update(
                "insert into check_results_latest values ('p1','disabled-instance','api','DOWN',1,null,'secret',now(),now())");
        db.update(
                "insert into projects(project_id,display_name,enabled) values ('disabled-project','Disabled',false)");
        db.update(
                "insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv,last_seen_at) values ('disabled-project','i1','I1','https://disabled-project',decode('00','hex'),decode('00','hex'),now())");
        db.update(
                "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at) values ('disabled-project','i1','api','API','API','EXTERNAL',now(),now())");
        db.update(
                "insert into check_results_latest values ('disabled-project','i1','api','DOWN',1,null,'secret',now(),now())");

        Map<String, Object> response =
                new DashboardController(
                                new DashboardQuery(
                                        db,
                                        new DashboardStatusCauseQuery(
                                                db, new ThresholdResolver(db))))
                        .dashboard("24h");

        assertEquals(1L, response.get("failed_api_count"));
        List<?> causes = (List<?>) response.get("status_causes");
        assertEquals(
                1,
                causes.stream()
                        .filter(
                                row ->
                                        "CHECK".equals(((Map<?, ?>) row).get("kind"))
                                                && "API"
                                                        .equals(
                                                                ((Map<?, ?>) row)
                                                                        .get("check_category"))
                                                && "DOWN".equals(((Map<?, ?>) row).get("status")))
                        .count());
        assertTrue(
                causes.stream()
                        .noneMatch(
                                row ->
                                        "p2".equals(((Map<?, ?>) row).get("project_id"))
                                                && "api"
                                                        .equals(
                                                                ((Map<?, ?>) row)
                                                                        .get("subject_id"))));
    }

    @Test
    void unusedApiDoesNotAffectOutageCountCausesOrOverviewHistory() {
        db.update(
                "update check_results_latest set status='DOWN' where project_id='p1' and check_id='api'");
        db.update(
                "insert into check_result_samples(project_id,instance_id,check_id,status,checked_at,central_received_at) values ('p1','i1','api','DOWN',now(),now())");
        var query =
                new DashboardQuery(
                        db, new DashboardStatusCauseQuery(db, new ThresholdResolver(db)));
        assertEquals(1L, query.dashboard().get("failed_api_count"));
        db.update(
                "update check_definitions set monitoring_enabled=false where project_id='p1' and check_id='api'");
        var dashboard = query.dashboard();
        assertEquals(0L, dashboard.get("failed_api_count"));
        assertFalse(
                ((List<?>) dashboard.get("status_causes"))
                        .stream()
                                .anyMatch(
                                        row ->
                                                "p1".equals(((Map<?, ?>) row).get("project_id"))
                                                        && "api"
                                                                .equals(
                                                                        ((Map<?, ?>) row)
                                                                                .get(
                                                                                        "subject_id"))));
        assertTrue(((List<?>) ((Map<?, ?>) dashboard.get("history")).get("api")).isEmpty());
        assertEquals(
                1, db.queryForObject("select count(*) from check_result_samples", Integer.class));
    }

    @Test
    void
            collectionRemainsHealthyWhenInternalCheckFailsAndUnusedResultStopsAffectingStatusImmediately() {
        db.update(
                "update check_results_latest set status='UP',duration_ms=100 where check_id='api'");
        db.update(
                "update check_results_latest set result_code=null,message='INTERNAL_CHECK_FAILED' where check_id='internal'");
        db.update(
                "insert into instance_snapshot_latest(project_id,instance_id,central_received_at,agent_observed_at,status) values('p1','i1',now(),now(),'DOWN')");
        var query =
                new DashboardQuery(
                        db, new DashboardStatusCauseQuery(db, new ThresholdResolver(db)));
        var dashboard = query.dashboard();
        Map<?, ?> instance =
                (Map<?, ?>)
                        ((List<?>)
                                        ((Map<?, ?>)
                                                        ((List<?>) dashboard.get("projects"))
                                                                .getFirst())
                                                .get("instances"))
                                .getFirst();
        assertEquals("UP", instance.get("collection_status"));
        assertEquals("DOWN", instance.get("status"));
        assertTrue(
                ((List<?>) dashboard.get("status_causes"))
                        .stream()
                                .anyMatch(
                                        c ->
                                                "INTERNAL_CHECK_FAILED"
                                                        .equals(
                                                                ((Map<?, ?>) c)
                                                                        .get("result_code"))));
        db.update(
                "update check_definitions set monitoring_enabled=false where check_id='internal'");
        dashboard = query.dashboard();
        instance =
                (Map<?, ?>)
                        ((List<?>)
                                        ((Map<?, ?>)
                                                        ((List<?>) dashboard.get("projects"))
                                                                .getFirst())
                                                .get("instances"))
                                .getFirst();
        assertEquals("UP", instance.get("status"));
        assertEquals("0/0", instance.get("internal_checks"));
        assertEquals(
                "DOWN",
                db.queryForObject("select status from instance_snapshot_latest", String.class));
        assertTrue(
                ((List<?>) dashboard.get("status_causes"))
                        .stream()
                                .noneMatch(
                                        c -> "internal".equals(((Map<?, ?>) c).get("subject_id"))));
    }

    @Test
    void dashboardApiCountsOnlyCertificateExpiryCause() {
        db.update(
                "insert into certificate_targets(certificate_target_id,project_id,hostname,port,sni_hostname) values (2,'p1','expiring.example',443,'expiring.example')");
        db.update(
                "insert into certificate_latest(certificate_target_id,days_remaining,chain_valid,hostname_valid,signature_algorithm,status,message,checked_at) values (2,10,true,true,'SHA256withRSA','WARN','expiry',now())");
        Map<String, Object> response =
                new DashboardController(
                                new DashboardQuery(
                                        db,
                                        new DashboardStatusCauseQuery(
                                                db, new ThresholdResolver(db))))
                        .dashboard("24h");
        assertEquals(1L, response.get("expiring_certificate_count"));
        assertEquals(
                2,
                ((List<?>) response.get("status_causes"))
                        .stream()
                                .filter(row -> "CERTIFICATE".equals(((Map<?, ?>) row).get("kind")))
                                .count());
    }

    @Test
    void dashboardIncludesRamAndHighestDiskRatiosWithoutTreatingUnknownCapacityAsZero() {
        db.update(
                """
            insert into instance_snapshot_latest(project_id,instance_id,central_received_at,
              agent_observed_at,status,physical_memory_used_bytes,physical_memory_total_bytes)
            values ('p1','i1',now(),now(),'UP',75,100),('p2','i2',now(),now(),'UP',50,0)
            """);
        db.update(
                """
            insert into disk_latest(project_id,instance_id,path_id,path_display,used_bytes,total_bytes,status)
            values ('p1','i1','data','data',20,100,'UP'),('p1','i1','logs','logs',90,100,'UP'),
              ('p1','i1','unknown','unknown',99,null,'UNKNOWN'),('p2','i2','unknown','unknown',10,0,'UNKNOWN')
            """);
        Map<String, Object> response =
                new DashboardQuery(db, new DashboardStatusCauseQuery(db, new ThresholdResolver(db)))
                        .dashboard("24h");
        List<?> projects = (List<?>) response.get("projects");
        Map<?, ?> first =
                (Map<?, ?>) ((List<?>) ((Map<?, ?>) projects.get(0)).get("instances")).get(0);
        Map<?, ?> second =
                (Map<?, ?>) ((List<?>) ((Map<?, ?>) projects.get(1)).get("instances")).get(0);
        assertEquals(.75, ((Number) first.get("physical_memory_ratio")).doubleValue(), .00001);
        assertEquals(.9, ((Number) first.get("disk_ratio")).doubleValue(), .00001);
        assertNull(second.get("physical_memory_ratio"));
        assertNull(second.get("disk_ratio"));
    }

    @Test
    void dashboardReturnsActualBalanceEvidenceAndPreservesMissingValuesAndUsage() {
        db.update(
                """
            insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at)
            values ('p1','i1','popbill','Popbill','API','EXTERNAL',now(),now()),
              ('p2','i2','popbill','Popbill','API','EXTERNAL',now(),now())
            """);
        db.update(
                """
            insert into check_results_latest(project_id,instance_id,check_id,status,checked_at,central_received_at,evidence_json)
            values ('p1','i1','popbill','WARN',now(),now(),
              '{"details":{"kind":"POPBILL_BALANCE","balance":500,"sms_unit_cost":20,"charged_points_30d":30000,"charge_history_complete":true}}')
            """);
        var query =
                new DashboardQuery(
                        db, new DashboardStatusCauseQuery(db, new ThresholdResolver(db)));
        var rows = (List<?>) query.dashboard().get("service_balances");
        assertEquals(2, rows.size());
        var collected = (Map<?, ?>) rows.getFirst();
        var details = (tools.jackson.databind.JsonNode) collected.get("details");
        assertEquals(500, details.path("balance").asInt());
        assertEquals(30000, details.path("charged_points_30d").asInt());
        assertEquals("P1", collected.get("project_name"));
        assertFalse(collected.containsKey("evidence_json"));
        assertFalse(((Map<?, ?>) rows.get(1)).containsKey("details"));
        db.update(
                "update check_definitions set monitoring_enabled=false where project_id='p1' and check_id='popbill'");
        rows = (List<?>) query.dashboard().get("service_balances");
        assertEquals(1, rows.size());
        assertEquals("p2", ((Map<?, ?>) rows.getFirst()).get("project_id"));
        db.update("update instances set enabled=false where project_id='p2'");
        assertTrue(((List<?>) query.dashboard().get("service_balances")).isEmpty());
    }
}
