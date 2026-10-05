package com.hermes.monitoring.center.certificate;

import com.hermes.monitoring.center.metric.ThresholdResolver;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CertificateContractTest {
    @Test
    void failuresExplainDnsTimeoutAndExpiredCertificates() {
        assertEquals(
                "TLS_DNS_ERROR",
                CertificateCheckService.failureCode(new java.net.UnknownHostException()));
        assertEquals(
                "TLS_TIMEOUT",
                CertificateCheckService.failureCode(new java.net.SocketTimeoutException()));
        var handshake = new javax.net.ssl.SSLHandshakeException("hidden details");
        handshake.initCause(new java.security.cert.CertificateExpiredException());
        assertEquals("TLS_CERTIFICATE_EXPIRED", CertificateCheckService.failureCode(handshake));
    }

    @Test
    void resultCarriesSerialAndFullValidityWindow() {
        Instant notBefore = Instant.parse("2026-01-01T00:00:00Z");
        Instant notAfter = Instant.parse("2027-01-01T00:00:00Z");
        CertificateChecker.Result result =
                new CertificateChecker.Result(
                        "subject",
                        "issuer",
                        "01ab",
                        notBefore,
                        notAfter,
                        120,
                        true,
                        true,
                        "SHA256withRSA",
                        "UP");
        assertEquals("01ab", result.serialNumber());
        assertEquals(notBefore, result.notBefore());
        assertEquals(notAfter, result.notAfter());
    }

    @Test
    void certificateDayStatusUsesTheSuppliedLiveThresholds() {
        CertificateChecker checker = new CertificateChecker();
        ThresholdResolver.Limits limits = new ThresholdResolver.Limits(45d, 14d);
        assertEquals("UP", checker.status(46, "SHA256withRSA", limits));
        assertEquals("WARN", checker.status(20, "SHA256withRSA", limits));
        assertEquals("DOWN", checker.status(14, "SHA256withRSA", limits));
    }

    @Test
    void immediateCheckOnlyQueuesWorkBeforeReturningAccepted() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        CertificateCheckService checks = mock(CertificateCheckService.class);
        when(checks.submit(1L)).thenReturn(CertificateCheckService.Submission.ACCEPTED);
        CertificateController controller = new CertificateController(db, checks);
        ResponseEntity<java.util.Map<String, String>> response = controller.check(1L);
        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        assertEquals("ACCEPTED", response.getBody().get("status"));
        verifyNoInteractions(db);
    }

    @Test
    void targetEditInvalidatesLatestAndRejectsWhitespaceHostnamesAtTheServerBoundary() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        CertificateCheckService checks = mock(CertificateCheckService.class);
        CertificateController controller = new CertificateController(db, checks);
        CertificateController.Target changed =
                new CertificateController.Target(
                        "sample-a", "new.example", 443, "new.example", true, 60);

        controller.update(17L, changed);

        org.mockito.InOrder order = org.mockito.Mockito.inOrder(db);
        order.verify(db)
                .update(
                        org.mockito.ArgumentMatchers.contains("target_version"),
                        org.mockito.ArgumentMatchers.any(Object[].class));
        order.verify(db)
                .update(
                        org.mockito.ArgumentMatchers.contains("delete from certificate_latest"),
                        org.mockito.ArgumentMatchers.eq(17L));
        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.update(
                                17L,
                                new CertificateController.Target(
                                        "sample-a", "bad host", 443, "bad host", true, 60)));
    }
}
