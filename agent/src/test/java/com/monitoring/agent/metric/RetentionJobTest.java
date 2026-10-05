package com.monitoring.agent.metric;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.atLeast;

class RetentionJobTest {
    @Test
    void usesEachHistoryTablesActualTimestampColumn() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        new RetentionJob(db).removeExpired();
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(db, times(4)).update(sql.capture(), any(Object[].class));
        assertTrue(
                sql.getAllValues().stream()
                        .anyMatch(
                                value ->
                                        value.contains("check_result_samples")
                                                && value.contains("checked_at")));
        assertTrue(
                sql.getAllValues().stream()
                        .filter(value -> !value.contains("check_result_samples"))
                        .allMatch(value -> value.contains("sampled_at")));
    }

    @Test
    void drainsMultipleSkipLockedBatchesWithinABoundedBudgetAndReportsRemainingRows() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        AtomicInteger calls = new AtomicInteger();
        when(db.update(any(String.class), any(Object[].class)))
                .thenAnswer(invocation -> calls.getAndIncrement() % 2 == 0 ? 10_000 : 0);
        when(db.queryForObject(any(String.class), eq(Long.class), any(Object[].class)))
                .thenReturn(7L);
        RetentionJob job = new RetentionJob(db);

        job.removeExpired();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(db, atLeast(8)).update(sql.capture(), any(Object[].class));
        assertTrue(
                sql.getAllValues().stream()
                        .allMatch(value -> value.contains("for update skip locked")));
        assertEquals(4, job.remainingRows().size());
        assertTrue(job.remainingRows().values().stream().allMatch(value -> value == 7L));
    }
}
