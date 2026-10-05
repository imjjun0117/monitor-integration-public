package com.monitoring.agent.collection;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.net.ConnectException;
import java.net.UnknownHostException;
import javax.net.ssl.SSLHandshakeException;
import org.junit.jupiter.api.Test;

final class ConnectionErrorCodeTest {
    @Test
    void preservesSafeGuardAndClientCodes() {
        for (String code :
                new String[] {
                    "ADDRESS_NOT_ALLOWED",
                    "ALLOWLIST_CONFIG_ERROR",
                    "AUTH_ERROR",
                    "REDIRECT_REJECTED",
                    "AGENT_TIMEOUT",
                    "AGENT_HTTP_ERROR",
                    "IDENTITY_MISMATCH"
                }) {
            Exception error =
                    code.equals("AGENT_TIMEOUT")
                                    || code.equals("AGENT_HTTP_ERROR")
                                    || code.equals("AUTH_ERROR")
                                    || code.equals("REDIRECT_REJECTED")
                            ? new CollectorClientException(code)
                            : new IllegalArgumentException(code);
            assertEquals(code, ConnectionErrorCode.classify(error));
        }
    }

    @Test
    void mapsTransportFailuresWithoutLeakingMessages() {
        assertEquals(
                "TLS_ERROR",
                ConnectionErrorCode.classify(new SSLHandshakeException("secret cert details")));
        assertEquals(
                "DNS_ERROR",
                ConnectionErrorCode.classify(new UnknownHostException("internal.example")));
        assertEquals(
                "CONNECTION_ERROR",
                ConnectionErrorCode.classify(new ConnectException("10.0.0.1 refused")));
        assertEquals(
                "CONNECTION_ERROR",
                ConnectionErrorCode.classify(new RuntimeException("stack secret")));
    }
}
