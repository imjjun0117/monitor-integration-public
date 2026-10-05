package com.hermes.monitoring.center.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

// 현재 사용자 권한으로 프로젝트 조회 범위 제한
public final class ProjectAccess {
    private ProjectAccess() {}

    public static boolean hasRole(String role) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null
                && auth.getAuthorities().stream()
                        .anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
    }

    public static String sql(String column) {
        if (!column.matches("[a-z_]+\\.project_id")) {
            throw new IllegalArgumentException("SCOPE_COLUMN_INVALID");
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        // 내부 조회와 테스트는 HTTP 사용자 정보 없이 실행. HTTP 접근은 요청 전달 전 검증
        if (auth == null || hasRole("ADMIN")) {
            return "true";
        }
        String username = auth.getName().replace("'", "''");
        return "exists (select 1 from user_project_access access_scope where access_scope.username='"
                + username
                + "' and access_scope.project_id="
                + column
                + ")";
    }
}
