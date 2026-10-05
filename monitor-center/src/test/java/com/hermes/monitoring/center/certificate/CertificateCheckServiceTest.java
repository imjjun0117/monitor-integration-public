package com.hermes.monitoring.center.certificate;

import com.hermes.monitoring.center.metric.ThresholdResolver;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CertificateCheckServiceTest {
    @Test
    void workerAndQueueLimitsRejectExcessWork() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        CertificateChecker checker = mock(CertificateChecker.class);
        CertificateResultStore results = mock(CertificateResultStore.class);
        ThresholdResolver thresholds = thresholds(30d, 7d);
        CountDownLatch release = new CountDownLatch(1);
        when(checker.check(anyString(), anyInt(), anyString(), any()))
                .thenAnswer(
                        invocation -> {
                            release.await(5, TimeUnit.SECONDS);
                            throw new IllegalStateException("expected test release");
                        });
        CertificateCheckService service =
                new CertificateCheckService(db, checker, results, thresholds, 1, 1);
        try {
            assertEquals(
                    CertificateCheckService.Submission.ACCEPTED, service.submit(target(1L, "one")));
            assertEquals(
                    CertificateCheckService.Submission.ACCEPTED, service.submit(target(2L, "two")));
            assertEquals(
                    CertificateCheckService.Submission.CAPACITY_EXCEEDED,
                    service.submit(target(3L, "three")));
        } finally {
            release.countDown();
            service.close();
        }
    }

    @Test
    void acceptedSubmissionDoesNotWaitForTlsAndExecutorShutsDown() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        CertificateChecker checker = mock(CertificateChecker.class);
        CertificateResultStore results = mock(CertificateResultStore.class);
        ThresholdResolver thresholds = thresholds(30d, 7d);
        CountDownLatch checkerStarted = new CountDownLatch(1);
        CountDownLatch releaseChecker = new CountDownLatch(1);
        when(db.queryForMap(anyString(), any(Object[].class)))
                .thenReturn(
                        Map.of(
                                "certificate_target_id",
                                7L,
                                "project_id",
                                "sample-a",
                                "hostname",
                                "certificate.example",
                                "port",
                                443,
                                "sni_hostname",
                                "certificate.example",
                                "target_version",
                                3L));
        when(checker.check(anyString(), anyInt(), anyString(), any()))
                .thenAnswer(
                        invocation -> {
                            checkerStarted.countDown();
                            assertTrue(releaseChecker.await(5, TimeUnit.SECONDS));
                            return new CertificateChecker.Result(
                                    "subject",
                                    "issuer",
                                    "01ab",
                                    InstantFixtures.NOT_BEFORE,
                                    InstantFixtures.NOT_AFTER,
                                    120,
                                    true,
                                    true,
                                    "SHA256withRSA",
                                    "UP");
                        });

        CertificateCheckService service =
                new CertificateCheckService(db, checker, results, thresholds, 1, 1);
        try {
            long startedAt = System.nanoTime();
            assertEquals(CertificateCheckService.Submission.ACCEPTED, service.submit(7L));
            long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
            assertTrue(elapsedMillis < 500, "submission blocked for " + elapsedMillis + "ms");
            assertTrue(checkerStarted.await(1, TimeUnit.SECONDS));
            releaseChecker.countDown();
            verify(results, org.mockito.Mockito.timeout(2_000)).success(any(), any());
        } finally {
            releaseChecker.countDown();
            service.close();
        }
        assertTrue(service.isTerminated());
    }

    @Test
    void certificateStatusUsesTheCurrentProjectThresholdForEveryRun() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        CertificateChecker checker = mock(CertificateChecker.class);
        CertificateResultStore results = mock(CertificateResultStore.class);
        ThresholdResolver thresholds = thresholds(45d, 14d);
        CertificateCheckService.Target target = target(11L, "threshold.example");
        when(checker.check(anyString(), anyInt(), anyString(), any()))
                .thenReturn(
                        new CertificateChecker.Result(
                                "subject",
                                "issuer",
                                "01ab",
                                InstantFixtures.NOT_BEFORE,
                                InstantFixtures.NOT_AFTER,
                                20,
                                true,
                                true,
                                "SHA256withRSA",
                                "WARN"));

        CertificateCheckService service =
                new CertificateCheckService(db, checker, results, thresholds, 1, 1);
        try {
            assertEquals(CertificateCheckService.Submission.ACCEPTED, service.submit(target));
            verify(results, org.mockito.Mockito.timeout(2_000))
                    .success(
                            target,
                            new CertificateChecker.Result(
                                    "subject",
                                    "issuer",
                                    "01ab",
                                    InstantFixtures.NOT_BEFORE,
                                    InstantFixtures.NOT_AFTER,
                                    20,
                                    true,
                                    true,
                                    "SHA256withRSA",
                                    "WARN"));
            verify(thresholds).resolve("sample-a", null);
            verify(checker)
                    .check(
                            "threshold.example",
                            443,
                            "threshold.example",
                            new ThresholdResolver.Limits(45d, 14d));
        } finally {
            service.close();
        }
    }

    private CertificateCheckService.Target target(long id, String hostname) {
        return new CertificateCheckService.Target(id, "sample-a", hostname, 443, hostname, 3L);
    }

    private ThresholdResolver thresholds(double warning, double critical) {
        ThresholdResolver thresholds = mock(ThresholdResolver.class);
        ThresholdResolver.Resolved resolved = mock(ThresholdResolver.Resolved.class);
        when(thresholds.resolve(anyString(), isNull())).thenReturn(resolved);
        when(resolved.get("CERTIFICATE_DAYS"))
                .thenReturn(new ThresholdResolver.Limits(warning, critical));
        return thresholds;
    }

    private static final class InstantFixtures {
        private static final java.time.Instant NOT_BEFORE =
                java.time.Instant.parse("2026-01-01T00:00:00Z");
        private static final java.time.Instant NOT_AFTER =
                java.time.Instant.parse("2027-01-01T00:00:00Z");
    }
}
