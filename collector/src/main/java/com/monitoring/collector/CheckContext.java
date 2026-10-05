package com.monitoring.collector;

// 점검 실행에 필요한 제한 및 인증 정보 제공
public final class CheckContext {
    private final long deadlineMillis;

    public CheckContext(long deadlineMillis) {
        this.deadlineMillis = deadlineMillis;
    }

    public long getDeadlineMillis() {
        return deadlineMillis;
    }
}
