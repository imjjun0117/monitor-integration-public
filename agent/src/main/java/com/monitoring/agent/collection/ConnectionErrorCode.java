package com.monitoring.agent.collection;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.util.Set;
import javax.net.ssl.SSLException;

// 접속 실패 원인을 공통 오류 코드로 변환
public final class ConnectionErrorCode {
    private static final Set<String> SAFE =
            Set.of(
                    "ADDRESS_NOT_ALLOWED",
                    "ALLOWLIST_CONFIG_ERROR",
                    "AUTH_ERROR",
                    "REDIRECT_REJECTED",
                    "AGENT_TIMEOUT",
                    "AGENT_HTTP_ERROR",
                    "IDENTITY_MISMATCH",
                    "TLS_ERROR",
                    "DNS_ERROR",
                    "CONNECTION_ERROR");

    private ConnectionErrorCode() {}

    public static String classify(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (current instanceof SSLException) {
                return "TLS_ERROR";
            }
            if (current instanceof UnknownHostException) {
                return "DNS_ERROR";
            }
            if (current instanceof ConnectException) {
                return "CONNECTION_ERROR";
            }
            if (SAFE.contains(current.getMessage())) {
                return current.getMessage();
            }
        }
        return "CONNECTION_ERROR";
    }
}
