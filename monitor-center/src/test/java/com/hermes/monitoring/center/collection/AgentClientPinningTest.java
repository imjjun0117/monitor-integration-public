package com.hermes.monitoring.center.collection;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AgentClientPinningTest {
    @Test
    void actualConnectionUsesTheValidatedIpWithoutASecondDnsLookup() throws Exception {
        AtomicInteger resolutions = new AtomicInteger();
        SsrfGuard guard =
                new SsrfGuard(
                        "127.0.0.1/32",
                        host -> {
                            if (resolutions.incrementAndGet() == 1) {
                                return new InetAddress[] {InetAddress.getByName("127.0.0.1")};
                            }
                            return new InetAddress[] {InetAddress.getByName("169.254.169.254")};
                        });

        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            ExecutorService serverThread = Executors.newSingleThreadExecutor();
            try {
                Future<String> received = serverThread.submit(() -> respondOnce(server));
                byte[] body =
                        new AgentClient(guard)
                                .get(
                                        "http://rebind.test:" + server.getLocalPort(),
                                        "info",
                                        "01234567890123456789012345678901");
                assertEquals("{}", new String(body, StandardCharsets.UTF_8));
                assertEquals(1, resolutions.get());
                assertTrue(received.get().contains("Host: rebind.test:" + server.getLocalPort()));
            } finally {
                serverThread.shutdownNow();
            }
        }
    }

    @Test
    void broadCidrsCannotImplicitlyEnableMetadataOrLoopback() throws Exception {
        assertThrows(
                IllegalArgumentException.class,
                () -> new SsrfGuard("0.0.0.0/0").resolve("http://169.254.169.254/latest"));
        assertThrows(
                IllegalArgumentException.class,
                () -> new SsrfGuard("127.0.0.0/8").resolve("http://127.0.0.1:8080"));
        assertEquals(
                "127.0.0.1",
                new SsrfGuard("127.0.0.1/32")
                        .resolve("http://127.0.0.1:8080")
                        .address()
                        .getHostAddress());
        assertEquals(
                "0:0:0:0:0:0:0:1",
                new SsrfGuard("::1/128").resolve("http://[::1]:8080").address().getHostAddress());
    }

    @Test
    void redirectResponsesAreRejectedWithoutFollowingTheLocation() throws Exception {
        AtomicInteger resolutions = new AtomicInteger();
        SsrfGuard guard =
                new SsrfGuard(
                        "127.0.0.1/32",
                        host -> {
                            resolutions.incrementAndGet();
                            return new InetAddress[] {InetAddress.getByName("127.0.0.1")};
                        });

        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            ExecutorService serverThread = Executors.newSingleThreadExecutor();
            try {
                Future<?> response =
                        serverThread.submit(
                                () -> {
                                    try (Socket socket = server.accept()) {
                                        socket.getInputStream().readNBytes(1);
                                        socket.getOutputStream()
                                                .write(
                                                        ("HTTP/1.1 302 Found\r\n"
                                                                        + "Location: http://169.254.169.254/latest\r\n"
                                                                        + "Content-Length: 0\r\nConnection: close\r\n\r\n")
                                                                .getBytes(
                                                                        StandardCharsets.US_ASCII));
                                        socket.getOutputStream().flush();
                                    }
                                    return null;
                                });

                AgentClientException error =
                        assertThrows(
                                AgentClientException.class,
                                () ->
                                        new AgentClient(guard)
                                                .get(
                                                        "http://redirect.test:"
                                                                + server.getLocalPort(),
                                                        "info",
                                                        "01234567890123456789012345678901"));
                assertEquals("REDIRECT_REJECTED", error.getMessage());
                assertEquals(1, resolutions.get());
                response.get();
            } finally {
                serverThread.shutdownNow();
            }
        }
    }

    @Test
    void httpsPinsTheSocketWhilePreservingLogicalTlsPeerAndSni() throws Exception {
        SsrfGuard guard =
                new SsrfGuard(
                        "127.0.0.1/32",
                        host -> new InetAddress[] {InetAddress.getByName("127.0.0.1")});
        SSLSocketFactory factory = mock(SSLSocketFactory.class);
        SSLSocket tls = mock(SSLSocket.class);
        when(tls.getSSLParameters()).thenReturn(new SSLParameters());
        when(tls.getOutputStream()).thenReturn(new ByteArrayOutputStream());
        when(tls.getInputStream())
                .thenReturn(
                        new ByteArrayInputStream(
                                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}"
                                        .getBytes(StandardCharsets.US_ASCII)));

        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            ExecutorService serverThread = Executors.newSingleThreadExecutor();
            try {
                Future<?> accepted =
                        serverThread.submit(
                                () -> {
                                    try (Socket ignored = server.accept()) {
                                        // The connected raw socket is deliberately wrapped by the
                                        // mocked TLS layer.
                                    }
                                    return null;
                                });
                when(factory.createSocket(
                                any(Socket.class),
                                eq("tls.example"),
                                eq(server.getLocalPort()),
                                eq(true)))
                        .thenReturn(tls);

                byte[] body =
                        new AgentClient(guard, factory)
                                .get(
                                        "https://tls.example:" + server.getLocalPort(),
                                        "info",
                                        "01234567890123456789012345678901");
                assertEquals("{}", new String(body, StandardCharsets.UTF_8));
                accepted.get();

                verify(factory)
                        .createSocket(
                                any(Socket.class),
                                eq("tls.example"),
                                eq(server.getLocalPort()),
                                eq(true));
                ArgumentCaptor<SSLParameters> parameters =
                        ArgumentCaptor.forClass(SSLParameters.class);
                verify(tls).setSSLParameters(parameters.capture());
                assertEquals("HTTPS", parameters.getValue().getEndpointIdentificationAlgorithm());
                SNIHostName serverName =
                        (SNIHostName) parameters.getValue().getServerNames().get(0);
                assertEquals("tls.example", serverName.getAsciiName());
            } finally {
                serverThread.shutdownNow();
            }
        }
    }

    private String respondOnce(ServerSocket server) throws Exception {
        try (Socket socket = server.accept()) {
            BufferedReader input =
                    new BufferedReader(
                            new InputStreamReader(
                                    socket.getInputStream(), StandardCharsets.US_ASCII));
            StringBuilder request = new StringBuilder();
            String line;
            while ((line = input.readLine()) != null && !line.isEmpty()) {
                request.append(line).append('\n');
            }
            byte[] response =
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                            .concat("Content-Length: 2\r\nConnection: close\r\n\r\n{}")
                            .getBytes(StandardCharsets.US_ASCII);
            OutputStream output = socket.getOutputStream();
            output.write(response);
            output.flush();
            return request.toString();
        }
    }
}
