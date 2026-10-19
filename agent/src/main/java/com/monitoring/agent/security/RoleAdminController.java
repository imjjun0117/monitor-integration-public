package com.monitoring.agent.security;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

// 역할 등록 및 사용자 배정 관리. 기준 권한과 프로젝트 접근 제한 유지
@RestController
@RequestMapping("/api/v1/settings/roles")
public class RoleAdminController {
    private final JdbcTemplate db;

    RoleAdminController(JdbcTemplate db) {
        this.db = db;
    }

    @GetMapping
    List<Map<String, Object>> list() {
        requireAdmin();
        return db.queryForList(
                """
                select r.role_id as "roleId",r.name,r.description,r.base_role as "baseRole",
                r.enabled,r.builtin,count(u.username)::integer as "userCount"
                from app_roles r left join app_users u on u.role=r.role_id
                group by r.role_id order by r.builtin desc,r.name,r.role_id
                """);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    void create(@RequestBody RoleWrite value) {
        requireAdmin();
        validate(value);
        if (!List.of("OPERATOR", "VIEWER").contains(value.baseRole())) {
            throw new IllegalArgumentException("ROLE_INVALID");
        }
        db.update(
                "insert into app_roles(role_id,name,description,base_role,enabled)"
                    + " values(?,?,?,?,?)",
                value.roleId(),
                value.name().strip(),
                value.description().strip(),
                value.baseRole(),
                value.enabled());
        // 신규 역할은 메뉴 권한을 부여하기 전까지 접근 차단
        db.update(
                "insert into role_menu_permissions(role,menu_id,can_read,can_write) select"
                    + " ?,menu_id,false,false from app_menus",
                value.roleId());
    }

    @PutMapping("/{roleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void update(@PathVariable("roleId") String roleId, @RequestBody RoleWrite value) {
        requireAdmin();
        validate(value);
        var original = db.queryForMap("select * from app_roles where role_id=? for update", roleId);
        // 기준 권한 변경에 따른 의도치 않은 승격 방지
        if (!roleId.equals(value.roleId())
                || Boolean.TRUE.equals(original.get("builtin"))
                || !original.get("base_role").equals(value.baseRole())) {
            throw new IllegalArgumentException("ROLE_PROTECTED");
        }
        db.update(
                "update app_roles set name=?,description=?,enabled=? where role_id=?",
                value.name().strip(),
                value.description().strip(),
                value.enabled(),
                roleId);
    }

    @DeleteMapping("/{roleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void delete(@PathVariable("roleId") String roleId) {
        requireAdmin();
        var original =
                db.queryForMap("select builtin from app_roles where role_id=? for update", roleId);
        if (Boolean.TRUE.equals(original.get("builtin"))) {
            throw new IllegalArgumentException("ROLE_PROTECTED");
        }
        // 배정된 사용자가 있으면 외래 키에서 삭제 차단
        db.update("delete from app_roles where role_id=?", roleId);
    }

    @GetMapping("/{roleId}/users")
    List<Map<String, Object>> users(@PathVariable("roleId") String roleId) {
        requireAdmin();
        db.queryForObject("select role_id from app_roles where role_id=?", String.class, roleId);
        return db.queryForList(
                "select username,role,enabled,(role=?) as assigned from app_users order by"
                    + " username",
                roleId);
    }

    @PutMapping("/{roleId}/users")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void assign(@PathVariable("roleId") String roleId, @RequestBody List<String> usernames) {
        requireAdmin();
        if (usernames == null
                || usernames.size() > 1000
                || usernames.stream()
                        .anyMatch(
                                name ->
                                        name == null
                                                || !name.matches(
                                                        "[A-Za-z0-9][A-Za-z0-9._@-]{1,79}"))
                || usernames.stream().distinct().count() != usernames.size()) {
            throw new IllegalArgumentException("USER_INVALID");
        }
        db.execute("select pg_advisory_xact_lock(hashtext('hermes.user-administration'))");
        var role =
                db.queryForMap("select enabled from app_roles where role_id=? for update", roleId);
        if (!Boolean.TRUE.equals(role.get("enabled"))) {
            throw new IllegalArgumentException("ROLE_DISABLED");
        }
        var users =
                db.queryForList("select username,role from app_users order by username for update");
        if (usernames.stream()
                .anyMatch(
                        name ->
                                users.stream()
                                        .noneMatch(user -> name.equals(user.get("username"))))) {
            throw new IllegalArgumentException("USER_INVALID");
        }
        for (var user : users) {
            String username = user.get("username").toString();
            String previous = user.get("role").toString();
            String next =
                    usernames.contains(username)
                            ? roleId
                            : roleId.equals(previous) ? "VIEWER" : previous;
            // 관리자 회수는 사용자 관리에서 자기 계정·마지막 관리자 검증 후 처리
            if ("ADMIN".equals(previous) && !"ADMIN".equals(next)) {
                throw new IllegalArgumentException("ADMIN_ASSIGNMENT_PROTECTED");
            }
            if (!previous.equals(next)) {
                db.update(
                        "update app_users set role=?,updated_at=now() where username=?",
                        next,
                        username);
                if ("ADMIN".equals(next)) {
                    db.update("delete from user_project_access where username=?", username);
                }
            }
        }
    }

    private void validate(RoleWrite value) {
        if (value == null
                || value.roleId() == null
                || !value.roleId().matches("[A-Z][A-Z0-9_]{1,19}")
                || value.name() == null
                || value.name().isBlank()
                || value.name().length() > 60
                || value.name().chars().anyMatch(Character::isISOControl)
                || value.description() == null
                || value.description().length() > 500
                || value.baseRole() == null
                || value.enabled() == null) {
            throw new IllegalArgumentException("ROLE_INVALID");
        }
    }

    private void requireAdmin() {
        if (!ProjectAccess.hasRole("ADMIN")) {
            throw new AccessDeniedException("FORBIDDEN");
        }
    }

    public record RoleWrite(
            String roleId, String name, String description, String baseRole, Boolean enabled) {}
}
