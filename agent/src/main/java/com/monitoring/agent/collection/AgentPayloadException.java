package com.monitoring.agent.collection;

// Collector 응답 검증 실패 정보 전달
public final class AgentPayloadException extends RuntimeException {
    public AgentPayloadException(String code) {
        super(code);
    }
}
