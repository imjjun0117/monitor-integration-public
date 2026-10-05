package com.hermes.monitoring.center.collection;

import java.io.IOException;

// 에이전트 접속 실패 정보 전달
public final class AgentClientException extends IOException {
    AgentClientException(String code) {
        super(code);
    }
}
