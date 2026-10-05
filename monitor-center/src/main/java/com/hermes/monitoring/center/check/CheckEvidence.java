package com.hermes.monitoring.center.check;

import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// 구버전 에이전트와 호환되는 선택형 점검 증적 구성
public final class CheckEvidence {
    private static final ObjectMapper JSON = new ObjectMapper();

    private CheckEvidence() {}

    public static String encode(JsonNode result) {
        var evidence = JSON.createObjectNode();
        for (String field : List.of("http", "details")) {
            if (result.path(field).isObject()) {
                evidence.set(field, result.get(field));
            }
        }
        return evidence.isEmpty() ? null : evidence.toString();
    }

    public static void attach(List<Map<String, Object>> items) {
        for (var item : items) {
            Object text = item.remove("evidence_json");
            if (text == null) {
                continue;
            }
            JsonNode evidence = JSON.readTree(text.toString());
            for (String field : List.of("http", "details")) {
                if (evidence.path(field).isObject()) {
                    item.put(field, evidence.get(field));
                }
            }
        }
    }
}
