package com.monitoring.collector.servlet;

import com.monitoring.collector.CheckCategory;
import com.monitoring.collector.CheckContext;
import com.monitoring.collector.CheckDirection;
import com.monitoring.collector.CheckResult;
import com.monitoring.collector.MonitorCollectorBuilder;
import com.monitoring.collector.MonitorCollectorConfigurer;
import com.monitoring.collector.MonitorCheck;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.Collections;
import java.util.Enumeration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import javax.servlet.ServletConfig;
import javax.servlet.ServletContext;
import javax.servlet.ServletInputStream;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class MonitorServletHttpStatusIntegrationTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String TOKEN = "01234567890123456789012345678901";
    private static HttpServer server;
    private static MonitorServlet servlet;
    private static String baseUrl;
    private static java.nio.file.Path logRoot;
    private static java.nio.file.Path outsideLog;

    @BeforeClass
    public static void startServletContainer() throws Exception {
        servlet = new MonitorServlet();
        logRoot = java.nio.file.Files.createTempDirectory("monitor-log-http-");
        outsideLog =
                java.nio.file.Files.createTempFile(logRoot.getParent(), "monitor-private-", ".log");
        servlet.init(servletConfig());
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/monitor/v1/",
                new HttpHandler() {
                    public void handle(HttpExchange exchange) throws java.io.IOException {
                        ServletResponseAdapter response = new ServletResponseAdapter(exchange);
                        try {
                            servlet.service(request(exchange), response.proxy());
                        } catch (Exception error) {
                            response.setFailure();
                        }
                        response.commit();
                    }
                });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/monitor/v1/checks/run";
    }

    @AfterClass
    public static void stopServletContainer() throws Exception {
        StatusConfigurer.releaseAll();
        if (servlet != null) {
            servlet.destroy();
        }
        if (server != null) {
            server.stop(0);
        }
        java.nio.file.Files.deleteIfExists(logRoot.resolve("catalina.out"));
        java.nio.file.Files.deleteIfExists(logRoot);
        java.nio.file.Files.deleteIfExists(outsideLog);
    }

    @Test
    public void infoAndSnapshotRetainRequiredNullFieldsOverHttp() throws Exception {
        HttpURLConnection infoConnection =
                (HttpURLConnection)
                        new URL(baseUrl.replace("/checks/run", "/info")).openConnection();
        infoConnection.setRequestProperty("X-Monitor-Token", TOKEN);
        assertEquals(200, infoConnection.getResponseCode());
        com.google.gson.JsonObject info =
                new com.google.gson.JsonParser()
                        .parse(read(infoConnection.getInputStream()))
                        .getAsJsonObject();
        com.google.gson.JsonObject check = info.getAsJsonArray("checks").get(0).getAsJsonObject();
        assertTrue(check.has("direction"));
        assertTrue(check.get("direction").isJsonNull());
        HttpURLConnection snapshotConnection =
                (HttpURLConnection)
                        new URL(baseUrl.replace("/checks/run", "/snapshot")).openConnection();
        snapshotConnection.setRequestProperty("X-Monitor-Token", TOKEN);
        assertEquals(200, snapshotConnection.getResponseCode());
        com.google.gson.JsonObject snapshot =
                new com.google.gson.JsonParser()
                        .parse(read(snapshotConnection.getInputStream()))
                        .getAsJsonObject();
        com.google.gson.JsonObject pool =
                snapshot.getAsJsonArray("db_pools").get(0).getAsJsonObject();
        assertTrue(pool.has("waiters"));
        assertTrue(pool.get("waiters").isJsonNull());
        assertTrue(pool.has("validation_latency_ms"));
        assertTrue(pool.get("validation_latency_ms").isJsonNull());
    }

    @Test
    public void actualHttpStatusReflectsEveryAcceptanceAndRejectionPolicy() throws Exception {
        assertStatus(400, request("{"));
        assertStatus(400, request("{\"check_ids\":[],\"requested_by\":\"agent\"}"));
        assertStatus(
                400,
                request(
                        "{\"check_ids\":[\"fast-check\"],"
                                + "\"requested_by\":\"agent\",\"url\":\"http://unregistered.invalid\"}"));
        assertStatus(400, request(runJson("missing-check")));

        Response acceptedMixed = request(runJson("fast-check", "missing-check"));
        assertStatus(202, acceptedMixed);
        assertTrue(acceptedMixed.body, acceptedMixed.body.contains("fast-check"));
        assertTrue(acceptedMixed.body, acceptedMixed.body.contains("NOT_REGISTERED"));

        assertStatus(202, request(runJson("slow-check")));
        assertTrue(
                "slow check did not start",
                StatusConfigurer.slowStarted.await(2L, TimeUnit.SECONDS));
        assertStatus(429, request(runJson("slow-check")));
        assertStatus(400, request(runJson("slow-check", "missing-check")));
        StatusConfigurer.slowRelease.countDown();

        String[] firstCapacityWave = new String[20];
        for (int index = 0; index < firstCapacityWave.length; index++) {
            firstCapacityWave[index] = capacityId(index + 1);
        }
        assertStatus(202, request(runJson(firstCapacityWave)));
        assertTrue(
                "capacity checks did not occupy workers",
                StatusConfigurer.capacityStarted.await(2L, TimeUnit.SECONDS));

        Response capacityMixed = request(runJson(capacityId(21), capacityId(22), capacityId(23)));
        assertStatus(202, capacityMixed);
        assertTrue(capacityMixed.body, capacityMixed.body.contains("RATE_LIMITED"));
        assertStatus(429, request(runJson(capacityId(23))));
    }

    private static String capacityId(int number) {
        return "capacity-" + number;
    }

    private static String runJson(String... ids) {
        StringBuilder value = new StringBuilder("{\"check_ids\":[");
        for (int index = 0; index < ids.length; index++) {
            if (index > 0) {
                value.append(',');
            }
            value.append('\"').append(ids[index]).append('\"');
        }
        return value.append("],\"requested_by\":\"agent\"}").toString();
    }

    private static Response request(String body) throws Exception {
        return request(baseUrl, body, TOKEN);
    }

    @Test
    public void logEndpointRequiresTokenAndEnforcesRootsWhileReturningRawContents()
            throws Exception {
        String url = baseUrl.replace("checks/run", "logs/read");
        String body = "{\"path\":\"/logs/catalina.out\",\"encoding\":\"UTF-8\",\"cursor\":null}";
        com.google.gson.JsonObject outside =
                new com.google.gson.JsonParser().parse(body).getAsJsonObject();
        outside.addProperty("path", outsideLog.toString());
        body = outside.toString();
        assertStatus(401, request(url, body, "wrong"));
        Response unavailable = request(url, body, TOKEN);
        assertStatus(200, unavailable);
        assertTrue(unavailable.body, unavailable.body.contains("LOG_PATH_NOT_ALLOWED"));
        assertStatus(400, request(url, "{}", TOKEN));
        java.nio.file.Path file = logRoot.resolve("catalina.out");
        String raw = "한글 token=keep <script>literal</script>\n";
        java.nio.file.Files.write(file, raw.getBytes(UTF8));
        java.util.Map<String, Object> value = new java.util.LinkedHashMap<String, Object>();
        value.put("path", file.toString());
        value.put("encoding", "UTF-8");
        value.put("cursor", null);
        Response result =
                request(
                        url,
                        new com.google.gson.GsonBuilder().serializeNulls().create().toJson(value),
                        TOKEN);
        assertStatus(200, result);
        com.google.gson.JsonObject parsed =
                new com.google.gson.JsonParser().parse(result.body).getAsJsonObject();
        assertEquals(raw, parsed.get("text").getAsString());
        assertEquals(
                "status-test", parsed.getAsJsonObject("identity").get("project_id").getAsString());
        value.put("cursor", parsed.get("cursor").getAsString());
        java.nio.file.Files.write(
                file, "append\n".getBytes(UTF8), java.nio.file.StandardOpenOption.APPEND);
        result =
                request(
                        url,
                        new com.google.gson.GsonBuilder().serializeNulls().create().toJson(value),
                        TOKEN);
        assertEquals(
                "append\n",
                new com.google.gson.JsonParser()
                        .parse(result.body)
                        .getAsJsonObject()
                        .get("text")
                        .getAsString());
    }

    private static Response request(String url, String body, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(2_000);
        connection.setReadTimeout(2_000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("X-Monitor-Token", token);
        connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        connection.setDoOutput(true);
        byte[] encoded = body.getBytes(UTF8);
        connection.setFixedLengthStreamingMode(encoded.length);
        OutputStream output = connection.getOutputStream();
        output.write(encoded);
        output.close();
        int status = connection.getResponseCode();
        InputStream input =
                status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        return new Response(status, read(input));
    }

    private static String read(InputStream input) throws Exception {
        if (input == null) {
            return "";
        }
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                output.write(buffer, 0, read);
            }
            return new String(output.toByteArray(), UTF8);
        } finally {
            input.close();
        }
    }

    private static void assertStatus(int expected, Response actual) {
        assertEquals(actual.body, expected, actual.status);
    }

    private static ServletConfig servletConfig() {
        return new ServletConfig() {
            public String getServletName() {
                return "monitor";
            }

            public ServletContext getServletContext() {
                return servletContext();
            }

            public String getInitParameter(String name) {
                if ("logAllowedRoots".equals(name)) {
                    return logRoot.toString();
                }
                return "configurerClass".equals(name) ? StatusConfigurer.class.getName() : null;
            }

            public Enumeration<?> getInitParameterNames() {
                return Collections.enumeration(Collections.singleton("configurerClass"));
            }
        };
    }

    private static ServletContext servletContext() {
        return (ServletContext)
                Proxy.newProxyInstance(
                        MonitorServletHttpStatusIntegrationTest.class.getClassLoader(),
                        new Class<?>[] {ServletContext.class},
                        new InvocationHandler() {
                            public Object invoke(Object proxy, Method method, Object[] arguments) {
                                return defaultValue(method.getReturnType());
                            }
                        });
    }

    private static HttpServletRequest request(final HttpExchange exchange) {
        return (HttpServletRequest)
                Proxy.newProxyInstance(
                        MonitorServletHttpStatusIntegrationTest.class.getClassLoader(),
                        new Class<?>[] {HttpServletRequest.class},
                        new InvocationHandler() {
                            public Object invoke(Object proxy, Method method, Object[] arguments) {
                                String name = method.getName();
                                if ("getMethod".equals(name)) {
                                    return exchange.getRequestMethod();
                                }
                                if ("getPathInfo".equals(name)) {
                                    return exchange.getRequestURI()
                                            .getPath()
                                            .substring("/monitor/v1".length());
                                }
                                if ("getHeader".equals(name)) {
                                    return exchange.getRequestHeaders()
                                            .getFirst(String.valueOf(arguments[0]));
                                }
                                if ("getInputStream".equals(name)) {
                                    return servletInput(exchange.getRequestBody());
                                }
                                if ("getQueryString".equals(name)) {
                                    return exchange.getRequestURI().getRawQuery();
                                }
                                return defaultValue(method.getReturnType());
                            }
                        });
    }

    private static ServletInputStream servletInput(final InputStream input) {
        return new ServletInputStream() {
            public int read() throws java.io.IOException {
                return input.read();
            }

            public int read(byte[] buffer, int offset, int length) throws java.io.IOException {
                return input.read(buffer, offset, length);
            }
        };
    }

    private static Object defaultValue(Class<?> type) {
        if (!type.isPrimitive()) {
            return null;
        }
        if (Boolean.TYPE.equals(type)) {
            return Boolean.FALSE;
        }
        if (Character.TYPE.equals(type)) {
            return Character.valueOf('\0');
        }
        if (Byte.TYPE.equals(type)) {
            return Byte.valueOf((byte) 0);
        }
        if (Short.TYPE.equals(type)) {
            return Short.valueOf((short) 0);
        }
        if (Integer.TYPE.equals(type)) {
            return Integer.valueOf(0);
        }
        if (Long.TYPE.equals(type)) {
            return Long.valueOf(0L);
        }
        if (Float.TYPE.equals(type)) {
            return Float.valueOf(0.0f);
        }
        return Double.valueOf(0.0d);
    }

    private static final class ServletResponseAdapter implements InvocationHandler {
        private final HttpExchange exchange;
        private final Headers headers;
        private final StringWriter body = new StringWriter();
        private final PrintWriter writer = new PrintWriter(body);
        private int status = 200;

        ServletResponseAdapter(HttpExchange exchange) {
            this.exchange = exchange;
            this.headers = exchange.getResponseHeaders();
        }

        HttpServletResponse proxy() {
            return (HttpServletResponse)
                    Proxy.newProxyInstance(
                            MonitorServletHttpStatusIntegrationTest.class.getClassLoader(),
                            new Class<?>[] {HttpServletResponse.class},
                            this);
        }

        public Object invoke(Object proxy, Method method, Object[] arguments) {
            String name = method.getName();
            if ("setStatus".equals(name)) {
                status = ((Integer) arguments[0]).intValue();
            } else if ("setHeader".equals(name)) {
                headers.set(String.valueOf(arguments[0]), String.valueOf(arguments[1]));
            } else if ("setContentType".equals(name)) {
                headers.set("Content-Type", String.valueOf(arguments[0]));
            } else if ("getWriter".equals(name)) {
                return writer;
            } else if ("getCharacterEncoding".equals(name)) {
                return "UTF-8";
            }
            return defaultValue(method.getReturnType());
        }

        void setFailure() {
            status = 500;
            body.getBuffer().setLength(0);
            body.write("{\"code\":\"TEST_ADAPTER_FAILURE\"}");
        }

        void commit() throws java.io.IOException {
            writer.flush();
            byte[] encoded = body.toString().getBytes(UTF8);
            exchange.sendResponseHeaders(status, encoded.length);
            OutputStream output = exchange.getResponseBody();
            output.write(encoded);
            output.close();
        }
    }

    private static final class Response {
        private final int status;
        private final String body;

        Response(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    public static final class StatusConfigurer implements MonitorCollectorConfigurer {
        static final CountDownLatch slowStarted = new CountDownLatch(1);
        static final CountDownLatch slowRelease = new CountDownLatch(1);
        static final CountDownLatch capacityStarted = new CountDownLatch(2);
        static final CountDownLatch capacityRelease = new CountDownLatch(1);

        public StatusConfigurer() {}

        public void configure(MonitorCollectorBuilder builder, ServletContext context) {
            builder.identity("status-test", "local-01")
                    .token(TOKEN)
                    .dbPool(
                            new com.monitoring.collector.DbPoolMetricsProvider() {
                                public com.monitoring.collector.DbPoolMetrics collect() {
                                    return new com.monitoring.collector.DbPoolMetrics(
                                            "main", "Main", 0, 0, 10, null, null);
                                }
                            })
                    .check(immediate("fast-check"))
                    .check(blocking("slow-check", slowStarted, slowRelease));
            for (int number = 1; number <= 23; number++) {
                builder.check(blocking(capacityId(number), capacityStarted, capacityRelease));
            }
        }

        static void releaseAll() {
            slowRelease.countDown();
            capacityRelease.countDown();
        }

        private static MonitorCheck immediate(final String id) {
            return new MonitorCheck() {
                public String getId() {
                    return id;
                }

                public String getName() {
                    return id;
                }

                public CheckCategory getCategory() {
                    return CheckCategory.INTERNAL;
                }

                public CheckDirection getDirection() {
                    return null;
                }

                public CheckResult execute(CheckContext context) {
                    return new CheckResult(id, "UP", 1L, "ok");
                }
            };
        }

        private static MonitorCheck blocking(
                final String id, final CountDownLatch started, final CountDownLatch release) {
            return new MonitorCheck() {
                public String getId() {
                    return id;
                }

                public String getName() {
                    return id;
                }

                public CheckCategory getCategory() {
                    return CheckCategory.INTERNAL;
                }

                public CheckDirection getDirection() {
                    return null;
                }

                public CheckResult execute(CheckContext context) throws Exception {
                    started.countDown();
                    release.await();
                    return new CheckResult(id, "UP", 1L, "ok");
                }
            };
        }
    }
}
