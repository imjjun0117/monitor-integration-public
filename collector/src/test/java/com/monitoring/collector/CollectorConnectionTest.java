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
    private static final int XLOG_RECORD_COUNT = 2000;
    private static final int XLOG_QUEUE_LIMIT = 500;
    private static final int XLOG_BATCH_LIMIT = 50;
    private static final long MESSAGE_TIMEOUT_MS = 5000;
    // 최대 대기열을 초당 50개씩 모두 전송하는 시간과 기존 메시지 대기 여유 합산
    private static final long XLOG_DRAIN_TIMEOUT_MS =
            TimeUnit.SECONDS.toMillis(XLOG_QUEUE_LIMIT / XLOG_BATCH_LIMIT) + MESSAGE_TIMEOUT_MS;

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
            // 폐기 없는 첫 전송을 먼저 수신해 생산·전송 스레드의 실행 순서 차이 재현
            collector.record(
                    generation, Collections.<String, Object>singletonMap("path", "/sample"));
            assertTrue(server.firstXlog.await(MESSAGE_TIMEOUT_MS, TimeUnit.MILLISECONDS));
            for (int i = 1; i < XLOG_RECORD_COUNT; i++) {
                collector.record(
                        generation, Collections.<String, Object>singletonMap("path", "/sample"));
            }
            assertTrue(
                    ((Number) collector.status().get("queue_size")).intValue() <= XLOG_QUEUE_LIMIT);
            long received = 0;
            long dropped = 0;
            long deliveryDeadline = System.currentTimeMillis() + XLOG_DRAIN_TIMEOUT_MS;
            while (received + dropped < XLOG_RECORD_COUNT) {
                JsonObject xlog = server.message("xlog", deliveryDeadline);
                int batchSize = xlog.getAsJsonArray("items").size();
                assertTrue(batchSize <= XLOG_BATCH_LIMIT);
                received += batchSize;
                dropped += xlog.get("dropped").getAsLong();
            }
            assertEquals(XLOG_RECORD_COUNT, received + dropped);
            assertTrue(dropped > 0);
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
        final java.util.concurrent.CountDownLatch firstXlog =
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
            JsonObject message = new JsonParser().parse(value).getAsJsonObject();
            messages.offer(message);
            if ("xlog".equals(message.get("type").getAsString())) {
                firstXlog.countDown();
            }
        }

        public void onClose(WebSocket socket, int code, String reason, boolean remote) {}

        public void onError(WebSocket socket, Exception error) {}

        public void onStart() {
            ready.countDown();
        }

        JsonObject message(String type) throws Exception {
            return message(type, System.currentTimeMillis() + MESSAGE_TIMEOUT_MS);
        }

        JsonObject message(String type, long deadline) throws Exception {
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
