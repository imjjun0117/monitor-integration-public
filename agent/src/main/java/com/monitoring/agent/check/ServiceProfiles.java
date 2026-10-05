package com.monitoring.agent.check;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

// 추가 API 호출 없이 선택한 서비스의 지표 구성
public final class ServiceProfiles {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern PATH =
            Pattern.compile("\\$(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[[0-9]{1,5}\\]){1,12}");
    private static final Pattern SENSITIVE =
            Pattern.compile(
                    "(?i)\\.(password|secret|token|authorization|api_?key|access_?token|refresh_?token|email|phone)(?:\\.|\\[|$)");

    private ServiceProfiles() {}

    public static void validate(JsonNode profile) {
        if (profile == null || profile.isNull()) {
            return;
        }
        require(profile.isObject() && profile.toString().length() <= 16000);
        only(profile, Set.of("title", "description", "dashboard", "fields"));
        text(profile, "title", 120, true);
        text(profile, "description", 500, false);
        require(profile.path("dashboard").isBoolean());
        JsonNode fields = profile.path("fields");
        require(fields.isArray() && !fields.isEmpty() && fields.size() <= 16);
        Set<String> keys = new HashSet<>();
        for (JsonNode field : fields) {
            require(field.isObject());
            only(
                    field,
                    Set.of(
                            "key",
                            "label",
                            "source",
                            "path",
                            "kind",
                            "unit",
                            "direction",
                            "warning",
                            "critical",
                            "valueLabels",
                            "when",
                            "required"));
            String key = text(field, "key", 64, true);
            require(key.matches("[a-z][a-z0-9_]{0,63}") && keys.add(key));
            text(field, "label", 120, true);
            text(field, "unit", 16, false);
            require(List.of("DETAILS", "RESPONSE_JSON").contains(field.path("source").asString()));
            require(List.of("NUMBER", "TEXT", "BOOLEAN").contains(field.path("kind").asString()));
            path(field.path("path"));
            if (field.has("required")) {
                require(field.path("required").isBoolean());
            }
            Double warning = number(field, "warning"), critical = number(field, "critical");
            String direction = field.path("direction").asString("LOW");
            require(List.of("LOW", "HIGH").contains(direction));
            if (warning != null || critical != null) {
                require("NUMBER".equals(field.path("kind").asString()));
            }
            if (warning != null && critical != null) {
                require("LOW".equals(direction) ? critical <= warning : critical >= warning);
            }
            JsonNode labels = field.path("valueLabels");
            if (!labels.isMissingNode() && !labels.isNull()) {
                require(labels.isObject() && labels.size() <= 10);
                for (Map.Entry<String, JsonNode> label : labels.properties()) {
                    require(
                            label.getKey().length() <= 64
                                    && label.getValue().isString()
                                    && label.getValue().asString().length() <= 120);
                }
            }
            JsonNode when = field.path("when");
            if (!when.isMissingNode() && !when.isNull()) {
                require(when.isObject());
                only(when, Set.of("path", "values"));
                path(when.path("path"));
                require(
                        when.path("values").isArray()
                                && !when.path("values").isEmpty()
                                && when.path("values").size() <= 8);
                for (JsonNode value : when.path("values")) {
                    require(
                            value.isValueNode()
                                    && !value.isNull()
                                    && value.toString().length() <= 120);
                }
            }
        }
    }

    public static void attach(List<Map<String, Object>> checks) {
        for (Map<String, Object> check : checks) {
            Object stored = check.remove("service_profile_json");
            JsonNode profile = stored == null ? preset(check) : JSON.readTree(stored.toString());
            if (profile == null || profile.isNull()) {
                continue;
            }
            validate(profile);
            check.put("service_profile", profile);
            check.put("service_info", evaluate(profile, check));
        }
    }

    static Map<String, Object> evaluate(JsonNode profile, Map<String, Object> check) {
        JsonNode details = JSON.valueToTree(check.get("details"));
        JsonNode http = JSON.valueToTree(check.get("http"));
        JsonNode response = null;
        if (!http.path("response_body_truncated").asBoolean(false)
                && http.path("status_code").asInt() >= 200
                && http.path("status_code").asInt() < 300) {
            try {
                response = JSON.readTree(http.path("response_body").asString());
            } catch (Exception ignored) {
                /* 응답 본문이 없거나 형식이 잘못되면 미수집 상태 유지 */
            }
        }
        List<Map<String, Object>> metrics = new ArrayList<>();
        String status = "UNKNOWN";
        int collected = 0;
        boolean missingRequired = false;
        for (JsonNode field : profile.path("fields")) {
            JsonNode root = "DETAILS".equals(field.path("source").asString()) ? details : response;
            JsonNode selected = select(root, field.path("path").asString());
            JsonNode when = field.path("when");
            if (when.isObject()) {
                JsonNode condition = select(root, when.path("path").asString());
                boolean matches = false;
                for (JsonNode allowed : when.path("values")) {
                    matches |= allowed.equals(condition);
                }
                if (!matches) {
                    selected = null;
                }
            }
            Object value = scalar(selected, field.path("kind").asString());
            missingRequired |= value == null && field.path("required").asBoolean(false);
            Map<String, Object> metric = new LinkedHashMap<>();
            for (String key : List.of("key", "label", "kind", "unit", "direction")) {
                metric.put(key, field.path(key).asString("direction".equals(key) ? "LOW" : ""));
            }
            String metricStatus = "UNKNOWN";
            Double warning = number(field, "warning"), critical = number(field, "critical");
            if (value != null) {
                collected++;
                metricStatus = "UP";
                if (value instanceof Double numeric) {
                    if (crossed(numeric, critical, field)) {
                        metricStatus = "DOWN";
                    } else if (crossed(numeric, warning, field)) {
                        metricStatus = "WARN";
                    }
                } else if (field.path("valueLabels").isObject()) {
                    String label =
                            field.path("valueLabels").path(String.valueOf(value)).asString(null);
                    if (label != null) {
                        value = label;
                    }
                }
                if ("UNKNOWN".equals(status) || rank(metricStatus) > rank(status)) {
                    status = metricStatus;
                }
            }
            metric.put("value", value);
            metric.put("status", metricStatus);
            metric.put("warning", warning);
            metric.put("critical", critical);
            metrics.add(metric);
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("title", profile.path("title").asString());
        info.put("description", profile.path("description").asString(""));
        info.put("dashboard", profile.path("dashboard").asBoolean());
        info.put("status", missingRequired && "UP".equals(status) ? "UNKNOWN" : status);
        info.put("collected", collected);
        info.put("metrics", metrics);
        return info;
    }

    private static JsonNode preset(Map<String, Object> check) {
        JsonNode details = JSON.valueToTree(check.get("details"));
        if (!"popbill".equals(check.get("check_id"))
                && !"POPBILL_BALANCE".equals(details.path("kind").asString())) {
            return null;
        }
        ObjectNode profile =
                JSON.createObjectNode().put("title", "팝빌 · 문자/알림톡").put("dashboard", true);
        profile.put(
                "description",
                "유형별 실제 과금 잔액으로 계산합니다. 같은 과금 대상의 예상 건수는 합산하지 않습니다. 충전 이력은 연동회원 내역이며 파트너 충전 이력은 현재 수집하지 않습니다.");
        var fields = profile.putArray("fields");
        ObjectNode primary = field("balance", "알림톡 과금 잔액", "balance", "NUMBER", "P");
        primary.put("required", true).put("critical", 0);
        primary.putObject("when")
                .put("path", "$.balance_source")
                .putArray("values")
                .add("MEMBER")
                .add("PARTNER");
        Double minimum =
                scalar(details.path("minimum_balance"), "NUMBER") instanceof Double value
                        ? value
                        : null;
        if (minimum != null) {
            primary.put("warning", minimum);
        }
        fields.add(primary);
        ObjectNode charged =
                field(
                        "charged_points_30d",
                        "연동회원 최근 30일 충전 포인트",
                        "charged_points_30d",
                        "NUMBER",
                        "P");
        charged.putObject("when")
                .put("path", "$.charge_history_complete")
                .putArray("values")
                .add(true);
        fields.add(charged);
        ObjectNode source = field("balance_source", "알림톡 과금 대상", "balance_source", "TEXT", "");
        source.putObject("valueLabels").put("MEMBER", "연동회원").put("PARTNER", "파트너");
        source.put("required", true);
        fields.add(source);
        fields.add(field("partner_balance", "파트너 잔액", "partner_balance", "NUMBER", "P"));
        fields.add(field("member_balance", "연동회원 잔액", "member_balance", "NUMBER", "P"));
        for (String type : List.of("ats", "sms", "lms")) {
            String name = "ats".equals(type) ? "알림톡" : type.toUpperCase(java.util.Locale.ROOT);
            ObjectNode method =
                    field(
                            type + "_balance_source",
                            name + " 과금 대상",
                            type + "_balance_source",
                            "TEXT",
                            "");
            method.putObject("valueLabels").put("MEMBER", "연동회원").put("PARTNER", "파트너");
            fields.add(method);
            fields.add(
                    field(
                            type + "_unit_cost",
                            name + " 건당 단가",
                            type + "_unit_cost",
                            "NUMBER",
                            "P"));
            ObjectNode estimate =
                    field(
                            type + "_remaining_estimate",
                            name + " 예상 발송 가능 건수",
                            type + "_remaining_estimate",
                            "NUMBER",
                            "건");
            estimate.put("critical", 0);
            estimate.putObject("when")
                    .put("path", "$." + type + "_balance_source")
                    .putArray("values")
                    .add("MEMBER")
                    .add("PARTNER");
            fields.add(estimate);
        }
        return profile;
    }

    private static ObjectNode field(
            String key, String label, String path, String kind, String unit) {
        return JSON.createObjectNode()
                .put("key", key)
                .put("label", label)
                .put("source", "DETAILS")
                .put("path", "$." + path)
                .put("kind", kind)
                .put("unit", unit)
                .put("direction", "LOW");
    }

    private static boolean crossed(double value, Double limit, JsonNode field) {
        return limit != null
                && ("HIGH".equals(field.path("direction").asString())
                        ? value >= limit
                        : value <= limit);
    }

    private static int rank(String status) {
        return "DOWN".equals(status) ? 3 : "WARN".equals(status) ? 2 : 1;
    }

    private static Object scalar(JsonNode value, String kind) {
        if (value == null || value.isNull() || value.isMissingNode()) {
            return null;
        }
        if ("BOOLEAN".equals(kind)) {
            return value.isBoolean() ? value.asBoolean() : null;
        }
        if ("TEXT".equals(kind)) {
            return value.isValueNode()
                    ? value.asString().substring(0, Math.min(512, value.asString().length()))
                    : null;
        }
        try {
            if (!value.isNumber()
                    && !(value.isString() && value.asString().matches("-?[0-9]+(?:\\.[0-9]+)?"))) {
                return null;
            }
            double number = Double.parseDouble(value.asString());
            return Double.isFinite(number) ? number : null;
        } catch (RuntimeException invalid) {
            return null;
        }
    }

    static JsonNode select(JsonNode root, String path) {
        if (root == null) {
            return null;
        }
        var segments = Pattern.compile("\\.([A-Za-z_][A-Za-z0-9_-]*)|\\[([0-9]+)\\]").matcher(path);
        JsonNode value = root;
        while (segments.find()) {
            if (value == null) {
                return null;
            }
            value =
                    segments.group(1) != null
                            ? value.get(segments.group(1))
                            : value.get(Integer.parseInt(segments.group(2)));
        }
        return value;
    }

    private static void path(JsonNode value) {
        require(
                value.isString()
                        && value.asString().length() <= 256
                        && PATH.matcher(value.asString()).matches()
                        && !SENSITIVE.matcher(value.asString()).find());
    }

    private static Double number(JsonNode value, String key) {
        JsonNode selected = value.path(key);
        if (selected.isMissingNode() || selected.isNull()) {
            return null;
        }
        require(selected.isNumber() && Double.isFinite(selected.doubleValue()));
        return selected.doubleValue();
    }

    private static String text(JsonNode value, String key, int limit, boolean required) {
        JsonNode selected = value.path(key);
        if (!required && (selected.isMissingNode() || selected.isNull())) {
            return "";
        }
        require(
                selected.isString()
                        && selected.asString().length() <= limit
                        && (!required || !selected.asString().isBlank()));
        return selected.asString();
    }

    private static void only(JsonNode value, Set<String> allowed) {
        for (Map.Entry<String, JsonNode> property : value.properties()) {
            require(allowed.contains(property.getKey()));
        }
    }

    private static void require(boolean valid) {
        if (!valid) {
            throw new IllegalArgumentException("SERVICE_PROFILE_INVALID");
        }
    }
}
