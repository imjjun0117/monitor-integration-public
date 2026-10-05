package com.monitoring.collector;

// 점검 상태·응답시간·결과 정보 보관
public final class CheckResult {
    private final String check_id;
    private final String category;
    private final String status;
    private final long duration_ms;
    private final String result_code;
    private final String message;
    private final String checked_at;
    private final HttpCheckDetails http;
    private final java.util.Map<String, Object> details;

    public CheckResult(String id, String status, long durationMs, String message) {
        this(id, null, status, durationMs, null, message, UtcClock.now());
    }

    CheckResult(
            String id,
            String category,
            String status,
            long durationMs,
            String resultCode,
            String message,
            String checkedAt) {
        this(id, category, status, durationMs, resultCode, message, checkedAt, null);
    }

    CheckResult(
            String id,
            String category,
            String status,
            long durationMs,
            String resultCode,
            String message,
            String checkedAt,
            HttpCheckDetails http) {
        this(id, category, status, durationMs, resultCode, message, checkedAt, http, null);
    }

    private CheckResult(
            String id,
            String category,
            String status,
            long durationMs,
            String resultCode,
            String message,
            String checkedAt,
            HttpCheckDetails http,
            java.util.Map<String, Object> details) {
        this.check_id = id;
        this.category = category;
        this.status = status;
        this.duration_ms = durationMs;
        this.result_code = resultCode;
        this.message = SecretMasker.mask(message);
        this.checked_at = checkedAt;
        this.http = http;
        this.details = details;
    }

    CheckResult forCheck(MonitorCheck check) {
        return new CheckResult(
                check.getId(),
                check.getCategory().name(),
                status,
                duration_ms,
                result_code,
                message,
                checked_at,
                http,
                details);
    }

    // 개수와 크기가 제한된 단일 단계 업무 지표 설정. 인증 원문과 고객 정보 전달 금지
    public CheckResult withDetails(java.util.Map<String, Object> values) {
        java.util.Map<String, Object> safe = new java.util.LinkedHashMap<String, Object>();
        for (java.util.Map.Entry<String, Object> entry : values.entrySet()) {
            if (safe.size() >= 32 || entry.getKey().length() > 120) {
                throw new IllegalArgumentException("DETAIL_LIMIT");
            }
            Object value = entry.getValue();
            if (HttpCheckDetails.sensitive(entry.getKey())) {
                value = "***";
            } else if (value instanceof String) {
                String text = SecretMasker.mask((String) value);
                value = text.substring(0, Math.min(1024, text.length()));
            } else if (value != null && !(value instanceof Number) && !(value instanceof Boolean)) {
                throw new IllegalArgumentException("DETAIL_VALUE_INVALID");
            }
            if (value instanceof Number
                    && (Double.isNaN(((Number) value).doubleValue())
                            || Double.isInfinite(((Number) value).doubleValue()))) {
                value = null;
            }
            safe.put(entry.getKey(), value);
        }
        return new CheckResult(
                check_id,
                category,
                status,
                duration_ms,
                result_code,
                message,
                checked_at,
                http,
                java.util.Collections.unmodifiableMap(safe));
    }

    public String getCheckId() {
        return check_id;
    }

    public String getStatus() {
        return status;
    }

    public long getDurationMs() {
        return duration_ms;
    }

    public String getResultCode() {
        return result_code;
    }

    public String getMessage() {
        return message;
    }

    public String getCheckedAt() {
        return checked_at;
    }
}
