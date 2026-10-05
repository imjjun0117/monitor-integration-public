package com.monitoring.collector;

import java.util.Map;

// HTTP 점검 템플릿의 변수 및 인증 정보 치환
final class TemplateResolver {
    private static final int MAX_RESOLVED_CHARS = 64 * 1024;
    private final Map<String, String> properties;
    private final SecretProvider secrets;
    private final java.util.Set<String> resolvedSecrets = new java.util.HashSet<String>();

    TemplateResolver(Map<String, String> properties, SecretProvider secrets) {
        this.properties = properties;
        this.secrets = secrets;
    }

    String resolve(String template) throws MissingConfigurationException {
        if (template == null) {
            return null;
        }
        StringBuilder resolved = new StringBuilder();
        int from = 0;
        while (from < template.length()) {
            int opening = template.indexOf("${", from);
            if (opening < 0) {
                resolved.append(template.substring(from));
                break;
            }
            resolved.append(template.substring(from, opening));
            int closing = template.indexOf('}', opening + 2);
            if (closing < 0) {
                throw new MissingConfigurationException();
            }
            String key = template.substring(opening + 2, closing);
            String value;
            if (key.startsWith("secret:")) {
                value = secrets.getSecret(key.substring("secret:".length()));
                if (value != null && value.length() > 0) {
                    resolvedSecrets.add(value);
                }
            } else {
                value = properties.get(key);
            }
            if (value == null || value.length() == 0) {
                throw new MissingConfigurationException();
            }
            resolved.append(value);
            if (resolved.length() > MAX_RESOLVED_CHARS) {
                throw new MissingConfigurationException();
            }
            from = closing + 1;
        }
        if (resolved.length() > MAX_RESOLVED_CHARS) {
            throw new MissingConfigurationException();
        }
        return resolved.toString();
    }

    // HTTP 실행별 값을 분리하여 동시 점검 사이에 진단 정보가 섞이지 않도록 처리
    TemplateResolver forExecution() {
        return new TemplateResolver(properties, secrets);
    }

    String maskSecrets(String text) {
        if (text == null) {
            return null;
        }
        java.util.List<String> values = new java.util.ArrayList<String>(resolvedSecrets);
        java.util.Collections.sort(
                values,
                new java.util.Comparator<String>() {
                    public int compare(String first, String second) {
                        return second.length() - first.length();
                    }
                });
        for (String value : values) {
            text = text.replace(value, "***");
            try {
                text = text.replace(java.net.URLEncoder.encode(value, "UTF-8"), "***");
                try {
                    text = text.replace(java.net.URLDecoder.decode(value, "UTF-8"), "***");
                } catch (IllegalArgumentException notEncoded) {
                    /* 원본 인증 정보는 이미 가려져 있으므로 유지 */
                }
            } catch (java.io.UnsupportedEncodingException impossible) {
                throw new AssertionError(impossible);
            }
        }
        return SecretMasker.mask(text);
    }

    static final class MissingConfigurationException extends Exception {
        private static final long serialVersionUID = 1L;
    }
}
