package com.hermes.monitoring.agent;

import java.util.Map;

// 에이전트 실행 환경의 호환성 확인
public final class AgentCompatibilityProbe {
    private AgentCompatibilityProbe() {}

    public static void main(String[] args) {
        MonitorRuntime runtime =
                new MonitorAgentBuilder()
                        .identity("runtime-probe", "java-probe")
                        .token("compatibility-probe-token-32-bytes")
                        .build();
        try {
            Map<String, Object> info = runtime.info();
            Map<String, Object> snapshot = runtime.snapshot();
            if (!"1.0".equals(info.get("schema_version"))
                    || snapshot.get("jvm") == null
                    || snapshot.get("system") == null) {
                throw new IllegalStateException("AGENT_COMPATIBILITY_PROBE_FAILED");
            }
            System.out.println("agent compatibility probe passed");
        } finally {
            runtime.shutdown();
        }
    }
}
