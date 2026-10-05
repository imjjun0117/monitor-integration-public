package com.monitoring.collector;

import java.nio.charset.Charset;
import java.security.MessageDigest;

// Collector 요청 토큰 검증
public final class TokenVerifier {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private TokenVerifier() {}

    public static boolean matches(String configuredToken, String suppliedToken) {
        if (configuredToken == null || configuredToken.length() == 0 || suppliedToken == null) {
            return false;
        }
        return MessageDigest.isEqual(configuredToken.getBytes(UTF8), suppliedToken.getBytes(UTF8));
    }
}
