package com.monitoring.agent.security;

import java.io.InputStreamReader;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.util.Arrays;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

// 명령행에서 관리자 비밀번호 초기화
public final class AdminPasswordResetCli {
    private static final int MINIMUM_PASSWORD_LENGTH = 8;

    private AdminPasswordResetCli() {}

    public static void main(String[] arguments) throws Exception {
        String jdbcUrl =
                environment(
                        "HERMES_DB_JDBC_URL", "jdbc:postgresql://127.0.0.1:5432/hermes_monitor");
        String databaseUser = environment("HERMES_DB_USERNAME", "hermes");
        String databasePassword = requiredEnvironment("HERMES_DB_PASSWORD");
        String adminUsername = environment("HERMES_ADMIN_USERNAME", "admin");
        char[] password = readPassword();
        try (Connection connection =
                DriverManager.getConnection(jdbcUrl, databaseUser, databasePassword)) {
            if (!connection.isValid(5)) {
                throw new IllegalStateException("DATABASE_NOT_READY");
            }
            reset(connection, adminUsername, password);
            System.out.println("ADMIN_PASSWORD_RESET_OK");
        } finally {
            Arrays.fill(password, '\0');
        }
    }

    static int reset(Connection connection, String username, char[] password) throws Exception {
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("ADMIN_USERNAME_REQUIRED");
        }
        if (password == null || password.length < MINIMUM_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("PASSWORD_TOO_SHORT");
        }
        boolean originalAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            try (PreparedStatement find =
                    connection.prepareStatement(
                            "select username from app_users where username=? for update")) {
                find.setString(1, username);
                try (var result = find.executeQuery()) {
                    if (!result.next() || result.next()) {
                        throw new IllegalStateException("ADMIN_USER_NOT_FOUND");
                    }
                }
            }
            String hash = new BCryptPasswordEncoder().encode(java.nio.CharBuffer.wrap(password));
            int updated;
            try (PreparedStatement update =
                    connection.prepareStatement(
                            "update app_users set password_hash=? where username=?")) {
                update.setString(1, hash);
                update.setString(2, username);
                updated = update.executeUpdate();
            }
            if (updated != 1) {
                throw new IllegalStateException("ADMIN_PASSWORD_UPDATE_COUNT_INVALID");
            }
            connection.commit();
            return updated;
        } catch (Exception error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(originalAutoCommit);
            Arrays.fill(password, '\0');
        }
    }

    private static char[] readPassword() throws Exception {
        char[] buffer = new char[4096];
        int length = 0;
        try {
            InputStreamReader reader = new InputStreamReader(System.in);
            for (int value; (value = reader.read()) != -1 && value != '\n'; ) {
                if (value == '\r') {
                    continue;
                }
                if (length == buffer.length) {
                    throw new IllegalArgumentException("PASSWORD_TOO_LONG");
                }
                buffer[length++] = (char) value;
            }
            if (length < MINIMUM_PASSWORD_LENGTH) {
                throw new IllegalArgumentException("PASSWORD_TOO_SHORT");
            }
            return Arrays.copyOf(buffer, length);
        } finally {
            Arrays.fill(buffer, '\0');
        }
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + "_REQUIRED");
        }
        return value;
    }

    private static String environment(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
