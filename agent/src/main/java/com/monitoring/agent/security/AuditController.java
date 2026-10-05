package com.monitoring.agent.security;

import com.monitoring.agent.web.ApiPage;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

// 접근 및 설정 변경 이력 조회
@RestController
@RequestMapping("/api/v1/settings/audit")
public final class AuditController {
    private final JdbcTemplate db;
    private final ObjectMapper json;

    AuditController(JdbcTemplate db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    @GetMapping
    ApiPage<Map<String, Object>> list(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size,
            @RequestParam(name = "project", required = false) String project,
            @RequestParam(name = "actor", required = false) String actor) {
        if (page < 0 || size < 1 || size > 200) {
            throw new IllegalArgumentException("PAGE_INVALID");
        }
        List<Object> args = new ArrayList<>();
        String where = " where true";
        if (project != null && !project.isBlank()) {
            where += " and project_id=?";
            args.add(project);
        }
        if (actor != null && !actor.isBlank()) {
            where += " and actor=?";
            args.add(actor);
        }
        Long total =
                db.queryForObject(
                        "select count(*) from audit_log" + where, Long.class, args.toArray());
        args.add(size);
        args.add((long) page * size);
        var items =
                db.queryForList(
                        "select audit_id,occurred_at,actor,action,entity_type,project_id,target_id,outcome,before_values::text,after_values::text from audit_log"
                                + where
                                + " order by occurred_at desc,audit_id desc limit ? offset ?",
                        args.toArray());
        for (var item : items) {
            for (String key : List.of("before_values", "after_values")) {
                Object raw = item.get(key);
                item.put(key, raw == null ? null : json.readTree(raw.toString()));
            }
        }
        return new ApiPage<>(items, page, size, total == null ? 0 : total);
    }
}
