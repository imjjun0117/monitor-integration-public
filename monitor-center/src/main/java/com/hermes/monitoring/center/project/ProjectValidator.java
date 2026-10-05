package com.hermes.monitoring.center.project;

import java.net.URI;
import java.nio.charset.StandardCharsets;

// 프로젝트 및 인스턴스 등록 값 검증
final class ProjectValidator {
    static final int MIN_ID_LENGTH = 2;
    static final int MAX_ID_LENGTH = 64;
    static final int MAX_DISPLAY_NAME_LENGTH = 120;
    static final int MAX_ENVIRONMENT_LENGTH = 40;
    static final int MAX_AGENT_URL_LENGTH = 500;
    static final int MIN_TOKEN_UTF8_BYTES = 32;
    static final int MIN_POLL_INTERVAL_SECONDS = 15;
    static final int MAX_POLL_INTERVAL_SECONDS = 715_827_882;
    static final String ID_PATTERN = "[a-z0-9][a-z0-9._-]{1,63}";

    private ProjectValidator() {}

    static void id(String value) {
        if (value == null || !value.matches(ID_PATTERN)) {
            throw new IllegalArgumentException("INVALID_ID");
        }
    }

    static void displayName(String value) {
        if (value == null
                || isUnicodeBlank(value)
                || hasSurroundingUnicodeSpace(value)
                || codePointLength(value) > MAX_DISPLAY_NAME_LENGTH) {
            throw new IllegalArgumentException("INVALID_DISPLAY_NAME");
        }
    }

    static void environment(String value) {
        if (value != null && codePointLength(value) > MAX_ENVIRONMENT_LENGTH) {
            throw new IllegalArgumentException("INSTANCE_INVALID");
        }
    }

    static void createToken(String value) {
        if (value == null
                || isUnicodeBlank(value)
                || value.getBytes(StandardCharsets.UTF_8).length < MIN_TOKEN_UTF8_BYTES) {
            throw new IllegalArgumentException("INSTANCE_INVALID");
        }
    }

    static void replacementToken(String value) {
        if (value != null && !isUnicodeBlank(value)) {
            createToken(value);
        }
    }

    static void poll(Integer value) {
        if (value == null
                || value < MIN_POLL_INTERVAL_SECONDS
                || value > MAX_POLL_INTERVAL_SECONDS) {
            throw new IllegalArgumentException("INSTANCE_INVALID");
        }
    }

    static void validateProject(ProjectController.Project value, String pathId) {
        if (value == null) {
            throw new IllegalArgumentException("PROJECT_INVALID");
        }
        id(pathId);
        id(value.projectId());
        if (!pathId.equals(value.projectId()) || value.enabled() == null) {
            throw new IllegalArgumentException("PROJECT_INVALID");
        }
        displayName(value.displayName());
    }

    static void validateInstance(ProjectController.Instance value) {
        if (value == null) {
            throw new IllegalArgumentException("INSTANCE_INVALID");
        }
        id(value.instanceId());
        displayName(value.displayName());
        environment(value.environment());
        createToken(value.token());
        poll(value.pollIntervalSeconds());
        if (value.apiChecksEnabled() == null || value.enabled() == null) {
            throw new IllegalArgumentException("INSTANCE_INVALID");
        }
        validateAgentUrl(value.agentBaseUrl());
    }

    static void validateInstanceUpdate(
            String projectId, String instanceId, InstanceActionsController.Update value) {
        id(projectId);
        id(instanceId);
        if (value == null) {
            throw new IllegalArgumentException("INSTANCE_INVALID");
        }
        id(value.instanceId());
        if (!instanceId.equals(value.instanceId())
                || value.apiChecksEnabled() == null
                || value.enabled() == null) {
            throw new IllegalArgumentException("INSTANCE_INVALID");
        }
        displayName(value.displayName());
        environment(value.environment());
        replacementToken(value.token());
        poll(value.pollIntervalSeconds());
        validateAgentUrl(value.agentBaseUrl());
    }

    static void validateAgentUrl(String value) {
        try {
            if (value == null
                    || value.isEmpty()
                    || codePointLength(value) > MAX_AGENT_URL_LENGTH
                    || hasSurroundingUnicodeSpace(value)) {
                throw new IllegalArgumentException();
            }
            URI uri = URI.create(value);
            boolean scheme =
                    "http".equalsIgnoreCase(uri.getScheme())
                            || "https".equalsIgnoreCase(uri.getScheme());
            if (!scheme
                    || uri.getHost() == null
                    || uri.getUserInfo() != null
                    || uri.getQuery() != null
                    || uri.getFragment() != null
                    || !uri.normalize().equals(uri)) {
                throw new IllegalArgumentException();
            }
        } catch (RuntimeException error) {
            throw new IllegalArgumentException("INSTANCE_URL_INVALID");
        }
    }

    private static int codePointLength(String value) {
        return value.codePointCount(0, value.length());
    }

    private static boolean isUnicodeBlank(String value) {
        for (int offset = 0; offset < value.length(); ) {
            int codePoint = value.codePointAt(offset);
            if (!isUnicodeSpace(codePoint)) {
                return false;
            }
            offset += Character.charCount(codePoint);
        }
        return true;
    }

    private static boolean hasSurroundingUnicodeSpace(String value) {
        if (value.isEmpty()) {
            return false;
        }
        return isUnicodeSpace(value.codePointAt(0))
                || isUnicodeSpace(value.codePointBefore(value.length()));
    }

    private static boolean isUnicodeSpace(int codePoint) {
        return codePoint == 0x0009
                || (codePoint >= 0x000A && codePoint <= 0x000D)
                || codePoint == 0x0020
                || codePoint == 0x00A0
                || codePoint == 0x1680
                || (codePoint >= 0x2000 && codePoint <= 0x200A)
                || codePoint == 0x2028
                || codePoint == 0x2029
                || codePoint == 0x202F
                || codePoint == 0x205F
                || codePoint == 0x3000
                || codePoint == 0xFEFF;
    }
}
