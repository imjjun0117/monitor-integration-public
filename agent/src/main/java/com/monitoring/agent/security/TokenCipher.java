package com.monitoring.agent.security;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

// Collector 접속 토큰 암호화 및 복호화
public final class TokenCipher {
    private static final int IV_BYTES = 12;
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public TokenCipher(String base64Key) {
        byte[] raw = Base64.getDecoder().decode(base64Key);
        if (raw.length != 32) {
            throw new IllegalArgumentException("MASTER_KEY_INVALID");
        }
        key = new SecretKeySpec(raw, "AES");
    }

    // 토큰을 암호화하여 암호문과 초기화 벡터 반환
    public EncryptedToken encrypt(String token) {
        if (token == null || token.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalArgumentException("TOKEN_TOO_SHORT");
        }
        try {
            byte[] initializationVector = new byte[IV_BYTES];
            random.nextBytes(initializationVector);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, initializationVector));
            return new EncryptedToken(
                    cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), initializationVector);
        } catch (Exception error) {
            throw new IllegalStateException("TOKEN_ENCRYPT_FAILED");
        }
    }

    // 저장된 암호문과 초기화 벡터로 토큰 복호화
    public String decrypt(byte[] data, byte[] initializationVector) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, initializationVector));
            return new String(cipher.doFinal(data), StandardCharsets.UTF_8);
        } catch (Exception error) {
            throw new IllegalStateException("TOKEN_DECRYPT_FAILED");
        }
    }

    public record EncryptedToken(byte[] ciphertext, byte[] iv) {}
}
