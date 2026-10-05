package com.monitoring.agent.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

// 요청마다 권한 갱신 및 응답 전 설정 변경 이력 커밋
final class AccessAuditFilter extends OncePerRequestFilter {
    private final JdbcTemplate db;
    private final TransactionTemplate transactions;

    AccessAuditFilter(JdbcTemplate db, PlatformTransactionManager manager) {
        this.db = db;
        transactions = new TransactionTemplate(manager);
        transactions.setTimeout(30);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/")
                || request.getRequestURI().startsWith("/api/v1/session/login")
                || request.getRequestURI().startsWith("/api/v1/session/logout");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth instanceof AnonymousAuthenticationToken) {
            chain.doFilter(request, response);
            return;
        }
        var users =
                db.queryForList(
                        "select role,enabled,security_version from app_users where username=?",
                        auth.getName());
        var session = request.getSession(false);
        if (users.isEmpty() || !Boolean.TRUE.equals(users.getFirst().get("enabled"))) {
            if (session != null) {
                session.invalidate();
            }
            SecurityContextHolder.clearContext();
            error(response, 401, "UNAUTHORIZED");
            return;
        }
        var user = users.getFirst();
        long version = ((Number) user.get("security_version")).longValue();
        if (session != null) {
            Object previous = session.getAttribute("hermes.securityVersion");
            if (previous instanceof Number n && n.longValue() != version) {
                session.invalidate();
                SecurityContextHolder.clearContext();
                error(response, 401, "UNAUTHORIZED");
                return;
            }
            session.setAttribute("hermes.securityVersion", version);
        }
        String role = user.get("role").toString();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(
                        auth.getPrincipal(),
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role))));
        SecurityContextHolder.setContext(context);
        String path = request.getRequestURI();
        boolean write = !List.of("GET", "HEAD", "OPTIONS").contains(request.getMethod());
        if (!allowed(path, role, write)) {
            if (write) {
                attempt(auth.getName(), request, "DENIED");
            }
            error(response, 403, "FORBIDDEN");
            return;
        }
        if (!write) {
            chain.doFilter(request, response);
            return;
        }
        var buffered = new ContentCachingResponseWrapper(response);
        try {
            transactions.executeWithoutResult(
                    status -> {
                        db.queryForObject(
                                "select set_config('hermes.actor',?,true)",
                                String.class,
                                auth.getName());
                        try {
                            chain.doFilter(request, buffered);
                        } catch (IOException | ServletException failure) {
                            throw new DispatchFailure(failure);
                        }
                        if (buffered.getStatus() >= 400) {
                            status.setRollbackOnly();
                        } else {
                            attempt(
                                    auth.getName(),
                                    request,
                                    buffered.getStatus() == 202 ? "ACCEPTED" : "SUCCESS");
                        }
                    });
            if (buffered.getStatus() >= 400) {
                attempt(auth.getName(), request, "FAILED");
            }
            buffered.copyBodyToResponse();
        } catch (DispatchFailure failure) {
            try {
                attempt(auth.getName(), request, "FAILED");
            } catch (org.springframework.dao.DataAccessException unavailable) {
                logger.warn("Failed request could not be audited; transaction rolled back");
                buffered.reset();
                error(response, 500, "WRITE_FAILED");
                return;
            }
            if (failure.getCause() instanceof IOException io) {
                throw io;
            }
            throw (ServletException) failure.getCause();
        } catch (org.springframework.dao.DataAccessException
                | org.springframework.transaction.TransactionException failure) {
            logger.warn("Configuration transaction failed; no success response published");
            buffered.reset();
            error(response, 500, "WRITE_FAILED");
        }
    }

    private boolean allowed(String path, String role, boolean write) {
        if ("ADMIN".equals(role)) {
            return true;
        }
        if (!List.of("OPERATOR", "VIEWER").contains(role)) {
            return false;
        }
        if (path.matches("^/api/v1/projects/[^/]+/instances/[^/]+/logs(?:/.*)?$")
                && !"OPERATOR".equals(role)) {
            return false;
        }
        if (path.startsWith("/api/v1/settings/users")
                || path.startsWith("/api/v1/settings/audit")) {
            return false;
        }
        if (write && !"OPERATOR".equals(role)) {
            return false;
        }
        String[] parts = path.split("/");
        if (parts.length >= 5 && ("projects".equals(parts[3]) || "api-checks".equals(parts[3]))) {
            if (write
                    && "projects".equals(parts[3])
                    && (parts.length == 5 || path.endsWith("/permanent"))) {
                return false;
            }
            return project(parts[4]);
        }
        if (parts.length >= 5 && "certificates".equals(parts[3])) {
            if (!parts[4].matches("[0-9]+")) {
                return false;
            }
            var targets =
                    db.queryForList(
                            "select project_id from certificate_targets where certificate_target_id=?",
                            Long.parseLong(parts[4]));
            return !targets.isEmpty() && project(targets.getFirst().get("project_id").toString());
        }
        if (!write) {
            return true;
        } // 전체 목록은 페이지 처리 전 SQL에서 접근 가능한 프로젝트로 제한
        // 본문의 프로젝트 ID는 컨트롤러 실행 전 ProjectWriteAdvice에서 검증
        return path.equals("/api/v1/certificates") || path.equals("/api/v1/settings/thresholds");
    }

    private boolean project(String projectId) {
        return Boolean.TRUE.equals(
                db.queryForObject(
                        "select exists(select 1 from user_project_access where username=? and project_id=?)",
                        Boolean.class,
                        SecurityContextHolder.getContext().getAuthentication().getName(),
                        projectId));
    }

    private void attempt(String actor, HttpServletRequest request, String outcome) {
        // 접근 이력에는 식별 정보만 저장. 요청 본문·조회 문자열·토큰·예외 메시지 저장 금지
        String[] parts = request.getRequestURI().split("/");
        String projectId =
                parts.length >= 5 && ("projects".equals(parts[3]) || "api-checks".equals(parts[3]))
                        ? parts[4]
                        : null;
        db.update(
                "insert into audit_log(actor,action,entity_type,project_id,target_id,outcome) values(?,?,?,?,?,?)",
                actor,
                request.getMethod(),
                "REQUEST",
                projectId,
                request.getRequestURI(),
                outcome);
    }

    private static void error(HttpServletResponse response, int status, String code)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"" + code + "\"}");
    }

    private static final class DispatchFailure extends RuntimeException {
        DispatchFailure(Exception cause) {
            super(cause);
        }
    }
}
