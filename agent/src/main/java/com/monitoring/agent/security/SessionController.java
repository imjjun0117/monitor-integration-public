package com.monitoring.agent.security;

import org.springframework.security.core.Authentication;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 현재 로그인 사용자와 권한 정보 반환
@RestController
@RequestMapping("/api/v1/session")
public final class SessionController {
    private final JdbcTemplate db;
    private final MenuAccess menus;

    SessionController(JdbcTemplate db, MenuAccess menus) {
        this.db = db;
        this.menus = menus;
    }

    @GetMapping("/me")
    Map<String, Object> me(Authentication principal) {
        String role =
                db.queryForObject(
                        "select role from app_users where username=?",
                        String.class,
                        principal.getName());
        String roleName =
                db.queryForObject("select name from app_roles where role_id=?", String.class, role);
        return Map.of(
                "role_id",
                role,
                "role_name",
                roleName,
                "menus",
                menus.menus(role),
                "project_ids",
                db.queryForList(
                        "select project_id from user_project_access where username=? order by"
                                + " project_id",
                        String.class,
                        principal.getName()),
                "username",
                principal.getName(),
                "role",
                principal.getAuthorities().stream()
                        .map(a -> a.getAuthority().replace("ROLE_", ""))
                        .filter(
                                authorityRole ->
                                        java.util.List.of("ADMIN", "OPERATOR", "VIEWER")
                                                .contains(authorityRole))
                        .findFirst()
                        .orElse("VIEWER"));
    }
}
