package com.monitoring.agent;

import com.monitoring.agent.collection.SnapshotPersistence;
import com.monitoring.agent.collection.CollectionFailureService;
import com.monitoring.agent.metric.ThresholdResolver;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.Duration;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.MvcResult;
import org.yaml.snakeyaml.Yaml;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "HERMES_ADMIN_USERNAME=admin",
            "HERMES_ADMIN_PASSWORD_HASH=$2a$10$abcdefghijklmnopqrstuu12345678901234567890123456789012",
            "spring.profiles.active=e2e,tunnel",
            "hermes.sample-fixtures.enabled=true",
            "HERMES_SAMPLE_AGENT_TOKEN=01234567890123456789012345678901"
        })
class MigrationStartupIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("hermes_monitor")
                    .withUsername("hermes")
                    .withPassword("test-password")
                    .withStartupTimeout(Duration.ofSeconds(60));

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("hermes.master-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
        registry.add("hermes.agent-allowed-cidrs", () -> "127.0.0.1/32");
    }

    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired SnapshotPersistence snapshots;
    @Autowired CollectionFailureService failures;
    @Autowired ThresholdResolver thresholds;
    @Autowired Flyway flyway;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired WebApplicationContext webContext;

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping handlerMapping;

    @LocalServerPort int port;

    @Test
    void migrationsFinishBeforeApplicationAndSchedulersStart() {
        assertTrue(port > 0);
        for (String table :
                new String[] {
                    "projects",
                    "instances",
                    "app_users",
                    "certificate_targets",
                    "flyway_schema_history"
                }) {
            Integer count =
                    db.queryForObject(
                            """
                select count(*) from information_schema.tables
                where table_schema='public' and table_name=?
                """,
                            Integer.class,
                            table);
            assertEquals(1, count, table);
        }
        assertEquals(2, db.queryForObject("select count(*) from projects", Integer.class));
        assertEquals(4, db.queryForObject("select count(*) from instances", Integer.class));
        assertAllProductionMigrationsAppliedSuccessfully();
    }

    private void assertAllProductionMigrationsAppliedSuccessfully() {
        List<MigrationInfo> productionMigrations =
                java.util.Arrays.stream(flyway.info().all())
                        .filter(MigrationInfo::isVersioned)
                        .toList();
        assertFalse(productionMigrations.isEmpty(), "production migration list must not be empty");
        assertAll(
                productionMigrations.stream()
                        .map(
                                migration ->
                                        () ->
                                                assertEquals(
                                                        MigrationState.SUCCESS,
                                                        migration.getState(),
                                                        migration.getVersion()
                                                                + "__"
                                                                + migration.getDescription())));

        List<String> resolved =
                productionMigrations.stream()
                        .map(
                                migration ->
                                        migration.getVersion() + "__" + migration.getDescription())
                        .toList();
        List<String> successfulHistory =
                db.queryForList(
                        """
            select version || '__' || description from flyway_schema_history
            where success and version is not null order by installed_rank
            """,
                        String.class);
        assertEquals(
                resolved,
                successfulHistory,
                "database history must exactly match the resolved production migrations");
        assertEquals(
                0,
                db.queryForObject(
                        "select count(*) from flyway_schema_history where not success",
                        Integer.class));
    }

    @Test
    void authenticationAndCsrfProtectStateChanges() throws Exception {
        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();
        mvc.perform(get("/api/v1/dashboard"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(get("/api/v1/dashboard").with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk());
        String body = "{\"projectId\":\"csrf-test\",\"displayName\":\"CSRF 시험\",\"enabled\":true}";
        mvc.perform(
                        post("/api/v1/projects")
                                .with(user("admin").roles("ADMIN"))
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post("/api/v1/projects")
                                .with(user("admin").roles("ADMIN"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isCreated());
        db.update("delete from projects where project_id='csrf-test'");
    }

    @Test
    void tunnelBrowserEntryUsesRelativeLoginAndSecureSessionCookie() throws Exception {
        HttpClient client =
                HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
        HttpResponse<String> response =
                client.send(
                        HttpRequest.newBuilder()
                                .uri(URI.create("http://127.0.0.1:" + port + "/"))
                                .header("Accept", "text/html")
                                .header("X-Forwarded-Proto", "https")
                                .header("X-Forwarded-Host", "attacker.example")
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());

        assertEquals(302, response.statusCode());
        assertEquals("/login", response.headers().firstValue("location").orElseThrow());
        String sessionCookie =
                response.headers().allValues("set-cookie").stream()
                        .filter(value -> value.startsWith("JSESSIONID="))
                        .findFirst()
                        .orElseThrow();
        assertTrue(sessionCookie.contains("; Secure"), sessionCookie);
        assertTrue(sessionCookie.contains("; HttpOnly"), sessionCookie);
        assertTrue(sessionCookie.contains("; SameSite=Lax"), sessionCookie);

        HttpResponse<String> login =
                client.send(
                        HttpRequest.newBuilder()
                                .uri(URI.create("http://127.0.0.1:" + port + "/login"))
                                .header("Accept", "text/html")
                                .header(
                                        "Cookie",
                                        sessionCookie.substring(0, sessionCookie.indexOf(';')))
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        assertEquals(200, login.statusCode());
        assertTrue(login.body().contains("DC Monitoring"));
        assertFalse(login.body().contains("Hermes Monitoring"));
        assertTrue(login.body().contains("<h1 id=\"login-title\">로그인</h1>"));
        assertTrue(login.body().contains("alt=\"\""));
        assertTrue(login.body().contains("/monitoring.svg"));
        assertFalse(login.body().contains("security-copy"));
        assertFalse(login.body().contains("product-panel"));
        assertFalse(login.body().contains("관리자 계정으로 계속하세요."));
        assertFalse(login.body().contains("OPERATIONS CONSOLE"));
        assertFalse(login.body().contains("Please sign in"));
        assertTrue(login.body().contains("name=\"_csrf\""));

        HttpResponse<String> brand =
                client.send(
                        HttpRequest.newBuilder()
                                .uri(URI.create("http://127.0.0.1:" + port + "/monitoring.svg"))
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        assertEquals(200, brand.statusCode());
        assertTrue(brand.headers().firstValue("content-type").orElse("").contains("image/svg+xml"));
        assertTrue(brand.body().contains("<svg"));
    }

    @Test
    void allOpenApiOperationsMatchRuntimeStatusContentAndRequiredFields() throws Exception {
        RuntimeOpenApiContract contract = RuntimeOpenApiContract.load(json);
        assertEquals(38, contract.operationCount());
        contract.assertControllerRouteCoverage(handlerMapping);
        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();
        String project = "contract-project";
        String instance = "contract-instance";
        String password = "contract-password";
        com.sun.net.httpserver.HttpServer agent = contractAgent(instance);
        agent.start();
        int agentPort = agent.getAddress().getPort();
        int certificatePort = unusedLocalPort();
        try {
            db.update(
                    """
                insert into app_users(username,password_hash,role,enabled)
                values('contract-admin',?,'ADMIN',true)
                on conflict(username) do update set password_hash=excluded.password_hash,enabled=true
                """,
                    passwordEncoder.encode(password));

            assertContract(
                    mvc,
                    contract,
                    "login",
                    post("/api/v1/session/login")
                            .with(csrf())
                            .param("username", "contract-admin")
                            .param("password", password));
            assertContract(
                    mvc, contract, "getSession", authorized(get("/api/v1/session/me"), false));
            assertContract(
                    mvc, contract, "listProjects", authorized(get("/api/v1/projects"), false));

            String projectBody =
                    """
                {"projectId":"contract-project","displayName":"Contract project","enabled":true}
                """;
            assertContract(
                    mvc,
                    contract,
                    "createProject",
                    authorized(
                            post("/api/v1/projects")
                                    .contentType("application/json")
                                    .content(projectBody),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "updateProject",
                    authorized(
                            put("/api/v1/projects/{projectId}", project)
                                    .contentType("application/json")
                                    .content(projectBody),
                            true));

            String instanceBody =
                    """
                {"instanceId":"contract-instance","displayName":"Contract instance",
                 "environment":"contract","agentBaseUrl":"http://127.0.0.1:%d",
                 "token":"01234567890123456789012345678901","apiChecksEnabled":true,
                 "pollIntervalSeconds":60,"enabled":true}
                """
                            .formatted(agentPort);
            assertContract(
                    mvc,
                    contract,
                    "createInstance",
                    authorized(
                            post("/api/v1/projects/{projectId}/instances", project)
                                    .contentType("application/json")
                                    .content(instanceBody),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "listInstances",
                    authorized(get("/api/v1/projects/{projectId}/instances", project), false));
            assertContract(
                    mvc,
                    contract,
                    "updateInstance",
                    authorized(
                            put(
                                            "/api/v1/projects/{projectId}/instances/{instanceId}",
                                            project,
                                            instance)
                                    .contentType("application/json")
                                    .content(instanceBody),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "testInstance",
                    authorized(
                            post(
                                    "/api/v1/projects/{projectId}/instances/{instanceId}/test",
                                    project,
                                    instance),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "getResources",
                    authorized(
                            get(
                                    "/api/v1/projects/{projectId}/instances/{instanceId}/resources",
                                    project,
                                    instance),
                            false));
            assertContract(
                    mvc,
                    contract,
                    "getDbPools",
                    authorized(
                            get(
                                    "/api/v1/projects/{projectId}/instances/{instanceId}/db-pools",
                                    project,
                                    instance),
                            false));

            // 미사용 로그 설정은 파일 요청 없이 등록·조회·수정·읽기 계약 검증
            String logBody =
                    """
                    {"name":"Contract log","path":"/tmp/application.log","encoding":"UTF-8",
                     "enabled":false,"pollIntervalSeconds":5}
                    """;
            String logPath = "/api/v1/projects/{projectId}/instances/{instanceId}/logs";
            assertContract(
                    mvc,
                    contract,
                    "createLog",
                    authorized(
                            post(logPath, project, instance)
                                    .contentType("application/json")
                                    .content(logBody),
                            true));
            long logId =
                    db.queryForObject(
                            "select log_id from log_sources where project_id=? and instance_id=? and name='Contract log'",
                            Long.class,
                            project,
                            instance);
            assertContract(
                    mvc, contract, "listLogs", authorized(get(logPath, project, instance), false));
            assertContract(
                    mvc,
                    contract,
                    "updateLog",
                    authorized(
                            put(logPath + "/{logId}", project, instance, logId)
                                    .contentType("application/json")
                                    .content(logBody),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "readLog",
                    authorized(get(logPath + "/{logId}/read", project, instance, logId), false));

            db.update(
                    """
                insert into check_definitions(project_id,instance_id,check_id,name,category,direction,
                  discovered_at,last_seen_at) values
                  (?,?, 'contract-internal','Contract internal','INTERNAL',null,now(),now()),
                  (?,?, 'contract-api','Contract API','API','EXTERNAL',now(),now())
                """,
                    project,
                    instance,
                    project,
                    instance);
            assertContract(
                    mvc,
                    contract,
                    "listInternalChecks",
                    authorized(
                            get(
                                    "/api/v1/projects/{projectId}/instances/{instanceId}/internal-checks",
                                    project,
                                    instance),
                            false));
            String serviceBody =
                    """
                {"profile":{"title":"Other vendor","dashboard":true,"fields":[{"key":"left",
                  "label":"Remaining","source":"DETAILS","path":"$.remaining","kind":"NUMBER","unit":"items","required":true}]}}
                """;
            assertContract(
                    mvc,
                    contract,
                    "updateServiceProfile",
                    authorized(
                            put(
                                            "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/service",
                                            project,
                                            instance)
                                    .contentType("application/json")
                                    .content(serviceBody),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "listApiChecks",
                    authorized(get("/api/v1/api-checks?project={projectId}", project), false));
            assertContract(
                    mvc, contract, "getDashboard", authorized(get("/api/v1/dashboard"), false));
            mvc.perform(
                            authorized(
                                    put(
                                                    "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/service",
                                                    project,
                                                    instance)
                                            .contentType("application/json")
                                            .content("{}"),
                                    true))
                    .andExpect(status().isBadRequest());
            mvc.perform(
                            authorized(
                                    put(
                                                    "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/service",
                                                    project,
                                                    instance)
                                            .contentType("application/json")
                                            .content("{\"profile\":null}"),
                                    true))
                    .andExpect(status().isNoContent());
            assertContract(
                    mvc,
                    contract,
                    "runApiCheck",
                    authorized(
                            post(
                                    "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/run",
                                    project,
                                    instance),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "updateApiCheckUsage",
                    authorized(
                            put(
                                            "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/usage",
                                            project,
                                            instance)
                                    .contentType("application/json")
                                    .content("{\"enabled\":false}"),
                            true));
            mvc.perform(
                            authorized(
                                    post(
                                            "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/run",
                                            project,
                                            instance),
                                    true))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("API_CHECK_UNUSED"));
            mvc.perform(
                            authorized(
                                    put(
                                                    "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/usage",
                                                    project,
                                                    instance)
                                            .contentType("application/json")
                                            .content("{}"),
                                    true))
                    .andExpect(status().isBadRequest());
            mvc.perform(
                            authorized(
                                    put(
                                                    "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/usage",
                                                    project,
                                                    instance)
                                            .contentType("application/json")
                                            .content("{\"enabled\":true}"),
                                    true))
                    .andExpect(status().isNoContent());

            assertContract(
                    mvc,
                    contract,
                    "updateCheckSettings",
                    authorized(
                            put(
                                            "/api/v1/api-checks/{projectId}/{instanceId}/contract-internal/settings",
                                            project,
                                            instance)
                                    .contentType("application/json")
                                    .content(
                                            "{\"monitoringEnabled\":true,\"automaticEnabled\":true,\"checkIntervalSeconds\":3600}"),
                            true));
            assertEquals(
                    3600,
                    db.queryForObject(
                            "select check_interval_seconds from check_definitions where project_id=? and instance_id=? and check_id='contract-internal'",
                            Integer.class,
                            project,
                            instance));
            mvc.perform(
                            authorized(
                                    put(
                                                    "/api/v1/api-checks/{projectId}/{instanceId}/contract-internal/settings",
                                                    project,
                                                    instance)
                                            .contentType("application/json")
                                            .content(
                                                    "{\"monitoringEnabled\":true,\"automaticEnabled\":true,\"checkIntervalSeconds\":59}"),
                                    true))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("CHECK_SETTINGS_INVALID"));
            String certificateBody =
                    """
                {"projectId":"contract-project","hostname":"127.0.0.1","port":%d,
                 "sniHostname":"contract.example","enabled":true,"checkIntervalMinutes":360}
                """
                            .formatted(certificatePort);
            assertContract(
                    mvc,
                    contract,
                    "createCertificate",
                    authorized(
                            post("/api/v1/certificates")
                                    .contentType("application/json")
                                    .content(certificateBody),
                            true));
            long certificateId =
                    db.queryForObject(
                            """
                select certificate_target_id from certificate_targets
                where project_id=? and hostname='127.0.0.1' and port=?
                """,
                            Long.class,
                            project,
                            certificatePort);
            assertContract(
                    mvc,
                    contract,
                    "listCertificates",
                    authorized(get("/api/v1/certificates?project={projectId}", project), false));
            assertContract(
                    mvc,
                    contract,
                    "updateCertificate",
                    authorized(
                            put("/api/v1/certificates/{id}", certificateId)
                                    .contentType("application/json")
                                    .content(certificateBody),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "checkCertificate",
                    authorized(post("/api/v1/certificates/{id}/check", certificateId), true));
            awaitCertificateResult(mvc, certificateId);
            Map<String, Object> failedCertificate =
                    db.queryForMap(
                            """
                select subject,issuer,serial_number,not_before,not_after,days_remaining,
                  chain_valid,hostname_valid,signature_algorithm,status
                from certificate_latest where certificate_target_id=?
                """,
                            certificateId);
            for (String nullable :
                    List.of(
                            "subject",
                            "issuer",
                            "serial_number",
                            "not_before",
                            "not_after",
                            "days_remaining",
                            "chain_valid",
                            "hostname_valid",
                            "signature_algorithm")) {
                assertNull(failedCertificate.get(nullable), nullable);
            }
            assertEquals("DOWN", failedCertificate.get("status"));

            assertContract(
                    mvc,
                    contract,
                    "listThresholds",
                    authorized(get("/api/v1/settings/thresholds"), false));
            String thresholdBody =
                    """
                [{"scope":"INSTANCE","projectId":"contract-project",
                  "instanceId":"contract-instance","metricKey":"SYSTEM_CPU",
                  "warningValue":0.8,"criticalValue":0.9}]
                """;
            assertContract(
                    mvc,
                    contract,
                    "updateThresholds",
                    authorized(
                            put("/api/v1/settings/thresholds")
                                    .contentType("application/json")
                                    .content(thresholdBody),
                            true));

            String userBody =
                    """
                {"username":"contract-reader","password":"contract-password",
                 "role":"VIEWER","enabled":true,"projectIds":["contract-project"]}
                """;
            assertContract(
                    mvc,
                    contract,
                    "createUser",
                    authorized(
                            post("/api/v1/settings/users")
                                    .contentType("application/json")
                                    .content(userBody),
                            true));
            assertContract(
                    mvc, contract, "listUsers", authorized(get("/api/v1/settings/users"), false));
            assertContract(
                    mvc,
                    contract,
                    "updateUser",
                    authorized(
                            put("/api/v1/settings/users/contract-reader")
                                    .contentType("application/json")
                                    .content(userBody.replace("contract-password", "")),
                            true));
            assertContract(
                    mvc, contract, "listAudit", authorized(get("/api/v1/settings/audit"), false));

            assertContract(
                    mvc,
                    contract,
                    "disableCertificate",
                    authorized(delete("/api/v1/certificates/{id}", certificateId), true));
            assertContract(
                    mvc,
                    contract,
                    "disableInstance",
                    authorized(
                            delete(
                                    "/api/v1/projects/{projectId}/instances/{instanceId}",
                                    project,
                                    instance),
                            true));
            assertContract(
                    mvc,
                    contract,
                    "disableProject",
                    authorized(delete("/api/v1/projects/{projectId}", project), true));
            assertContract(
                    mvc, contract, "logout", authorized(post("/api/v1/session/logout"), true));
            assertEquals(36, contract.checkedCount());
            contract.assertSecurityErrors(mvc);
            contract.assertApplicationErrors(mvc, project, instance);
        } finally {
            agent.stop(0);
            awaitAsyncRows(project, instance);
            deleteContractRows(project, instance);
            db.update(
                    "delete from app_users where username in ('contract-admin','contract-reader')");
        }
    }

    private MockHttpServletRequestBuilder authorized(
            MockHttpServletRequestBuilder request, boolean stateChanging) {
        request.with(user("admin").roles("ADMIN"));
        return stateChanging ? request.with(csrf()) : request;
    }

    private void assertContract(
            MockMvc mvc,
            RuntimeOpenApiContract contract,
            String operationId,
            MockHttpServletRequestBuilder request)
            throws Exception {
        MvcResult result = mvc.perform(request).andReturn();
        contract.assertResponse(operationId, result);
    }

    private com.sun.net.httpserver.HttpServer contractAgent(String instanceId) throws Exception {
        com.sun.net.httpserver.HttpServer server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/monitor/v1/info",
                exchange ->
                        respond(
                                exchange,
                                200,
                                "{\"identity\":{\"project_id\":\"contract-project\",\"instance_id\":\""
                                        + instanceId
                                        + "\"}}"));
        server.createContext(
                "/monitor/v1/checks/run",
                exchange -> respond(exchange, 202, "{\"job_id\":\"contract-job\"}"));
        server.createContext(
                "/monitor/v1/checks/results",
                exchange ->
                        respond(
                                exchange,
                                200,
                                "{\"results\":[{\"check_id\":\"contract-api\",\"category\":\"API\","
                                        + "\"status\":\"UP\",\"duration_ms\":1,\"result_code\":\"200\","
                                        + "\"checked_at\":\"2026-09-03T09:00:00Z\",\"message\":\"ok\"}]}"));
        return server;
    }

    private void respond(com.sun.net.httpserver.HttpExchange exchange, int statusCode, String body)
            throws java.io.IOException {
        byte[] bytes = body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (java.io.OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private int unusedLocalPort() throws java.io.IOException {
        try (java.net.ServerSocket socket =
                new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
            return socket.getLocalPort();
        }
    }

    private void awaitAsyncRows(String project, String instance) throws InterruptedException {
        for (int attempt = 0; attempt < 100; attempt++) {
            Integer checks =
                    db.queryForObject(
                            """
                select count(*) from check_results_latest where project_id=? and instance_id=?
                """,
                            Integer.class,
                            project,
                            instance);
            Integer certificates =
                    db.queryForObject(
                            """
                select count(*) from certificate_latest l join certificate_targets t
                using(certificate_target_id) where t.project_id=?
                """,
                            Integer.class,
                            project);
            if (checks != null && checks > 0 && certificates != null && certificates > 0) {
                return;
            }
            Thread.sleep(10L);
        }
    }

    private void awaitCertificateResult(MockMvc mvc, long certificateId) throws Exception {
        int lastStatus = 0;
        for (int attempt = 0; attempt < 200; attempt++) {
            Integer count =
                    db.queryForObject(
                            """
                select count(*) from certificate_latest where certificate_target_id=?
                """,
                            Integer.class,
                            certificateId);
            if (count != null && count > 0) {
                return;
            }
            lastStatus =
                    mvc.perform(
                                    post("/api/v1/certificates/{id}/check", certificateId)
                                            .with(user("admin").roles("ADMIN"))
                                            .with(csrf()))
                            .andReturn()
                            .getResponse()
                            .getStatus();
            Thread.sleep(10L);
        }
        fail(
                "asynchronous certificate failure was not persisted; last status="
                        + lastStatus
                        + ", target="
                        + db.queryForMap(
                                "select * from certificate_targets "
                                        + "where certificate_target_id=?",
                                certificateId));
    }

    private void deleteContractRows(String project, String instance) {
        db.update("delete from thresholds where project_id=?", project);
        db.update(
                "delete from certificate_latest where certificate_target_id in "
                        + "(select certificate_target_id from certificate_targets where project_id=?)",
                project);
        db.update("delete from certificate_targets where project_id=?", project);
        db.update(
                "delete from check_result_samples where project_id=? and instance_id=?",
                project,
                instance);
        db.update(
                "delete from check_results_latest where project_id=? and instance_id=?",
                project,
                instance);
        db.update(
                "delete from check_definitions where project_id=? and instance_id=?",
                project,
                instance);
        db.update("delete from instances where project_id=? and instance_id=?", project, instance);
        db.update("delete from projects where project_id=?", project);
    }

    private static final class RuntimeOpenApiContract {
        private final ObjectMapper json;
        private final Map<String, Object> document;
        private final Map<String, Map<String, Object>> operations;
        private final List<String> checked = new ArrayList<>();

        private RuntimeOpenApiContract(
                ObjectMapper json,
                Map<String, Object> document,
                Map<String, Map<String, Object>> operations) {
            this.json = json;
            this.document = document;
            this.operations = operations;
        }

        static RuntimeOpenApiContract load(ObjectMapper json) throws Exception {
            try (java.io.InputStream input =
                    MigrationStartupIntegrationTest.class
                            .getClassLoader()
                            .getResourceAsStream("contracts/center-api.openapi.yaml")) {
                assertNotNull(input, "OpenAPI resource");
                Map<String, Object> document = new Yaml().load(input);
                Map<String, Map<String, Object>> operations = new LinkedHashMap<>();
                Map<String, Object> paths = map(document.get("paths"));
                for (Map.Entry<String, Object> pathEntry : paths.entrySet()) {
                    Map<String, Object> path = map(pathEntry.getValue());
                    for (String method : List.of("get", "post", "put", "delete", "patch")) {
                        if (!(path.get(method) instanceof Map<?, ?>)) {
                            continue;
                        }
                        Map<String, Object> operation = new LinkedHashMap<>(map(path.get(method)));
                        operation.put("_runtimePath", "/api/v1" + pathEntry.getKey());
                        operation.put("_runtimeMethod", method);
                        operations.put((String) operation.get("operationId"), operation);
                    }
                }
                for (Map.Entry<String, Map<String, Object>> entry : operations.entrySet()) {
                    Map<String, Object> responses = map(entry.getValue().get("responses"));
                    String method = (String) entry.getValue().get("_runtimeMethod");
                    if (!"login".equals(entry.getKey()) && !"logout".equals(entry.getKey())) {
                        assertTrue(responses.containsKey("401"), entry.getKey() + " missing 401");
                    }
                    if (!"get".equals(method) && !"logout".equals(entry.getKey())) {
                        assertTrue(responses.containsKey("403"), entry.getKey() + " missing 403");
                    }
                }
                return new RuntimeOpenApiContract(json, document, operations);
            }
        }

        int operationCount() {
            return operations.size();
        }

        int checkedCount() {
            return checked.size();
        }

        void assertResponse(String operationId, MvcResult result) throws Exception {
            Map<String, Object> operation = operations.get(operationId);
            assertNotNull(operation, operationId);
            Map<String, Object> responses = map(operation.get("responses"));
            String status = Integer.toString(result.getResponse().getStatus());
            assertTrue(
                    responses.containsKey(status),
                    operationId
                            + " returned undocumented "
                            + status
                            + " with body "
                            + result.getResponse().getContentAsString()
                            + " and exception "
                            + result.getResolvedException());
            Map<String, Object> response = dereference(map(responses.get(status)));
            Map<String, Object> content = mapOrEmpty(response.get("content"));
            byte[] body = result.getResponse().getContentAsByteArray();
            if (content.containsKey("application/json")) {
                assertNotNull(result.getResponse().getContentType(), operationId + " content type");
                assertTrue(
                        result.getResponse().getContentType().startsWith("application/json"),
                        operationId + " content type " + result.getResponse().getContentType());
                assertTrue(body.length > 0, operationId + " body");
                Map<String, Object> media = map(content.get("application/json"));
                validateRequired(json.readTree(body), map(media.get("schema")), operationId);
            } else {
                assertEquals(0, body.length, operationId + " undocumented body");
            }
            assertFalse(checked.contains(operationId), operationId + " checked twice");
            checked.add(operationId);
        }

        void assertSecurityErrors(MockMvc mvc) throws Exception {
            for (Map.Entry<String, Map<String, Object>> entry : operations.entrySet()) {
                String operationId = entry.getKey();
                Map<String, Object> operation = entry.getValue();
                String method = (String) operation.get("_runtimeMethod");
                String path = ((String) operation.get("_runtimePath")).replaceAll("\\{[^}]+}", "1");
                Map<String, Object> responses = map(operation.get("responses"));
                boolean stateChanging = !"get".equals(method);

                if ("login".equals(operationId)) {
                    MvcResult unauthorized =
                            mvc.perform(
                                            post("/api/v1/session/login")
                                                    .with(csrf())
                                                    .param("username", "missing-user")
                                                    .param("password", "wrong-password"))
                                    .andReturn();
                    assertDocumentedResponse(operationId, "401", unauthorized);
                    MvcResult forbidden =
                            mvc.perform(
                                            post("/api/v1/session/login")
                                                    .param("username", "missing-user")
                                                    .param("password", "wrong-password"))
                                    .andReturn();
                    assertDocumentedResponse(operationId, "403", forbidden);
                    continue;
                }

                if (responses.containsKey("401")) {
                    MockHttpServletRequestBuilder request =
                            org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                    .request(
                                            org.springframework.http.HttpMethod.valueOf(
                                                    method.toUpperCase()),
                                            path);
                    if (stateChanging) {
                        request.with(csrf());
                    }
                    MvcResult unauthorized = mvc.perform(request).andReturn();
                    assertDocumentedResponse(operationId, "401", unauthorized);
                }
                if (responses.containsKey("403")) {
                    MockHttpServletRequestBuilder request =
                            org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                    .request(
                                            org.springframework.http.HttpMethod.valueOf(
                                                    method.toUpperCase()),
                                            path)
                                    .with(
                                            stateChanging
                                                    ? user("admin").roles("ADMIN")
                                                    : user("contract-reader").roles("VIEWER"));
                    MvcResult forbidden = mvc.perform(request).andReturn();
                    assertDocumentedResponse(operationId, "403", forbidden);
                }
            }
        }

        void assertControllerRouteCoverage(RequestMappingHandlerMapping handlers) {
            java.util.Set<String> runtime = new java.util.TreeSet<>();
            handlers.getHandlerMethods()
                    .forEach(
                            (mapping, method) -> {
                                for (String path : mapping.getPatternValues()) {
                                    if (!path.startsWith("/api/v1")) {
                                        continue;
                                    }
                                    for (org.springframework.web.bind.annotation.RequestMethod
                                            verb : mapping.getMethodsCondition().getMethods()) {
                                        runtime.add(verb.name().toLowerCase() + " " + path);
                                    }
                                }
                            });
            java.util.Set<String> documented = new java.util.TreeSet<>();
            for (Map<String, Object> operation : operations.values()) {
                String path = (String) operation.get("_runtimePath");
                if ("/api/v1/session/login".equals(path) || "/api/v1/session/logout".equals(path)) {
                    continue;
                }
                documented.add(operation.get("_runtimeMethod") + " " + path);
            }
            assertEquals(36, runtime.size(), "unexpected controller route count");
            assertEquals(documented, runtime, "controller routes and OpenAPI paths differ");
        }

        void assertApplicationErrors(MockMvc mvc, String project, String instance)
                throws Exception {
            assertDocumentedResponse(
                    "listProjects",
                    "400",
                    mvc.perform(get("/api/v1/projects?size=201").with(user("admin").roles("ADMIN")))
                            .andReturn());
            assertDocumentedResponse(
                    "testInstance",
                    "404",
                    mvc.perform(
                                    post(
                                                    "/api/v1/projects/{projectId}/instances/missing/test",
                                                    project)
                                            .with(user("admin").roles("ADMIN"))
                                            .with(csrf()))
                            .andReturn());
            assertDocumentedResponse(
                    "runApiCheck",
                    "429",
                    mvc.perform(
                                    post(
                                                    "/api/v1/api-checks/{projectId}/{instanceId}/contract-api/run",
                                                    project,
                                                    instance)
                                            .with(user("admin").roles("ADMIN"))
                                            .with(csrf()))
                            .andReturn());
        }

        private void assertDocumentedResponse(
                String operationId, String expectedStatus, MvcResult result) throws Exception {
            assertEquals(
                    Integer.parseInt(expectedStatus),
                    result.getResponse().getStatus(),
                    operationId + " error status");
            Map<String, Object> operation = operations.get(operationId);
            Map<String, Object> response =
                    dereference(map(map(operation.get("responses")).get(expectedStatus)));
            Map<String, Object> content = map(response.get("content"));
            Map<String, Object> media = map(content.get("application/json"));
            assertNotNull(
                    result.getResponse().getContentType(), operationId + " error content type");
            assertTrue(
                    result.getResponse().getContentType().startsWith("application/json"),
                    operationId + " error content type " + result.getResponse().getContentType());
            validateRequired(
                    json.readTree(result.getResponse().getContentAsByteArray()),
                    map(media.get("schema")),
                    operationId + "." + expectedStatus);
        }

        private void validateRequired(JsonNode value, Map<String, Object> schema, String location) {
            if (schema.containsKey("$ref")) {
                validateRequired(value, schemaAt((String) schema.get("$ref")), location);
                return;
            }
            for (Object member : list(schema.get("allOf"))) {
                validateRequired(value, map(member), location);
            }
            boolean oneOfDeclared = !list(schema.get("oneOf")).isEmpty();
            for (Object member : list(schema.get("oneOf"))) {
                Map<String, Object> candidate = map(member);
                Map<String, Object> effective =
                        candidate.containsKey("$ref")
                                ? schemaAt((String) candidate.get("$ref"))
                                : candidate;
                if (matchesType(value, effective.get("type"))) {
                    validateRequired(value, candidate, location);
                    return;
                }
            }
            assertFalse(oneOfDeclared, location + " does not match oneOf");
            Object type = schema.get("type");
            if (type != null) {
                assertTrue(matchesType(value, type), location + " has wrong type for " + type);
            }
            if (value == null || value.isNull()) {
                return;
            }
            if (!list(schema.get("enum")).isEmpty()) {
                Object actual = json.treeToValue(value, Object.class);
                assertTrue(
                        list(schema.get("enum")).contains(actual),
                        location + " is not in enum " + schema.get("enum"));
            }
            if ("date-time".equals(schema.get("format"))) {
                assertDoesNotThrow(() -> Instant.parse(value.asString()), location + " date-time");
            }
            if ("uri".equals(schema.get("format"))) {
                assertTrue(URI.create(value.asString()).isAbsolute(), location + " URI");
            }
            if (value.isArray()) {
                assertTrue(value.isArray(), location + " must be an array");
                Map<String, Object> items = mapOrEmpty(schema.get("items"));
                int index = 0;
                for (JsonNode item : value) {
                    validateRequired(item, items, location + "[" + index++ + "]");
                }
                return;
            }
            List<Object> required = list(schema.get("required"));
            if (!required.isEmpty()) {
                assertTrue(value.isObject(), location + " must be an object");
                for (Object name : required) {
                    assertTrue(value.has((String) name), location + " missing required " + name);
                }
            }
            Map<String, Object> properties = mapOrEmpty(schema.get("properties"));
            if (Boolean.FALSE.equals(schema.get("additionalProperties")) && value.isObject()) {
                for (String name : value.propertyNames()) {
                    assertTrue(properties.containsKey(name), location + " unexpected " + name);
                }
            }
            for (Map.Entry<String, Object> property : properties.entrySet()) {
                if (value.has(property.getKey())) {
                    validateRequired(
                            value.get(property.getKey()),
                            map(property.getValue()),
                            location + "." + property.getKey());
                }
            }
        }

        private boolean matchesType(JsonNode value, Object declaration) {
            if (declaration instanceof List<?>) {
                for (Object candidate : (List<?>) declaration) {
                    if (matchesType(value, candidate)) {
                        return true;
                    }
                }
                return false;
            }
            if (declaration == null) {
                return true;
            }
            return switch (declaration.toString()) {
                case "null" -> value == null || value.isNull();
                case "object" -> value != null && value.isObject();
                case "array" -> value != null && value.isArray();
                case "string" -> value != null && value.isString();
                case "integer" -> value != null && value.isIntegralNumber();
                case "number" -> value != null && value.isNumber();
                case "boolean" -> value != null && value.isBoolean();
                default -> true;
            };
        }

        private Map<String, Object> schemaAt(String reference) {
            Object value = document;
            for (String part : reference.substring(2).split("/")) {
                value = map(value).get(part);
            }
            return map(value);
        }

        private Map<String, Object> dereference(Map<String, Object> value) {
            return value.containsKey("$ref") ? schemaAt((String) value.get("$ref")) : value;
        }

        private static Map<String, Object> map(Object value) {
            assertTrue(value instanceof Map<?, ?>, "expected map but got " + value);
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                assertTrue(
                        entry.getKey() instanceof String,
                        "expected string key but got " + entry.getKey());
                result.put((String) entry.getKey(), entry.getValue());
            }
            return result;
        }

        private static Map<String, Object> mapOrEmpty(Object value) {
            return value == null ? Map.of() : map(value);
        }

        private static List<Object> list(Object value) {
            if (value == null) {
                return List.of();
            }
            assertTrue(value instanceof List<?>, "expected list but got " + value);
            return new ArrayList<>((List<?>) value);
        }
    }

    @Test
    void healthRespondsToThreeConsecutiveRequests() throws Exception {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        for (int attempt = 0; attempt < 3; attempt++) {
            HttpRequest request =
                    HttpRequest.newBuilder(
                                    URI.create("http://127.0.0.1:" + port + "/actuator/health"))
                            .timeout(Duration.ofSeconds(5))
                            .GET()
                            .build();
            HttpResponse<String> response =
                    client.send(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            assertTrue(response.body().contains("\"status\":\"UP\""));
        }
    }

    @Test
    void snapshotTransactionPersistsLatestAndOneMinuteHistoryForEveryResource() throws Exception {
        deleteSnapshotData("sample-a", "local-01");
        JsonNode snapshot =
                json.readTree(Files.readAllBytes(Path.of("../fixtures/agent-snapshot.json")));
        JsonNode info =
                json.readTree(
                        """
            {"checks":[{"check_id":"db-health","name":"Database health",
              "category":"INTERNAL","direction":null},
              {"check_id":"private-api","name":"Private API",
              "category":"API","direction":"INTERNAL"},
              {"check_id":"public-api","name":"Public API",
              "category":"API","direction":"EXTERNAL"}]}
            """);
        Instant received = Instant.parse("2026-09-03T01:30:45Z");
        snapshots.save("sample-a", "local-01", info, snapshot, received);
        snapshots.save(
                "sample-a", "local-01", info, snapshot, Instant.parse("2026-09-03T01:30:59Z"));

        assertCount("instance_snapshot_latest", 1);
        assertCount("instance_metric_samples", 1);
        assertCount("disk_latest", 1);
        assertCount("disk_samples", 1);
        assertCount("db_pool_latest", 1);
        assertCount("db_pool_samples", 1);
        assertCount("check_definitions", 3);
        assertCount("check_results_latest", 1);
        assertCount("check_result_samples", 1);
        assertEquals(
                73400320L,
                db.queryForObject(
                        "select non_heap_used_bytes from instance_snapshot_latest where project_id='sample-a' and instance_id='local-01'",
                        Long.class));
        assertNull(
                db.queryForObject(
                        """
            select direction from check_definitions
            where project_id='sample-a' and instance_id='local-01' and check_id='db-health'
            """,
                        String.class));
        assertEquals(
                "INTERNAL",
                db.queryForObject(
                        """
            select direction from check_definitions
            where project_id='sample-a' and instance_id='local-01' and check_id='private-api'
            """,
                        String.class));
        assertEquals(
                "EXTERNAL",
                db.queryForObject(
                        """
            select direction from check_definitions
            where project_id='sample-a' and instance_id='local-01' and check_id='public-api'
            """,
                        String.class));
    }

    private void deleteSnapshotData(String projectId, String instanceId) {
        for (String table :
                new String[] {
                    "check_result_samples",
                    "check_results_latest",
                    "check_definitions",
                    "db_pool_samples",
                    "db_pool_latest",
                    "disk_samples",
                    "disk_latest",
                    "instance_metric_samples",
                    "instance_snapshot_latest"
                }) {
            db.update(
                    "delete from " + table + " where project_id=? and instance_id=?",
                    projectId,
                    instanceId);
        }
    }

    private void assertCount(String table, int expected) {
        Integer count =
                db.queryForObject(
                        "select count(*) from "
                                + table
                                + " where project_id='sample-a' and instance_id='local-01'",
                        Integer.class);
        assertEquals(expected, count, table);
    }

    @Test
    void collectionFailuresTransitionWarnWarnDownAndSuccessfulSnapshotRecovers() throws Exception {
        JsonNode snapshot =
                json.readTree(Files.readAllBytes(Path.of("../fixtures/agent-snapshot.json")));
        JsonNode info = json.readTree("{\"checks\":[]}");
        snapshots.save(
                "sample-a", "local-02", info, snapshot, Instant.parse("2026-09-03T01:30:45Z"));

        Instant failedAt = Instant.parse("2026-09-03T01:31:00Z");
        failures.record("sample-a", "local-02", "AUTH_ERROR", failedAt);
        assertInstanceState("sample-a", "local-02", 1, "WARN", "AUTH_ERROR");
        failures.record("sample-a", "local-02", "AUTH_ERROR", failedAt);
        assertInstanceState("sample-a", "local-02", 2, "WARN", "AUTH_ERROR");
        failures.record("sample-a", "local-02", "AUTH_ERROR", failedAt);
        assertInstanceState("sample-a", "local-02", 3, "DOWN", "AUTH_ERROR");

        snapshots.save(
                "sample-a", "local-02", info, snapshot, Instant.parse("2026-09-03T01:31:01Z"));
        assertEquals(
                0,
                db.queryForObject(
                        "select consecutive_failures from instances "
                                + "where project_id='sample-a' and instance_id='local-02'",
                        Integer.class));
        assertEquals(
                "UP",
                db.queryForObject(
                        "select status from instance_snapshot_latest "
                                + "where project_id='sample-a' and instance_id='local-02'",
                        String.class));
    }

    private void assertInstanceState(
            String project, String instance, int failureCount, String status, String code) {
        Map<String, Object> row =
                db.queryForMap(
                        """
            select i.consecutive_failures,i.last_collection_error_code,l.status,l.status_reason
            from instances i join instance_snapshot_latest l using(project_id,instance_id)
            where i.project_id=? and i.instance_id=?
            """,
                        project,
                        instance);
        assertEquals(failureCount, ((Number) row.get("consecutive_failures")).intValue());
        assertEquals(code, row.get("last_collection_error_code"));
        assertEquals(status, row.get("status"));
        assertEquals(code, row.get("status_reason"));
    }

    @Test
    void realApisExposePersistedHistoryPaginationAndNoTokenMaterial() throws Exception {
        JsonNode snapshot =
                json.readTree(Files.readAllBytes(Path.of("../fixtures/agent-snapshot.json")));
        JsonNode info =
                json.readTree(
                        """
            {"checks":[{"check_id":"db-health","name":"Database health",
            "category":"INTERNAL","direction":null}]}
            """);
        snapshots.save("sample-a", "local-01", info, snapshot, Instant.now().minusSeconds(30));
        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();

        mvc.perform(
                        get("/api/v1/projects?page=0&size=2&sort=project_id,asc")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2));
        mvc.perform(
                        get("/api/v1/projects/sample-a/instances?page=0&size=50")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].token_ciphertext").doesNotExist())
                .andExpect(jsonPath("$.items[0].token_iv").doesNotExist());
        mvc.perform(
                        get("/api/v1/projects/sample-a/instances/local-01/resources?period=24h&max_points=1000")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latest.non_heap_used_bytes").value(73400320))
                .andExpect(jsonPath("$.history.length()").value(1))
                .andExpect(jsonPath("$.disks.length()").value(1))
                .andExpect(jsonPath("$.disk_history.length()").value(1));
        mvc.perform(
                        get("/api/v1/projects/sample-a/instances/local-01/db-pools?period=24h&max_points=1000")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].pool_id").value("main"))
                .andExpect(jsonPath("$.history.length()").value(1));
        mvc.perform(
                        get("/api/v1/projects/sample-a/instances/local-01/internal-checks?page=0&size=50")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].check_id").value("db-health"));
        mvc.perform(get("/api/v1/projects?size=201").with(user("admin").roles("ADMIN")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void apiChecksIncludeBoundedHistoryAndCertificatesUseFilteredPages() throws Exception {
        Instant checkedAt = Instant.now().minusSeconds(30);
        db.update(
                """
            insert into check_definitions(project_id,instance_id,check_id,name,category,direction,
              discovered_at,last_seen_at) values('sample-a','local-01','partner-api',
              'Partner API','API','EXTERNAL',now(),now()) on conflict do nothing
            """);
        db.update(
                """
            insert into check_result_samples(project_id,instance_id,check_id,checked_at,status,
              duration_ms,result_code,message,central_received_at)
            values('sample-a','local-01','partner-api',?,'UP',12,'200','ok',now())
            on conflict do nothing
            """,
                Timestamp.from(checkedAt));
        db.update(
                """
            insert into check_results_latest(project_id,instance_id,check_id,status,duration_ms,
              result_code,message,checked_at,central_received_at)
            values('sample-a','local-01','partner-api','UP',12,'200','ok',?,now())
            on conflict(project_id,instance_id,check_id) do update set checked_at=excluded.checked_at
            """,
                Timestamp.from(checkedAt));
        db.update(
                """
            insert into check_definitions(project_id,instance_id,check_id,name,category,direction,
              discovered_at,last_seen_at) values('sample-a','local-01','private-partner-api',
              'Private Partner API','API','INTERNAL',now(),now()) on conflict do nothing
            """);
        db.update(
                """
            insert into check_result_samples(project_id,instance_id,check_id,checked_at,status,
              duration_ms,result_code,message,central_received_at)
            values('sample-a','local-01','private-partner-api',?,'UP',8,'200','ok',now())
            on conflict do nothing
            """,
                Timestamp.from(checkedAt));
        db.update(
                """
            insert into check_results_latest(project_id,instance_id,check_id,status,duration_ms,
              result_code,message,checked_at,central_received_at)
            values('sample-a','local-01','private-partner-api','UP',8,'200','ok',?,now())
            on conflict(project_id,instance_id,check_id) do update set checked_at=excluded.checked_at
            """,
                Timestamp.from(checkedAt));
        db.update(
                """
            insert into certificate_targets(project_id,hostname,port,sni_hostname)
            values('sample-a','one.example.test',443,'one.example.test'),
                  ('sample-b','two.example.test',443,'two.example.test') on conflict do nothing
            """);
        db.update(
                """
            insert into certificate_latest(certificate_target_id,status,checked_at)
            select certificate_target_id,'WARN',now() from certificate_targets
            where hostname='one.example.test' on conflict do nothing
            """);
        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();

        mvc.perform(
                        get("/api/v1/api-checks?project=sample-a&size=10")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].category").value("API"))
                .andExpect(jsonPath("$.items[0].history.length()").value(1));
        mvc.perform(
                        get("/api/v1/api-checks?project=sample-a&direction=INTERNAL&name=Partner")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].check_id").value("private-partner-api"))
                .andExpect(jsonPath("$.items[0].direction").value("INTERNAL"))
                .andExpect(jsonPath("$.items[0].history.length()").value(1));
        mvc.perform(get("/api/v1/api-checks?direction=SIDEWAYS").with(user("admin").roles("ADMIN")))
                .andExpect(status().isBadRequest());
        mvc.perform(
                        get("/api/v1/certificates?project=sample-a&status=WARN&page=0&size=1&sort=hostname,asc")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].serial_number").isEmpty())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/v1/certificates?size=201").with(user("admin").roles("ADMIN")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void thresholdsUseOpenApiFieldNamesAndPersistValidatedUpdates() throws Exception {
        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();
        mvc.perform(get("/api/v1/settings/thresholds").with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].metricKey").exists())
                .andExpect(jsonPath("$[0].warningValue").isNumber())
                .andExpect(jsonPath("$[0].metric_key").doesNotExist());
        String body =
                """
            [{"scope":"GLOBAL","projectId":null,"instanceId":null,
              "metricKey":"SYSTEM_CPU","warningValue":0.75,"criticalValue":0.90}]
            """;
        mvc.perform(
                        put("/api/v1/settings/thresholds")
                                .with(user("admin").roles("ADMIN"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].metricKey").exists());
        assertEquals(
                0.75d,
                db.queryForObject(
                        """
            select warning_value from thresholds
            where scope='GLOBAL' and metric_key='SYSTEM_CPU'
            """,
                        Double.class));
    }

    @Test
    void certificateDayEvaluationReadsCurrentGlobalAndProjectDatabaseOverrides() {
        try {
            db.update(
                    """
                update thresholds set warning_value=45,critical_value=14
                where scope='GLOBAL' and metric_key='CERTIFICATE_DAYS'
                """);
            ThresholdResolver.Limits global =
                    thresholds.resolve("sample-b", null).get("CERTIFICATE_DAYS");
            assertEquals(new ThresholdResolver.Limits(45d, 14d), global);

            db.update(
                    """
                insert into thresholds(scope,project_id,instance_id,metric_key,
                  warning_value,critical_value)
                values('PROJECT','sample-a',null,'CERTIFICATE_DAYS',60,20)
                """);
            ThresholdResolver.Limits project =
                    thresholds.resolve("sample-a", null).get("CERTIFICATE_DAYS");
            assertEquals(new ThresholdResolver.Limits(60d, 20d), project);
        } finally {
            db.update(
                    "delete from thresholds where scope='PROJECT' and project_id='sample-a' "
                            + "and metric_key='CERTIFICATE_DAYS'");
            db.update(
                    "update thresholds set warning_value=30,critical_value=7 "
                            + "where scope='GLOBAL' and metric_key='CERTIFICATE_DAYS'");
        }
    }

    @Test
    void certificateTargetEditInvalidatesLatestAndAdvancesIdentityVersion() throws Exception {
        long id =
                db.queryForObject(
                        """
            insert into certificate_targets(project_id,hostname,port,sni_hostname)
            values('sample-b','before.example',443,'before.example')
            returning certificate_target_id
            """,
                        Long.class);
        db.update(
                "insert into certificate_latest(certificate_target_id,status,checked_at) "
                        + "values(?,'UP',now())",
                id);
        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();
        try {
            mvc.perform(
                            put("/api/v1/certificates/{id}", id)
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(
                                            """
                        {"projectId":"sample-b","hostname":"after.example","port":8443,
                         "sniHostname":"after.example","enabled":true,
                         "checkIntervalMinutes":60}
                        """))
                    .andExpect(status().isOk());
            assertEquals(
                    0,
                    db.queryForObject(
                            "select count(*) from certificate_latest "
                                    + "where certificate_target_id=?",
                            Integer.class,
                            id));
            Map<String, Object> target =
                    db.queryForMap(
                            "select hostname,port,sni_hostname,"
                                    + "target_version from certificate_targets where certificate_target_id=?",
                            id);
            assertEquals("after.example", target.get("hostname"));
            assertEquals(8443, target.get("port"));
            assertEquals(1L, target.get("target_version"));
        } finally {
            db.update("delete from certificate_latest where certificate_target_id=?", id);
            db.update("delete from certificate_targets where certificate_target_id=?", id);
        }
    }

    @Test
    void delayedOlderCheckResultCannotWinTheLatestRowRace() throws Exception {
        deleteSnapshotData("sample-b", "local-01");
        String source = Files.readString(Path.of("../fixtures/agent-snapshot.json"));
        JsonNode newer =
                json.readTree(
                        source.replace("\"status\": \"UP\"", "\"status\": \"DOWN\"")
                                .replace("2026-09-03T01:30:00Z", "2026-09-03T01:35:00Z")
                                .replace("\"message\": \"정상\"", "\"message\": \"newer\""));
        JsonNode older = json.readTree(source);
        JsonNode info =
                json.readTree(
                        """
            {"attributes":{"host_name":"race-host"},"checks":[
              {"check_id":"db-health","name":"Database health",
               "category":"INTERNAL","direction":null}]}
            """);
        CountDownLatch newerSaved = new CountDownLatch(1);
        ExecutorService race = Executors.newFixedThreadPool(2);
        try {
            var delayedOlder =
                    race.submit(
                            () -> {
                                assertTrue(newerSaved.await(5, TimeUnit.SECONDS));
                                snapshots.save(
                                        "sample-b",
                                        "local-01",
                                        info,
                                        older,
                                        Instant.parse("2026-09-03T01:36:00Z"));
                                return null;
                            });
            var currentNewer =
                    race.submit(
                            () -> {
                                snapshots.save(
                                        "sample-b",
                                        "local-01",
                                        info,
                                        newer,
                                        Instant.parse("2026-09-03T01:35:01Z"));
                                newerSaved.countDown();
                                return null;
                            });
            currentNewer.get(10, TimeUnit.SECONDS);
            delayedOlder.get(10, TimeUnit.SECONDS);
        } finally {
            race.shutdownNow();
        }

        Map<String, Object> latest =
                db.queryForMap(
                        """
            select status,message,checked_at from check_results_latest
            where project_id='sample-b' and instance_id='local-01' and check_id='db-health'
            """);
        assertEquals("DOWN", latest.get("status"));
        assertEquals("newer", latest.get("message"));
        assertEquals(
                Instant.parse("2026-09-03T01:35:00Z"),
                ((Timestamp) latest.get("checked_at")).toInstant());

        JsonNode equalTimestamp = json.readTree(newer.toString().replace("newer", "equal-time"));
        snapshots.save(
                "sample-b",
                "local-01",
                info,
                equalTimestamp,
                Instant.parse("2026-09-03T01:37:00Z"));
        Map<String, Object> afterEqual =
                db.queryForMap(
                        """
            select status,message,checked_at from check_results_latest
            where project_id='sample-b' and instance_id='local-01' and check_id='db-health'
            """);
        assertEquals("newer", afterEqual.get("message"));
    }

    @Test
    void apiAndFailureStateUseEachInstancesConfiguredPollInterval() throws Exception {
        JsonNode snapshot =
                json.readTree(Files.readAllBytes(Path.of("../fixtures/agent-snapshot.json")));
        JsonNode info =
                json.readTree(
                        """
            {"attributes":{"host_name":"interval-host"},"checks":[]}
            """);
        snapshots.save("sample-a", "local-02", info, snapshot, Instant.now().minusSeconds(61));
        db.update(
                """
            update instances set poll_interval_seconds=120,last_seen_at=now()-interval '61 seconds',
              consecutive_failures=0 where project_id='sample-a' and instance_id='local-02'
            """);
        db.update(
                """
            update instance_snapshot_latest set central_received_at=now()-interval '61 seconds',
              status='UP' where project_id='sample-a' and instance_id='local-02'
            """);

        failures.record("sample-a", "local-02", "AUTH_ERROR", Instant.now());
        assertEquals(
                "WARN",
                db.queryForObject(
                        """
            select status from instance_snapshot_latest
            where project_id='sample-a' and instance_id='local-02'
            """,
                        String.class));
        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();
        mvc.perform(
                        get("/api/v1/projects/sample-a/instances/local-02/resources")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stale").value(false));

        db.update(
                """
            update instances set last_seen_at=now()-interval '361 seconds',consecutive_failures=0
            where project_id='sample-a' and instance_id='local-02'
            """);
        db.update(
                """
            update instance_snapshot_latest set central_received_at=now()-interval '361 seconds',
              status='UP' where project_id='sample-a' and instance_id='local-02'
            """);
        mvc.perform(
                        get("/api/v1/projects/sample-a/instances?status=DOWN")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.instance_id == 'local-02')]").isNotEmpty());
        mvc.perform(
                        get("/api/v1/projects/sample-a/instances/local-02/resources")
                                .with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stale").value(true));
    }

    @Test
    void liveThresholdsResolveInstanceThenProjectThenGlobalAndApiChangesApplyImmediately()
            throws Exception {
        JsonNode snapshot =
                json.readTree(Files.readAllBytes(Path.of("../fixtures/agent-snapshot.json")));
        JsonNode info =
                json.readTree(
                        """
            {"attributes":{"host_name":"threshold-host"},"checks":[]}
            """);
        db.update(
                "update thresholds set warning_value=.30,critical_value=.90 "
                        + "where scope='GLOBAL' and metric_key='SYSTEM_CPU'");
        db.update(
                """
            insert into thresholds(scope,project_id,metric_key,warning_value,critical_value)
            values('PROJECT','sample-a','SYSTEM_CPU',.40,.90)
            on conflict(scope,project_id,instance_id,metric_key) do update set
              warning_value=excluded.warning_value,critical_value=excluded.critical_value
            """);
        db.update(
                """
            insert into thresholds(scope,project_id,instance_id,metric_key,warning_value,critical_value)
            values('INSTANCE','sample-a','local-01','SYSTEM_CPU',.20,.30)
            on conflict(scope,project_id,instance_id,metric_key) do update set
              warning_value=excluded.warning_value,critical_value=excluded.critical_value
            """);

        Instant received = Instant.parse("2026-09-03T01:30:16Z");
        snapshots.save("sample-a", "local-01", info, snapshot, received);
        assertEquals(
                "DOWN",
                db.queryForObject(
                        """
            select status from instance_snapshot_latest
            where project_id='sample-a' and instance_id='local-01'
            """,
                        String.class));

        MockMvc mvc =
                MockMvcBuilders.webAppContextSetup(webContext).apply(springSecurity()).build();
        String body =
                """
            [{"scope":"INSTANCE","projectId":"sample-a","instanceId":"local-01",
              "metricKey":"SYSTEM_CPU","warningValue":0.80,"criticalValue":0.90}]
            """;
        mvc.perform(
                        put("/api/v1/settings/thresholds")
                                .with(user("admin").roles("ADMIN"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(body))
                .andExpect(status().isOk());
        snapshots.save("sample-a", "local-01", info, snapshot, received.plusSeconds(1));
        assertEquals(
                "UP",
                db.queryForObject(
                        """
            select status from instance_snapshot_latest
            where project_id='sample-a' and instance_id='local-01'
            """,
                        String.class));

        db.update(
                "delete from thresholds where scope in ('PROJECT','INSTANCE') "
                        + "and project_id='sample-a' and metric_key='SYSTEM_CPU'");
        db.update(
                "update thresholds set warning_value=.80,critical_value=.90 "
                        + "where scope='GLOBAL' and metric_key='SYSTEM_CPU'");
    }
}
