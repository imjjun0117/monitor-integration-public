package com.monitoring.agent.security;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

// 메뉴 표시 설정과 역할별 조회·변경 권한 관리
@RestController
@RequestMapping("/api/v1/settings")
public class MenuAdminController {
    private final JdbcTemplate db;
    private final MenuAccess access;

    public MenuAdminController(JdbcTemplate db, MenuAccess access) {
        this.db = db;
        this.access = access;
    }

    @GetMapping("/menus")
    List<MenuAccess.Menu> menus() {
        requireAdmin();
        return access.menus("ADMIN");
    }

    @PutMapping("/menus/{menuId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void updateMenu(@PathVariable("menuId") String menuId, @RequestBody MenuWrite value) {
        requireAdmin();
        if (value.label() == null
                || value.label().isBlank()
                || value.label().length() > 60
                || value.label().chars().anyMatch(Character::isISOControl)
                || value.sortOrder() < 0
                || value.sortOrder() > 999
                || ("settings".equals(menuId) && !value.enabled())) {
            throw new IllegalArgumentException("MENU_INVALID");
        }
        if (db.update(
                        "update app_menus set label=?,sort_order=?,enabled=? where menu_id=?",
                        value.label().strip(),
                        value.sortOrder(),
                        value.enabled(),
                        menuId)
                != 1) {
            throw new IllegalArgumentException("MENU_INVALID");
        }
    }

    @GetMapping("/permissions")
    List<Map<String, Object>> permissions() {
        requireAdmin();
        return db.queryForList(
                """
                select p.role,p.menu_id as "menuId",m.label,p.can_read as "canRead",
                p.can_write as "canWrite" from role_menu_permissions p
                join app_menus m on m.menu_id=p.menu_id order by p.role,m.sort_order,m.menu_id
                """);
    }

    @PutMapping("/permissions/{role}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void updatePermissions(
            @PathVariable("role") String role, @RequestBody List<PermissionWrite> values) {
        requireAdmin();
        String baseRole =
                db.queryForObject(
                        "select base_role from app_roles where role_id=?", String.class, role);
        if (!List.of("OPERATOR", "VIEWER").contains(baseRole)
                || values == null
                || values.stream().anyMatch(java.util.Objects::isNull)
                || values.size() != access.menus(role).size()
                || values.stream().map(PermissionWrite::menuId).distinct().count()
                        != values.size()) {
            throw new IllegalArgumentException("PERMISSION_INVALID");
        }
        for (PermissionWrite value : values) {
            if ((value.canWrite() && !value.canRead())
                    || ("VIEWER".equals(baseRole) && value.canWrite())) {
                throw new IllegalArgumentException("PERMISSION_INVALID");
            }
            if (db.update(
                            """
update role_menu_permissions set can_read=?,can_write=? where role=? and menu_id=?
""",
                            value.canRead(),
                            value.canWrite(),
                            role,
                            value.menuId())
                    != 1) {
                throw new IllegalArgumentException("PERMISSION_INVALID");
            }
        }
    }

    private void requireAdmin() {
        if (!ProjectAccess.hasRole("ADMIN")) {
            throw new AccessDeniedException("FORBIDDEN");
        }
    }

    public record MenuWrite(String label, int sortOrder, boolean enabled) {}

    public record PermissionWrite(String menuId, boolean canRead, boolean canWrite) {}
}
