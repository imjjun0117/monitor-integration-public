package com.monitoring.agent.collection;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CollectorPayloadValidatorTest {
    private final CollectorPayloadValidator validator = new CollectorPayloadValidator();

    @Test
    void validatesTheCompleteSnapshotSchemaAndExpectedIdentity() throws Exception {
        byte[] valid = Files.readAllBytes(Path.of("../fixtures/agent-snapshot.json"));
        assertDoesNotThrow(() -> validator.validateSnapshot(valid, "sample-a", "local-01"));

        String source = Files.readString(Path.of("../fixtures/agent-snapshot.json"));
        assertCode(
                "SCHEMA_ERROR",
                source.replace("\"schema_version\": \"1.0\"", "\"schema_version\": \"2.0\""),
                "sample-a",
                "local-01");
        assertCode(
                "SCHEMA_ERROR",
                source.replaceFirst("\"pid\"\\s*:\\s*18432,", ""),
                "sample-a",
                "local-01");
        assertCode("IDENTITY_MISMATCH", source, "different-project", "local-01");
    }

    @Test
    void validatesInfoRequiredFieldsAndIdentity() throws Exception {
        String info =
                """
            {"schema_version":"1.0","agent_version":"0.1.0",
             "observed_at":"2026-09-03T01:30:00Z",
             "identity":{"project_id":"sample-a","instance_id":"local-01"},
             "attributes":{"display_name":"Sample","environment":"test","host_name":"localhost","context_path":""},
             "capabilities":["JVM"],"checks":[]}
            """;
        assertDoesNotThrow(
                () ->
                        validator.validateInfo(
                                info.getBytes(StandardCharsets.UTF_8), "sample-a", "local-01"));
        assertCode("SCHEMA_ERROR", info.replace("\"checks\":[]", ""), "sample-a", "local-01", true);
        assertCode(
                "SCHEMA_ERROR",
                info.replace("2026-09-03T01:30:00Z", "2026-09-03T10:30:00+09:00"),
                "sample-a",
                "local-01",
                true);
    }

    @Test
    void checkDirectionMustMatchItsCategory() {
        String base =
                """
            {"schema_version":"1.0","agent_version":"0.1.0",
             "observed_at":"2026-09-03T01:30:00Z",
             "identity":{"project_id":"sample-a","instance_id":"local-01"},
             "attributes":{"display_name":"Sample","environment":"test",
               "host_name":"localhost","context_path":""},
             "capabilities":["INTERNAL_CHECK","API_CHECK"],"checks":[%s]}
            """;
        assertDoesNotThrow(
                () ->
                        validator.validateInfo(
                                base.formatted(
                                                """
            {"check_id":"db-health","name":"DB","category":"INTERNAL","direction":null},
            {"check_id":"private-api","name":"Private","category":"API","direction":"INTERNAL"},
            {"check_id":"public-api","name":"Public","category":"API","direction":"EXTERNAL"}
            """)
                                        .getBytes(StandardCharsets.UTF_8),
                                "sample-a",
                                "local-01"));

        assertDirectionError(
                base,
                """
            {"check_id":"db-health","name":"DB","category":"INTERNAL","direction":"INTERNAL"}
            """);
        assertDirectionError(
                base,
                """
            {"check_id":"db-health","name":"DB","category":"INTERNAL"}
            """);
        assertDirectionError(
                base,
                """
            {"check_id":"public-api","name":"Public","category":"API","direction":null}
            """);
        assertDirectionError(
                base,
                """
            {"check_id":"public-api","name":"Public","category":"API"}
            """);
    }

    @Test
    void acceptsSchemaValidPartialSnapshotWhenJvmAndSystemCollectorsFail() {
        String partial =
                """
            {"schema_version":"1.0","observed_at":"2026-09-03T01:30:00Z",
             "identity":{"project_id":"sample-a","instance_id":"local-01"},
             "jvm":{"pid":null,"start_time":null,"uptime_ms":null,"java_vendor":null,
               "java_version":null,"process_cpu_ratio":null,"heap_used_bytes":null,
               "heap_max_bytes":null,"non_heap_used_bytes":null,"thread_live_count":null,
               "thread_peak_count":null,"gc_count":null,"gc_time_ms":null},
             "system":{"system_cpu_ratio":null,"physical_memory_used_bytes":null,
               "physical_memory_total_bytes":null,"disks":[]},
             "db_pools":[],"recent_checks":[],"partial":true,
             "collection_errors":["JVM_COLLECTION_FAILED","SYSTEM_COLLECTION_FAILED"]}
            """;
        assertDoesNotThrow(
                () ->
                        validator.validateSnapshot(
                                partial.getBytes(StandardCharsets.UTF_8), "sample-a", "local-01"));
    }

    @Test
    void directCheckResultMustMatchTheDedicatedJsonSchemaAndRequestedId() throws Exception {
        var json = new ObjectMapper();
        var valid =
                json.readTree(
                        """
            {"check_id":"partner-api","category":"API","status":"UP",
             "duration_ms":12,"result_code":"200",
             "checked_at":"2026-09-03T01:30:00Z","message":"ok"}
            """);
        assertDoesNotThrow(() -> validator.validateCheckResult(valid, "partner-api"));
        assertEquals(
                "SCHEMA_ERROR",
                assertThrows(
                                AgentPayloadException.class,
                                () ->
                                        validator.validateCheckResult(
                                                json.readTree(
                                                        valid.toString()
                                                                .replace("\"UP\"", "\"BROKEN\"")),
                                                "partner-api"))
                        .getMessage());
        assertEquals(
                "CHECK_ID_MISMATCH",
                assertThrows(
                                AgentPayloadException.class,
                                () -> validator.validateCheckResult(valid, "another-api"))
                        .getMessage());
    }

    @Test
    void acceptsBoundedExecutionDetailsInDirectResultsAndSnapshots() throws Exception {
        var json = new ObjectMapper();
        var result =
                json.readTree(
                        """
            {"check_id":"partner-api","category":"API","status":"UP","duration_ms":12,
             "result_code":"HTTP_ASSERTIONS_PASSED","checked_at":"2026-09-03T01:30:00Z","message":"ok",
             "http":{"method":"GET","url":"https://api.example/","request_headers":{"Authorization":"***"},
               "status_code":200,"response_body":"actual response","response_body_truncated":false},
             "details":{"balance":1000,"sms_remaining_estimate":50,"lms_remaining_estimate":null}}
            """);
        assertDoesNotThrow(() -> validator.validateCheckResult(result, "partner-api"));
        var snapshot =
                (tools.jackson.databind.node.ObjectNode)
                        json.readTree(Files.readString(Path.of("../fixtures/agent-snapshot.json")));
        snapshot.putArray("recent_checks").add(result);
        assertDoesNotThrow(
                () ->
                        validator.validateSnapshot(
                                snapshot.toString().getBytes(StandardCharsets.UTF_8),
                                "sample-a",
                                "local-01"));
        ((tools.jackson.databind.node.ObjectNode) result.path("http"))
                .put("response_body", "x".repeat(4097));
        assertThrows(
                AgentPayloadException.class,
                () -> validator.validateCheckResult(result, "partner-api"));
    }

    @Test
    void acceptsNullOptionalEvidenceFromMarketSerializeNulls() throws Exception {
        var json = new ObjectMapper();
        var result =
                (tools.jackson.databind.node.ObjectNode)
                        json.readTree(
                                """
            {"check_id":"partner-api","category":"API","status":"UNKNOWN","duration_ms":0,
             "result_code":null,"checked_at":"2026-09-03T01:30:00Z","message":"CONFIGURATION_MISSING",
             "http":null,"details":null}
            """);
        assertDoesNotThrow(() -> validator.validateCheckResult(result, "partner-api"));
        result.putObject("http")
                .put("method", "GET")
                .putNull("request_body")
                .putNull("status_code")
                .putNull("response_body")
                .putNull("response_bytes");
        assertDoesNotThrow(() -> validator.validateCheckResult(result, "partner-api"));
        var snapshot =
                (tools.jackson.databind.node.ObjectNode)
                        json.readTree(Files.readString(Path.of("../fixtures/agent-snapshot.json")));
        snapshot.putArray("recent_checks").add(result);
        assertDoesNotThrow(
                () ->
                        validator.validateSnapshot(
                                snapshot.toString().getBytes(StandardCharsets.UTF_8),
                                "sample-a",
                                "local-01"));
    }

    private void assertCode(String expected, String json, String project, String instance) {
        assertCode(expected, json, project, instance, false);
    }

    private void assertCode(
            String expected, String json, String project, String instance, boolean info) {
        AgentPayloadException error =
                assertThrows(
                        AgentPayloadException.class,
                        () -> {
                            if (info) {
                                validator.validateInfo(
                                        json.getBytes(StandardCharsets.UTF_8), project, instance);
                            } else {
                                validator.validateSnapshot(
                                        json.getBytes(StandardCharsets.UTF_8), project, instance);
                            }
                        });
        assertEquals(expected, error.getMessage());
    }

    private void assertDirectionError(String base, String definition) {
        AgentPayloadException error =
                assertThrows(
                        AgentPayloadException.class,
                        () ->
                                validator.validateInfo(
                                        base.formatted(definition).getBytes(StandardCharsets.UTF_8),
                                        "sample-a",
                                        "local-01"));
        assertEquals("SCHEMA_ERROR", error.getMessage());
    }
}
