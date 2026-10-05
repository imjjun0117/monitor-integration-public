package com.hermes.monitoring.center.check;

import com.hermes.monitoring.center.metric.ThresholdResolver;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CheckResultStoreTest {
    @Test
    void latestOnlyAcceptsAStrictlyNewerCheckedAt() throws Exception {
        JdbcTemplate db = mock(JdbcTemplate.class);
        TransactionTemplate transaction = mock(TransactionTemplate.class);
        org.mockito.Mockito.doAnswer(
                        invocation -> {
                            Consumer<TransactionStatus> callback = invocation.getArgument(0);
                            callback.accept(mock(TransactionStatus.class));
                            return null;
                        })
                .when(transaction)
                .executeWithoutResult(any());
        CheckResultStore store =
                new CheckResultStore(db, transaction, mock(ThresholdResolver.class));
        JsonNode result =
                new ObjectMapper()
                        .readTree(
                                """
            {"status":"DOWN","duration_ms":null,"result_code":"FAILED",
             "message":"failed","checked_at":"2026-09-03T09:00:00Z"}
            """);

        store.save("sample-a", "local-01", "check-01", result);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(db, org.mockito.Mockito.times(2)).update(sql.capture(), any(Object[].class));
        assertTrue(
                sql.getAllValues()
                        .get(0)
                        .contains("excluded.checked_at > check_results_latest.checked_at"));
    }
}
