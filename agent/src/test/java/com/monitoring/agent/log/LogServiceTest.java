package com.monitoring.agent.log;

import com.monitoring.agent.collection.CollectorClient;
import com.monitoring.agent.security.TokenCipher;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LogServiceTest {
    @Test
    void readersShareOneUpstreamFetchAndDisabledSourcesNeverCallAgent() throws Exception {
        CollectorClient client = mock(CollectorClient.class);
        when(client.readLog(anyString(), anyString(), anyString()))
                .thenReturn(
                        "{\"text\":\"raw token=keep\\n\",\"cursor\":\"offset\",\"reset\":false,\"limited\":false,\"identity\":{\"project_id\":\"test\",\"instance_id\":\"dev\"}}"
                                .getBytes());
        TokenCipher cipher = new TokenCipher(Base64.getEncoder().encodeToString(new byte[32]));
        var token = cipher.encrypt("a".repeat(32));
        Map<String, Object> config =
                new HashMap<>(
                        Map.of(
                                "log_id",
                                1L,
                                "enabled",
                                true,
                                "instance_enabled",
                                true,
                                "project_enabled",
                                true,
                                "poll_interval_seconds",
                                10,
                                "path",
                                "/logs/a.log",
                                "encoding",
                                "UTF-8",
                                "agent_base_url",
                                "https://agent.example",
                                "token_ciphertext",
                                token.ciphertext(),
                                "token_iv",
                                token.iv()));
        config.put("project_id", "test");
        config.put("instance_id", "dev");
        LogService service = new LogService(cipher, new ObjectMapper(), client);
        var first = service.read(config, null);
        var other = service.read(config, null);
        assertEquals("raw token=keep\n", first.text());
        assertEquals(first.text(), other.text());
        assertEquals("", service.read(config, first.cursor()).text());
        verify(client, times(1)).readLog(anyString(), anyString(), anyString());
        config.put("enabled", false);
        assertEquals("LOG_DISABLED", service.read(config, first.cursor()).code());
        verifyNoMoreInteractions(client);
    }

    @Test
    void fileResetReplacesContentsAndExpiredCursorReturnsTail() {
        LogBuffer buffer = new LogBuffer();
        buffer.append("old\n", false, false);
        var first = buffer.view(null, null, 0);
        buffer.append("new\n", true, false);
        var reset = buffer.view(first.cursor(), null, 0);
        assertTrue(reset.reset());
        assertEquals("new\n", reset.text());
        assertEquals("new\n", buffer.view("expired", null, 0).text());
    }
}
