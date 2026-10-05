package com.monitoring.agent.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.IOException;
import java.net.URI;
import org.springframework.web.filter.OncePerRequestFilter;

// 로그인 이동 경로를 상대 경로로 처리
final class RelativeLoginRedirectFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String loginPath = request.getContextPath() + "/login";
        filterChain.doFilter(
                request,
                new HttpServletResponseWrapper(response) {
                    @Override
                    public void sendRedirect(String location) throws IOException {
                        if (isLoginRedirect(location, loginPath)) {
                            setStatus(HttpServletResponse.SC_FOUND);
                            setHeader("Location", loginPath);
                            return;
                        }
                        super.sendRedirect(location);
                    }
                });
    }

    private static boolean isLoginRedirect(String location, String loginPath) {
        try {
            URI uri = URI.create(location);
            return loginPath.equals(uri.getRawPath())
                    && uri.getRawQuery() == null
                    && uri.getRawFragment() == null;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }
}
