package com.hermes.monitoring.center.collection;

import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

// 인스턴스 중복 실행 차단 및 수집 대기열 제한
final class BoundedInstanceExecutor {
    enum Submission {
        ACCEPTED,
        ALREADY_RUNNING,
        QUEUE_FULL,
        SHUTDOWN
    }

    private final ThreadPoolExecutor executor;
    private final Set<String> running = ConcurrentHashMap.newKeySet();

    BoundedInstanceExecutor(int threads, int queueCapacity) {
        executor =
                new ThreadPoolExecutor(
                        threads,
                        threads,
                        0L,
                        TimeUnit.MILLISECONDS,
                        new ArrayBlockingQueue<>(queueCapacity),
                        new ThreadPoolExecutor.AbortPolicy());
    }

    // 동일 인스턴스의 중복 실행 차단 후 제한된 대기열에 등록
    Submission submit(String instanceKey, Runnable task) {
        if (executor.isShutdown()) {
            return Submission.SHUTDOWN;
        }
        if (!running.add(instanceKey)) {
            return Submission.ALREADY_RUNNING;
        }
        try {
            executor.execute(
                    () -> {
                        try {
                            task.run();
                        } finally {
                            running.remove(instanceKey);
                        }
                    });
            return Submission.ACCEPTED;
        } catch (RejectedExecutionException error) {
            running.remove(instanceKey);
            return executor.isShutdown() ? Submission.SHUTDOWN : Submission.QUEUE_FULL;
        }
    }

    int queueDepth() {
        return executor.getQueue().size();
    }

    int activeCount() {
        return executor.getActiveCount();
    }

    // 남은 수집 작업 중단 및 실행기 종료 대기
    void shutdown() {
        executor.shutdownNow();
        try {
            executor.awaitTermination(5L, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    boolean isShutdown() {
        return executor.isShutdown();
    }
}
