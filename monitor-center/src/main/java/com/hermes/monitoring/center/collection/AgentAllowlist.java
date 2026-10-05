package com.hermes.monitoring.center.collection;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

// 설정 파일의 허용 도메인 및 IP 범위 조회·검증
final class AgentAllowlist {
    private static final ObjectMapper JSON =
            JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

    private AgentAllowlist() {}

    static SsrfGuard read(Path file, SsrfGuard.Resolver resolver) {
        try {
            JsonNode root = JSON.readTree(Files.readString(file));
            if (root == null || !root.isObject() || root.size() != 2) {
                throw new IllegalArgumentException();
            }
            return new SsrfGuard(
                    entries(root, "allowed_cidrs"), entries(root, "allowed_hosts"), resolver);
        } catch (Exception error) {
            throw new IllegalArgumentException("ALLOWLIST_CONFIG_ERROR", error);
        }
    }

    private static String entries(JsonNode root, String name) {
        JsonNode array = root.get(name);
        if (array == null || !array.isArray()) {
            throw new IllegalArgumentException();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode entry : array) {
            if (!entry.isString() || entry.asString().isBlank() || entry.asString().contains(",")) {
                throw new IllegalArgumentException();
            }
            values.add(entry.asString().trim());
        }
        return String.join(",", values);
    }
}
