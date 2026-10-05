package com.monitoring.agent.metric;

// 자원 지표와 임계값으로 상태 판정
public final class StatusEvaluator {
    public enum Status {
        UP,
        UNKNOWN,
        WARN,
        DOWN
    }

    public Status metric(Double value, double warning, double critical) {
        if (value == null) {
            return Status.UNKNOWN;
        }
        if (value >= critical) {
            return Status.DOWN;
        }
        if (value >= warning) {
            return Status.WARN;
        }
        return Status.UP;
    }

    public Status connection(int failures, long ageSeconds) {
        return connection(failures, ageSeconds, 15);
    }

    public Status connection(int failures, long ageSeconds, int pollIntervalSeconds) {
        long staleAfter = Math.max(60L, 3L * pollIntervalSeconds);
        if (failures >= 3 || ageSeconds > staleAfter) {
            return Status.DOWN;
        }
        if (failures > 0) {
            return Status.WARN;
        }
        return Status.UP;
    }

    public Status worst(Status... values) {
        Status result = Status.UP;
        for (Status value : values) {
            if (value.ordinal() > result.ordinal()) {
                result = value;
            }
        }
        return result;
    }
}
