package com.monitoring.agent.transport;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

// 프로젝트 접근 권한이 적용된 연결 설정 및 저장 결과 조회
@RestController
@RequestMapping("/api/v1/projects/{projectId}")
public final class TransportController {
    private final JdbcTemplate db;
    private final CollectorTransportHub hub;
    private final ObjectMapper json;

    public TransportController(JdbcTemplate db, CollectorTransportHub hub, ObjectMapper json) {
        this.db = db;
        this.hub = hub;
        this.json = json;
    }

    @GetMapping("/xlog-settings")
    public Map<String, Object> xlog(@PathVariable("projectId") String projectId) {
        var rows =
                db.queryForList(
                        """
                select
                    xlog_enabled as enabled
                from projects
                where project_id = ?
                """,
                        projectId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND");
        }
        return rows.getFirst();
    }

    @PutMapping("/xlog-settings")
    public Map<String, Object> xlog(
            @PathVariable("projectId") String projectId, @RequestBody XlogSettings value) {
        if (value.enabled == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ENABLED_REQUIRED");
        }
        if (db.update(
                        """
                update projects
                set xlog_enabled = ?
                    ,updated_at = now()
                where project_id = ?
                """,
                        value.enabled,
                        projectId)
                == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND");
        }
        for (var row :
                db.queryForList(
                        """
                select
                    instance_id
                from instances
                where project_id = ?
                    and enabled
                """,
                        projectId)) {
            String instance = row.get("instance_id").toString();
            try {
                hub.configure(projectId, instance);
            } catch (Exception failed) {
                // 설정 전달 실패 시 기존 수집을 종료하고 다음 수동 연결부터 적용
                hub.stop(projectId, instance);
            }
        }
        return xlog(projectId);
    }

    @GetMapping("/instances/{instanceId}/connection")
    public Map<String, Object> status(
            @PathVariable("projectId") String projectId, @PathVariable("instanceId") String instanceId) {
        return hub.status(projectId, instanceId);
    }

    @PutMapping("/instances/{instanceId}/connection")
    public Map<String, Object> mode(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestBody Mode value) {
        if (!"HTTP".equals(value.mode) && !"WSS".equals(value.mode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_TRANSPORT_MODE");
        }
        hub.status(projectId, instanceId);
        hub.stop(projectId, instanceId);
        db.update(
                """
                update instances
                set transport_mode = ?
                    ,updated_at = now()
                where project_id = ?
                    and instance_id = ?
                """,
                value.mode,
                projectId,
                instanceId);
        return hub.status(projectId, instanceId);
    }

    @PostMapping("/instances/{instanceId}/connection/start")
    public Map<String, Object> start(
            @PathVariable("projectId") String projectId, @PathVariable("instanceId") String instanceId) throws Exception {
        return hub.start(projectId, instanceId);
    }

    @PostMapping("/instances/{instanceId}/connection/stop")
    public Map<String, Object> stop(
            @PathVariable("projectId") String projectId, @PathVariable("instanceId") String instanceId) {
        hub.status(projectId, instanceId);
        hub.stop(projectId, instanceId);
        return hub.status(projectId, instanceId);
    }

    @GetMapping("/instances/{instanceId}/events")
    public Map<String, Object> events(
            @PathVariable("projectId") String projectId,
            @PathVariable("instanceId") String instanceId,
            @RequestParam(name = "kind", defaultValue = "XLOG") String kind,
            @RequestParam(name = "beforeId", defaultValue = "0") long beforeId) {
        if (!"XLOG".equals(kind) && !"LOG".equals(kind)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_EVENT_KIND");
        }
        if ("LOG".equals(kind)
                && SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                        .noneMatch(
                                authority ->
                                        List.of("ROLE_ADMIN", "ROLE_OPERATOR")
                                                .contains(authority.getAuthority()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        hub.status(projectId, instanceId);
        List<Map<String, Object>> items =
                db.query(
                        """
                select id
                    ,received_at
                    ,payload::text
                from collector_events
                where project_id = ?
                    and instance_id = ?
                    and kind = ?
                    and (? = 0 or id < ?)
                order by id desc
                limit 100
                """,
                        (rs, index) ->
                                Map.of(
                                        "id", rs.getLong("id"),
                                        "received_at",
                                                rs.getTimestamp("received_at")
                                                        .toInstant()
                                                        .toString(),
                                        "payload", json.readTree(rs.getString("payload"))),
                        projectId,
                        instanceId,
                        kind,
                        beforeId,
                        beforeId);
        return Map.of("items", items);
    }

    public record XlogSettings(Boolean enabled) {}

    public record Mode(String mode) {}
}
