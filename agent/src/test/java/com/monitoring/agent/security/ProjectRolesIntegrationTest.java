package com.monitoring.agent.security;

import java.util.Base64;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
@SpringBootTest(
        properties = {
            "HERMES_ADMIN_USERNAME=admin",
            "HERMES_ADMIN_PASSWORD_HASH=$2a$10$abcdefghijklmnopqrstuu12345678901234567890123456789012",
            "spring.profiles.active=e2e",
            "hermes.sample-fixtures.enabled=false",
            "hermes.agent-allowed-cidrs=127.0.0.1/32",
            "hermes.agent-allowlist-file="
        })
class ProjectRolesIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("roles")
                    .withUsername("hermes")
                    .withPassword("test-password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", postgres::getJdbcUrl);
        properties.add("spring.datasource.username", postgres::getUsername);
        properties.add("spring.datasource.password", postgres::getPassword);
        properties.add("hermes.master-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
    }

    @Autowired JdbcTemplate db;
    @Autowired WebApplicationContext context;
    @Autowired TokenCipher tokenCipher;
    MockMvc mvc;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        db.update(
                "insert into projects(project_id,display_name) values('rbac-a','Allowed'),('rbac-b','Private') on conflict(project_id) do nothing");
        db.update(
                "insert into instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv,enabled) values('rbac-a','dev','Allowed server','https://allowed.example',decode('00','hex'),decode('00','hex'),false),('rbac-b','dev','Private server','https://private.example',decode('00','hex'),decode('00','hex'),false) on conflict(project_id,instance_id) do nothing");
        db.update(
                "insert into check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at) values('rbac-a','dev','api','Allowed API','API','EXTERNAL',now(),now()),('rbac-b','dev','api','Private API','API','EXTERNAL',now(),now()) on conflict(project_id,instance_id,check_id) do update set monitoring_enabled=true,automatic_enabled=true,check_interval_seconds=300");
        db.update(
                "insert into app_users(username,password_hash,role) values('operator','unused','OPERATOR'),('viewer','unused','VIEWER') on conflict(username) do update set role=excluded.role,enabled=true,security_version=0");
        db.update("delete from user_project_access where username in ('operator','viewer')");
        db.update(
                "insert into user_project_access(username,project_id) values('operator','rbac-a'),('viewer','rbac-a')");
        db.update("delete from audit_log");
    }

    @Test
    void projectScopeAppliesToListsTotalsDashboardAndDirectUrls() throws Exception {
        mvc.perform(get("/api/v1/projects").with(user("viewer").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].project_id").value("rbac-a"));
        mvc.perform(get("/api/v1/dashboard?period=365d").with(user("viewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects.length()").value(1))
                .andExpect(jsonPath("$.projects[0].project_id").value("rbac-a"));
        mvc.perform(get("/api/v1/api-checks").with(user("viewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].project_id").value("rbac-a"));
        mvc.perform(get("/api/v1/projects/rbac-b/instances/dev/resources").with(user("viewer")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/session/me").with(user("viewer").roles("ADMIN")))
                .andExpect(jsonPath("$.role").value("VIEWER"));
        db.update("delete from user_project_access where username='viewer'");
        mvc.perform(get("/api/v1/projects").with(user("viewer")))
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void viewerAndUnassignedOperatorWritesAreDeniedAndAuthorizedChangesHaveBeforeAndAfter()
            throws Exception {
        String body =
                "{\"monitoringEnabled\":false,\"automaticEnabled\":false,\"checkIntervalSeconds\":600}";
        mvc.perform(
                        put("/api/v1/api-checks/rbac-a/dev/api/settings")
                                .with(user("viewer").roles("ADMIN"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        put("/api/v1/api-checks/rbac-b/dev/api/settings")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        put("/api/v1/api-checks/rbac-a/dev/api/settings")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isNoContent());
        assertEquals(
                1,
                db.queryForObject(
                        "select count(*) from audit_log where actor='operator' and entity_type='check_definitions' and before_values->>'monitoring_enabled'='true' and after_values->>'monitoring_enabled'='false'",
                        Integer.class));
        assertEquals(
                2,
                db.queryForObject(
                        "select count(*) from audit_log where outcome='DENIED'", Integer.class));
        mvc.perform(get("/api/v1/settings/users").with(user("operator")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/settings/audit").with(user("viewer")))
                .andExpect(status().isForbidden());
    }

    @Test
    void bodyScopeIsCheckedForThresholdsAndCertificateReassignment() throws Exception {
        String global =
                "[{\"scope\":\"GLOBAL\",\"projectId\":null,\"instanceId\":null,\"metricKey\":\"SYSTEM_CPU\",\"warningValue\":0.7,\"criticalValue\":0.9}]";
        mvc.perform(
                        put("/api/v1/settings/thresholds")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(global))
                .andExpect(status().isForbidden());
        String own =
                global.replace("GLOBAL", "PROJECT")
                        .replace("\"projectId\":null", "\"projectId\":\"rbac-a\"");
        mvc.perform(
                        put("/api/v1/settings/thresholds")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(own))
                .andExpect(status().isOk());
        mvc.perform(
                        put("/api/v1/settings/thresholds")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(own.replace("rbac-a", "rbac-b")))
                .andExpect(status().isForbidden());
        String cert =
                "{\"projectId\":\"rbac-b\",\"hostname\":\"private.example\",\"port\":443,\"sniHostname\":\"private.example\",\"enabled\":true,\"checkIntervalMinutes\":360}";
        mvc.perform(
                        post("/api/v1/certificates")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(cert))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post("/api/v1/certificates")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(cert.replace("rbac-b", "rbac-a")))
                .andExpect(status().isCreated());
        Long id =
                db.queryForObject(
                        "select certificate_target_id from certificate_targets where project_id='rbac-a' and hostname='private.example'",
                        Long.class);
        mvc.perform(
                        put("/api/v1/certificates/" + id)
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(cert))
                .andExpect(status().isForbidden());
        db.update("delete from certificate_latest where certificate_target_id=?", id);
        db.update("delete from certificate_targets where certificate_target_id=?", id);
    }

    @Test
    void userChangesAreAuditedPasswordsAreNotReturnedAndSessionRevocationIsImmediate()
            throws Exception {
        String value =
                "{\"username\":\"new-reader\",\"password\":\"test-only-password-123\",\"role\":\"VIEWER\",\"enabled\":true,\"projectIds\":[\"rbac-a\"]}";
        db.update("delete from app_users where username='new-reader'");
        mvc.perform(
                        post("/api/v1/settings/users")
                                .with(user("admin").roles("ADMIN"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(value))
                .andExpect(status().isCreated());
        String audit =
                mvc.perform(get("/api/v1/settings/audit").with(user("admin").roles("ADMIN")))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertFalse(audit.contains("test-only-password-123"));
        assertFalse(audit.contains("password_hash"));
        mvc.perform(get("/api/v1/settings/users").with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].password_hash").doesNotExist());
        MockHttpSession oldSession = new MockHttpSession();
        oldSession.setAttribute("hermes.securityVersion", 0L);
        mvc.perform(
                        put("/api/v1/settings/users/new-reader")
                                .with(user("admin").roles("ADMIN"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        value.replace(
                                                "test-only-password-123",
                                                "replacement-password-456")))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/session/me").session(oldSession).with(user("new-reader")))
                .andExpect(status().isUnauthorized());
        String self =
                value.replace("new-reader", "admin")
                        .replace("\"password\":\"test-only-password-123\"", "\"password\":\"\"")
                        .replace("[\"rbac-a\"]", "[]");
        mvc.perform(
                        put("/api/v1/settings/users/admin")
                                .with(user("admin").roles("ADMIN"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(self))
                .andExpect(status().isBadRequest());
        db.update("update app_users set enabled=false where username='viewer'");
        mvc.perform(get("/api/v1/session/me").with(user("viewer")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void auditFailureRollsBackTheConfigurationChange() throws Exception {
        db.execute(
                "create function reject_audit_test() returns trigger language plpgsql as $$ begin raise exception 'test audit failure'; end $$");
        db.execute(
                "create trigger reject_audit_test before insert on audit_log for each row execute function reject_audit_test()");
        try {
            mvc.perform(
                            put("/api/v1/api-checks/rbac-a/dev/api/usage")
                                    .with(user("operator"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content("{\"enabled\":false}"))
                    .andExpect(status().isInternalServerError());
            assertTrue(
                    db.queryForObject(
                            "select monitoring_enabled from check_definitions where project_id='rbac-a' and instance_id='dev' and check_id='api'",
                            Boolean.class));
        } finally {
            db.execute("drop trigger reject_audit_test on audit_log");
            db.execute("drop function reject_audit_test()");
        }
    }

    @Test
    void logConfigurationIsScopedAuditedAndDisabledReadsNeverContactAgent() throws Exception {
        db.update("delete from log_sources where project_id='rbac-a'");
        String body =
                "{\"name\":\"WAS\",\"path\":\"/logs/catalina.out\",\"encoding\":\"UTF-8\",\"enabled\":false,\"pollIntervalSeconds\":10}";
        String url = "/api/v1/projects/rbac-a/instances/dev/logs";
        mvc.perform(get(url).with(user("viewer"))).andExpect(status().isForbidden());
        mvc.perform(
                        post(url)
                                .with(user("viewer"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(url.replace("rbac-a", "rbac-b"))
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(url)
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        body.replace(
                                                "\"pollIntervalSeconds\":10",
                                                "\"pollIntervalSeconds\":4")))
                .andExpect(status().isBadRequest());
        mvc.perform(
                        post(url)
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isOk());
        Long id =
                db.queryForObject(
                        "select log_id from log_sources where project_id='rbac-a'", Long.class);
        mvc.perform(get(url + "/" + id + "/read").with(user("operator")))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("LOG_DISABLED"))
                .andExpect(jsonPath("$.text").value(""));
        mvc.perform(get(url + "/" + id + "/read").with(user("viewer")))
                .andExpect(status().isForbidden());
        assertEquals(
                1,
                db.queryForObject(
                        "select count(*) from audit_log where entity_type='LOG_VIEW' and actor='operator'",
                        Integer.class));
        assertEquals(
                1,
                db.queryForObject(
                        "select count(*) from audit_log where entity_type='log_sources' and action='INSERT'",
                        Integer.class));
        mvc.perform(
                        put(url + "/" + id)
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body.replace("Seconds\":10", "Seconds\":1800")))
                .andExpect(status().isOk());
        assertEquals(
                1800,
                db.queryForObject(
                        "select poll_interval_seconds from log_sources where log_id=?",
                        Integer.class,
                        id));
        db.update("delete from log_sources where log_id=?", id);
    }

    @Test
    void logReadsUseAuthenticatedHttpShareResponsesAndNeverPersistBody() throws Exception {
        var server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        var reads = new java.util.concurrent.atomic.AtomicInteger();
        String raw = "raw token=visible <script>plain</script>\n";
        byte[] payload =
                new tools.jackson.databind.ObjectMapper()
                        .writeValueAsBytes(
                                java.util.Map.of(
                                        "text",
                                        raw,
                                        "cursor",
                                        "file-offset",
                                        "reset",
                                        false,
                                        "limited",
                                        false,
                                        "identity",
                                        java.util.Map.of(
                                                "project_id", "rbac-a", "instance_id", "dev")));
        server.createContext(
                "/monitor/v1/logs/read",
                exchange -> {
                    reads.incrementAndGet();
                    assertEquals("POST", exchange.getRequestMethod());
                    assertEquals(
                            "x".repeat(32),
                            exchange.getRequestHeaders().getFirst("X-Monitor-Token"));
                    var sent =
                            new tools.jackson.databind.ObjectMapper()
                                    .readTree(exchange.getRequestBody().readAllBytes());
                    assertEquals("/logs/catalina.out", sent.path("path").asString());
                    assertEquals(3, sent.size());
                    assertTrue(sent.path("cursor").isNull());
                    exchange.sendResponseHeaders(200, payload.length);
                    exchange.getResponseBody().write(payload);
                    exchange.close();
                });
        server.start();
        var token = tokenCipher.encrypt("x".repeat(32));
        db.update("delete from log_sources where project_id='rbac-a'");
        db.update(
                "update instances set enabled=true,poll_interval_seconds=1800,last_polled_at=now(),agent_base_url=?,token_ciphertext=?,token_iv=? where project_id='rbac-a' and instance_id='dev'",
                "http://127.0.0.1:" + server.getAddress().getPort(),
                token.ciphertext(),
                token.iv());
        String url = "/api/v1/projects/rbac-a/instances/dev/logs";
        String body =
                "{\"name\":\"WAS\",\"path\":\"/logs/catalina.out\",\"encoding\":\"UTF-8\",\"enabled\":true,\"pollIntervalSeconds\":10}";
        try {
            mvc.perform(
                            post(url)
                                    .with(user("operator"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(body))
                    .andExpect(status().isOk());
            Long id =
                    db.queryForObject(
                            "select log_id from log_sources where project_id='rbac-a'", Long.class);
            String readUrl = url + "/" + id + "/read";
            String result =
                    mvc.perform(get(readUrl).with(user("operator")))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.text").value(raw))
                            .andExpect(jsonPath("$.code").isEmpty())
                            .andReturn()
                            .getResponse()
                            .getContentAsString();
            String cursor =
                    new tools.jackson.databind.ObjectMapper()
                            .readTree(result)
                            .path("cursor")
                            .asString();
            mvc.perform(get(readUrl).with(user("admin").roles("ADMIN")))
                    .andExpect(jsonPath("$.text").value(raw));
            mvc.perform(get(readUrl).param("cursor", cursor).with(user("operator")))
                    .andExpect(jsonPath("$.text").value(""));
            assertEquals(1, reads.get());
            String audit =
                    db.queryForObject(
                            "select coalesce(jsonb_agg(to_jsonb(a))::text,'[]') from audit_log a",
                            String.class);
            assertFalse(audit.contains("token=visible"));
            assertFalse(audit.contains("file-offset"));
            mvc.perform(
                            put(url + "/" + id)
                                    .with(user("operator"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(body.replace("\"enabled\":true", "\"enabled\":false")))
                    .andExpect(status().isOk());
            mvc.perform(get(readUrl).param("cursor", cursor).with(user("operator")))
                    .andExpect(jsonPath("$.code").value("LOG_DISABLED"));
            assertEquals(1, reads.get());
        } finally {
            db.update("delete from log_sources where project_id='rbac-a'");
            db.update(
                    "update instances set enabled=false,agent_base_url='https://allowed.example' where project_id='rbac-a' and instance_id='dev'");
            server.stop(0);
        }
    }
}
