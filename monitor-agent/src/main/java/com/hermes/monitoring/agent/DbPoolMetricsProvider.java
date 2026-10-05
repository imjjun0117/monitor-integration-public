package com.hermes.monitoring.agent;

// DB 커넥션 풀 지표 조회 계약 정의
public interface DbPoolMetricsProvider {
    DbPoolMetrics collect();
}
