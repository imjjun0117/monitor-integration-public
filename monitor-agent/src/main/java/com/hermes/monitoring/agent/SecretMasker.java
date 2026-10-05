package com.hermes.monitoring.agent;

import java.util.regex.Pattern;

// 점검 결과에 포함된 인증 정보 가리기
public final class SecretMasker {
    private static final String KEYWORDS =
            "authorization|x[-_]?api[-_]?key|token|api[-_]?key|apikey|secret|password|"
                    + "service[-_]?key|access[-_]?key";
    private static final String[] ESCAPED_KEYS = {
        "authorization", "x-api-key", "x_api_key", "apikey", "api-key", "api_key",
        "token", "secret", "password", "servicekey", "service-key", "service_key",
        "accesskey", "access-key", "access_key"
    };
    private static final Pattern URL_QUERY = Pattern.compile("(?i)(https?://[^\\s?]+)\\?[^\\s]*");
    private static final Pattern JSON_VALUE =
            Pattern.compile(
                    "(?i)(\\\"(?:"
                            + KEYWORDS
                            + ")\\\"\\s*:\\s*\\\")"
                            + "(?:\\\\.|[^\\\"\\\\])*(\\\")");
    private static final String ESCAPED_QUOTE = Pattern.quote("\\\"");
    private static final Pattern ESCAPED_JSON_VALUE =
            Pattern.compile(
                    "(?i)("
                            + ESCAPED_QUOTE
                            + "(?:"
                            + KEYWORDS
                            + ")"
                            + ESCAPED_QUOTE
                            + "\\s*:\\s*"
                            + ESCAPED_QUOTE
                            + ").*?("
                            + ESCAPED_QUOTE
                            + "(?=\\s*[,}]))");
    private static final Pattern HEADER_VALUE =
            Pattern.compile("(?im)^(\\s*(?:authorization|x[-_]?api[-_]?key)\\s*:\\s*)[^\\r\\n]*");
    private static final Pattern AUTHORIZATION_VALUE =
            Pattern.compile("(?i)(\\bauthorization\\b\\s*[:=]\\s*)[^\\r\\n]*");
    private static final Pattern NAMED_VALUE =
            Pattern.compile(
                    "(?i)(\\b(?:"
                            + KEYWORDS
                            + ")\\b\\s*[:=]\\s*)"
                            + "(?:\\\"(?:\\\\.|[^\\\"])*\\\"|'[^']*'|[^\\s,&}\\]]+)");

    private SecretMasker() {}

    public static String mask(String value) {
        if (value == null) {
            return "";
        }
        String masked = maskEscapedJson(value);
        masked = replace(URL_QUERY, masked, "$1?***");
        masked = replace(JSON_VALUE, masked, "$1***$2");
        masked = replace(ESCAPED_JSON_VALUE, masked, "$1***$2");
        masked = replace(HEADER_VALUE, masked, "$1***");
        masked = replace(AUTHORIZATION_VALUE, masked, "$1***");
        return replace(NAMED_VALUE, masked, "$1***");
    }

    private static String maskEscapedJson(String value) {
        String masked = value;
        for (int keyIndex = 0; keyIndex < ESCAPED_KEYS.length; keyIndex++) {
            String marker = "\\\"" + ESCAPED_KEYS[keyIndex] + "\\\"";
            int from = 0;
            while (true) {
                String lower = masked.toLowerCase(java.util.Locale.ENGLISH);
                int key = lower.indexOf(marker, from);
                if (key < 0) {
                    break;
                }
                int colon = skipWhitespace(masked, key + marker.length());
                if (colon >= masked.length() || masked.charAt(colon) != ':') {
                    from = key + marker.length();
                    continue;
                }
                int openingSlash = skipWhitespace(masked, colon + 1);
                if (!isEscapedQuote(masked, openingSlash)) {
                    from = colon + 1;
                    continue;
                }
                int end = escapedJsonValueEnd(masked, openingSlash + 2);
                if (end < 0) {
                    return masked.substring(0, openingSlash + 2) + "***";
                }
                masked = masked.substring(0, openingSlash + 2) + "***" + masked.substring(end);
                from = openingSlash + 5;
            }
        }
        return masked;
    }

    private static int escapedJsonValueEnd(String value, int from) {
        for (int index = from; index + 1 < value.length(); index++) {
            if (value.charAt(index) != '\\' || value.charAt(index + 1) != '"') {
                continue;
            }
            int slashes = 1;
            for (int previous = index - 1;
                    previous >= 0 && value.charAt(previous) == '\\';
                    previous--) {
                slashes++;
            }
            if (slashes == 1) {
                return index;
            }
        }
        return -1;
    }

    private static boolean isEscapedQuote(String value, int index) {
        return index + 1 < value.length()
                && value.charAt(index) == '\\'
                && value.charAt(index + 1) == '"';
    }

    private static int skipWhitespace(String value, int index) {
        while (index < value.length() && Character.isWhitespace(value.charAt(index))) {
            index++;
        }
        return index;
    }

    private static String replace(Pattern pattern, String value, String replacement) {
        return pattern.matcher(value).replaceAll(replacement);
    }
}
