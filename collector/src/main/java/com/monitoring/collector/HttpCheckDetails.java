package com.monitoring.collector;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

// 인증 정보와 쿠키를 제외한 요청·응답 증적 보관
final class HttpCheckDetails {
    private static final int BODY_LIMIT = 4096;
    private static final Pattern XML_SECRET =
            Pattern.compile(
                    "(?is)(<([\\w:-]*(?:token|secret|password|key|authorization|cookie)[\\w:-]*)\\b[^>]*>).*?(</\\2\\s*>)");
    private static final Pattern HTML_INPUT =
            Pattern.compile("(?is)(<input\\b[^>]*?\\bvalue\\s*=\\s*)(\"[^\"]*\"|'[^']*'|[^\\s>]+)");
    private static final Pattern NAMED_SECRET =
            Pattern.compile(
                    "(?i)(\\b[\\w.-]*(?:token|secret|password|key|authorization|cookie|signature)[\\w.-]*\\s*[:=]\\s*)(\"(?:\\\\.|[^\"\\\\])*\"|'[^']*'|[^\\s,&}\\]]+)");

    String method;
    String url;
    Map<String, String> request_query = new LinkedHashMap<String, String>();
    Map<String, String> request_headers = new LinkedHashMap<String, String>();
    String request_body;
    boolean request_body_truncated;
    int connect_timeout_ms;
    int read_timeout_ms;
    String expected;
    Integer status_code;
    Map<String, String> response_headers = new LinkedHashMap<String, String>();
    String response_body;
    boolean response_body_truncated;
    Integer response_bytes;

    HttpCheckDetails(DeclarativeCheckSpec spec) {
        method = spec.method;
        connect_timeout_ms = spec.connectTimeoutMillis;
        read_timeout_ms = spec.readTimeoutMillis;
        StringBuilder summary = new StringBuilder("HTTP ");
        for (DeclarativeCheckSpec.StatusRange range : spec.assertion.statuses) {
            if (summary.length() > 5) {
                summary.append(", ");
            }
            summary.append(range.minimum);
            if (range.maximum != range.minimum) {
                summary.append('-').append(range.maximum);
            }
        }
        if (spec.assertion.contains != null) {
            summary.append(" · 본문에 ").append(spec.assertion.contains).append(" 포함");
        }
        if (spec.assertion.regex != null) {
            summary.append(" · 본문 패턴: ").append(spec.assertion.regex.pattern());
        }
        if (spec.assertion.json != null) {
            summary.append(" · JSON ")
                    .append(spec.assertion.json.path)
                    .append(
                            spec.assertion.json.equal == null
                                    ? (spec.assertion.json.exists ? " 존재" : " 없음")
                                    : " = " + spec.assertion.json.equal);
        }
        if (spec.assertion.xml != null) {
            summary.append(" · XML ")
                    .append(spec.assertion.xml.element)
                    .append(
                            spec.assertion.xml.equal == null
                                    ? (spec.assertion.xml.exists ? " 존재" : " 없음")
                                    : " = " + spec.assertion.xml.equal);
        }
        expected = summary.toString();
    }

    HttpCheckDetails sanitized(TemplateResolver resolver) {
        url = limit(resolver.maskSecrets(url), 8192);
        expected = limit(resolver.maskSecrets(expected), 2048);
        request_query = maskedMap(request_query, resolver);
        request_headers = maskedMap(request_headers, resolver);
        response_headers = maskedMap(response_headers, resolver);
        request_body = redactBody(request_body, resolver);
        request_body_truncated = request_body != null && request_body.length() > BODY_LIMIT;
        request_body = limit(request_body, BODY_LIMIT);
        response_body = redactBody(response_body, resolver);
        response_body_truncated = response_body != null && response_body.length() > BODY_LIMIT;
        response_body = limit(response_body, BODY_LIMIT);
        return this;
    }

    private static Map<String, String> maskedMap(
            Map<String, String> values, TemplateResolver resolver) {
        Map<String, String> result = new LinkedHashMap<String, String>();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (result.size() >= 32) {
                break;
            }
            result.put(
                    limit(entry.getKey(), 120),
                    sensitive(entry.getKey())
                            ? "***"
                            : limit(resolver.maskSecrets(entry.getValue()), 1024));
        }
        return result;
    }

    private static String redactBody(String body, TemplateResolver resolver) {
        if (body == null || body.length() == 0) {
            return body;
        }
        // 긴 인증 정보의 앞부분이 노출되지 않도록 길이 제한 전 분석 및 가리기
        try {
            JsonElement json = new JsonParser().parse(body);
            if (json.isJsonObject() || json.isJsonArray()) {
                try {
                    redactJson(json, resolver, 0);
                } catch (RuntimeException tooDeep) {
                    return "[Structured response omitted]";
                }
                return resolver.maskSecrets(json.toString());
            }
        } catch (RuntimeException ignored) {
            String trimmed = body.trim();
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                return "[Malformed JSON response omitted]";
            }
        }
        String masked = XML_SECRET.matcher(body).replaceAll("$1***$3");
        masked = HTML_INPUT.matcher(masked).replaceAll("$1\"***\"");
        masked = NAMED_SECRET.matcher(masked).replaceAll("$1***");
        return resolver.maskSecrets(masked);
    }

    private static void redactJson(JsonElement value, TemplateResolver resolver, int depth) {
        if (depth > 32) {
            throw new IllegalArgumentException("DIAGNOSTIC_DEPTH_LIMIT");
        }
        if (value.isJsonObject()) {
            JsonObject object = value.getAsJsonObject();
            for (Map.Entry<String, JsonElement> field : object.entrySet()) {
                if (sensitive(field.getKey())) {
                    object.addProperty(field.getKey(), "***");
                } else if (field.getValue().isJsonPrimitive()
                        && field.getValue().getAsJsonPrimitive().isString()) {
                    object.addProperty(
                            field.getKey(), resolver.maskSecrets(field.getValue().getAsString()));
                } else {
                    redactJson(field.getValue(), resolver, depth + 1);
                }
            }
        } else if (value.isJsonArray()) {
            com.google.gson.JsonArray array = value.getAsJsonArray();
            for (int index = 0; index < array.size(); index++) {
                JsonElement child = array.get(index);
                if (child.isJsonPrimitive() && child.getAsJsonPrimitive().isString()) {
                    array.set(
                            index,
                            new com.google.gson.JsonPrimitive(
                                    resolver.maskSecrets(child.getAsString())));
                } else {
                    redactJson(child, resolver, depth + 1);
                }
            }
        }
    }

    static boolean sensitive(String name) {
        String key = name.toLowerCase(Locale.ENGLISH).replaceAll("[-_.]", "");
        return key.contains("token")
                || key.contains("secret")
                || key.contains("password")
                || key.contains("key")
                || key.contains("authorization")
                || key.contains("cookie")
                || key.contains("signature")
                || key.contains("email")
                || key.contains("phone")
                || key.contains("mobile")
                || key.contains("jumin")
                || key.equals("ssn")
                || key.equals("bno")
                || key.equals("corpnum");
    }

    private static String limit(String value, int length) {
        return value == null || value.length() <= length ? value : value.substring(0, length);
    }
}
