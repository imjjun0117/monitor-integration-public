package com.monitoring.agent.project;

import com.monitoring.agent.collection.CollectorClient;
import com.monitoring.agent.collection.ConnectionErrorCode;
import com.monitoring.agent.collection.SsrfGuard;
import com.monitoring.agent.security.TokenCipher;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// 인스턴스 연결 확인 및 관리 요청 처리
@RestController
@RequestMapping("/api/v1/projects/{projectId}/instances/{instanceId}")
public final class InstanceActionsController {
    private final JdbcTemplate db;
    private final TokenCipher cipher;
    private final CollectorClient client;
    private final ObjectMapper json;

    @Autowired
    InstanceActionsController(
            JdbcTemplate db,
            TokenCipher cipher,
            ObjectMapper json,
            @Value("${hermes.agent-allowed-cidrs:}") String cidrs,
            @Value("${hermes.agent-allowed-hosts:}") String hosts,
            @Value("${hermes.agent-allowlist-file:}") String allowlistFile) {
        this.db = db;
        this.cipher = cipher;
        this.json = json;
        this.client = new CollectorClient(new SsrfGuard(cidrs, hosts, allowlistFile));
    }

    InstanceActionsController(
            JdbcTemplate db, TokenCipher cipher, ObjectMapper json, String cidrs, String hosts) {
        this(db, cipher, json, cidrs, hosts, "");
    }

    InstanceActionsController(
            JdbcTemplate db, TokenCipher cipher, ObjectMapper json, String cidrs) {
        this(db, cipher, json, cidrs, "");
    }

    @PutMapping
    void update(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestBody Update value) {
        validate(projectId, instanceId, value);
        try {
            int interval = value.pollIntervalSeconds();
            if (value.token() == null || value.token().isBlank()) {
                db.update(
                        """
                    update instances set
                      display_name=?,environment=?,agent_base_url=?,api_checks_enabled=?,
                      poll_interval_seconds=?,enabled=?,updated_at=now()
                    where project_id=? and instance_id=?
                    """,
                        value.displayName(),
                        value.environment(),
                        value.agentBaseUrl(),
                        value.apiChecksEnabled(),
                        interval,
                        value.enabled(),
                        projectId,
                        instanceId);
                return;
            }
            TokenCipher.EncryptedToken encrypted = cipher.encrypt(value.token());
            db.update(
                    """
                update instances set
                  display_name=?,environment=?,agent_base_url=?,token_ciphertext=?,token_iv=?,
                  api_checks_enabled=?,poll_interval_seconds=?,enabled=?,updated_at=now()
                where project_id=? and instance_id=?
                """,
                    value.displayName(),
                    value.environment(),
                    value.agentBaseUrl(),
                    encrypted.ciphertext(),
                    encrypted.iv(),
                    value.apiChecksEnabled(),
                    interval,
                    value.enabled(),
                    projectId,
                    instanceId);
        } catch (DataIntegrityViolationException error) {
            throw new ProjectConflictException("AGENT_URL_ALREADY_EXISTS");
        }
    }

    @PostMapping("/test")
    Map<String, Object> test(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId)
            throws Exception {
        Map<String, Object> value =
                db.queryForMap(
                        """
            select agent_base_url,token_ciphertext,token_iv from instances
            where project_id=? and instance_id=?
            """,
                        projectId,
                        instanceId);
        try {
            String token =
                    cipher.decrypt(
                            (byte[]) value.get("token_ciphertext"), (byte[]) value.get("token_iv"));
            JsonNode info =
                    json.readTree(client.get((String) value.get("agent_base_url"), "info", token));
            JsonNode identity = info.path("identity");
            if (!projectId.equals(identity.path("project_id").asString())
                    || !instanceId.equals(identity.path("instance_id").asString())) {
                throw new IllegalStateException("IDENTITY_MISMATCH");
            }
            return Map.of("status", "UP");
        } catch (Exception error) {
            return Map.of("status", "DOWN", "code", ConnectionErrorCode.classify(error));
        }
    }

    private void validate(String projectId, String instanceId, Update value) {
        ProjectValidator.validateInstanceUpdate(projectId, instanceId, value);
    }

    record Update(
            String instanceId,
            String displayName,
            String environment,
            String agentBaseUrl,
            String token,
            Boolean apiChecksEnabled,
            Integer pollIntervalSeconds,
            Boolean enabled) {}
}
