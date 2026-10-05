package com.monitoring.collector;

import java.util.Arrays;
import java.util.Collection;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class CheckJobExecutionTest {
    @Test
    public void resultsAreCorrelatedToTheSubmittingJob() throws Exception {
        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "local-01")
                        .token("01234567890123456789012345678901")
                        .check(check("first-check", 0L))
                        .check(check("second-check", 0L))
                        .build();

        MonitorRuntime.CheckRun first = runtime.startChecks(Arrays.asList("first-check"));
        MonitorRuntime.CheckRun second = runtime.startChecks(Arrays.asList("second-check"));
        awaitResult(runtime, first.getJobId());
        awaitResult(runtime, second.getJobId());

        Collection<CheckResult> firstResults = runtime.results(first.getJobId(), null);
        Collection<CheckResult> secondResults = runtime.results(second.getJobId(), null);
        assertEquals(1, firstResults.size());
        assertEquals("first-check", firstResults.iterator().next().getCheckId());
        assertEquals(1, secondResults.size());
        assertEquals("second-check", secondResults.iterator().next().getCheckId());
        runtime.shutdown();
    }

    @Test
    public void oneAbsoluteJobDeadlineCancelsBlockingChecks() throws Exception {
        final CountDownLatch interrupted = new CountDownLatch(1);
        BoundedCheckExecutor executor = new BoundedCheckExecutor(1, 2, 500L);
        long jobDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(500L);
        executor.submit(check("queue-a", 200L), "job-deadline", jobDeadline);
        executor.submit(
                new MonitorCheck() {
                    public String getId() {
                        return "queue-b";
                    }

                    public String getName() {
                        return "queue-b";
                    }

                    public CheckCategory getCategory() {
                        return CheckCategory.INTERNAL;
                    }

                    public CheckDirection getDirection() {
                        return null;
                    }

                    public CheckResult execute(CheckContext context) throws Exception {
                        try {
                            Thread.sleep(5_000L);
                            return new CheckResult(getId(), "UP", 5_000L, "late");
                        } catch (InterruptedException error) {
                            interrupted.countDown();
                            throw error;
                        }
                    }
                },
                "job-deadline",
                jobDeadline);

        assertTrue("blocking check was not interrupted", interrupted.await(2L, TimeUnit.SECONDS));
        Collection<CheckResult> results = waitFor(executor, "job-deadline", 2);
        assertEquals(2, results.size());
        assertTrue(hasStatus(results, "queue-b", "UNKNOWN"));
        assertTrue(hasCode(results, "queue-b", "TIMEOUT"));
        executor.shutdown();
    }

    @Test
    public void timedOutUncooperativeCheckKeepsItsRunningGuardUntilItReallyExits()
            throws Exception {
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch exited = new CountDownLatch(1);
        BoundedCheckExecutor executor = new BoundedCheckExecutor(1, 1, 100L);
        MonitorCheck uncooperative =
                new MonitorCheck() {
                    public String getId() {
                        return "uncooperative";
                    }

                    public String getName() {
                        return "uncooperative";
                    }

                    public CheckCategory getCategory() {
                        return CheckCategory.INTERNAL;
                    }

                    public CheckDirection getDirection() {
                        return null;
                    }

                    public CheckResult execute(CheckContext context) {
                        started.countDown();
                        try {
                            while (release.getCount() > 0L) {
                                try {
                                    release.await(20L, TimeUnit.MILLISECONDS);
                                } catch (InterruptedException ignored) {
                                    // Deliberately emulate a dependency that ignores cancellation.
                                }
                            }
                            return new CheckResult(getId(), "UP", 1L, "late");
                        } finally {
                            exited.countDown();
                        }
                    }
                };

        try {
            long submittedAt = System.nanoTime();
            assertEquals("ACCEPTED", executor.submit(uncooperative));
            assertTrue("worker did not start", started.await(1L, TimeUnit.SECONDS));
            Collection<CheckResult> deadlineResult = waitForLatest(executor, 1);
            long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - submittedAt);
            assertTrue("deadline result took " + elapsedMillis + "ms", elapsedMillis < 1_000L);
            assertTrue(hasCode(deadlineResult, "uncooperative", "TIMEOUT"));
            assertFalse(
                    "underlying worker exited despite ignoring interrupts",
                    exited.await(100L, TimeUnit.MILLISECONDS));
            assertEquals("ALREADY_RUNNING", executor.submit(uncooperative));

            release.countDown();
            assertTrue("underlying worker did not exit", exited.await(1L, TimeUnit.SECONDS));
            assertEquals("ACCEPTED", awaitAccepted(executor, uncooperative));
        } finally {
            release.countDown();
            executor.shutdown();
        }
    }

    private MonitorCheck check(final String id, final long sleepMillis) {
        return new MonitorCheck() {
            public String getId() {
                return id;
            }

            public String getName() {
                return id;
            }

            public CheckCategory getCategory() {
                return CheckCategory.INTERNAL;
            }

            public CheckDirection getDirection() {
                return null;
            }

            public CheckResult execute(CheckContext context) throws Exception {
                if (sleepMillis > 0L) {
                    Thread.sleep(sleepMillis);
                }
                return new CheckResult(id, "UP", sleepMillis, "ok");
            }
        };
    }

    private void awaitResult(MonitorRuntime runtime, String jobId) throws Exception {
        long deadline = System.currentTimeMillis() + 1_000L;
        while (runtime.results(jobId, null).isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(10L);
        }
    }

    private Collection<CheckResult> waitFor(BoundedCheckExecutor executor, String jobId, int count)
            throws Exception {
        long deadline = System.currentTimeMillis() + 1_000L;
        Collection<CheckResult> results = executor.results(jobId, null);
        while (results.size() < count && System.currentTimeMillis() < deadline) {
            Thread.sleep(10L);
            results = executor.results(jobId, null);
        }
        return results;
    }

    private Collection<CheckResult> waitForLatest(BoundedCheckExecutor executor, int count)
            throws Exception {
        long deadline = System.currentTimeMillis() + 1_000L;
        Collection<CheckResult> results = executor.results();
        while (results.size() < count && System.currentTimeMillis() < deadline) {
            Thread.sleep(10L);
            results = executor.results();
        }
        return results;
    }

    private String awaitAccepted(BoundedCheckExecutor executor, MonitorCheck check)
            throws Exception {
        long deadline = System.currentTimeMillis() + 1_000L;
        String result = executor.submit(check);
        while ("ALREADY_RUNNING".equals(result) && System.currentTimeMillis() < deadline) {
            Thread.sleep(10L);
            result = executor.submit(check);
        }
        return result;
    }

    private boolean hasStatus(Collection<CheckResult> values, String id, String status) {
        for (CheckResult value : values) {
            if (id.equals(value.getCheckId()) && status.equals(value.getStatus())) {
                return true;
            }
        }
        return false;
    }

    private boolean hasCode(Collection<CheckResult> values, String id, String code) {
        for (CheckResult value : values) {
            if (id.equals(value.getCheckId()) && code.equals(value.getResultCode())) {
                return true;
            }
        }
        return false;
    }
}
