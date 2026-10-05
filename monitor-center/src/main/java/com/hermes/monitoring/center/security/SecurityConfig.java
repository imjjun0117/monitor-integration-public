package com.hermes.monitoring.center.security;

import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.JdbcUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

// 로그인·세션·API 접근 보안 설정
@Configuration
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    UserDetailsService users(DataSource dataSource) {
        JdbcUserDetailsManager users = new JdbcUserDetailsManager(dataSource);
        users.setUsersByUsernameQuery(
                "select username,password_hash,enabled from app_users where username=?");
        users.setAuthoritiesByUsernameQuery(
                "select username,concat('ROLE_',role) from app_users where username=?");
        return users;
    }

    @Bean
    TokenCipher tokenCipher(
            @org.springframework.beans.factory.annotation.Value("${hermes.master-key}")
                    String key) {
        return new TokenCipher(key);
    }

    @Bean
    SecurityFilterChain chain(
            HttpSecurity http,
            JdbcTemplate db,
            PlatformTransactionManager transactions,
            @Value("${hermes.external-https:false}") boolean externalHttps)
            throws Exception {
        CookieCsrfTokenRepository csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookieCustomizer(cookie -> cookie.secure(externalHttps).sameSite("Lax"));
        http.authorizeHttpRequests(
                        auth ->
                                auth.requestMatchers(
                                                "/login",
                                                "/actuator/health",
                                                "/assets/**",
                                                "/index.html",
                                                "/hermes-monitoring.svg")
                                        .permitAll()
                                        .anyRequest()
                                        .authenticated())
                .csrf(config -> config.csrfTokenRepository(csrf))
                .formLogin(
                        form ->
                                form.loginPage("/login")
                                        .loginProcessingUrl("/api/v1/session/login")
                                        .successHandler(
                                                (request, response, authentication) -> {
                                                    Long version =
                                                            db.queryForObject(
                                                                    "select security_version from app_users where username=?",
                                                                    Long.class,
                                                                    authentication.getName());
                                                    request.getSession()
                                                            .setAttribute(
                                                                    "hermes.securityVersion",
                                                                    version);
                                                    response.sendRedirect("/");
                                                })
                                        .failureHandler(
                                                (request, response, error) -> {
                                                    String accept = request.getHeader("Accept");
                                                    if (accept != null
                                                            && accept.contains("text/html")) {
                                                        response.setStatus(302);
                                                        response.setHeader(
                                                                "Location", "/login?error");
                                                        return;
                                                    }
                                                    response.setStatus(401);
                                                    response.setContentType("application/json");
                                                    response.getWriter()
                                                            .write("{\"code\":\"AUTH_FAILED\"}");
                                                }))
                .exceptionHandling(
                        errors ->
                                errors.defaultAuthenticationEntryPointFor(
                                                (request, response, error) -> {
                                                    response.setStatus(401);
                                                    response.setContentType("application/json");
                                                    response.getWriter()
                                                            .write("{\"code\":\"UNAUTHORIZED\"}");
                                                },
                                                request ->
                                                        request.getRequestURI().startsWith("/api/"))
                                        .accessDeniedHandler(
                                                (request, response, error) -> {
                                                    response.setStatus(403);
                                                    response.setContentType("application/json");
                                                    response.getWriter()
                                                            .write("{\"code\":\"FORBIDDEN\"}");
                                                }))
                .logout(
                        logout ->
                                logout.logoutUrl("/api/v1/session/logout")
                                        .logoutSuccessHandler(
                                                (request, response, authentication) ->
                                                        response.setStatus(204)))
                .addFilterBefore(new AccessAuditFilter(db, transactions), AuthorizationFilter.class)
                .addFilterBefore(
                        new RelativeLoginRedirectFilter(),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
