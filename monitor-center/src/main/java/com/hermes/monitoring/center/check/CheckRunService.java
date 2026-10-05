package com.hermes.monitoring.center.check;

import com.hermes.monitoring.center.collection.AgentClient;
import com.hermes.monitoring.center.collection.SsrfGuard;
import com.hermes.monitoring.center.security.TokenCipher;
import java.sql.SQLException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

// 점검 실행 등록 및 중복·대기열 제한
@Component
public final class CheckRunService implements DisposableBean {
    public enum Submission {
        ACCEPTED,
        ALREADY_RUNNING,
        QUEUE_FULL
    }

    private final JdbcTemplate db;
    private final TokenCipher cipher;
    private final CheckResultStore store;
    private final CheckPollingJob polling;
    private final ThreadPoolExecutor executor;
    private final Set<String> running = ConcurrentHashMap.newKeySet();

    @Autowired
    CheckRunService(
            JdbcTemplate db,
            TokenCipher cipher,
            CheckResultStore store,
            ObjectMapper json,
            @Value("${hermes.agent-allowed-cidrs:}") String cidrs,
            @Value("${hermes.agent-allowed-hosts:}") String hosts,
            @Value("${hermes.check.threads:5}") int threads,
            @Value("${hermes.check.queue-capacity:100}") int queueCapacity,
            @Value("${hermes.check.poll-interval-ms:1000}") long pollInterval,
            @Value("${hermes.check.max-polls:15}") int maxPolls,
            @Value("${hermes.agent-allowlist-file:}") String allowlistFile) {
        this.db = db;
        this.cipher = cipher;
        this.store = store;
        AgentClient client = new AgentClient(new SsrfGuard(cidrs, hosts, allowlistFile));
        this.polling =
                new CheckPollingJob(
                        new CheckPollingJob.Gateway() {
                            @Override
                            public byte[] runChecks(String base, String token, String body)
                                    throws Exception {
                                return client.runChecks(base, token, body);
                            }

                            @Override
                            public byte[] getResults(String base, String token, String jobId)
                                    throws Exception {
                                return client.getResults(base, token, jobId);
                            }
                        },
                        json,
                        pollInterval,
                        maxPolls);
        this.executor =
                new ThreadPoolExecutor(
                        threads,
                        threads,
                        0L,
                        TimeUnit.MILLISECONDS,
                        new ArrayBlockingQueue<>(queueCapacity),
                        new ThreadPoolExecutor.AbortPolicy());
    }

    CheckRunService(
            JdbcTemplate db,
            TokenCipher cipher,
            CheckResultStore store,
            ObjectMapper json,
            String cidrs,
            String hosts,
            int threads,
            int queueCapacity,
            long pollInterval,
            int maxPolls) {
        this(
                db,
                cipher,
                store,
                json,
                cidrs,
                hosts,
                threads,
                queueCapacity,
                pollInterval,
                maxPolls,
                "");
    }

    CheckRunService(
            JdbcTemplate db,
            TokenCipher cipher,
            CheckResultStore store,
            ObjectMapper json,
            String cidrs,
            int threads,
            int queueCapacity,
            long pollInterval,
            int maxPolls) {
        this(db, cipher, store, json, cidrs, "", threads, queueCapacity, pollInterval, maxPolls);
    }

    // 중복 점검 차단 후 실행 대기열 등록
    public Submission submit(String projectId, String instanceId, String checkId) {
        return submit(projectId, instanceId, checkId, false);
    }

    public Submission submitAutomatic(String projectId, String instanceId, String checkId) {
        return submit(projectId, instanceId, checkId, true);
    }

    // 중복 점검 차단 후 실행 대기열 등록
    private Submission submit(
            String projectId, String instanceId, String checkId, boolean automatic) {
        String key = projectId + "/" + instanceId + "/" + checkId;
        if (!running.add(key)) {
            return Submission.ALREADY_RUNNING;
        }
        try {
            executor.execute(
                    () -> {
                        try {
                            execute(projectId, instanceId, checkId, automatic);
                        } finally {
                            running.remove(key);
                        }
                    });
            return Submission.ACCEPTED;
        } catch (RejectedExecutionException error) {
            running.remove(key);
            return Submission.QUEUE_FULL;
        }
    }

    // 현재 사용 여부 확인 후 점검 실행 및 결과 저장
    private void execute(String projectId, String instanceId, String checkId) {
        execute(projectId, instanceId, checkId, false);
    }

    // 현재 사용 여부 확인 후 점검 실행 및 결과 저장
    private void execute(String projectId, String instanceId, String checkId, boolean automatic) {
        final Map<String, Object> instance;
        try {
            instance =
                    db.queryForMap(
                            """
                select i.agent_base_url,i.token_ciphertext,i.token_iv from instances i
                join projects p using(project_id)
                join check_definitions d using(project_id,instance_id)
                where i.project_id=? and i.instance_id=? and d.check_id=?
                  and i.enabled and p.enabled and d.enabled
                  and d.monitoring_enabled
                """
                                    + (automatic
                                            ? " and d.automatic_enabled and (d.category <> 'API' or i.api_checks_enabled)"
                                            : ""),
                            projectId,
                            instanceId,
                            checkId);
        } catch (EmptyResultDataAccessException deleted) {
            return;
        }
        try {
            String token =
                    cipher.decrypt(
                            (byte[]) instance.get("token_ciphertext"),
                            (byte[]) instance.get("token_iv"));
            polling.run(
                    (String) instance.get("agent_base_url"),
                    token,
                    checkId,
                    result -> storeSafely(() -> store.save(projectId, instanceId, checkId, result)),
                    () -> storeSafely(() -> store.timeout(projectId, instanceId, checkId)));
        } catch (Exception error) {
            if (scopeExists(projectId, instanceId, checkId)) {
                storeSafely(() -> store.failed(projectId, instanceId, checkId));
            }
        }
    }

    private boolean scopeExists(String projectId, String instanceId, String checkId) {
        try {
            Boolean exists =
                    db.queryForObject(
                            """
                select exists(
                  select 1 from instances i join check_definitions d using(project_id,instance_id)
                  where i.project_id=? and i.instance_id=? and d.check_id=?
                )
                """,
                            Boolean.class,
                            projectId,
                            instanceId,
                            checkId);
            return Boolean.TRUE.equals(exists);
        } catch (Exception deletedOrUnavailable) {
            return false;
        }
    }

    // 삭제와 저장이 겹치면 외래 키 위반 여부를 확인하여 처리
    private void storeSafely(Runnable write) {
        try {
            write.run();
        } catch (DataIntegrityViolationException deletionRace) {
            if (!isForeignKeyViolation(deletionRace)) {
                throw deletionRace;
            }
            // 저장보다 영구 삭제가 먼저 완료된 경우 외래 키로 차단하고 재시도하지 않음
        }
    }

    private boolean isForeignKeyViolation(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && "23503".equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void destroy() {
        executor.shutdownNow();
        try {
            executor.awaitTermination(5L, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }
}
