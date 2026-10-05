package com.hermes.monitoring.center.project;

import com.hermes.monitoring.center.security.TokenCipher;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ProjectValidationTest {
    private final TokenCipher cipher =
            new TokenCipher(Base64.getEncoder().encodeToString(new byte[32]));

    @Test
    void sharedLimitsAndIdentifierBoundariesAreStrict() {
        assertEquals(2, ProjectValidator.MIN_ID_LENGTH);
        assertEquals(64, ProjectValidator.MAX_ID_LENGTH);
        assertDoesNotThrow(() -> ProjectValidator.id("aa"));
        assertDoesNotThrow(() -> ProjectValidator.id("a".repeat(64)));
        assertThrows(IllegalArgumentException.class, () -> ProjectValidator.id("a"));
        assertThrows(IllegalArgumentException.class, () -> ProjectValidator.id("a".repeat(65)));
    }

    @Test
    void createTokenUsesUtf8ByteBoundary() {
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.createToken("가".repeat(10) + "a")); // 31
        assertDoesNotThrow(() -> ProjectValidator.createToken("가".repeat(10) + "ab")); // 32
        assertThrows(IllegalArgumentException.class, () -> ProjectValidator.createToken("   "));
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.createToken("\u00a0".repeat(32)));
        assertThrows(IllegalArgumentException.class, () -> ProjectValidator.createToken(null));
    }

    @Test
    void replacementTokenPreservesNullAndBlankButValidatesNonblank() {
        assertDoesNotThrow(() -> ProjectValidator.replacementToken(null));
        assertDoesNotThrow(() -> ProjectValidator.replacementToken("   "));
        assertDoesNotThrow(() -> ProjectValidator.replacementToken("\u00a0".repeat(32)));
        assertDoesNotThrow(() -> ProjectValidator.replacementToken("\ufeff".repeat(32)));
        assertDoesNotThrow(() -> ProjectValidator.replacementToken("\u001c".repeat(32)));
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.replacementToken("가".repeat(10) + "a"));
        assertDoesNotThrow(() -> ProjectValidator.replacementToken("가".repeat(10) + "ab"));
    }

    @Test
    void urlRejectsEmptyCredentialsQueryFragmentAndOverLimit() {
        for (String value :
                new String[] {
                    "",
                    "https://u:p@example.test",
                    "https://example.test?q=x",
                    "https://example.test/#x",
                    "https://example.test/" + "a".repeat(480)
                }) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ProjectValidator.validateAgentUrl(value),
                    value);
        }
        assertDoesNotThrow(() -> ProjectValidator.validateAgentUrl("https://example.test/base"));
    }

    @Test
    void displayRejectsLeadingOrTrailingWhitespaceAndHonorsBoundary() {
        assertThrows(IllegalArgumentException.class, () -> ProjectValidator.displayName(" name "));
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.displayName("\u00a0name\u00a0"));
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.displayName("\ufeffname\ufeff"));
        assertDoesNotThrow(() -> ProjectValidator.displayName("a".repeat(120)));
        assertDoesNotThrow(() -> ProjectValidator.displayName("😀".repeat(120)));
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.displayName("a".repeat(121)));
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.displayName("😀".repeat(121)));
    }

    @Test
    void urlRejectsDotSegmentsBeforeNormalization() {
        assertThrows(
                IllegalArgumentException.class,
                () -> ProjectValidator.validateAgentUrl("https://example.test/a/../b"));
    }

    @Test
    void pollIntervalHasAnOverflowSafeMaximumOnCreate() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        ProjectService projects = new ProjectService(db, cipher);
        ProjectController.Instance tooLarge =
                instance("01234567890123456789012345678901", 715_827_883);
        assertThrows(
                IllegalArgumentException.class,
                () -> projects.createInstance("sample-a", tooLarge));
        verifyNoInteractions(db);
    }

    @Test
    void createInstanceRejectsMissingOrDisabledProjectBeforeEncryptionAndInsert() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForObject(anyString(), eq(Boolean.class), eq("sample-a")))
                .thenThrow(new EmptyResultDataAccessException(1));
        ProjectService projects = new ProjectService(db, cipher);
        ProjectNotFoundException error =
                assertThrows(
                        ProjectNotFoundException.class,
                        () -> projects.createInstance("sample-a", instance("x".repeat(32), 15)));
        assertEquals("PROJECT_NOT_FOUND", error.getMessage());
    }

    @Test
    void duplicateProjectIsSafeDomainConflict() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.update(anyString(), eq("sample-a"), eq("Sample"), eq(true)))
                .thenThrow(new DataIntegrityViolationException("secret SQL constraint details"));
        ProjectService projects = new ProjectService(db, cipher);
        ProjectConflictException error =
                assertThrows(
                        ProjectConflictException.class,
                        () ->
                                projects.createProject(
                                        new ProjectController.Project("sample-a", "Sample", true)));
        assertEquals("PROJECT_ALREADY_EXISTS", error.getMessage());
    }

    private ProjectController.Instance instance(String token, int poll) {
        return new ProjectController.Instance(
                "local-01", "Local", null, "https://agent.example", token, false, poll, true);
    }
}
