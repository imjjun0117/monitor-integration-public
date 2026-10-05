package com.monitoring.agent.collection;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

// 허용된 대상에 토큰 인증으로 Collector HTTP 요청
public final class CollectorClient {
    public static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    private static final int CONNECT_TIMEOUT_MILLIS = 2_000;
    private static final int READ_TIMEOUT_MILLIS = 3_000;
    private static final String TOKEN_HEADER = "X-Monitor-" + "Token";
    private final SsrfGuard guard;
    private final SSLSocketFactory tlsFactory;
    private final HttpResponseParser responseParser = new HttpResponseParser();

    public CollectorClient(SsrfGuard guard) {
        this(guard, (SSLSocketFactory) SSLSocketFactory.getDefault());
    }

    CollectorClient(SsrfGuard guard, SSLSocketFactory tlsFactory) {
        this.guard = guard;
        this.tlsFactory = tlsFactory;
    }

    public byte[] get(String base, String endpoint, String token) throws Exception {
        return execute("GET", base, endpoint, null, token, null, 200);
    }

    public byte[] getResults(String base, String token, String jobId) throws Exception {
        String query = "job_id=" + URLEncoder.encode(jobId, StandardCharsets.UTF_8);
        return execute("GET", base, "checks/results", query, token, null, 200);
    }

    public byte[] runChecks(String base, String token, String requestJson) throws Exception {
        byte[] body = requestJson.getBytes(StandardCharsets.UTF_8);
        return execute("POST", base, "checks/run", null, token, body, 202);
    }

    public byte[] readLog(String base, String token, String requestJson) throws Exception {
        return execute(
                "POST",
                base,
                "logs/read",
                null,
                token,
                requestJson.getBytes(StandardCharsets.UTF_8),
                200);
    }

    // 접속 대상을 검증하고 허용된 IP로 HTTP 요청 실행
    private byte[] execute(
            String method,
            String base,
            String endpoint,
            String query,
            String token,
            byte[] body,
            int expectedStatus)
            throws Exception {
        rejectHeaderInjection(token);
        SsrfGuard.ResolvedTarget target = guard.resolve(base);
        URI uri = target.uri();
        String requestTarget = endpointPath(uri, endpoint, query);
        Exception lastFailure = null;
        for (InetAddress address : target.addresses()) {
            try (Socket socket = connect(uri, address)) {
                writeRequest(socket.getOutputStream(), method, uri, requestTarget, token, body);
                return responseParser.read(socket.getInputStream(), expectedStatus);
            } catch (CollectorClientException error) {
                throw error;
            } catch (SocketTimeoutException error) {
                throw new CollectorClientException("AGENT_TIMEOUT");
            } catch (Exception error) {
                lastFailure = error;
            }
        }
        if (lastFailure != null) {
            throw lastFailure;
        }
        throw new CollectorClientException("AGENT_HTTP_ERROR");
    }

    // 검증된 IP에 연결하고 HTTPS는 원래 호스트명으로 인증서 검증
    private Socket connect(URI uri, InetAddress address) throws Exception {
        int port = effectivePort(uri);
        Socket connection = new Socket();
        try {
            connection.connect(new InetSocketAddress(address, port), CONNECT_TIMEOUT_MILLIS);
            connection.setSoTimeout(READ_TIMEOUT_MILLIS);
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                return connection;
            }

            SSLSocket tls =
                    (SSLSocket) tlsFactory.createSocket(connection, uri.getHost(), port, true);
            SSLParameters parameters = tls.getSSLParameters();
            parameters.setEndpointIdentificationAlgorithm("HTTPS");
            if (!isIpLiteral(uri.getHost())) {
                parameters.setServerNames(List.of(new SNIHostName(uri.getHost())));
            }
            tls.setSSLParameters(parameters);
            tls.setSoTimeout(READ_TIMEOUT_MILLIS);
            tls.startHandshake();
            return tls;
        } catch (Exception error) {
            try {
                connection.close();
            } catch (IOException ignored) {
                // 연결 종료 오류보다 최초 접속 실패 원인 유지
            }
            throw error;
        }
    }

    // 요청 토큰과 본문을 포함한 HTTP 요청 작성
    private void writeRequest(
            OutputStream output,
            String method,
            URI uri,
            String requestTarget,
            String token,
            byte[] body)
            throws IOException {
        StringBuilder headers = new StringBuilder();
        headers.append(method).append(' ').append(requestTarget).append(" HTTP/1.1\r\n");
        headers.append("Host: ").append(hostHeader(uri)).append("\r\n");
        headers.append("Accept: application/json\r\n");
        headers.append(TOKEN_HEADER).append(": ").append(token).append("\r\n");
        headers.append("Connection: close\r\n");
        if (body != null) {
            headers.append("Content-Type: application/json\r\n");
            headers.append("Content-Length: ").append(body.length).append("\r\n");
        }
        headers.append("\r\n");
        output.write(headers.toString().getBytes(StandardCharsets.US_ASCII));
        if (body != null) {
            output.write(body);
        }
        output.flush();
    }

    private String endpointPath(URI root, String endpoint, String query) {
        String basePath = root.getRawPath();
        if (basePath == null || basePath.isEmpty()) {
            basePath = "";
        }
        basePath = basePath.replaceAll("/$", "");
        String path = basePath + "/monitor/v1/" + endpoint;
        return query == null ? path : path + "?" + query;
    }

    private String hostHeader(URI uri) {
        String host = uri.getHost();
        if (host.indexOf(':') >= 0) {
            host = "[" + host + "]";
        }
        int port = effectivePort(uri);
        boolean defaultPort =
                ("http".equalsIgnoreCase(uri.getScheme()) && port == 80)
                        || ("https".equalsIgnoreCase(uri.getScheme()) && port == 443);
        return defaultPort ? host : host + ":" + port;
    }

    private int effectivePort(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private boolean isIpLiteral(String host) {
        if (host.indexOf(':') >= 0) {
            return true;
        }
        return host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}");
    }

    // 토큰의 줄바꿈으로 HTTP 헤더가 추가되지 않도록 검증
    private void rejectHeaderInjection(String token) {
        if (token == null || token.indexOf('\r') >= 0 || token.indexOf('\n') >= 0) {
            throw new IllegalArgumentException("TOKEN_INVALID");
        }
    }
}
