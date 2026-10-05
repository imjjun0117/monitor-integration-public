package com.hermes.monitoring.center.project;

import java.util.Set;

// 조회 요청 조건 검증
public final class QueryValidation {
    private static final Set<String> STATUSES = Set.of("UP", "WARN", "DOWN", "UNKNOWN");

    private QueryValidation() {}

    public static void status(String status) {
        if (status != null && !STATUSES.contains(status)) {
            throw new IllegalArgumentException("STATUS_INVALID");
        }
    }
}
