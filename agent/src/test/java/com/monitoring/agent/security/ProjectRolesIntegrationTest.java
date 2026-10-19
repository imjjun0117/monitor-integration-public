package com.monitoring.agent.security;

import java.util.Base64;
import java.util.List;
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

    @Test
    void incidentsRespectProjectMenuLogPermissionsAndRejectConcurrentEdits() throws Exception {
        db.update("delete from incidents");
        String observation = "{\"kind\":\"CHECK\",\"status\":\"DOWN\"}";
        long id =
                db.queryForObject(
                        """
                insert into incidents(
                    project_id, instance_id, source_key, kind, severity, first_observation, latest_observation)
                values ('rbac-a', 'dev', 'check', 'CHECK', 'DOWN', ?::jsonb, ?::jsonb)
                returning incident_id
                """,
                        Long.class,
                        observation,
                        observation);
        long other =
                db.queryForObject(
                        """
                insert into incidents(
                    project_id, instance_id, source_key, kind, severity, first_observation, latest_observation)
                values ('rbac-b', 'dev', 'check', 'CHECK', 'DOWN', ?::jsonb, ?::jsonb)
                returning incident_id
                """,
                        Long.class,
                        observation,
                        observation);
        String path = "/api/v1/incidents/" + id;
        String action = "{\"version\":0,\"action\":\"ACKNOWLEDGE\"}";
        mvc.perform(get("/api/v1/incidents").with(user("viewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].project_id").value("rbac-a"));
        mvc.perform(get("/api/v1/incidents/" + other).with(user("operator")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/incidents/" + other + "/evidence").with(user("operator")))
                .andExpect(status().isNotFound());
        mvc.perform(
                        post("/api/v1/incidents/" + other + "/actions")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(action))
                .andExpect(status().isNotFound());
        mvc.perform(
                        post(path + "/actions")
                                .with(user("viewer"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(action))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(path + "/actions")
                                .with(user("operator"))
                                .contentType("application/json")
                                .content(action))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post(path + "/actions")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(action))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("ACKNOWLEDGED"))
                .andExpect(jsonPath("$.version").value(1));
        mvc.perform(
                        post(path + "/actions")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(action))
                .andExpect(status().isConflict());
        mvc.perform(
                        post(path + "/actions")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"version\":1,\"action\":\"ASSIGN\",\"assignee\":\"viewer\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(
                        post(path + "/actions")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"version\":1,\"action\":\"ASSIGN\",\"assignee\":\"operator\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignee").value("operator"));
        mvc.perform(
                        post(path + "/actions")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"version\":2,\"action\":\"COMMENT\",\"note\":\"확인 중\"}"))
                .andExpect(status().isOk());
        mvc.perform(get(path).with(user("viewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignees.length()").value(0))
                .andExpect(jsonPath("$.events[0].actor").value("operator"))
                .andExpect(jsonPath("$.events[0].note").value("확인 중"));
        mvc.perform(get(path + "/evidence").with(user("viewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logs_allowed").value(false))
                .andExpect(jsonPath("$.changes_allowed").value(false));
        mvc.perform(get(path + "/evidence").with(user("operator")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logs_allowed").value(true))
                .andExpect(jsonPath("$.changes_allowed").value(false));
        db.update(
                "update role_menu_permissions set can_read = false, can_write = false where role = 'OPERATOR' and menu_id = 'logs'");
        mvc.perform(get(path + "/evidence").with(user("operator")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logs_allowed").value(false));
        db.update(
                "update role_menu_permissions set can_read = false, can_write = false where role = 'OPERATOR' and menu_id = 'incidents'");
        mvc.perform(get(path).with(user("operator"))).andExpect(status().isForbidden());
        db.update(
                "update incidents set state = 'RECOVERED', closed_at = now() where incident_id = ?",
                id);
        mvc.perform(get("/api/v1/incidents").with(user("viewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/incidents").param("state", "").with(user("viewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void registeredRolesRetainProjectScopesAndApplyDisabledStateImmediately() throws Exception {
        String body =
                "{\"roleId\":\"QA_READER\",\"name\":\"Scoped"
                        + " reader\",\"description\":\"\",\"baseRole\":\"VIEWER\",\"enabled\":true}";
        try {
            mvc.perform(
                            post("/api/v1/settings/roles")
                                    .with(user("operator"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(body))
                    .andExpect(status().isForbidden());
            mvc.perform(
                            post("/api/v1/settings/roles")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(body))
                    .andExpect(status().isCreated());
            mvc.perform(
                            put("/api/v1/settings/roles/QA_READER/users")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content("[\"viewer\"]"))
                    .andExpect(status().isNoContent());
            mvc.perform(get("/api/v1/projects/rbac-a/instances").with(user("viewer")))
                    .andExpect(status().isForbidden());
            db.update("update role_menu_permissions set can_read=true where role='QA_READER'");
            mvc.perform(get("/api/v1/session/me").with(user("viewer")))
                    .andExpect(jsonPath("$.role").value("VIEWER"))
                    .andExpect(jsonPath("$.role_id").value("QA_READER"));
            mvc.perform(get("/api/v1/projects/rbac-a/instances").with(user("viewer")))
                    .andExpect(status().isOk());
            mvc.perform(get("/api/v1/projects/rbac-b/instances").with(user("viewer")))
                    .andExpect(status().isForbidden());
            mvc.perform(
                            post("/api/v1/projects/rbac-a/instances/dev/checks/api/run")
                                    .with(user("viewer"))
                                    .with(csrf()))
                    .andExpect(status().isForbidden());
            mvc.perform(
                            delete("/api/v1/settings/roles/QA_READER")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf()))
                    .andExpect(status().isConflict());
            mvc.perform(
                            put("/api/v1/settings/roles/QA_READER")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(body.replace("\"enabled\":true", "\"enabled\":false")))
                    .andExpect(status().isNoContent());
            mvc.perform(get("/api/v1/session/me").with(user("viewer")))
                    .andExpect(status().isUnauthorized());
            assertTrue(
                    db.queryForObject(
                                    "select count(*) from audit_log where entity_type='app_roles'"
                                            + " and target_id='QA_READER'",
                                    Long.class)
                            >= 2);
        } finally {
            db.update("update app_users set role='VIEWER' where role='QA_READER'");
            db.update("delete from app_roles where role_id='QA_READER'");
        }
    }

    @Test
    void roleAssignmentCannotRemoveAdministratorsOrEscalateViewerRole() throws Exception {
        String body =
                "{\"roleId\":\"QA_VIEWER\",\"name\":\"Viewer\",\"description\":\"\",\"baseRole\":\"VIEWER\",\"enabled\":true}";
        try {
            mvc.perform(
                            post("/api/v1/settings/roles")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(body))
                    .andExpect(status().isCreated());
            mvc.perform(
                            put("/api/v1/settings/roles/QA_VIEWER/users")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content("[\"viewer\",\"admin\"]"))
                    .andExpect(status().isBadRequest());
            assertEquals(
                    "VIEWER",
                    db.queryForObject(
                            "select role from app_users where username='viewer'", String.class));
            String grants =
                    new tools.jackson.databind.ObjectMapper()
                            .writeValueAsString(
                                    db.queryForList(
                                            "select menu_id as \"menuId\",true as \"canRead\",true"
                                                    + " as \"canWrite\" from app_menus"));
            mvc.perform(
                            put("/api/v1/settings/permissions/QA_VIEWER")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(grants))
                    .andExpect(status().isBadRequest());
            mvc.perform(
                            put("/api/v1/settings/roles/QA_VIEWER")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(
                                            body.replace(
                                                    "VIEWER\",\"enabled", "OPERATOR\",\"enabled")))
                    .andExpect(status().isBadRequest());
            mvc.perform(
                            delete("/api/v1/settings/roles/ADMIN")
                                    .with(user("admin").roles("ADMIN"))
                                    .with(csrf()))
                    .andExpect(status().isBadRequest());
        } finally {
            db.update("delete from app_roles where role_id='QA_VIEWER'");
        }
    }

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        db.update("update app_menus set enabled=true");
        db.update("update role_menu_permissions set can_read=true,can_write=(role<>'VIEWER')");
        db.update(
                "insert into projects(project_id,display_name)"
                        + " values('rbac-a','Allowed'),('rbac-b','Private') on conflict(project_id) do"
                        + " nothing");
        db.update(
                "insert into"
                        + " instances(project_id,instance_id,display_name,agent_base_url,token_ciphertext,token_iv,enabled)"
                        + " values('rbac-a','dev','Allowed"
                        + " server','https://allowed.example',decode('00','hex'),decode('00','hex'),false),('rbac-b','dev','Private"
                        + " server','https://private.example',decode('00','hex'),decode('00','hex'),false)"
                        + " on conflict(project_id,instance_id) do nothing");
        db.update(
                "insert into"
                        + " check_definitions(project_id,instance_id,check_id,name,category,direction,discovered_at,last_seen_at)"
                        + " values('rbac-a','dev','api','Allowed"
                        + " API','API','EXTERNAL',now(),now()),('rbac-b','dev','api','Private"
                        + " API','API','EXTERNAL',now(),now()) on"
                        + " conflict(project_id,instance_id,check_id) do update set"
                        + " monitoring_enabled=true,automatic_enabled=true,check_interval_seconds=300");
        db.update(
                "insert into app_users(username,password_hash,role)"
                        + " values('operator','unused','OPERATOR'),('viewer','unused','VIEWER') on"
                        + " conflict(username) do update set"
                        + " role=excluded.role,enabled=true,security_version=0");
        db.update("delete from user_project_access where username in ('operator','viewer')");
        db.update(
                "insert into user_project_access(username,project_id)"
                        + " values('operator','rbac-a'),('viewer','rbac-a')");
        db.update("delete from audit_log");
    }

    @Test
    void xlogQueriesAggregateOnlyAllowedScopeAndHonorFiltersAndMenuRevocation() throws Exception {
        db.update("delete from collector_events where project_id in ('rbac-a','rbac-b')");
        db.update("update projects set xlog_enabled=true where project_id='rbac-a'");
        for (String project : List.of("rbac-a", "rbac-b")) {
            for (int status : List.of(200, 500)) {
                db.update(
                        """
                        insert into collector_events(project_id,instance_id,kind,payload)
                        values (?, 'dev', 'XLOG', jsonb_build_object(
                            'started_at',(extract(epoch from now()) * 1000)::bigint
                            ,'duration_ms',?::int,'status',?::int,'method','GET','path','/sample'))
                        """,
                        project,
                        status,
                        status);
            }
        }
        mvc.perform(get("/api/v1/xlog").with(user("operator").roles("OPERATOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.count").value(2))
                .andExpect(jsonPath("$.summary.errors").value(1))
                .andExpect(jsonPath("$.summary.average_ms").value(350))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].project_id").value("rbac-a"));
        mvc.perform(
                        get("/api/v1/xlog")
                                .param("project", "rbac-b")
                                .with(user("operator").roles("OPERATOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.count").value(0));
        mvc.perform(
                        get("/api/v1/xlog")
                                .param("errorsOnly", "true")
                                .with(user("operator").roles("OPERATOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.count").value(1));
        mvc.perform(
                        get("/api/v1/xlog")
                                .param("path", "/missing")
                                .with(user("operator").roles("OPERATOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(
                        get("/api/v1/xlog")
                                .param("minutes", "1441")
                                .with(user("operator").roles("OPERATOR")))
                .andExpect(status().isBadRequest());
        db.update(
                "update role_menu_permissions set can_read=false,can_write=false where role='OPERATOR' and menu_id='xlog'");
        mvc.perform(get("/api/v1/xlog").with(user("operator").roles("OPERATOR")))
                .andExpect(status().isForbidden());
    }

    @Test
    void transportAndXlogKeepProjectScopesCsrfAndRawLogPermissions() throws Exception {
        String root = "/api/v1/projects/rbac-a/instances/dev";
        db.update(
                "update instances set enabled=true,transport_mode='WSS',last_polled_at=now() where project_id='rbac-a' and instance_id='dev'");
        try {
            mvc.perform(get(root + "/connection")).andExpect(status().isUnauthorized());
            mvc.perform(get(root + "/connection").with(user("viewer")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.mode").value("WSS"));
            mvc.perform(
                            get(root.replace("rbac-a", "rbac-b") + "/connection")
                                    .with(user("operator")))
                    .andExpect(status().isForbidden());
            mvc.perform(post(root + "/connection/start").with(user("viewer")).with(csrf()))
                    .andExpect(status().isForbidden());
            mvc.perform(post(root + "/connection/stop").with(user("operator")))
                    .andExpect(status().isForbidden());
            mvc.perform(get(root + "/events").param("kind", "LOG").with(user("viewer")))
                    .andExpect(status().isForbidden());
            mvc.perform(get(root + "/events").param("kind", "LOG").with(user("operator")))
                    .andExpect(status().isOk());
            mvc.perform(
                            put("/api/v1/projects/rbac-a/xlog-settings")
                                    .with(user("operator"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content("{\"enabled\":true}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.enabled").value(true));
            assertTrue(
                    db.queryForObject(
                            "select exists(select 1 from audit_log where entity_type='projects' and after_values->>'xlog_enabled'='true')",
                            Boolean.class));
            mvc.perform(
                            put(root + "/connection")
                                    .with(user("operator"))
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content("{\"mode\":\"HTTP\"}"))
                    .andExpect(status().isOk());
            assertTrue(
                    db.queryForObject(
                            "select exists(select 1 from audit_log where entity_type='instances' and after_values->>'transport_mode'='HTTP')",
                            Boolean.class));
        } finally {
            db.update(
                    "update instances set enabled=false,transport_mode='HTTP' where project_id='rbac-a' and instance_id='dev'");
            db.update("update projects set xlog_enabled=false where project_id='rbac-a'");
        }
    }

    @Test
    void menuPermissionsApplyImmediatelyAndCannotBypassExistingRoles() throws Exception {
        mvc.perform(get("/api/v1/settings/permissions").with(user("operator")))
                .andExpect(status().isForbidden());
        db.update(
                "update role_menu_permissions set can_write=false where role='OPERATOR' and"
                        + " menu_id='api'");
        mvc.perform(get("/api/v1/api-checks").with(user("operator"))).andExpect(status().isOk());
        mvc.perform(
                        put("/api/v1/api-checks/rbac-a/dev/api/settings")
                                .with(user("operator"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"monitoringEnabled\":false,\"automaticEnabled\":false,\"checkIntervalSeconds\":600}"))
                .andExpect(status().isForbidden());
        db.update(
                "update role_menu_permissions set can_read=false where role='OPERATOR' and"
                        + " menu_id='api'");
        mvc.perform(get("/api/v1/api-checks").with(user("operator")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/session/me").with(user("operator")))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.menus[?(@.menuId=='api')].canRead")
                                .value(org.hamcrest.Matchers.contains(false)));
        db.update("update app_menus set enabled=false where menu_id='api'");
        mvc.perform(get("/api/v1/api-checks").with(user("viewer")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/api-checks").with(user("admin"))).andExpect(status().isOk());
    }

    @Test
    void menuAdministrationPreservesRecoveryAndRejectsPartialPermissionWrites() throws Exception {
        mvc.perform(
                        put("/api/v1/settings/menus/api")
                                .with(user("admin"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"label\":\"API\\n"
                                                + "메뉴\",\"sortOrder\":30,\"enabled\":true}"))
                .andExpect(status().isBadRequest());
        mvc.perform(
                        put("/api/v1/settings/menus/settings")
                                .with(user("admin"))
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"label\":\"설정\",\"sortOrder\":50,\"enabled\":false}"))
                .andExpect(status().isBadRequest());
        mvc.perform(
                        put("/api/v1/settings/permissions/ADMIN")
                                .with(user("admin"))
                                .with(csrf())
                                .contentType("application/json")
                                .content("[]"))
                .andExpect(status().isBadRequest());
        String invalid =
                "[{\"menuId\":\"dashboard\",\"canRead\":false,\"canWrite\":false},"
                        + "{\"menuId\":\"projects\",\"canRead\":true,\"canWrite\":true},"
                        + "{\"menuId\":\"api\",\"canRead\":true,\"canWrite\":true},"
                        + "{\"menuId\":\"certificates\",\"canRead\":true,\"canWrite\":true},"
                        + "{\"menuId\":\"unknown\",\"canRead\":true,\"canWrite\":true}]";
        mvc.perform(
                        put("/api/v1/settings/permissions/OPERATOR")
                                .with(user("admin"))
                                .with(csrf())
                                .contentType("application/json")
                                .content(invalid))
                .andExpect(status().isBadRequest());
        assertEquals(
                Boolean.TRUE,
                db.queryForObject(
                        "select can_read from role_menu_permissions where role='OPERATOR' and"
                                + " menu_id='dashboard'",
                        Boolean.class));
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
                        "select count(*) from audit_log where actor='operator' and"
                                + " entity_type='check_definitions' and"
                                + " before_values->>'monitoring_enabled'='true' and"
                                + " after_values->>'monitoring_enabled'='false'",
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
                        "select certificate_target_id from certificate_targets where"
                                + " project_id='rbac-a' and hostname='private.example'",
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
                "create function reject_audit_test() returns trigger language plpgsql as $$ begin"
                        + " raise exception 'test audit failure'; end $$");
        db.execute(
                "create trigger reject_audit_test before insert on audit_log for each row execute"
                        + " function reject_audit_test()");
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
                            "select monitoring_enabled from check_definitions where"
                                    + " project_id='rbac-a' and instance_id='dev' and check_id='api'",
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
                        "select count(*) from audit_log where entity_type='LOG_VIEW' and"
                                + " actor='operator'",
                        Integer.class));
        assertEquals(
                1,
                db.queryForObject(
                        "select count(*) from audit_log where entity_type='log_sources' and"
                                + " action='INSERT'",
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
                "update instances set"
                        + " enabled=true,poll_interval_seconds=1800,last_polled_at=now(),agent_base_url=?,token_ciphertext=?,token_iv=?"
                        + " where project_id='rbac-a' and instance_id='dev'",
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
                    "update instances set enabled=false,agent_base_url='https://allowed.example'"
                            + " where project_id='rbac-a' and instance_id='dev'");
            server.stop(0);
        }
    }
    @Test
    void instanceThresholdsSaveScopedEmailsAndAuditChanges() throws Exception {
        clearInstanceThresholds();
        String path = "/api/v1/projects/rbac-a/instances/dev/thresholds";
        mvc.perform(get(path).with(user("operator")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.length()").value(0));
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json").content(instanceThresholdBody(false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipientEmails.length()").value(1))
                .andExpect(jsonPath("$.metrics[0].warningValue").value(.7))
                .andExpect(jsonPath("$.metrics[0].recipientEmails[0]").value("cpu@example.com"));
        assertTrue(db.queryForObject(
                "select exists(select 1 from audit_log where entity_type='instance_threshold_contacts' and actor='operator')",
                Boolean.class));
    }

    @Test
    void instanceThresholdsRestoreProjectDefaultsAndPreserveOtherServers() throws Exception {
        clearInstanceThresholds();
        db.update("""
                insert into thresholds(scope,project_id,instance_id,metric_key,warning_value,critical_value)
                values ('PROJECT','rbac-a',null,'SYSTEM_CPU',.65,.85),
                    ('INSTANCE','rbac-b','dev','SYSTEM_CPU',.5,.75)
                """);
        String path = "/api/v1/projects/rbac-a/instances/dev/thresholds";
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json").content(instanceThresholdBody(false)))
                .andExpect(status().isOk());
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json").content("{\"recipientEmails\":[],\"metrics\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.length()").value(0));
        assertEquals(.65, db.queryForObject(
                "select warning_value from thresholds where scope='PROJECT' and project_id='rbac-a' and metric_key='SYSTEM_CPU'",
                Double.class));
        assertEquals(.5, db.queryForObject(
                "select warning_value from thresholds where project_id='rbac-b' and instance_id='dev' and metric_key='SYSTEM_CPU'",
                Double.class));
    }

    @Test
    void instanceThresholdsRegisterIndividualItemsAndRemoveOnlyOmittedItems() throws Exception {
        clearInstanceThresholds();
        String path = "/api/v1/projects/rbac-a/instances/dev/thresholds";
        String cpu = """
                {"metricKey":"SYSTEM_CPU","warningValue":0.7,"criticalValue":0.9,
                 "useDefault":false,"recipientEmails":["cpu@example.com"]}
                """;
        String ram = """
                {"metricKey":"PHYSICAL_MEMORY","warningValue":0.75,"criticalValue":0.95,
                 "useDefault":false,"recipientEmails":["ram@example.com","support@example.com"]}
                """;
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json")
                        .content("{\"recipientEmails\":[],\"metrics\":[" + cpu + "," + ram + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.length()").value(2))
                .andExpect(jsonPath("$.metrics[0].recipientEmails[0]").value("cpu@example.com"))
                .andExpect(jsonPath("$.metrics[1].recipientEmails[0]").value("ram@example.com"));
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json")
                        .content("{\"recipientEmails\":[],\"metrics\":[" + ram + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.length()").value(1))
                .andExpect(jsonPath("$.metrics[0].metricKey").value("PHYSICAL_MEMORY"));
        assertEquals(0, db.queryForObject(
                "select count(*) from thresholds where project_id='rbac-a' and metric_key='SYSTEM_CPU'",
                Integer.class));
        assertEquals(1, db.queryForObject(
                "select count(*) from instance_threshold_contacts where project_id='rbac-a' and not(metric_emails ? 'SYSTEM_CPU')",
                Integer.class));
    }

    @Test
    void instanceThresholdsRejectInvalidInputsWithoutPartialWrites() throws Exception {
        clearInstanceThresholds();
        String path = "/api/v1/projects/rbac-a/instances/dev/thresholds";
        for (String body : List.of(
                instanceThresholdBody(false).replace("ops@example.com", "not-an-email"),
                instanceThresholdBody(false).replace("0.9", "1.1"),
                instanceThresholdBody(false).replace("PHYSICAL_MEMORY", "SYSTEM_CPU"),
                instanceThresholdBody(false).replace("\"PHYSICAL_MEMORY\"", "null"))) {
            mvc.perform(put(path).with(user("operator")).with(csrf())
                            .contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        }
        assertEquals(0, db.queryForObject(
                "select count(*) from thresholds where project_id='rbac-a'", Integer.class));
        assertEquals(0, db.queryForObject(
                "select count(*) from instance_threshold_contacts where project_id='rbac-a'", Integer.class));
    }

    @Test
    void instanceThresholdsRespectProjectRoleAndCsrfPermissions() throws Exception {
        clearInstanceThresholds();
        String path = "/api/v1/projects/rbac-a/instances/dev/thresholds";
        mvc.perform(get(path).with(user("viewer"))).andExpect(status().isOk());
        mvc.perform(get(path.replace("rbac-a", "rbac-b")).with(user("operator")))
                .andExpect(status().isForbidden());
        mvc.perform(put(path).with(user("viewer")).with(csrf())
                        .contentType("application/json").content(instanceThresholdBody(false)))
                .andExpect(status().isForbidden());
        mvc.perform(put(path).with(user("operator"))
                        .contentType("application/json").content(instanceThresholdBody(false)))
                .andExpect(status().isForbidden());
        mvc.perform(put(path.replace("rbac-a", "rbac-b")).with(user("operator")).with(csrf())
                        .contentType("application/json").content(instanceThresholdBody(false)))
                .andExpect(status().isForbidden());
    }

    @Test
    void instanceThresholdsSslDaysApplyToSelectedCertificateAndUpdateCachedStatus() throws Exception {
        clearInstanceThresholds();
        long target = certificateTarget("rbac-a", "ssl-threshold.example");
        db.update(
                """
                insert into certificate_latest(
                    certificate_target_id
                    ,days_remaining
                    ,chain_valid
                    ,hostname_valid
                    ,signature_algorithm
                    ,status)
                values (?, 10, true, true, 'SHA256withRSA', 'WARN')
                """,
                target);
        String path = "/api/v1/projects/rbac-a/instances/dev/thresholds";
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json")
                        .content(sslThresholdBody(target, 45, 14)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics[0].certificateTargetId").value(target))
                .andExpect(jsonPath("$.metrics[0].certificateTargetLabel").value("ssl-threshold.example:443"))
                .andExpect(jsonPath("$.metrics[0].recipientEmails[0]").value("ssl@example.com"));
        assertEquals("DOWN", db.queryForObject(
                "select status from certificate_latest where certificate_target_id=?", String.class, target));
        var resolver = context.getBean(com.monitoring.agent.metric.ThresholdResolver.class);
        assertEquals(14d, resolver.resolveCertificate("rbac-a", target).critical());
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json")
                        .content(sslThresholdBody(target, 7, 3)))
                .andExpect(status().isOk());
        assertEquals("UP", db.queryForObject(
                "select status from certificate_latest where certificate_target_id=?", String.class, target));
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json")
                        .content("{\"recipientEmails\":[],\"metrics\":[]}"))
                .andExpect(status().isOk());
        assertEquals("WARN", db.queryForObject(
                "select status from certificate_latest where certificate_target_id=?", String.class, target));
        assertEquals(30d, resolver.resolveCertificate("rbac-a", target).warning());
    }

    @Test
    void instanceThresholdsSslTargetsAndDaysAreValidatedBeforeWriting() throws Exception {
        clearInstanceThresholds();
        long local = certificateTarget("rbac-a", "ssl-local.example");
        long foreign = certificateTarget("rbac-b", "ssl-foreign.example");
        String path = "/api/v1/projects/rbac-a/instances/dev/thresholds";
        mvc.perform(get(path + "/certificates").with(user("operator")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + local + ")]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id == " + foreign + ")]").isEmpty());
        for (String body : List.of(
                sslThresholdBody(local, 7, 30),
                sslThresholdBody(local, 30.5, 7),
                sslThresholdBody(foreign, 30, 7),
                sslThresholdBody(local, 30, 7).replace("\"certificateTargetId\":" + local, "\"certificateTargetId\":null"))) {
            mvc.perform(put(path).with(user("operator")).with(csrf())
                            .contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        }
        assertEquals(0, db.queryForObject(
                "select count(*) from thresholds where project_id='rbac-a'", Integer.class));
        db.update(
                """
                insert into instances(
                    project_id
                    ,instance_id
                    ,display_name
                    ,agent_base_url
                    ,token_ciphertext
                    ,token_iv)
                select project_id, 'ssl-other', 'Other', 'https://other.example/monitor', token_ciphertext, token_iv
                from instances
                where project_id = 'rbac-a' and instance_id = 'dev'
                on conflict do nothing
                """);
        db.update("insert into instance_certificate_thresholds values ('rbac-a','ssl-other',?)", local);
        mvc.perform(put(path).with(user("operator")).with(csrf())
                        .contentType("application/json").content(sslThresholdBody(local, 30, 7)))
                .andExpect(status().isBadRequest());
        mvc.perform(get(path + "/certificates").with(user("operator")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + local + ")]").isEmpty());
        assertEquals("ssl-other", db.queryForObject(
                "select instance_id from instance_certificate_thresholds where certificate_target_id=?",
                String.class, local));
    }

    private long certificateTarget(String projectId, String hostname) {
        db.update("delete from certificate_targets where project_id=? and hostname=?", projectId, hostname);
        return db.queryForObject(
                """
                insert into certificate_targets(
                    project_id
                    ,hostname
                    ,port
                    ,sni_hostname)
                values (?, ?, 443, ?)
                returning certificate_target_id
                """,
                Long.class,
                projectId,
                hostname,
                hostname);
    }

    private String sslThresholdBody(long target, double warning, double critical) {
        return new tools.jackson.databind.ObjectMapper().writeValueAsString(
                java.util.Map.of(
                        "recipientEmails", List.of(),
                        "metrics", List.of(java.util.Map.of(
                                "metricKey", "CERTIFICATE_DAYS",
                                "warningValue", warning,
                                "criticalValue", critical,
                                "useDefault", false,
                                "recipientEmails", List.of("ssl@example.com"),
                                "certificateTargetId", target))));
    }

    private void clearInstanceThresholds() {
        db.update("delete from instance_certificate_thresholds where project_id in ('rbac-a','rbac-b')");
        db.update("delete from thresholds where project_id in ('rbac-a','rbac-b')");
        db.update("delete from instance_threshold_contacts where project_id in ('rbac-a','rbac-b')");
    }

    private String instanceThresholdBody(boolean useDefault) {
        var metrics = List.of("SYSTEM_CPU", "PHYSICAL_MEMORY", "JVM_HEAP", "DISK", "DB_POOL", "API_LATENCY_MS")
                .stream()
                .map(key -> java.util.Map.of(
                        "metricKey", key,
                        "warningValue", "API_LATENCY_MS".equals(key) ? 2000 : .7,
                        "criticalValue", "API_LATENCY_MS".equals(key) ? 5000 : .9,
                        "useDefault", useDefault,
                        "recipientEmails", List.of("cpu@example.com")))
                .toList();
        return new tools.jackson.databind.ObjectMapper().writeValueAsString(
                java.util.Map.of("recipientEmails", List.of("ops@example.com", "ops@example.com"), "metrics", metrics));
    }

}
