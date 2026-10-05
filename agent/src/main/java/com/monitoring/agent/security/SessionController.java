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

    SessionController(JdbcTemplate db) {
        this.db = db;
    }

    @GetMapping("/me")
    Map<String, Object> me(Authentication principal) {
        return Map.of(
                "project_ids",
                db.queryForList(
                        "select project_id from user_project_access where username=? order by project_id",
                        String.class,
                        principal.getName()),
                "username",
                principal.getName(),
                "role",
                principal.getAuthorities().stream()
                        .map(a -> a.getAuthority().replace("ROLE_", ""))
                        .filter(
                                role ->
                                        java.util.List.of("ADMIN", "OPERATOR", "VIEWER")
                                                .contains(role))
                        .findFirst()
                        .orElse("VIEWER"));
    }
}
