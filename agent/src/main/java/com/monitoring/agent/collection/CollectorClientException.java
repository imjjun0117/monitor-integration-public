package com.monitoring.agent.collection;

import java.io.IOException;

// Collector 접속 실패 정보 전달
public final class CollectorClientException extends IOException {
    CollectorClientException(String code) {
        super(code);
    }
}
