package com.monitoring.collector;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.InetSocketAddress;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.junit.Test;
import static org.junit.Assert.*;

// 실제 소켓으로 인증 헤더·명령·단절 후 재시도 금지 검증
public class CollectorConnectionTest {
    private static final String TOKEN = "01234567890123456789012345678901";
    private static final String TICKET = TOKEN + TOKEN;

    @Test
    public void explicitStartConnectsOnceAndDisconnectStopsXlogWithoutRetry() throws Exception {
        Server server = new Server();
        server.start();
        assertTrue(server.ready.await(5, TimeUnit.SECONDS));
        MonitorRuntime runtime =
                new MonitorCollectorBuilder().identity("sample-a", "prod").token(TOKEN).build();
        CollectorConnection collector =
                new CollectorConnection(
                        runtime, new LogReader(""), "ws://127.0.0.1:" + server.getPort());
        try {
            assertEquals("IDLE", collector.status().get("state"));
            assertEquals(0, server.opens.get());
            collector.start(TICKET);
            collector.start(TICKET);
            assertTrue(server.opened.await(5, TimeUnit.SECONDS));
            assertEquals(TOKEN, server.token);
            assertEquals(TICKET, server.ticket);
            String configureId = "00000000-0000-0000-0000-000000000001";
            server.connection.send(
                    "{\"id\":\""
                            + configureId
                            + "\",\"endpoint\":\"configure\","
                            + "\"body\":{\"xlog_enabled\":true,\"interval_seconds\":60}}");
            JsonObject configured;
            try {
                configured = server.result(configureId);
            } catch (AssertionError failed) {
                throw new AssertionError(collector.status().toString(), failed);
            }
            assertTrue(configured.getAsJsonObject("body").get("xlog_enabled").getAsBoolean());
            long generation = collector.xlogGeneration();
            for (int i = 0; i < 2000; i++) {
                collector.record(
                        generation, Collections.<String, Object>singletonMap("path", "/sample"));
            }
            assertTrue(((Number) collector.status().get("queue_size")).intValue() <= 500);
            JsonObject xlog = server.message("xlog");
            assertTrue(xlog.getAsJsonArray("items").size() <= 50);
            assertTrue(xlog.get("dropped").getAsLong() > 0);
            server.connection.close();
            long deadline = System.currentTimeMillis() + 5000;
            while (collector.isXlogEnabled() && System.currentTimeMillis() < deadline) {
                Thread.sleep(10);
            }
            assertFalse(collector.isXlogEnabled());
            assertEquals(0, collector.status().get("queue_size"));
            Thread.sleep(1200);
            assertEquals(1, server.opens.get());
            assertEquals("CLOSED", collector.status().get("state"));
        } finally {
            collector.destroy();
            runtime.shutdown();
            server.stop(1000);
        }
    }

    @Test
    public void failedConnectionDoesNotRetryAndCannotRecord() throws Exception {
        java.net.ServerSocket reservation = new java.net.ServerSocket(0);
        int port = reservation.getLocalPort();
        reservation.close();
        MonitorRuntime runtime =
                new MonitorCollectorBuilder().identity("sample-a", "prod").token(TOKEN).build();
        CollectorConnection collector =
                new CollectorConnection(runtime, new LogReader(""), "ws://127.0.0.1:" + port);
        try {
            collector.start(TICKET);
            long deadline = System.currentTimeMillis() + 5000;
            while ("CONNECTING".equals(collector.status().get("state"))
                    && System.currentTimeMillis() < deadline) {
                Thread.sleep(10);
            }
            assertEquals("FAILED", collector.status().get("state"));
            collector.record(collector.xlogGeneration(), Collections.<String, Object>emptyMap());
            assertEquals(0, collector.status().get("queue_size"));
            Thread.sleep(1100);
            assertEquals("FAILED", collector.status().get("state"));
        } finally {
            collector.destroy();
            runtime.shutdown();
        }
    }

    @Test
    public void socketLogCommandsFollowAppendsAndReturnSafePathErrors() throws Exception {
        java.nio.file.Path root = java.nio.file.Files.createTempDirectory("collector-logs");
        java.nio.file.Path file = root.resolve("catalina.out");
        java.nio.file.Files.write(file, "first\n".getBytes("UTF-8"));
        Server server = new Server();
        server.start();
        assertTrue(server.ready.await(5, TimeUnit.SECONDS));
        MonitorRuntime runtime =
                new MonitorCollectorBuilder().identity("sample-a", "prod").token(TOKEN).build();
        CollectorConnection collector =
                new CollectorConnection(
                        runtime,
                        new LogReader(root.toString()),
                        "ws://127.0.0.1:" + server.getPort());
        try {
            collector.start(TICKET);
            assertTrue(server.opened.await(5, TimeUnit.SECONDS));
            JsonObject request = new JsonObject();
            request.addProperty("id", "00000000-0000-0000-0000-000000000002");
            request.addProperty("endpoint", "logs/read");
            JsonObject body = new JsonObject();
            body.addProperty("path", file.toString());
            body.addProperty("encoding", "UTF-8");
            request.add("body", body);
            server.connection.send(request.toString());
            JsonObject first =
                    server.result(request.get("id").getAsString()).getAsJsonObject("body");
            assertEquals("first\n", first.get("text").getAsString());
            java.nio.file.Files.write(
                    file, "second\n".getBytes("UTF-8"), java.nio.file.StandardOpenOption.APPEND);
            request.addProperty("id", "00000000-0000-0000-0000-000000000003");
            body.addProperty("cursor", first.get("cursor").getAsString());
            server.connection.send(request.toString());
            JsonObject second =
                    server.result(request.get("id").getAsString()).getAsJsonObject("body");
            assertEquals("second\n", second.get("text").getAsString());
            assertFalse(second.get("reset").getAsBoolean());
            request.addProperty("id", "00000000-0000-0000-0000-000000000004");
            body.addProperty("path", root.resolve("../forbidden.log").toString());
            server.connection.send(request.toString());
            assertEquals(
                    "LOG_PATH_NOT_ALLOWED",
                    server.result(request.get("id").getAsString())
                            .getAsJsonObject("body")
                            .get("code")
                            .getAsString());
        } finally {
            collector.destroy();
            runtime.shutdown();
            server.stop(1000);
            java.nio.file.Files.deleteIfExists(file);
            java.nio.file.Files.deleteIfExists(root);
        }
    }

    private static final class Server extends WebSocketServer {
        final java.util.concurrent.CountDownLatch ready =
                new java.util.concurrent.CountDownLatch(1);
        final java.util.concurrent.CountDownLatch opened =
                new java.util.concurrent.CountDownLatch(1);
        final AtomicInteger opens = new AtomicInteger();
        final LinkedBlockingQueue<JsonObject> messages = new LinkedBlockingQueue<JsonObject>();
        volatile WebSocket connection;
        volatile String token;
        volatile String ticket;

        Server() {
            super(new InetSocketAddress("127.0.0.1", 0), 1);
        }

        public void onOpen(WebSocket socket, ClientHandshake handshake) {
            connection = socket;
            token = handshake.getFieldValue("X-Monitor-Token");
            ticket = handshake.getFieldValue("X-Monitor-Ticket");
            opens.incrementAndGet();
            opened.countDown();
        }

        public void onMessage(WebSocket socket, String value) {
            messages.offer(new JsonParser().parse(value).getAsJsonObject());
        }

        public void onClose(WebSocket socket, int code, String reason, boolean remote) {}

        public void onError(WebSocket socket, Exception error) {}

        public void onStart() {
            ready.countDown();
        }

        JsonObject message(String type) throws Exception {
            long deadline = System.currentTimeMillis() + 5000;
            while (System.currentTimeMillis() < deadline) {
                JsonObject value = messages.poll(100, TimeUnit.MILLISECONDS);
                if (value != null && type.equals(value.get("type").getAsString())) {
                    return value;
                }
            }
            throw new AssertionError("Missing message: " + type);
        }

        JsonObject result(String id) throws Exception {
            JsonObject value = message("result");
            assertEquals(id, value.get("id").getAsString());
            return value;
        }
    }
}
