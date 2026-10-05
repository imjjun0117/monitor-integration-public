package com.hermes.monitoring.agent;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

// 실행 수와 대기열을 제한하여 점검 작업 처리
public final class BoundedCheckExecutor {
    private static final long DEFAULT_JOB_DEADLINE_MS = 10_000L;
    private static final int MAX_JOB_RESULTS = 256;

    private final long defaultDeadlineMillis;
    private final ThreadPoolExecutor workers;
    private final ThreadPoolExecutor supervisors;
    private final Set<String> running = Collections.synchronizedSet(new HashSet<String>());
    private final Map<String, CheckResult> latest = new ConcurrentHashMap<String, CheckResult>();
    private final Map<String, Map<String, CheckResult>> jobs =
            new ConcurrentHashMap<String, Map<String, CheckResult>>();
    private final ConcurrentLinkedQueue<String> jobOrder = new ConcurrentLinkedQueue<String>();

    public BoundedCheckExecutor(int threads, int queueCapacity) {
        this(threads, queueCapacity, DEFAULT_JOB_DEADLINE_MS);
    }

    BoundedCheckExecutor(int threads, int queueCapacity, long defaultDeadlineMillis) {
        this.defaultDeadlineMillis = defaultDeadlineMillis;
        workers = pool(threads, queueCapacity);
        supervisors = pool(threads, queueCapacity);
    }

    // 점검 작업의 중복 및 실행 용량을 확인하여 접수
    public String submit(final MonitorCheck check) {
        String jobId = "single-" + System.nanoTime();
        return submit(check, jobId, deadlineFromNow());
    }

    // 점검 작업의 중복 및 실행 용량을 확인하여 접수
    String submit(final MonitorCheck check, final String jobId, final long deadlineNanos) {
        if (workers.isShutdown() || supervisors.isShutdown()) {
            return "RATE_LIMITED";
        }
        if (!running.add(check.getId())) {
            return "ALREADY_RUNNING";
        }
        registerJob(jobId);
        try {
            supervisors.execute(
                    new Runnable() {
                        public void run() {
                            executeUntilDeadline(check, jobId, deadlineNanos);
                        }
                    });
            return "ACCEPTED";
        } catch (RejectedExecutionException error) {
            running.remove(check.getId());
            return "RATE_LIMITED";
        }
    }

    public Collection<CheckResult> results() {
        return new ArrayList<CheckResult>(latest.values());
    }

    Collection<CheckResult> results(String jobId, String since) {
        Collection<CheckResult> source;
        if (jobId != null) {
            Map<String, CheckResult> values = jobs.get(jobId);
            source = values == null ? Collections.<CheckResult>emptyList() : values.values();
        } else {
            source = latest.values();
        }
        if (since == null) {
            return new ArrayList<CheckResult>(source);
        }

        Long boundary = UtcClock.parse(since);
        if (boundary == null) {
            return Collections.emptyList();
        }
        Collection<CheckResult> filtered = new ArrayList<CheckResult>();
        for (CheckResult value : source) {
            Long checkedAt = UtcClock.parse(value.getCheckedAt());
            if (checkedAt != null && checkedAt.longValue() > boundary.longValue()) {
                filtered.add(value);
            }
        }
        return filtered;
    }

    long deadlineFromNow() {
        return System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(defaultDeadlineMillis);
    }

    public void shutdown() {
        supervisors.shutdownNow();
        workers.shutdownNow();
        await(supervisors);
        await(workers);
    }

    boolean isShutdown() {
        return supervisors.isShutdown() && workers.isShutdown();
    }

    private void executeUntilDeadline(
            final MonitorCheck check, String jobId, final long deadlineNanos) {
        final long started = System.currentTimeMillis();
        Future<CheckResult> future = null;
        WorkerCall task = null;
        try {
            long remaining = deadlineNanos - System.nanoTime();
            if (remaining <= 0L) {
                throw new TimeoutException();
            }
            task = new WorkerCall(check, started, deadlineNanos);
            future = workers.submit(task);
            remaining = deadlineNanos - System.nanoTime();
            if (remaining <= 0L) {
                throw new TimeoutException();
            }
            store(
                    jobId,
                    check.getId(),
                    future.get(remaining, TimeUnit.NANOSECONDS).forCheck(check));
        } catch (TimeoutException error) {
            if (task != null && task.cancelBeforeOrDuringExecution(future)) {
                running.remove(check.getId());
            }
            store(jobId, check.getId(), failure(check, "TIMEOUT", started));
        } catch (RejectedExecutionException error) {
            store(jobId, check.getId(), failure(check, "RATE_LIMITED", started));
        } catch (ExecutionException error) {
            store(jobId, check.getId(), failure(check, "CHECK_FAILED", started));
        } catch (InterruptedException error) {
            if (task != null && task.cancelBeforeOrDuringExecution(future)) {
                running.remove(check.getId());
            }
            Thread.currentThread().interrupt();
            store(jobId, check.getId(), failure(check, "CANCELLED", started));
        } finally {
            if (task == null || future == null) {
                running.remove(check.getId());
            }
        }
    }

    private final class WorkerCall implements Callable<CheckResult> {
        private final MonitorCheck check;
        private final long started;
        private final long deadlineNanos;
        private boolean startedExecution;
        private boolean cancelledBeforeStart;

        WorkerCall(MonitorCheck check, long started, long deadlineNanos) {
            this.check = check;
            this.started = started;
            this.deadlineNanos = deadlineNanos;
        }

        public CheckResult call() throws Exception {
            synchronized (this) {
                if (cancelledBeforeStart) {
                    running.remove(check.getId());
                    return failure(check, "CANCELLED", started);
                }
                startedExecution = true;
            }
            try {
                return check.execute(
                        new CheckContext(
                                started
                                        + TimeUnit.NANOSECONDS.toMillis(
                                                deadlineNanos - System.nanoTime())));
            } finally {
                running.remove(check.getId());
            }
        }

        synchronized boolean cancelBeforeOrDuringExecution(Future<CheckResult> future) {
            if (future == null) {
                return true;
            }
            if (!startedExecution) {
                cancelledBeforeStart = true;
            }
            future.cancel(true);
            return !startedExecution;
        }
    }

    private CheckResult failure(MonitorCheck check, String code, long started) {
        return new CheckResult(
                check.getId(),
                check.getCategory().name(),
                "UNKNOWN",
                Math.max(0L, System.currentTimeMillis() - started),
                code,
                code,
                UtcClock.now());
    }

    private void store(String jobId, String checkId, CheckResult result) {
        latest.put(checkId, result);
        Map<String, CheckResult> values = jobs.get(jobId);
        if (values != null) {
            values.put(checkId, result);
        }
    }

    private void registerJob(String jobId) {
        synchronized (jobs) {
            if (jobs.containsKey(jobId)) {
                return;
            }
            jobs.put(jobId, new ConcurrentHashMap<String, CheckResult>());
            jobOrder.add(jobId);
            while (jobOrder.size() > MAX_JOB_RESULTS) {
                String expired = jobOrder.poll();
                if (expired != null) {
                    jobs.remove(expired);
                }
            }
        }
    }

    private ThreadPoolExecutor pool(int threads, int queueCapacity) {
        return new ThreadPoolExecutor(
                threads,
                threads,
                0L,
                TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<Runnable>(queueCapacity),
                new ThreadPoolExecutor.AbortPolicy());
    }

    private void await(ThreadPoolExecutor executor) {
        try {
            executor.awaitTermination(2L, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }
}
