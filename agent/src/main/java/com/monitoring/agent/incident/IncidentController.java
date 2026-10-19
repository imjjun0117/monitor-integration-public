package com.monitoring.agent.incident;

import com.monitoring.agent.security.MenuAccess;
import com.monitoring.agent.security.ProjectAccess;
import com.monitoring.agent.web.ApiPage;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

// 장애 조회·담당자·처리 상태·조치 메모 및 조사 자료 제공
@RestController
@RequestMapping("/api/v1/incidents")
public class IncidentController {
    private final JdbcTemplate db;
    private final IncidentQuery query;
    private final MenuAccess menus;

    public IncidentController(JdbcTemplate db, IncidentQuery query, MenuAccess menus) {
        this.db = db;
        this.query = query;
        this.menus = menus;
    }

    @GetMapping
    public ApiPage<Map<String, Object>> list(
            @RequestParam(name = "project", required = false) String project,
            @RequestParam(name = "state", required = false) String state,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size) {
        return query.list(project, state == null ? "ACTIVE" : state, page, size);
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable("id") long id) {
        Map<String, Object> incident = query.get(id, false);
        List<String> assignees = ProjectAccess.hasRole("VIEWER")
                ? List.of() : query.assignees(incident.get("project_id").toString());
        return Map.of(
                "incident", incident,
                "events", query.events(id),
                "assignees", assignees);
    }

    @GetMapping("/{id}/evidence")
    public Map<String, Object> evidence(
            @PathVariable("id") long id,
            @RequestParam(name = "at", required = false) Instant at,
            Authentication user) {
        Map<String, Object> incident = query.get(id, false);
        String role =
                db.queryForObject(
                        "select role from app_users where username = ?",
                        String.class,
                        user.getName());
        boolean logsAllowed =
                (ProjectAccess.hasRole("ADMIN") || ProjectAccess.hasRole("OPERATOR"))
                        && menus.allowed("/api/v1/projects/p/instances/i/logs", role, false);
        // 기존 원문 로그·전체 변경 이력 권한을 조사 화면에서도 유지
        return query.evidence(incident, at, logsAllowed, ProjectAccess.hasRole("ADMIN"));
    }

    @PostMapping("/{id}/actions")
    @Transactional
    public Map<String, Object> act(
            @PathVariable("id") long id, @RequestBody IncidentAction action, Authentication actor) {
        if (!ProjectAccess.hasRole("ADMIN") && !ProjectAccess.hasRole("OPERATOR")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (action == null
                || action.version() == null
                || action.version() < 0
                || action.action() == null
                || !List.of("ACKNOWLEDGE", "START", "ASSIGN", "COMMENT").contains(action.action())
                || (action.note() != null && action.note().length() > 2000)) {
            throw new IllegalArgumentException("INCIDENT_ACTION_INVALID");
        }
        Map<String, Object> incident = query.get(id, true);
        if (((Number) incident.get("version")).longValue() != action.version()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "INCIDENT_CHANGED");
        }

        String state = incident.get("state").toString();
        String assignee = (String) incident.get("assignee");
        String type = action.action();
        String note = action.note() == null ? null : action.note().strip();
        switch (action.action()) {
            case "ACKNOWLEDGE" -> {
                if (!"OPEN".equals(state)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "INCIDENT_CHANGED");
                }
                state = "ACKNOWLEDGED";
                type = state;
            }
            case "START" -> {
                if (!List.of("OPEN", "ACKNOWLEDGED").contains(state)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "INCIDENT_CHANGED");
                }
                state = "IN_PROGRESS";
                type = state;
            }
            case "ASSIGN" -> {
                assignee =
                        action.assignee() == null || action.assignee().isBlank()
                                ? null
                                : action.assignee();
                if (assignee != null
                        && !query.assignees(incident.get("project_id").toString())
                                .contains(assignee)) {
                    throw new IllegalArgumentException("INCIDENT_ASSIGNEE_INVALID");
                }
                type = "ASSIGNED";
            }
            case "COMMENT" -> {
                if (note == null || note.isEmpty()) {
                    throw new IllegalArgumentException("INCIDENT_NOTE_REQUIRED");
                }
            }
            default -> throw new IllegalArgumentException("INCIDENT_ACTION_INVALID");
        }

        // 상태와 조치 이력을 같은 트랜잭션에 기록하고 낙관적 버전으로 덮어쓰기 차단
        db.update(
                """
                update incidents
                set state = ?
                    ,assignee = ?
                    ,version = version + 1
                where
                    incident_id = ?
                """,
                state,
                assignee,
                id);
        db.update(
                """
                insert into incident_events(
                    incident_id
                    ,actor
                    ,event_type
                    ,note
                    ,assignee)
                values (?, ?, ?, ?, ?)
                """,
                id,
                actor.getName(),
                type,
                note,
                assignee);
        return query.get(id, false);
    }

    public record IncidentAction(Long version, String action, String assignee, String note) {}
}
