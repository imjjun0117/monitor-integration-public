package com.monitoring.collector;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.InetSocketAddress;
import java.nio.charset.Charset;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class DeclarativeHttpCheckIntegrationTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String TOKEN = "01234567890123456789012345678901";
    private static final String RUNTIME_SECRET = "runtime-partner-secret";
    private static final String RESPONSE_SECRET = "response-body-secret";
    private HttpServer server;
    private String baseUrl;
    private final AtomicInteger jsonHits = new AtomicInteger();
    private final AtomicInteger entityHits = new AtomicInteger();
    private final AtomicReference<String> received = new AtomicReference<String>();

    @Before
    public void startHttpFixture() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/json",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        jsonHits.incrementAndGet();
                        received.set(
                                exchange.getRequestMethod()
                                        + " "
                                        + exchange.getRequestURI()
                                        + "\n"
                                        + exchange.getRequestHeaders().getFirst("Authorization")
                                        + "\n"
                                        + read(exchange.getRequestBody()));
                        respond(
                                exchange,
                                200,
                                "{\"status\":\"OK\",\"message\":\"service-ok-42\","
                                        + "\"response_secret\":\""
                                        + RESPONSE_SECRET
                                        + "\"}");
                    }
                });
        server.createContext(
                "/xml",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        respond(
                                exchange,
                                200,
                                "<?xml version=\"1.0\"?><health><status>READY</status></health>");
                    }
                });
        server.createContext(
                "/xxe",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        String xml =
                                "<?xml version=\"1.0\"?><!DOCTYPE health [<!ENTITY probe SYSTEM \""
                                        + baseUrl
                                        + "/entity\">]><health><status>&probe;</status></health>";
                        respond(exchange, 200, xml);
                    }
                });
        server.createContext(
                "/entity",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        entityHits.incrementAndGet();
                        respond(exchange, 200, "READY");
                    }
                });
        server.createContext(
                "/redirect",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        exchange.getResponseHeaders().set("Location", baseUrl + "/json");
                        respond(exchange, 302, "redirecting");
                    }
                });
        server.createContext(
                "/large",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        StringBuilder padding = new StringBuilder();
                        for (int i = 0; i < 6000; i++) {
                            padding.append('x');
                        }
                        exchange.getResponseHeaders()
                                .set("Content-Type", "application/json; charset=UTF-8");
                        exchange.getResponseHeaders()
                                .set("Set-Cookie", "session=never-publish-this");
                        respond(
                                exchange,
                                200,
                                "{\"access_token\":\"never-publish-token\",\"safe\":\""
                                        + padding
                                        + "\"}");
                    }
                });
        server.createContext(
                "/slow",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        try {
                            Thread.sleep(500L);
                            respond(exchange, 200, "late");
                        } catch (InterruptedException error) {
                            Thread.currentThread().interrupt();
                        } catch (IOException ignored) {
                            // The bounded client is expected to close the timed-out request.
                        }
                    }
                });
        server.createContext(
                "/malformed",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws IOException {
                        respond(
                                exchange,
                                502,
                                "{\"access_token\":\"server-generated-secret\",\"message\":");
                    }
                });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @After
    public void stopHttpFixture() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    public void executesRegisteredHttpRequestAndAllStatusTextRegexAndJsonAssertions()
            throws Exception {
        final AtomicInteger secretReads = new AtomicInteger();
        SecretProvider secrets =
                new SecretProvider() {
                    public String getSecret(String name) {
                        secretReads.incrementAndGet();
                        return "partner.token".equals(name) ? RUNTIME_SECRET : null;
                    }
                };
        String json =
                oneCheck(
                        "{"
                                + "\"check_id\":\"partner-api\",\"name\":\"Partner API\","
                                + "\"category\":\"API\",\"direction\":\"INTERNAL\","
                                + "\"type\":\"HTTP\",\"enabled\":true,\"read_only\":true,"
                                + "\"request\":{\"method\":\"POST\",\"url\":\"${service.url}/json\","
                                + "\"query\":{\"plain\":\"hello world\",\"signature\":\"${secret:partner.token}\"},"
                                + "\"headers\":{\"Authorization\":\"Bearer ${secret:partner.token}\"},"
                                + "\"body\":\"token=${secret:partner.token}\","
                                + "\"connect_timeout_ms\":500,\"read_timeout_ms\":500},"
                                + "\"assertion\":{\"status\":[200],\"contains\":\"service-ok\","
                                + "\"regex\":\"service-ok-[0-9]+\","
                                + "\"json\":{\"path\":\"$.status\",\"equals\":\"OK\"}}}");
        DeclarativeCheckLoader loader = loader(baseUrl, secrets);
        List<MonitorCheck> checks = loader.load(new StringReader(json));
        assertEquals("secrets must resolve only during execution", 0, secretReads.get());

        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("declarative-test", "local-01")
                        .token(TOKEN)
                        .check(checks.get(0))
                        .build();
        String before = new Gson().toJson(runtime.info()) + new Gson().toJson(runtime.snapshot());
        assertFalse(before, before.contains(RUNTIME_SECRET));
        assertEquals("ACCEPTED", runtime.runCheck("partner-api"));
        CheckResult result = await(runtime, "partner-api");

        assertEquals("UP", result.getStatus());
        assertEquals("HTTP_ASSERTIONS_PASSED", result.getResultCode());
        assertTrue(received.get(), received.get().startsWith("POST /json?"));
        assertTrue(received.get(), received.get().contains("plain=hello+world"));
        assertTrue(received.get(), received.get().contains("signature=" + RUNTIME_SECRET));
        assertTrue(received.get(), received.get().contains("Bearer " + RUNTIME_SECRET));
        assertTrue(received.get(), received.get().contains("token=" + RUNTIME_SECRET));
        assertTrue(secretReads.get() >= 3);

        String published =
                new Gson().toJson(runtime.info())
                        + new Gson().toJson(runtime.snapshot())
                        + new Gson().toJson(result);
        for (String forbidden : new String[] {RUNTIME_SECRET, RESPONSE_SECRET, "signature="}) {
            assertFalse(forbidden + " leaked in " + published, published.contains(forbidden));
        }
        com.google.gson.JsonObject evidence =
                new com.google.gson.JsonParser()
                        .parse(new Gson().toJson(result))
                        .getAsJsonObject()
                        .getAsJsonObject("http");
        assertEquals(200, evidence.get("status_code").getAsInt());
        assertEquals(
                "***",
                evidence.getAsJsonObject("request_headers").get("Authorization").getAsString());
        assertEquals(
                "***", evidence.getAsJsonObject("request_query").get("signature").getAsString());
        assertEquals(
                "hello world",
                evidence.getAsJsonObject("request_query").get("plain").getAsString());
        assertTrue(evidence.get("response_body").getAsString().contains("service-ok-42"));
        runtime.shutdown();
    }

    @Test
    public void capturesBoundedResponseAfterRedactionAndNeverPublishesCookies() throws Exception {
        CheckResult result =
                loader(baseUrl, noSecrets())
                        .load(
                                new StringReader(
                                        oneCheck(
                                                httpCheck(
                                                        "large-response",
                                                        "${service.url}/large",
                                                        "{\"status\":[200]}"))))
                        .get(0)
                        .execute(new CheckContext(System.currentTimeMillis() + 2_000L));
        String encoded = new Gson().toJson(result);
        com.google.gson.JsonObject http =
                new com.google.gson.JsonParser()
                        .parse(encoded)
                        .getAsJsonObject()
                        .getAsJsonObject("http");
        assertEquals(4096, http.get("response_body").getAsString().length());
        assertTrue(http.get("response_body_truncated").getAsBoolean());
        assertTrue(http.get("response_bytes").getAsInt() > 4096);
        assertFalse(encoded.contains("never-publish-token"));
        assertFalse(encoded.contains("never-publish-this"));
        assertEquals("UP", result.getStatus());
    }

    @Test
    public void supportsSecureXmlAssertionAndNeverExpandsExternalEntities() throws Exception {
        String valid =
                oneCheck(
                        httpCheck(
                                "xml-check",
                                "${service.url}/xml",
                                "{\"status\":[200],\"xml\":{\"element\":\"status\",\"equals\":\"READY\"}}"));
        CheckResult result =
                loader(baseUrl, noSecrets())
                        .load(new StringReader(valid))
                        .get(0)
                        .execute(new CheckContext(System.currentTimeMillis() + 1_000L));
        assertEquals("UP", result.getStatus());

        String xmlBomb =
                oneCheck(
                        httpCheck(
                                "xml-safe",
                                "${service.url}/xxe",
                                "{\"status\":[200],\"xml\":{\"element\":\"status\",\"equals\":\"READY\"}}"));
        CheckResult rejected =
                loader(baseUrl, noSecrets())
                        .load(new StringReader(xmlBomb))
                        .get(0)
                        .execute(new CheckContext(System.currentTimeMillis() + 1_000L));
        assertEquals("DOWN", rejected.getStatus());
        assertEquals("XML_ASSERTION_FAILED", rejected.getResultCode());
        assertEquals("external XML entity was fetched", 0, entityHits.get());
    }

    @Test
    public void malformedJsonDoesNotPublishServerGeneratedCredentials() throws Exception {
        CheckResult result =
                loader(baseUrl, noSecrets())
                        .load(
                                new StringReader(
                                        oneCheck(
                                                httpCheck(
                                                        "malformed-json",
                                                        "${service.url}/malformed",
                                                        "{\"status\":[200]}"))))
                        .get(0)
                        .execute(new CheckContext(System.currentTimeMillis() + 2_000L));
        String encoded = new Gson().toJson(result);
        assertEquals("DOWN", result.getStatus());
        assertEquals("HTTP_STATUS_MISMATCH", result.getResultCode());
        assertFalse(encoded.contains("server-generated-secret"));
        assertTrue(encoded.contains("Malformed JSON response omitted"));
    }

    @Test
    public void redirectsStayDisabledAndReadTimeoutIsBoundedByCheckDeadline() throws Exception {
        String redirectJson =
                oneCheck(
                        httpCheck(
                                "redirect-check", "${service.url}/redirect", "{\"status\":[200]}"));
        CheckResult redirect =
                loader(baseUrl, noSecrets())
                        .load(new StringReader(redirectJson))
                        .get(0)
                        .execute(new CheckContext(System.currentTimeMillis() + 1_000L));
        assertEquals("DOWN", redirect.getStatus());
        assertEquals("HTTP_STATUS_MISMATCH", redirect.getResultCode());
        assertEquals(
                302,
                new com.google.gson.JsonParser()
                        .parse(new Gson().toJson(redirect))
                        .getAsJsonObject()
                        .getAsJsonObject("http")
                        .get("status_code")
                        .getAsInt());
        assertEquals("redirect target was followed", 0, jsonHits.get());

        String rangeJson =
                oneCheck(
                        httpCheck(
                                "redirect-range",
                                "${service.url}/redirect",
                                "{\"status\":[\"300-399\"]}"));
        CheckResult range =
                loader(baseUrl, noSecrets())
                        .load(new StringReader(rangeJson))
                        .get(0)
                        .execute(new CheckContext(System.currentTimeMillis() + 1_000L));
        assertEquals("UP", range.getStatus());
        assertEquals("redirect target was followed", 0, jsonHits.get());

        String timeoutJson =
                oneCheck(
                        httpCheckWithTimeout(
                                "timeout-check",
                                "${service.url}/slow",
                                "{\"status\":[200]}",
                                1_000,
                                1_000));
        long started = System.currentTimeMillis();
        CheckResult timeout =
                loader(baseUrl, noSecrets())
                        .load(new StringReader(timeoutJson))
                        .get(0)
                        .execute(new CheckContext(System.currentTimeMillis() + 120L));
        long elapsed = System.currentTimeMillis() - started;
        assertEquals("DOWN", timeout.getStatus());
        assertEquals("HTTP_TIMEOUT", timeout.getResultCode());
        assertTrue("deadline was not enforced: " + elapsed, elapsed < 800L);
    }

    @Test
    public void missingOrFailingSecretProvidersPublishOnlyStableErrorCodes() throws Exception {
        String declaration =
                oneCheck(
                        "{"
                                + "\"check_id\":\"secret-failure\",\"name\":\"secret-failure\","
                                + "\"category\":\"API\",\"direction\":\"EXTERNAL\","
                                + "\"type\":\"HTTP\",\"enabled\":true,\"read_only\":true,"
                                + "\"request\":{\"method\":\"GET\",\"url\":\"${service.url}/json\","
                                + "\"headers\":{\"Authorization\":\"Bearer ${secret:partner.token}\"},"
                                + "\"connect_timeout_ms\":500,\"read_timeout_ms\":500},"
                                + "\"assertion\":{\"status\":[200]}}");
        MonitorCheck missing =
                loader(baseUrl, noSecrets()).load(new StringReader(declaration)).get(0);
        CheckResult missingResult =
                missing.execute(new CheckContext(System.currentTimeMillis() + 1_000L));
        assertEquals("CONFIGURATION_MISSING", missingResult.getResultCode());

        final String providerSecret = "provider-exception-secret";
        MonitorCheck failing =
                loader(
                                baseUrl,
                                new SecretProvider() {
                                    public String getSecret(String name) {
                                        throw new IllegalStateException(
                                                "password=" + providerSecret);
                                    }
                                })
                        .load(new StringReader(declaration))
                        .get(0);
        CheckResult failingResult =
                failing.execute(new CheckContext(System.currentTimeMillis() + 1_000L));
        String published = new Gson().toJson(failingResult);
        assertEquals("HTTP_REQUEST_FAILED", failingResult.getResultCode());
        assertFalse(published, published.contains(providerSecret));
        assertEquals("request ran despite secret resolution failure", 0, jsonHits.get());
    }

    private DeclarativeCheckLoader loader(String serviceUrl, SecretProvider secrets) {
        return new DeclarativeCheckLoader(
                Collections.singletonMap("service.url", serviceUrl), secrets);
    }

    private SecretProvider noSecrets() {
        return new SecretProvider() {
            public String getSecret(String name) {
                return null;
            }
        };
    }

    private String httpCheck(String id, String url, String assertion) {
        return httpCheckWithTimeout(id, url, assertion, 500, 500);
    }

    private String httpCheckWithTimeout(
            String id, String url, String assertion, int connectTimeout, int readTimeout) {
        return "{\"check_id\":\""
                + id
                + "\",\"name\":\""
                + id
                + "\","
                + "\"category\":\"API\",\"direction\":\"EXTERNAL\","
                + "\"type\":\"HTTP\",\"enabled\":true,\"read_only\":true,"
                + "\"request\":{\"method\":\"GET\",\"url\":\""
                + url
                + "\","
                + "\"connect_timeout_ms\":"
                + connectTimeout
                + ","
                + "\"read_timeout_ms\":"
                + readTimeout
                + "},"
                + "\"assertion\":"
                + assertion
                + "}";
    }

    private String oneCheck(String check) {
        return "{\"checks\":[" + check + "]}";
    }

    private CheckResult await(MonitorRuntime runtime, String id) throws Exception {
        long deadline = System.currentTimeMillis() + 2_000L;
        while (System.currentTimeMillis() < deadline) {
            for (CheckResult result : runtime.results()) {
                if (id.equals(result.getCheckId())) {
                    return result;
                }
            }
            Thread.sleep(10L);
        }
        throw new AssertionError("missing result for " + id);
    }

    private static String read(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[512];
        int count;
        while ((count = input.read(buffer)) >= 0) {
            output.write(buffer, 0, count);
        }
        return new String(output.toByteArray(), UTF8);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] encoded = body.getBytes(UTF8);
        exchange.sendResponseHeaders(status, encoded.length);
        OutputStream output = exchange.getResponseBody();
        output.write(encoded);
        output.close();
    }
}
