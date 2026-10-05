package com.monitoring.agent.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 초기 관리자 계정 등록
@Component
public final class AdminSeeder implements ApplicationRunner {
    private final JdbcTemplate db;
    private final String username;
    private final String passwordHash;

    AdminSeeder(
            JdbcTemplate db,
            @Value("${HERMES_ADMIN_USERNAME:admin}") String username,
            @Value("${HERMES_ADMIN_PASSWORD_HASH:}") String passwordHash) {
        this.db = db;
        this.username = username;
        this.passwordHash = passwordHash;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        if (passwordHash.isBlank()) {
            throw new IllegalStateException("ADMIN_PASSWORD_HASH_REQUIRED");
        }
        db.update(
                """
            insert into app_users(username,password_hash,role)
            values(?,?,'ADMIN')
            on conflict(username) do nothing
            """,
                username,
                passwordHash);
    }
}
