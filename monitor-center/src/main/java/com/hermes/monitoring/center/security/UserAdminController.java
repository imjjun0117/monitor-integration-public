package com.hermes.monitoring.center.security;

import com.hermes.monitoring.center.web.ApiPage;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

// 사용자 계정 및 프로젝트 권한 설정 처리
@RestController
@RequestMapping("/api/v1/settings/users")
public class UserAdminController {
    private final JdbcTemplate db;
    private final PasswordEncoder passwords;

    UserAdminController(JdbcTemplate db, PasswordEncoder passwords) {
        this.db = db;
        this.passwords = passwords;
    }

    @GetMapping
    ApiPage<Map<String, Object>> list(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "50") int size) {
        if (page < 0 || size < 1 || size > 200) {
            throw new IllegalArgumentException("PAGE_INVALID");
        }
        var rows =
                db.queryForList(
                        "select username,role,enabled,created_at,updated_at from app_users order by username limit ? offset ?",
                        size,
                        (long) page * size);
        var assignments =
                db.queryForList(
                        "select username,project_id from user_project_access order by project_id");
        for (var row : rows) {
            row.put(
                    "project_ids",
                    assignments.stream()
                            .filter(a -> row.get("username").equals(a.get("username")))
                            .map(a -> a.get("project_id"))
                            .toList());
        }
        Long total = db.queryForObject("select count(*) from app_users", Long.class);
        return new ApiPage<>(rows, page, size, total == null ? 0 : total);
    }

    @PostMapping
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    @Transactional
    void create(@RequestBody UserWrite value) {
        validate(value, true);
        db.update(
                "insert into app_users(username,password_hash,role,enabled) values(?,?,?,?)",
                value.username(),
                passwords.encode(value.password()),
                value.role(),
                value.enabled());
        assignments(value);
    }

    @PutMapping("/{username}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    @Transactional
    void update(@PathVariable("username") String username, @RequestBody UserWrite value) {
        validate(value, false);
        if (!username.equals(value.username())) {
            throw new IllegalArgumentException("USER_INVALID");
        }
        db.execute("select pg_advisory_xact_lock(hashtext('hermes.user-administration'))");
        if (username.equals(SecurityContextHolder.getContext().getAuthentication().getName())
                && (!value.enabled() || !"ADMIN".equals(value.role()))) {
            throw new IllegalArgumentException("SELF_ADMIN_REQUIRED");
        }
        var original =
                db.queryForMap(
                        "select role,enabled from app_users where username=? for update", username);
        if ("ADMIN".equals(original.get("role"))
                && Boolean.TRUE.equals(original.get("enabled"))
                && (!value.enabled() || !"ADMIN".equals(value.role()))) {
            Long admins =
                    db.queryForObject(
                            "select count(*) from app_users where enabled and role='ADMIN'",
                            Long.class);
            if (admins == null || admins <= 1) {
                throw new IllegalArgumentException("LAST_ADMIN_REQUIRED");
            }
        }
        if (value.password() == null || value.password().isEmpty()) {
            db.update(
                    "update app_users set role=?,enabled=?,updated_at=now() where username=?",
                    value.role(),
                    value.enabled(),
                    username);
        } else {
            db.update(
                    "update app_users set role=?,enabled=?,password_hash=?,security_version=security_version+1,updated_at=now() where username=?",
                    value.role(),
                    value.enabled(),
                    passwords.encode(value.password()),
                    username);
        }
        assignments(value);
    }

    private void assignments(UserWrite value) {
        // 변경되지 않은 권한은 유지하여 불필요한 회수·부여 이력 방지
        var existing =
                db.queryForList(
                        "select project_id from user_project_access where username=?",
                        String.class,
                        value.username());
        for (String id : existing) {
            if (!value.projectIds().contains(id)) {
                db.update(
                        "delete from user_project_access where username=? and project_id=?",
                        value.username(),
                        id);
            }
        }
        for (String id : value.projectIds()) {
            if (!existing.contains(id)) {
                db.update(
                        "insert into user_project_access(username,project_id) values(?,?)",
                        value.username(),
                        id);
            }
        }
    }

    private void validate(UserWrite value, boolean creating) {
        if (value == null
                || value.username() == null
                || !value.username().matches("[A-Za-z0-9][A-Za-z0-9._@-]{1,79}")
                || !List.of("ADMIN", "OPERATOR", "VIEWER")
                        .contains(value.role() == null ? "" : value.role())
                || value.enabled() == null
                || value.projectIds() == null
                || value.projectIds().size() > 200
                || value.projectIds().stream()
                        .anyMatch(id -> id == null || !id.matches("[a-z0-9][a-z0-9._-]{1,63}"))
                || value.projectIds().stream().distinct().count() != value.projectIds().size()
                || ("ADMIN".equals(value.role()) && !value.projectIds().isEmpty())) {
            throw new IllegalArgumentException("USER_INVALID");
        }
        boolean supplied = value.password() != null && !value.password().isEmpty();
        if ((creating && !supplied)
                || (supplied
                        && (value.password().length() < 12
                                || value.password().getBytes(StandardCharsets.UTF_8).length
                                        > 72))) {
            throw new IllegalArgumentException("PASSWORD_INVALID");
        }
        for (String id : value.projectIds()) {
            if (!Boolean.TRUE.equals(
                    db.queryForObject(
                            "select exists(select 1 from projects where project_id=?)",
                            Boolean.class,
                            id))) {
                throw new IllegalArgumentException("PROJECT_NOT_FOUND");
            }
        }
    }

    public record UserWrite(
            String username,
            String password,
            String role,
            Boolean enabled,
            List<String> projectIds) {}
}
