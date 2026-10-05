package com.hermes.monitoring.center.security;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class AdminPasswordResetCliTest {
    private static final String DUMMY_PASSWORD = "가나다라마바사아";

    @Container
    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:17.11-bookworm")
                    .withDatabaseName("admin_reset_test")
                    .withUsername("hermes")
                    .withPassword("isolated-test-db-password");

    @Test
    void acceptsEightCharactersAndResetsExactlyOneExistingAdminInsideATransaction()
            throws Exception {
        try (Connection connection = connection()) {
            createUsers(connection);
            insertUser(connection, "admin", "old-admin-hash");
            insertUser(connection, "other", "old-other-hash");

            int updated =
                    AdminPasswordResetCli.reset(connection, "admin", DUMMY_PASSWORD.toCharArray());

            assertEquals(1, updated);
            String adminHash = passwordHash(connection, "admin");
            assertTrue(new BCryptPasswordEncoder().matches(DUMMY_PASSWORD, adminHash));
            assertEquals("old-other-hash", passwordHash(connection, "other"));
            assertTrue(connection.getAutoCommit(), "caller connection state must be restored");
        }
    }

    @Test
    void missingAdminFailsClosedWithoutChangingAnyUser() throws Exception {
        try (Connection connection = connection()) {
            createUsers(connection);
            insertUser(connection, "other", "old-other-hash");

            IllegalStateException error =
                    assertThrows(
                            IllegalStateException.class,
                            () ->
                                    AdminPasswordResetCli.reset(
                                            connection, "admin", DUMMY_PASSWORD.toCharArray()));

            assertEquals("ADMIN_USER_NOT_FOUND", error.getMessage());
            assertEquals("old-other-hash", passwordHash(connection, "other"));
            assertTrue(connection.getAutoCommit(), "rollback must restore caller connection state");
        }
    }

    @Test
    void rejectsSevenCharactersBeforeDatabaseAccess() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> AdminPasswordResetCli.reset(null, "admin", "가나다라마바사".toCharArray()));

        assertEquals("PASSWORD_TOO_SHORT", error.getMessage());
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }

    private void createUsers(Connection connection) throws Exception {
        try (PreparedStatement statement =
                connection.prepareStatement(
                        """
            drop table if exists app_users;
            create table app_users(
              username varchar(100) primary key,
              password_hash varchar(100) not null,
              role varchar(20) not null default 'ADMIN',
              enabled boolean not null default true
            )
            """)) {
            statement.execute();
        }
    }

    private void insertUser(Connection connection, String username, String hash) throws Exception {
        try (PreparedStatement statement =
                connection.prepareStatement(
                        "insert into app_users(username,password_hash) values (?,?)")) {
            statement.setString(1, username);
            statement.setString(2, hash);
            statement.executeUpdate();
        }
    }

    private String passwordHash(Connection connection, String username) throws Exception {
        try (PreparedStatement statement =
                connection.prepareStatement(
                        "select password_hash from app_users where username=?")) {
            statement.setString(1, username);
            try (var result = statement.executeQuery()) {
                assertTrue(result.next());
                return result.getString(1);
            }
        }
    }
}
