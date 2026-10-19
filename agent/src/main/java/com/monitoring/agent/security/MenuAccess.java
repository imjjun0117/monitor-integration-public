package com.monitoring.agent.security;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

// DB 메뉴 권한과 기존 프로젝트 접근 범위 함께 적용
@Service
public class MenuAccess {
    private final JdbcTemplate db;

    public MenuAccess(JdbcTemplate db) {
        this.db = db;
    }

    public List<Menu> menus(String role) {
        return db.query(
                """
                select m.*,p.can_read,p.can_write from app_menus m
                join role_menu_permissions p on p.menu_id=m.menu_id and p.role=?
                order by m.sort_order,m.menu_id
                """,
                (rs, index) ->
                        new Menu(
                                rs.getString("menu_id"),
                                rs.getString("label"),
                                rs.getString("route"),
                                rs.getInt("sort_order"),
                                rs.getBoolean("enabled"),
                                "ADMIN".equals(role)
                                        || (rs.getBoolean("enabled") && rs.getBoolean("can_read")),
                                "ADMIN".equals(role)
                                        || (rs.getBoolean("enabled")
                                                && rs.getBoolean("can_write"))),
                role);
    }

    public boolean allowed(String path, String role, boolean write) {
        if ("ADMIN".equals(role) || path.startsWith("/api/v1/session/")) {
            return true;
        }
        String menu =
                path.startsWith("/api/v1/incidents")
                        ? "incidents"
                        : path.startsWith("/api/v1/dashboard")
                                ? "dashboard"
                                : path.startsWith("/api/v1/xlog")
                                        ? "xlog"
                                        : path.startsWith("/api/v1/api-checks")
                                                ? "api"
                                                : path.startsWith("/api/v1/certificates")
                                                        ? "certificates"
                                                        : path.startsWith("/api/v1/settings")
                                                                ? "settings"
                                                                : path.matches(
                                                                                "^/api/v1/projects/[^/]+/instances/[^/]+/logs(?:/.*)?$")
                                                                        ? "logs"
                                                                        : path.startsWith(
                                                                                        "/api/v1/projects")
                                                                                ? "projects"
                                                                                : null;
        if (menu == null) {
            return false;
        }
        // 프로젝트 선택 목록은 여러 화면에서 공유하며 기존 프로젝트 범위 필터 유지
        if (!write
                && ("/api/v1/projects".equals(path)
                        || path.matches("^/api/v1/projects/[^/]+/instances$"))) {
            return menus(role).stream().anyMatch(Menu::canRead);
        }
        return menus(role).stream()
                .anyMatch(
                        item ->
                                item.menuId().equals(menu)
                                        && item.canRead()
                                        && (!write || item.canWrite()));
    }

    public record Menu(
            String menuId,
            String label,
            String route,
            int sortOrder,
            boolean enabled,
            boolean canRead,
            boolean canWrite) {}
}
