package com.monitoring.agent.metric;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// 행 수와 처리 시간을 제한하여 보관 기간이 지난 이력 삭제
@Component
public final class RetentionJob {
    private static final Logger LOGGER = LoggerFactory.getLogger(RetentionJob.class);
    private static final int RETENTION_DAYS = 366;
    private static final Map<String, String> HISTORY_TIMESTAMPS =
            Map.of(
                    "instance_metric_samples", "sampled_at",
                    "disk_samples", "sampled_at",
                    "db_pool_samples", "sampled_at",
                    "check_result_samples", "checked_at");

    private final JdbcTemplate db;
    private final int batchSize;
    private final int rowBudget;
    private final long timeBudgetNanos;
    private final Map<String, AtomicLong> remaining = new ConcurrentHashMap<>();

    @Autowired
    RetentionJob(
            JdbcTemplate db,
            MeterRegistry meters,
            @Value("${hermes.retention.batch-size:10000}") int batchSize,
            @Value("${hermes.retention.row-budget:100000}") int rowBudget,
            @Value("${hermes.retention.time-budget-ms:5000}") long timeBudgetMillis) {
        this.db = db;
        this.batchSize = batchSize;
        this.rowBudget = rowBudget;
        this.timeBudgetNanos = TimeUnit.MILLISECONDS.toNanos(timeBudgetMillis);
        for (String table : HISTORY_TIMESTAMPS.keySet()) {
            AtomicLong value = new AtomicLong();
            remaining.put(table, value);
            meters.gauge(
                    "hermes.retention.remaining.rows",
                    java.util.List.of(io.micrometer.core.instrument.Tag.of("table", table)),
                    value);
        }
    }

    RetentionJob(JdbcTemplate db) {
        this(
                db,
                new io.micrometer.core.instrument.simple.SimpleMeterRegistry(),
                10_000,
                100_000,
                5_000L);
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "UTC")
    public void removeExpired() {
        long deadline = System.nanoTime() + timeBudgetNanos;
        int availableRows = rowBudget;
        for (Map.Entry<String, String> history : HISTORY_TIMESTAMPS.entrySet()) {
            if (availableRows <= 0 || System.nanoTime() >= deadline) {
                break;
            }
            int deleted = drain(history.getKey(), history.getValue(), availableRows, deadline);
            availableRows -= deleted;
        }
        reportRemaining(
                rowBudget - availableRows, availableRows <= 0 || System.nanoTime() >= deadline);
    }

    Map<String, Long> remainingRows() {
        Map<String, Long> values = new LinkedHashMap<>();
        for (Map.Entry<String, AtomicLong> entry : remaining.entrySet()) {
            values.put(entry.getKey(), entry.getValue().get());
        }
        return values;
    }

    private int drain(String table, String timestamp, int availableRows, long deadline) {
        int deletedTotal = 0;
        while (deletedTotal < availableRows && System.nanoTime() < deadline) {
            int limit = Math.min(batchSize, availableRows - deletedTotal);
            int deleted =
                    db.update(
                            "delete from "
                                    + table
                                    + " where ctid in (select ctid from "
                                    + table
                                    + " where "
                                    + timestamp
                                    + " < now()-(? * interval '1 day') order by "
                                    + timestamp
                                    + " limit ? for update skip locked)",
                            RETENTION_DAYS,
                            limit);
            deletedTotal += deleted;
            if (deleted < limit) {
                break;
            }
        }
        return deletedTotal;
    }

    private void reportRemaining(int deleted, boolean budgetExhausted) {
        for (Map.Entry<String, String> history : HISTORY_TIMESTAMPS.entrySet()) {
            Long count =
                    db.queryForObject(
                            "select count(*) from "
                                    + history.getKey()
                                    + " where "
                                    + history.getValue()
                                    + " < now()-(? * interval '1 day')",
                            Long.class,
                            RETENTION_DAYS);
            remaining.get(history.getKey()).set(count == null ? 0L : count.longValue());
        }
        LOGGER.info(
                "Retention cycle deletedRows={} remainingRows={} budgetExhausted={}",
                deleted,
                remainingRows(),
                budgetExhausted);
    }
}
