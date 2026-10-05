package com.monitoring.agent.collection;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BoundedInstanceExecutorTest {
    @Test
    void skipsConcurrentWorkForTheSameInstanceAndShutsDown() throws Exception {
        BoundedInstanceExecutor executor = new BoundedInstanceExecutor(1, 1);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        assertEquals(
                BoundedInstanceExecutor.Submission.ACCEPTED,
                executor.submit(
                        "sample-a/local-01",
                        () -> {
                            entered.countDown();
                            try {
                                release.await(2, TimeUnit.SECONDS);
                            } catch (InterruptedException error) {
                                Thread.currentThread().interrupt();
                            }
                        }));
        assertTrue(entered.await(1, TimeUnit.SECONDS));
        assertEquals(
                BoundedInstanceExecutor.Submission.ALREADY_RUNNING,
                executor.submit("sample-a/local-01", () -> {}));
        release.countDown();
        executor.shutdown();
        assertTrue(executor.isShutdown());
        assertEquals(
                BoundedInstanceExecutor.Submission.SHUTDOWN,
                executor.submit("sample-b/local-01", () -> {}));
    }
}
