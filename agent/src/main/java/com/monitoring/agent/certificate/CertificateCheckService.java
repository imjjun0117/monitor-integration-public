package com.monitoring.agent.certificate;

import com.monitoring.agent.metric.ThresholdResolver;
import jakarta.annotation.PreDestroy;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

// 인증서 검사 작업의 실행 수와 대기열 제한
@Component
final class CertificateCheckService implements AutoCloseable {
    private static final Logger LOG = LoggerFactory.getLogger(CertificateCheckService.class);
    private static final int SHUTDOWN_SECONDS = 5;
    private final JdbcTemplate db;
    private final CertificateChecker checker;
    private final CertificateResultStore results;
    private final ThresholdResolver thresholds;
    private final ThreadPoolExecutor executor;
    private final Set<Long> inFlight = ConcurrentHashMap.newKeySet();

    CertificateCheckService(
            JdbcTemplate db,
            CertificateChecker checker,
            CertificateResultStore results,
            ThresholdResolver thresholds,
            @Value("${hermes.certificate-check-workers:4}") int workers,
            @Value("${hermes.certificate-check-queue-capacity:100}") int queueCapacity) {
        if (workers < 1 || queueCapacity < 1) {
            throw new IllegalArgumentException("CERTIFICATE_EXECUTOR_INVALID");
        }
        this.db = db;
        this.checker = checker;
        this.results = results;
        this.thresholds = thresholds;
        this.executor =
                new ThreadPoolExecutor(
                        workers,
                        workers,
                        0L,
                        TimeUnit.MILLISECONDS,
                        new ArrayBlockingQueue<>(queueCapacity),
                        new CertificateThreadFactory(),
                        new ThreadPoolExecutor.AbortPolicy());
    }

    Submission submit(long id) {
        Map<String, Object> row =
                db.queryForMap(
                        """
            select certificate_target_id,project_id,hostname,port,sni_hostname,target_version
            from certificate_targets where certificate_target_id=? and enabled
            """,
                        id);
        return submit(Target.from(row));
    }

    Submission submit(Target target) {
        if (!inFlight.add(target.id())) {
            return Submission.ALREADY_RUNNING;
        }
        try {
            executor.execute(() -> run(target));
            return Submission.ACCEPTED;
        } catch (RejectedExecutionException error) {
            inFlight.remove(target.id());
            return Submission.CAPACITY_EXCEEDED;
        }
    }

    private void run(Target target) {
        try {
            ThresholdResolver.Limits limits =
                    thresholds.resolve(target.projectId(), null).get("CERTIFICATE_DAYS");
            CertificateChecker.Result result =
                    checker.check(target.hostname(), target.port(), target.sniHostname(), limits);
            results.success(target, result);
        } catch (Exception error) {
            try {
                results.failure(target, failureCode(error));
            } catch (RuntimeException persistenceError) {
                LOG.error(
                        "Certificate failure result persistence failed for target {}",
                        target.id(),
                        persistenceError);
            }
        } finally {
            inFlight.remove(target.id());
        }
    }

    @Override
    @PreDestroy
    public void close() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(SHUTDOWN_SECONDS, TimeUnit.SECONDS)) {
                executor.shutdownNow();
                executor.awaitTermination(SHUTDOWN_SECONDS, TimeUnit.SECONDS);
            }
        } catch (InterruptedException error) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    boolean isTerminated() {
        return executor.isTerminated();
    }

    static String failureCode(Exception error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof java.security.cert.CertificateExpiredException) {
                return "TLS_CERTIFICATE_EXPIRED";
            }
            if (cause instanceof java.security.cert.CertificateNotYetValidException) {
                return "TLS_CERTIFICATE_NOT_YET_VALID";
            }
            if (cause instanceof java.net.UnknownHostException) {
                return "TLS_DNS_ERROR";
            }
            if (cause instanceof java.net.SocketTimeoutException) {
                return "TLS_TIMEOUT";
            }
            if (cause instanceof java.net.ConnectException) {
                return "TLS_CONNECTION_FAILED";
            }
        }
        return error instanceof javax.net.ssl.SSLException
                ? "TLS_HANDSHAKE_FAILED"
                : "TLS_CHECK_FAILED";
    }

    enum Submission {
        ACCEPTED,
        ALREADY_RUNNING,
        CAPACITY_EXCEEDED
    }

    record Target(
            long id,
            String projectId,
            String hostname,
            int port,
            String sniHostname,
            long version) {
        static Target from(Map<String, Object> row) {
            return new Target(
                    ((Number) row.get("certificate_target_id")).longValue(),
                    (String) row.get("project_id"),
                    (String) row.get("hostname"),
                    ((Number) row.get("port")).intValue(),
                    (String) row.get("sni_hostname"),
                    ((Number) row.get("target_version")).longValue());
        }
    }

    private static final class CertificateThreadFactory implements ThreadFactory {
        private final AtomicInteger sequence = new AtomicInteger();

        @Override
        public Thread newThread(Runnable task) {
            Thread thread = new Thread(task, "certificate-check-" + sequence.incrementAndGet());
            thread.setDaemon(false);
            return thread;
        }
    }
}
