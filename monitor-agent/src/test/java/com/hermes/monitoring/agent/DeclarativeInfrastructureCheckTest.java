package com.hermes.monitoring.agent;

import java.io.File;
import java.io.FileWriter;
import java.io.StringReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class DeclarativeInfrastructureCheckTest {
    @Test
    public void executesTcpFileDirectoryAndBatchFreshnessChecks() throws Exception {
        final ServerSocket server = new ServerSocket(0, 1);
        Thread accept =
                new Thread(
                        new Runnable() {
                            public void run() {
                                try {
                                    Socket socket = server.accept();
                                    socket.close();
                                } catch (Exception ignored) {
                                }
                            }
                        });
        accept.start();

        File directory = temporaryDirectory();
        File fresh = new File(directory, "fresh.marker");
        FileWriter writer = new FileWriter(fresh);
        writer.write("complete");
        writer.close();
        File stale = new File(directory, "stale.marker");
        writer = new FileWriter(stale);
        writer.write("complete");
        writer.close();
        assertTrue(stale.setLastModified(System.currentTimeMillis() - 10_000L));

        Map<String, String> properties = new HashMap<String, String>();
        properties.put("tcp.host", "127.0.0.1");
        properties.put("tcp.port", String.valueOf(server.getLocalPort()));
        properties.put("file.path", fresh.getAbsolutePath());
        properties.put("directory.path", directory.getAbsolutePath());
        properties.put("fresh.path", fresh.getAbsolutePath());
        properties.put("stale.path", stale.getAbsolutePath());
        String json =
                "{\"checks\":["
                        + internal(
                                "tcp-check",
                                "TCP",
                                "\"host\":\"${tcp.host}\","
                                        + "\"port\":\"${tcp.port}\",\"connect_timeout_ms\":500")
                        + ","
                        + internal("file-check", "FILE", "\"path\":\"${file.path}\"")
                        + ","
                        + internal("directory-check", "DIRECTORY", "\"path\":\"${directory.path}\"")
                        + ","
                        + internal(
                                "fresh-batch",
                                "BATCH",
                                "\"path\":\"${fresh.path}\",\"max_age_ms\":1000")
                        + ","
                        + internal(
                                "stale-batch",
                                "BATCH",
                                "\"path\":\"${stale.path}\",\"max_age_ms\":1000")
                        + "]}";

        List<MonitorCheck> checks = loader(properties).load(new StringReader(json));
        assertEquals(5, checks.size());
        assertResult(checks.get(0), "UP", "TCP_CONNECTED");
        assertResult(checks.get(1), "UP", "FILE_PRESENT");
        assertResult(checks.get(2), "UP", "DIRECTORY_PRESENT");
        assertResult(checks.get(3), "UP", "BATCH_FRESH");
        assertResult(checks.get(4), "DOWN", "BATCH_STALE");

        server.close();
        accept.join(1_000L);
    }

    @Test
    public void loaderSkipsDisabledChecksAndRejectsUnsafeOrAmbiguousDeclarations()
            throws Exception {
        String disabled =
                "{\"checks\":["
                        + internal(
                                "disabled",
                                "FILE",
                                "\"path\":\"${missing.path}\",\"enabled\":false")
                        + "]}";
        assertEquals(
                0, loader(new HashMap<String, String>()).load(new StringReader(disabled)).size());

        assertInvalid(
                apiHttp("unsafe-method", "DELETE", "http://127.0.0.1/value", "\"status\":[200]"));
        assertInvalid(
                apiHttp(
                        "credential-url",
                        "GET",
                        "http://user:pass@127.0.0.1/value",
                        "\"status\":[200]"));
        assertInvalid(
                apiHttp(
                        "unsafe-header",
                        "GET",
                        "http://127.0.0.1/value",
                        "\"status\":[200]",
                        "\"headers\":{\"Host\":\"other.example\"},"));
        assertInvalid(
                apiHttp(
                        "literal-secret",
                        "GET",
                        "http://127.0.0.1/value",
                        "\"status\":[200]",
                        "\"headers\":{\"Authorization\":\"Bearer raw-value\"},"));
        assertInvalid(
                apiHttp(
                        "unsafe-regex",
                        "GET",
                        "http://127.0.0.1/value",
                        "\"status\":[200],\"regex\":\"(a+)+\""));
        assertInvalid(
                "{\"check_id\":\"custom\",\"name\":\"custom\","
                        + "\"category\":\"INTERNAL\",\"direction\":null,\"type\":\"CUSTOM\","
                        + "\"enabled\":true}");
    }

    private void assertResult(MonitorCheck check, String status, String code) throws Exception {
        CheckResult result = check.execute(new CheckContext(System.currentTimeMillis() + 1_000L));
        assertEquals(check.getId(), status, result.getStatus());
        assertEquals(check.getId(), code, result.getResultCode());
    }

    private void assertInvalid(String check) throws Exception {
        try {
            loader(new HashMap<String, String>())
                    .load(new StringReader("{\"checks\":[" + check + "]}"));
            fail("unsafe declaration accepted: " + check);
        } catch (IllegalArgumentException expected) {
            assertEquals("INVALID_CHECK_DECLARATION", expected.getMessage());
        }
    }

    private DeclarativeCheckLoader loader(Map<String, String> properties) {
        return new DeclarativeCheckLoader(
                properties,
                new SecretProvider() {
                    public String getSecret(String name) {
                        return null;
                    }
                });
    }

    private String internal(String id, String type, String fields) {
        String enabled = fields.indexOf("\"enabled\"") >= 0 ? "" : ",\"enabled\":true";
        return "{\"check_id\":\""
                + id
                + "\",\"name\":\""
                + id
                + "\","
                + "\"category\":\"INTERNAL\",\"direction\":null,\"type\":\""
                + type
                + "\","
                + fields
                + enabled
                + "}";
    }

    private String apiHttp(String id, String method, String url, String assertions) {
        return apiHttp(id, method, url, assertions, "");
    }

    private String apiHttp(
            String id, String method, String url, String assertions, String extraRequest) {
        return "{\"check_id\":\""
                + id
                + "\",\"name\":\""
                + id
                + "\","
                + "\"category\":\"API\",\"direction\":\"EXTERNAL\","
                + "\"type\":\"HTTP\",\"enabled\":true,\"read_only\":true,"
                + "\"request\":{"
                + extraRequest
                + "\"method\":\""
                + method
                + "\","
                + "\"url\":\""
                + url
                + "\",\"connect_timeout_ms\":100,"
                + "\"read_timeout_ms\":100},\"assertion\":{"
                + assertions
                + "}}";
    }

    private File temporaryDirectory() {
        File value =
                new File(
                        System.getProperty("java.io.tmpdir"),
                        "hermes-declarative-" + System.nanoTime());
        assertTrue(value.mkdir());
        value.deleteOnExit();
        return value;
    }
}
