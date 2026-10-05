package com.hermes.monitoring.agent;

// 점검에 필요한 인증 정보 조회 계약 정의
public interface SecretProvider {
    String getSecret(String name);
}
