package com.monitoring.agent.transport;

import com.monitoring.agent.collection.SnapshotPersistence;
import com.monitoring.agent.security.TokenCipher;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

// 일회용 승인·토큰 인증·기존 소켓 명령 및 미사용 XLog 폐기 검증
class CollectorTransportHubTest {
    @Test
    void startIssuesOneTicketAndAuthenticatesOnlyOnceThenRoutesCommandsOverSocket()
            throws Exception {
        String token = "01234567890123456789012345678901";
        ObjectMapper json = new ObjectMapper();
        TokenCipher cipher = new TokenCipher(Base64.getEncoder().encodeToString(new byte[32]));
        var encrypted = cipher.encrypt(token);
        JdbcTemplate db = mock(JdbcTemplate.class);
        HttpServer collector = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        LinkedBlockingQueue<String> tickets = new LinkedBlockingQueue<>();
        collector.createContext(
                "/monitor/v1/connection/start",
                request -> {
                    assertEquals(token, request.getRequestHeaders().getFirst("X-Monitor-Token"));
                    tickets.offer(
                            json.readTree(request.getRequestBody()).path("ticket").asString());
                    byte[] response = "{\"state\":\"CONNECTING\"}".getBytes(StandardCharsets.UTF_8);
                    request.getResponseHeaders().set("Content-Type", "application/json");
                    request.sendResponseHeaders(202, response.length);
                    request.getResponseBody().write(response);
                    request.close();
                });
        collector.start();
        String base = "http://127.0.0.1:" + collector.getAddress().getPort();
        Map<String, Object> config =
                Map.of(
                        "transport_mode",
                        "WSS",
                        "agent_base_url",
                        base,
                        "token_ciphertext",
                        encrypted.ciphertext(),
                        "token_iv",
                        encrypted.iv(),
                        "xlog_enabled",
                        false,
                        "poll_interval_seconds",
                        60);
        when(db.queryForList(anyString(), eq("sample-a"), eq("prod"))).thenReturn(List.of(config));
        when(db.queryForObject(anyString(), eq(Boolean.class), eq(base))).thenReturn(true);
        when(db.queryForList(contains("agent_base_url"), eq(base)))
                .thenReturn(List.of(Map.of("project_id", "sample-a", "instance_id", "prod")));
        CollectorTransportHub hub =
                new CollectorTransportHub(
                        db, cipher, json, mock(SnapshotPersistence.class), "127.0.0.1/32", "", "");
        try {
            assertEquals("IDLE", hub.status("sample-a", "prod").get("state"));
            hub.start("sample-a", "prod");
            hub.start("sample-a", "prod");
            String ticket = tickets.poll(3, TimeUnit.SECONDS);
            assertNotNull(ticket);
            assertNull(tickets.poll(100, TimeUnit.MILLISECONDS));
            assertFalse(handshake(hub, "f".repeat(64), token, new java.util.HashMap<>()));
            Map<String, Object> attributes = new java.util.HashMap<>();
            assertTrue(handshake(hub, ticket, token, attributes));
            assertEquals("sample-a/prod", attributes.get("instance"));
            assertFalse(handshake(hub, ticket, token, new java.util.HashMap<>()));
            WebSocketSession session = mock(WebSocketSession.class);
            when(session.getAttributes()).thenReturn(attributes);
            when(session.getId()).thenReturn("connection-1");
            when(session.isOpen()).thenReturn(true);
            doAnswer(
                            invocation -> {
                                var command =
                                        json.readTree(
                                                ((TextMessage) invocation.getArgument(0))
                                                        .getPayload());
                                hub.handleTextMessage(
                                        session,
                                        new TextMessage(
                                                json.writeValueAsString(
                                                        Map.of(
                                                                "type",
                                                                "result",
                                                                "id",
                                                                command.path("id").asString(),
                                                                "body",
                                                                Map.of("code", "OK")))));
                                return null;
                            })
                    .when(session)
                    .sendMessage(any());
            hub.afterConnectionEstablished(session);
            assertEquals("CONNECTED", hub.status("sample-a", "prod").get("state"));
            assertEquals(
                    "OK",
                    json.readTree(hub.request(base, "info", null, null)).path("code").asString());
            hub.handleTextMessage(session, new TextMessage("{\"type\":\"xlog\",\"items\":[]}"));
            Thread.sleep(100);
            verify(session, never()).close(CloseStatus.SERVER_ERROR);
            verify(db, never())
                    .update(contains("insert into collector_events"), any(), any(), any(), any());
            hub.afterConnectionClosed(session, CloseStatus.NORMAL);
            assertEquals("CLOSED", hub.status("sample-a", "prod").get("state"));
            assertThrows(
                    IllegalStateException.class, () -> hub.request(base, "snapshot", null, null));
            assertNull(tickets.poll(100, TimeUnit.MILLISECONDS));
        } finally {
            hub.destroy();
            collector.stop(0);
        }
    }

    private static boolean handshake(
            CollectorTransportHub hub,
            String ticket,
            String token,
            Map<String, Object> attributes) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/collector/connect");
        request.addHeader("X-Monitor-Ticket", ticket);
        request.addHeader("X-Monitor-Token", token);
        return hub.beforeHandshake(
                new ServletServerHttpRequest(request),
                new ServletServerHttpResponse(new MockHttpServletResponse()),
                hub,
                attributes);
    }
}
