package com.monitoring.agent.collection;

import com.monitoring.agent.security.TokenCipher;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SnapshotCollectorProjectUsageTest {
    @Test
    void dueScanRequiresEnabledProject() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        SnapshotCollector collector = collector(db, mock(TokenCipher.class));
        try {
            collector.collect();
            ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
            verify(db).queryForList(sql.capture());
            assertTrue(sql.getValue().contains("p.project_id = instances.project_id"));
            assertTrue(sql.getValue().contains("and p.enabled"));
        } finally {
            collector.destroy();
        }
    }

    @Test
    void disabledProjectAfterSchedulingSkipsCollectorRequest() {
        JdbcTemplate db = mock(JdbcTemplate.class);
        when(db.queryForList(anyString()))
                .thenReturn(List.of(Map.of("project_id", "sample", "instance_id", "prod")));
        when(db.queryForObject(anyString(), eq(Boolean.class), eq("sample"), eq("prod")))
                .thenReturn(false);
        TokenCipher cipher = mock(TokenCipher.class);
        SnapshotCollector collector = collector(db, cipher);
        try {
            collector.collect();
            ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
            verify(db, timeout(2000)).queryForObject(
                    sql.capture(), eq(Boolean.class), eq("sample"), eq("prod"));
            assertTrue(sql.getValue().contains("and p.enabled"));
            assertTrue(sql.getValue().contains("and i.enabled"));
            assertTrue(sql.getValue().contains("i.transport_mode = 'HTTP'"));
        } finally {
            collector.destroy();
        }
        verifyNoInteractions(cipher);
    }

    private SnapshotCollector collector(JdbcTemplate db, TokenCipher cipher) {
        return new SnapshotCollector(
                db,
                cipher,
                new ObjectMapper(),
                mock(SnapshotPersistence.class),
                mock(CollectionFailureService.class),
                "",
                1,
                1);
    }
}
