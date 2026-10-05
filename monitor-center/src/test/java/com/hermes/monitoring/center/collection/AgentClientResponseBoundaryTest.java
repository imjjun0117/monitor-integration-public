package com.hermes.monitoring.center.collection;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AgentClientResponseBoundaryTest {
    private static final String TOKEN = "01234567890123456789012345678901";

    @Test
    void rejectsMalformedChunkSizesAndChunkTerminators() {
        assertProtocolError(chunked("+2\r\n{}\r\n0\r\n\r\n"));
        assertProtocolError(chunked("Z\r\n{}\r\n0\r\n\r\n"));
        assertProtocolError(chunked("2\r\n{}X\n0\r\n\r\n"));
        assertProtocolError(chunked("1;\r\nA\r\n0\r\n\r\n"));
        assertProtocolError(chunked("1;bad extension\r\nA\r\n0\r\n\r\n"));
    }

    @Test
    void rejectsConflictingOrInvalidContentLengthFraming() {
        assertProtocolError(
                response(
                        "Content-Length: 2\r\nTransfer-Encoding: chunked\r\n",
                        "2\r\n{}\r\n0\r\n\r\n"));
        assertProtocolError(response("Content-Length: +2\r\n", "{}"));
        assertProtocolError(response("Content-Length: 2\r\nContent-Length: 3\r\n", "{}"));
    }

    @Test
    void rejectsMalformedHeadersAndStatusLines() {
        assertProtocolError(response("Bad Header: value\r\nContent-Length: 2\r\n", "{}"));
        assertProtocolError(
                "HTTP/1.1 200 OK\u0001\r\nContent-Length: 2\r\n\r\n{}"
                        .getBytes(StandardCharsets.US_ASCII));
        assertProtocolError(
                "NOT-HTTP 200 OK\r\nContent-Length: 2\r\n\r\n{}"
                        .getBytes(StandardCharsets.US_ASCII));
    }

    @Test
    void enforcesOneMegabyteForFixedStreamingAndChunkedBodies() throws Exception {
        byte[] boundaryBody = new byte[AgentClient.MAX_RESPONSE_BYTES];
        Arrays.fill(boundaryBody, (byte) 'a');
        assertArrayEquals(boundaryBody, exchange(fixedResponse(boundaryBody)));

        assertCode("RESPONSE_TOO_LARGE", fixedLengthHeader(AgentClient.MAX_RESPONSE_BYTES + 1L));

        byte[] streamingBody = new byte[AgentClient.MAX_RESPONSE_BYTES + 1];
        assertCode("RESPONSE_TOO_LARGE", responseBytes("", streamingBody));

        String oversizedChunk = Integer.toHexString(AgentClient.MAX_RESPONSE_BYTES + 1);
        assertCode("RESPONSE_TOO_LARGE", chunked(oversizedChunk + "\r\n"));
    }

    @Test
    void mapsAReadTimeoutToAStableClientError() throws Exception {
        try (ServerSocket server = server()) {
            ExecutorService thread = Executors.newSingleThreadExecutor();
            try {
                Future<?> response =
                        thread.submit(
                                () -> {
                                    try (Socket socket = server.accept()) {
                                        readRequest(socket);
                                        Thread.sleep(4_000L);
                                    }
                                    return null;
                                });
                AgentClientException error =
                        assertThrows(
                                AgentClientException.class,
                                () -> client().get(base(server), "info", TOKEN));
                assertEquals("AGENT_TIMEOUT", error.getMessage());
                response.get(5, TimeUnit.SECONDS);
            } finally {
                thread.shutdownNow();
            }
        }
    }

    private void assertProtocolError(byte[] response) {
        assertCode("AGENT_HTTP_ERROR", response);
    }

    private void assertCode(String expected, byte[] response) {
        AgentClientException error =
                assertThrows(AgentClientException.class, () -> exchange(response));
        assertEquals(expected, error.getMessage());
    }

    private byte[] exchange(byte[] response) throws Exception {
        try (ServerSocket server = server()) {
            ExecutorService thread = Executors.newSingleThreadExecutor();
            try {
                Future<?> sent =
                        thread.submit(
                                () -> {
                                    try (Socket socket = server.accept()) {
                                        readRequest(socket);
                                        try {
                                            socket.getOutputStream().write(response);
                                            socket.getOutputStream().flush();
                                        } catch (java.io.IOException ignored) {
                                            // A client that rejects framing may close before the
                                            // server finishes.
                                        }
                                    }
                                    return null;
                                });
                try {
                    return client().get(base(server), "info", TOKEN);
                } finally {
                    sent.get(5, TimeUnit.SECONDS);
                }
            } finally {
                thread.shutdownNow();
            }
        }
    }

    private AgentClient client() throws Exception {
        return new AgentClient(
                new SsrfGuard(
                        "127.0.0.1/32",
                        host -> new InetAddress[] {InetAddress.getByName("127.0.0.1")}));
    }

    private ServerSocket server() throws Exception {
        return new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
    }

    private String base(ServerSocket server) {
        return "http://boundary.test:" + server.getLocalPort();
    }

    private void readRequest(Socket socket) throws Exception {
        BufferedReader input =
                new BufferedReader(
                        new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
        while (true) {
            String line = input.readLine();
            if (line == null || line.isEmpty()) {
                return;
            }
        }
    }

    private byte[] fixedResponse(byte[] body) throws Exception {
        return responseBytes("Content-Length: " + body.length + "\r\n", body);
    }

    private byte[] fixedLengthHeader(long length) {
        return response("Content-Length: " + length + "\r\n", "");
    }

    private byte[] chunked(String chunks) {
        return response("Transfer-Encoding: chunked\r\n", chunks);
    }

    private byte[] response(String headers, String body) {
        return responseBytes(headers, body.getBytes(StandardCharsets.US_ASCII));
    }

    private byte[] responseBytes(String headers, byte[] body) {
        try {
            ByteArrayOutputStream response = new ByteArrayOutputStream();
            response.write(
                    ("HTTP/1.1 200 OK\r\n" + headers + "Connection: close\r\n\r\n")
                            .getBytes(StandardCharsets.US_ASCII));
            response.write(body);
            return response.toByteArray();
        } catch (java.io.IOException impossible) {
            throw new AssertionError(impossible);
        }
    }
}
