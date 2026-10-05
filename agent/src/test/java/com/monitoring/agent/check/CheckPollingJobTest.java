package com.monitoring.agent.check;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.monitoring.agent.collection.AgentPayloadException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CheckPollingJobTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void pollsUntilTheRequestedResultAndPersistsIt() throws Exception {
        FakeGateway gateway = new FakeGateway();
        gateway.results.add("[]".getBytes(StandardCharsets.UTF_8));
        gateway.results.add(
                """
            [{"check_id":"partner-api","category":"API","status":"UP",
              "duration_ms":12,"result_code":"200",
              "checked_at":"2026-09-03T01:30:00Z","message":"ok"}]
            """
                        .getBytes(StandardCharsets.UTF_8));
        AtomicBoolean persisted = new AtomicBoolean();
        AtomicBoolean timedOut = new AtomicBoolean();

        new CheckPollingJob(gateway, json, 0L, 15)
                .run(
                        "http://agent",
                        "token",
                        "partner-api",
                        result -> persisted.set("UP".equals(result.path("status").asString())),
                        () -> timedOut.set(true));

        assertEquals(2, gateway.polls.get());
        assertTrue(persisted.get());
        assertFalse(timedOut.get());
    }

    @Test
    void stopsAfterExactlyFifteenPollsAndPersistsTimeout() throws Exception {
        FakeGateway gateway = new FakeGateway();
        AtomicBoolean timedOut = new AtomicBoolean();
        new CheckPollingJob(gateway, json, 0L, 15)
                .run(
                        "http://agent",
                        "token",
                        "partner-api",
                        result -> {},
                        () -> timedOut.set(true));
        assertEquals(15, gateway.polls.get());
        assertTrue(timedOut.get());
    }

    @Test
    void rejectsAnAgentResultThatDoesNotMatchTheDirectResultSchema() {
        FakeGateway gateway = new FakeGateway();
        gateway.results.add(
                """
            [{"check_id":"partner-api","category":"API","status":"BROKEN",
              "duration_ms":12,"checked_at":"2026-09-03T01:30:00Z","message":"bad"}]
            """
                        .getBytes(StandardCharsets.UTF_8));
        AtomicBoolean persisted = new AtomicBoolean();

        assertThrows(
                AgentPayloadException.class,
                () ->
                        new CheckPollingJob(gateway, json, 0L, 1)
                                .run(
                                        "http://agent",
                                        "token",
                                        "partner-api",
                                        result -> persisted.set(true),
                                        () -> {}));
        assertFalse(persisted.get());
    }

    private static final class FakeGateway implements CheckPollingJob.Gateway {
        private final Queue<byte[]> results = new ArrayDeque<>();
        private final AtomicInteger polls = new AtomicInteger();

        @Override
        public byte[] runChecks(String base, String token, String body) {
            return "{\"job_id\":\"job-1\"}".getBytes(StandardCharsets.UTF_8);
        }

        @Override
        public byte[] getResults(String base, String token, String jobId) {
            polls.incrementAndGet();
            return results.isEmpty() ? "[]".getBytes(StandardCharsets.UTF_8) : results.remove();
        }
    }
}
