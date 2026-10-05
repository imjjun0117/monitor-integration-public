package com.monitoring.agent.project;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.monitoring.agent.security.TokenCipher;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

class InstanceActionsControllerConflictTest {
    @Test
    void duplicateAgentUrlOnUpdateIsSafeDomainConflict() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.update(
                        anyString(),
                        eq("Instance"),
                        eq("prod"),
                        eq("https://duplicate.example"),
                        eq(false),
                        eq(15),
                        eq(true),
                        eq("sample-a"),
                        eq("local-01")))
                .thenThrow(new DataIntegrityViolationException("secret unique constraint details"));
        InstanceActionsController controller =
                new InstanceActionsController(
                        db, mock(TokenCipher.class), mock(ObjectMapper.class), "");
        var update =
                new InstanceActionsController.Update(
                        "local-01",
                        "Instance",
                        "prod",
                        "https://duplicate.example",
                        null,
                        false,
                        15,
                        true);

        ProjectConflictException error =
                assertThrows(
                        ProjectConflictException.class,
                        () -> controller.update("sample-a", "local-01", update));

        assertEquals("AGENT_URL_ALREADY_EXISTS", error.getMessage());
    }
}
