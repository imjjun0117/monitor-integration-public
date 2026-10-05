package com.monitoring.agent.check;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 점검 설정 변경 및 수동 실행 요청 처리
@RestController
@RequestMapping("/api/v1/api-checks")
public final class CheckActionsController {
    private static final long RATE_LIMIT_MS = 30_000L;
    private final Map<String, Long> lastRuns = new ConcurrentHashMap<>();
    private final JdbcTemplate db;
    private final CheckRunService checks;

    CheckActionsController(JdbcTemplate db, CheckRunService checks) {
        this.db = db;
        this.checks = checks;
    }

    public record Usage(Boolean enabled) {}

    public record Settings(
            Boolean monitoringEnabled, Boolean automaticEnabled, Integer checkIntervalSeconds) {}

    public record ServiceWrite(
            @com.fasterxml.jackson.annotation.JsonProperty(value = "profile", required = true)
                    tools.jackson.databind.JsonNode profile) {}

    @PutMapping("/{projectId}/{instanceId}/{checkId}/service")
    ResponseEntity<?> service(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @PathVariable("checkId") String checkId,
            @RequestBody ServiceWrite request) {
        try {
            ServiceProfiles.validate(request.profile());
        } catch (IllegalArgumentException invalid) {
            return ResponseEntity.badRequest().body(Map.of("code", "SERVICE_PROFILE_INVALID"));
        }
        String profile = request.profile() == null ? "null" : request.profile().toString();
        int changed =
                db.update(
                        """
            update check_definitions set service_profile_json=cast(? as jsonb)
            where project_id=? and instance_id=? and check_id=? and enabled and category='API'
            """,
                        profile,
                        projectId,
                        instanceId,
                        checkId);
        return changed == 0
                ? ResponseEntity.badRequest().body(Map.of("code", "CHECK_NOT_REGISTERED"))
                : ResponseEntity.noContent().build();
    }

    @PutMapping("/{projectId}/{instanceId}/{checkId}/settings")
    ResponseEntity<?> settings(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @PathVariable("checkId") String checkId,
            @RequestBody Settings settings) {
        if (settings.monitoringEnabled() == null
                || settings.automaticEnabled() == null
                || settings.checkIntervalSeconds() == null
                || settings.checkIntervalSeconds() < 60
                || settings.checkIntervalSeconds() > 604800) {
            return ResponseEntity.badRequest().body(Map.of("code", "CHECK_SETTINGS_INVALID"));
        }
        int changed =
                db.update(
                        """
            update check_definitions set monitoring_enabled=?,automatic_enabled=?,check_interval_seconds=?
            where project_id=? and instance_id=? and check_id=? and enabled
            """,
                        settings.monitoringEnabled(),
                        settings.automaticEnabled(),
                        settings.checkIntervalSeconds(),
                        projectId,
                        instanceId,
                        checkId);
        return changed == 0
                ? ResponseEntity.badRequest().body(Map.of("code", "CHECK_NOT_REGISTERED"))
                : ResponseEntity.noContent().build();
    }

    @PutMapping("/{projectId}/{instanceId}/{checkId}/usage")
    ResponseEntity<?> usage(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @PathVariable("checkId") String checkId,
            @RequestBody Usage usage) {
        if (usage.enabled() == null) {
            return ResponseEntity.badRequest().body(Map.of("code", "USAGE_REQUIRED"));
        }
        int changed =
                db.update(
                        """
            update check_definitions set monitoring_enabled=?
            where project_id=? and instance_id=? and check_id=? and enabled
            """,
                        usage.enabled(),
                        projectId,
                        instanceId,
                        checkId);
        if (changed == 0) {
            return ResponseEntity.badRequest().body(Map.of("code", "CHECK_NOT_REGISTERED"));
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{projectId}/{instanceId}/{checkId}/run")
    ResponseEntity<Map<String, String>> run(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @PathVariable("checkId") String checkId) {
        var known =
                db.queryForList(
                        """
            select category,monitoring_enabled from check_definitions
            where project_id=? and instance_id=? and check_id=? and enabled
            """,
                        projectId,
                        instanceId,
                        checkId);
        if (known.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("code", "CHECK_NOT_REGISTERED"));
        }
        if (Boolean.FALSE.equals(known.getFirst().get("monitoring_enabled"))) {
            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "code",
                                    "API".equals(known.getFirst().get("category"))
                                            ? "API_CHECK_UNUSED"
                                            : "CHECK_UNUSED"));
        }
        String key = projectId + "/" + instanceId + "/" + checkId;
        long now = System.currentTimeMillis();
        Long previous = lastRuns.putIfAbsent(key, now);
        if (previous != null && now - previous < RATE_LIMIT_MS) {
            return ResponseEntity.status(429).body(Map.of("code", "RATE_LIMITED"));
        }
        lastRuns.put(key, now);
        CheckRunService.Submission submission = checks.submit(projectId, instanceId, checkId);
        if (submission != CheckRunService.Submission.ACCEPTED) {
            return ResponseEntity.status(429).body(Map.of("code", submission.name()));
        }
        return ResponseEntity.accepted().body(Map.of("status", "ACCEPTED"));
    }
}
