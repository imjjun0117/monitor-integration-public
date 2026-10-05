package com.hermes.monitoring.center.certificate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CertificateResultStoreTest {
    @Test
    void successPersistsFullLeafCertificateAndValidationState() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        Instant checkedAt = Instant.parse("2026-09-03T09:00:00Z");
        Instant notBefore = Instant.parse("2026-01-01T00:00:00Z");
        Instant notAfter = Instant.parse("2027-01-01T00:00:00Z");
        CertificateResultStore store =
                new CertificateResultStore(db, Clock.fixed(checkedAt, ZoneOffset.UTC));

        CertificateCheckService.Target target = target(8L);
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);
        store.success(
                target,
                new CertificateChecker.Result(
                        "CN=subject",
                        "CN=issuer",
                        "0123456789abcdef",
                        notBefore,
                        notAfter,
                        119,
                        true,
                        true,
                        "SHA256withRSA",
                        "UP"));

        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(db).update(anyString(), arguments.capture());
        Object[] values = arguments.getValue();
        assertEquals(18, values.length);
        assertEquals("CN=subject", values[0]);
        assertEquals("CN=issuer", values[1]);
        assertEquals("0123456789abcdef", values[2]);
        assertEquals(notBefore, ((java.sql.Timestamp) values[3]).toInstant());
        assertEquals(notAfter, ((java.sql.Timestamp) values[4]).toInstant());
        assertEquals(119L, values[5]);
        assertEquals(true, values[6]);
        assertEquals(true, values[7]);
        assertEquals("SHA256withRSA", values[8]);
        assertEquals("UP", values[9]);
        assertEquals(8L, values[12]);
        assertEquals(4L, values[13]);
        assertEquals("sample-a", values[14]);
        assertEquals("target.example", values[15]);
        assertEquals(443, values[16]);
        assertEquals("target.example", values[17]);
    }

    @Test
    void failureClearsEveryNullableCertificateValueAndPersistsDown() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        Instant checkedAt = Instant.parse("2026-09-03T09:00:00Z");
        CertificateResultStore store =
                new CertificateResultStore(db, Clock.fixed(checkedAt, ZoneOffset.UTC));

        CertificateCheckService.Target target = target(9L);
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);
        store.failure(target);

        ArgumentCaptor<Object[]> arguments = ArgumentCaptor.forClass(Object[].class);
        verify(db).update(anyString(), arguments.capture());
        Object[] values = arguments.getValue();
        assertEquals(18, values.length);
        for (int index = 0; index <= 8; index++) {
            assertNull(values[index], "argument " + index);
        }
        assertEquals("DOWN", values[9]);
        assertEquals("TLS_CHECK_FAILED", values[10]);
        assertTrue(values[11] instanceof java.sql.Timestamp);
        assertEquals(checkedAt, ((java.sql.Timestamp) values[11]).toInstant());
        assertEquals(9L, values[12]);
        assertEquals(4L, values[13]);
    }

    @Test
    void staleTargetIdentityMakesTheConditionalWriteANoOp() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        CertificateResultStore store = new CertificateResultStore(db, Clock.systemUTC());
        when(db.update(anyString(), any(Object[].class))).thenReturn(0);

        assertEquals(false, store.failure(target(10L)));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(db).update(sql.capture(), any(Object[].class));
        assertTrue(sql.getValue().contains("target_version=?"));
        assertTrue(sql.getValue().contains("project_id=?"));
        assertTrue(sql.getValue().contains("hostname=?"));
        assertTrue(sql.getValue().contains("port=?"));
        assertTrue(sql.getValue().contains("sni_hostname=?"));
        assertTrue(sql.getValue().contains("for key share of t"));
    }

    private CertificateCheckService.Target target(long id) {
        return new CertificateCheckService.Target(
                id, "sample-a", "target.example", 443, "target.example", 4L);
    }
}
