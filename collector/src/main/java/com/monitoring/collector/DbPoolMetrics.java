package com.monitoring.collector;

import java.util.ArrayList;
import java.util.List;

// DB 커넥션 풀 사용량 보관
public final class DbPoolMetrics {
    private final String pool_id;
    private final String name;
    private final Integer active;
    private final Integer idle;
    private final Integer max;
    private final Integer min_idle;
    private final Integer waiters;
    private final Long max_wait_ms;
    private final Long validation_latency_ms;
    private final List<String> unsupported;

    public DbPoolMetrics(
            String poolId,
            String name,
            Integer active,
            Integer idle,
            Integer max,
            Integer minIdle,
            Integer waiters) {
        this(poolId, name, active, idle, max, minIdle, waiters, null, null);
    }

    public DbPoolMetrics(
            String poolId,
            String name,
            Integer active,
            Integer idle,
            Integer max,
            Integer minIdle,
            Integer waiters,
            Long maxWaitMs,
            Long validationLatencyMs) {
        this.pool_id = poolId;
        this.name = name;
        this.active = active;
        this.idle = idle;
        this.max = max;
        this.min_idle = minIdle;
        this.waiters = waiters;
        this.max_wait_ms = maxWaitMs;
        this.validation_latency_ms = validationLatencyMs;
        this.unsupported = new ArrayList<String>();
        if (active == null) {
            unsupported.add("active");
        }
        if (idle == null) {
            unsupported.add("idle");
        }
        if (max == null) {
            unsupported.add("max");
        }
        if (minIdle == null) {
            unsupported.add("min_idle");
        }
        if (waiters == null) {
            unsupported.add("waiters");
        }
        if (maxWaitMs == null) {
            unsupported.add("max_wait_ms");
        }
        if (validationLatencyMs == null) {
            unsupported.add("validation_latency_ms");
        }
    }

    public String getPoolId() {
        return pool_id;
    }

    public Integer getActive() {
        return active;
    }

    public Integer getMax() {
        return max;
    }
}
