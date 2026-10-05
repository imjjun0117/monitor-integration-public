package com.monitoring.agent.check;

import com.monitoring.agent.security.TokenCipher;
import java.lang.reflect.Method;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CheckRunServiceDeletionTest {
    @Test
    void missingInstanceDoesNotCreateAFailedResult() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        CheckResultStore store = mock(CheckResultStore.class);
        when(db.queryForMap(anyString(), eq("project"), eq("instance"), eq("check")))
                .thenThrow(new EmptyResultDataAccessException(1));
        CheckRunService service =
                new CheckRunService(
                        db,
                        mock(TokenCipher.class),
                        store,
                        new ObjectMapper(),
                        "127.0.0.1/32",
                        1,
                        1,
                        0,
                        1);
        try {
            Method execute =
                    CheckRunService.class.getDeclaredMethod(
                            "execute", String.class, String.class, String.class);
            execute.setAccessible(true);
            execute.invoke(service, "project", "instance", "check");
            verify(store, never()).failed("project", "instance", "check");
        } finally {
            service.destroy();
        }
    }

    @Test
    void deletedCheckIsVerifiedBeforeFailedResultWrite() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        TokenCipher cipher = mock(TokenCipher.class);
        CheckResultStore store = mock(CheckResultStore.class);
        when(db.queryForMap(anyString(), eq("project"), eq("instance"), eq("check")))
                .thenReturn(instance());
        when(cipher.decrypt(any(byte[].class), any(byte[].class))).thenReturn("token");
        when(db.queryForObject(
                        anyString(), eq(Boolean.class), eq("project"), eq("instance"), eq("check")))
                .thenReturn(false);
        CheckRunService service = service(db, cipher, store);
        try {
            invokeExecute(service);
            verify(store, never()).failed("project", "instance", "check");
        } finally {
            service.destroy();
        }
    }

    @Test
    void deletionRaceConstraintViolationIsConsumedWithoutRetry() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        TokenCipher cipher = mock(TokenCipher.class);
        CheckResultStore store = mock(CheckResultStore.class);
        when(db.queryForMap(anyString(), eq("project"), eq("instance"), eq("check")))
                .thenReturn(instance());
        when(cipher.decrypt(any(byte[].class), any(byte[].class))).thenReturn("token");
        when(db.queryForObject(
                        anyString(), eq(Boolean.class), eq("project"), eq("instance"), eq("check")))
                .thenReturn(true);
        org.mockito.Mockito.doThrow(
                        new DataIntegrityViolationException(
                                "private database detail",
                                new java.sql.SQLException("foreign key", "23503")))
                .when(store)
                .failed("project", "instance", "check");
        CheckRunService service = service(db, cipher, store);
        try {
            invokeExecute(service);
            verify(store).failed("project", "instance", "check");
        } finally {
            service.destroy();
        }
    }

    private CheckRunService service(JdbcTemplate db, TokenCipher cipher, CheckResultStore store) {
        return new CheckRunService(
                db, cipher, store, new ObjectMapper(), "127.0.0.1/32", 1, 1, 0, 1);
    }

    private void invokeExecute(CheckRunService service) throws Exception {
        Method execute =
                CheckRunService.class.getDeclaredMethod(
                        "execute", String.class, String.class, String.class);
        execute.setAccessible(true);
        execute.invoke(service, "project", "instance", "check");
    }

    private Map<String, Object> instance() {
        return Map.of(
                "agent_base_url",
                "not-a-url",
                "token_ciphertext",
                new byte[1],
                "token_iv",
                new byte[1]);
    }
}
