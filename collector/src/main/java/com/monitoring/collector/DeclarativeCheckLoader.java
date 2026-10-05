package com.monitoring.collector;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

// 배포 설정 파일 monitor-checks.json의 점검 목록 조회
public final class DeclarativeCheckLoader {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final int MAX_CONFIG_CHARS = 256 * 1024;
    private static final int MAX_CHECKS = 100;
    private static final int MAX_TIMEOUT_MS = 10_000;
    private static final Pattern ID = Pattern.compile("[a-z0-9][a-z0-9._-]{1,63}");
    private static final Pattern HEADER = Pattern.compile("[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}");
    private static final Pattern JSON_PATH =
            Pattern.compile("\\$(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[[0-9]+\\])*");
    private static final Pattern XML_ELEMENT = Pattern.compile("[A-Za-z_][A-Za-z0-9_.:-]{0,127}");
    private static final Set<String> UNSAFE_HEADERS =
            lowerSet(
                    new String[] {
                        "connection",
                        "content-length",
                        "host",
                        "proxy-authorization",
                        "proxy-connection",
                        "te",
                        "trailer",
                        "transfer-encoding",
                        "upgrade"
                    });

    private final Map<String, String> properties;
    private final SecretProvider secrets;

    public DeclarativeCheckLoader(Map<String, String> properties, SecretProvider secrets) {
        if (properties == null || secrets == null) {
            throw new IllegalArgumentException("DECLARATIVE_CONFIGURATION_REQUIRED");
        }
        this.properties =
                Collections.unmodifiableMap(new LinkedHashMap<String, String>(properties));
        this.secrets = secrets;
    }

    // 선언형 점검 설정 파일 조회 및 필드 검증
    public List<MonitorCheck> load(InputStream input) throws IOException {
        if (input == null) {
            throw invalid();
        }
        return load(new InputStreamReader(input, UTF8));
    }

    // 선언형 점검 설정 파일 조회 및 필드 검증
    public List<MonitorCheck> load(Reader input) throws IOException {
        JsonObject root = object(parse(readLimited(input)));
        only(root, new String[] {"checks"});
        JsonArray declarations = array(root, "checks", true);
        if (declarations.size() > MAX_CHECKS) {
            throw invalid();
        }

        List<MonitorCheck> checks = new ArrayList<MonitorCheck>();
        Set<String> ids = new HashSet<String>();
        for (JsonElement value : declarations) {
            JsonObject declaration = object(value);
            Common common = common(declaration);
            if (!ids.add(common.id)) {
                throw invalid();
            }
            if (!common.enabled) {
                if ("CUSTOM".equals(common.type)) {
                    validateDisabledCustom(declaration);
                } else {
                    specification(declaration, common);
                }
                continue;
            }
            DeclarativeCheckSpec spec = specification(declaration, common);
            checks.add(
                    new DeclarativeMonitorCheck(spec, new TemplateResolver(properties, secrets)));
        }
        return checks;
    }

    private Common common(JsonObject value) {
        String id = string(value, "check_id", true);
        String name = string(value, "name", true);
        if (!ID.matcher(id).matches() || name.length() == 0 || name.length() > 120) {
            throw invalid();
        }
        CheckCategory category;
        try {
            category = CheckCategory.valueOf(string(value, "category", true));
        } catch (RuntimeException error) {
            throw invalid();
        }
        CheckDirection direction = null;
        if (value.has("direction") && !value.get("direction").isJsonNull()) {
            try {
                direction = CheckDirection.valueOf(string(value, "direction", true));
            } catch (RuntimeException error) {
                throw invalid();
            }
        }
        validateDirection(category, direction);
        String type = string(value, "type", true);
        boolean enabled = bool(value, "enabled", true);
        configurationRequired(value);
        return new Common(id, name, category, direction, type, enabled);
    }

    private DeclarativeCheckSpec specification(JsonObject value, Common common) {
        if ("HTTP".equals(common.type)) {
            return http(value, common);
        }
        if ("TCP".equals(common.type)) {
            return tcp(value, common);
        }
        if ("FILE".equals(common.type)
                || "DIRECTORY".equals(common.type)
                || "BATCH".equals(common.type)) {
            return path(value, common);
        }
        throw invalid();
    }

    private DeclarativeCheckSpec http(JsonObject value, Common common) {
        only(
                value,
                new String[] {
                    "check_id",
                    "name",
                    "category",
                    "direction",
                    "type",
                    "enabled",
                    "read_only",
                    "request",
                    "assertion",
                    "configuration_required"
                });
        if (!bool(value, "read_only", true)) {
            throw invalid();
        }
        JsonObject request = object(value.get("request"));
        only(
                request,
                new String[] {
                    "method",
                    "url",
                    "query",
                    "headers",
                    "body",
                    "connect_timeout_ms",
                    "read_timeout_ms"
                });
        String method = string(request, "method", true).toUpperCase(java.util.Locale.ENGLISH);
        if (!"GET".equals(method) && !"HEAD".equals(method) && !"POST".equals(method)) {
            throw invalid();
        }
        String url = string(request, "url", true);
        if (url.indexOf("${secret:") >= 0) {
            throw invalid();
        }
        HttpDeclarativeExecutor.validateUrlTemplate(url);
        Map<String, String> query = stringMap(request, "query");
        for (Map.Entry<String, String> entry : query.entrySet()) {
            if (sensitive(entry.getKey()) && entry.getValue().indexOf("${secret:") < 0) {
                throw invalid();
            }
        }
        Map<String, String> headers = stringMap(request, "headers");
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String header = entry.getKey();
            if (!HEADER.matcher(header).matches()
                    || UNSAFE_HEADERS.contains(header.toLowerCase(java.util.Locale.ENGLISH))) {
                throw invalid();
            }
            if (lineBreak(entry.getValue())
                    || (sensitive(header) && entry.getValue().indexOf("${secret:") < 0)) {
                throw invalid();
            }
        }
        String body = string(request, "body", false);
        if (("GET".equals(method) || "HEAD".equals(method)) && body != null) {
            throw invalid();
        }
        if (body != null && body.length() > HttpDeclarativeExecutor.MAX_REQUEST_CHARS) {
            throw invalid();
        }
        if (body != null && containsSensitiveMarker(body) && body.indexOf("${secret:") < 0) {
            throw invalid();
        }
        int connectTimeout = timeout(request, "connect_timeout_ms");
        int readTimeout = timeout(request, "read_timeout_ms");
        DeclarativeCheckSpec.Assertion assertion = assertion(object(value.get("assertion")));
        return DeclarativeCheckSpec.http(
                common.id,
                common.name,
                common.category,
                common.direction,
                method,
                url,
                query,
                headers,
                body,
                connectTimeout,
                readTimeout,
                assertion);
    }

    private DeclarativeCheckSpec tcp(JsonObject value, Common common) {
        only(
                value,
                new String[] {
                    "check_id",
                    "name",
                    "category",
                    "direction",
                    "type",
                    "enabled",
                    "host",
                    "port",
                    "connect_timeout_ms",
                    "configuration_required"
                });
        String host = string(value, "host", true);
        if (host.length() == 0 || host.length() > 253 || host.indexOf("${secret:") >= 0) {
            throw invalid();
        }
        String port = port(value.get("port"));
        return DeclarativeCheckSpec.tcp(
                common.id,
                common.name,
                common.category,
                common.direction,
                host,
                port,
                timeout(value, "connect_timeout_ms"));
    }

    private DeclarativeCheckSpec path(JsonObject value, Common common) {
        only(
                value,
                new String[] {
                    "check_id",
                    "name",
                    "category",
                    "direction",
                    "type",
                    "enabled",
                    "path",
                    "max_age_ms",
                    "configuration_required"
                });
        String path = string(value, "path", true);
        if (path.length() == 0 || path.length() > 4096 || path.indexOf("${secret:") >= 0) {
            throw invalid();
        }
        Long maxAge = longValue(value, "max_age_ms", false);
        if ("BATCH".equals(common.type) && maxAge == null) {
            throw invalid();
        }
        if (maxAge != null
                && (maxAge.longValue() < 1L
                        || maxAge.longValue() > 30L * 24L * 60L * 60L * 1000L)) {
            throw invalid();
        }
        return DeclarativeCheckSpec.path(
                common.id,
                common.name,
                common.category,
                common.direction,
                common.type,
                path,
                maxAge);
    }

    private void validateDisabledCustom(JsonObject value) {
        only(
                value,
                new String[] {
                    "check_id",
                    "name",
                    "category",
                    "direction",
                    "type",
                    "enabled",
                    "implementation",
                    "configuration_required"
                });
        String implementation = string(value, "implementation", true);
        if (implementation.length() == 0 || implementation.length() > 240) {
            throw invalid();
        }
        if (!value.has("configuration_required")
                || value.getAsJsonArray("configuration_required").size() == 0) {
            throw invalid();
        }
    }

    private DeclarativeCheckSpec.Assertion assertion(JsonObject value) {
        only(value, new String[] {"status", "contains", "regex", "json", "xml"});
        JsonArray statuses = array(value, "status", true);
        if (statuses.size() == 0 || statuses.size() > 20) {
            throw invalid();
        }
        List<DeclarativeCheckSpec.StatusRange> ranges =
                new ArrayList<DeclarativeCheckSpec.StatusRange>();
        for (JsonElement status : statuses) {
            ranges.add(statusRange(status));
        }
        String contains = string(value, "contains", false);
        if (contains != null && (contains.length() == 0 || contains.length() > 4096)) {
            throw invalid();
        }
        Pattern regex = safeRegex(string(value, "regex", false));
        DeclarativeCheckSpec.JsonAssertion json =
                value.has("json") ? jsonAssertion(object(value.get("json"))) : null;
        DeclarativeCheckSpec.XmlAssertion xml =
                value.has("xml") ? xmlAssertion(object(value.get("xml"))) : null;
        return new DeclarativeCheckSpec.Assertion(ranges, contains, regex, json, xml);
    }

    private DeclarativeCheckSpec.StatusRange statusRange(JsonElement value) {
        int minimum;
        int maximum;
        try {
            if (value.isJsonPrimitive() && value.getAsJsonPrimitive().isNumber()) {
                minimum = value.getAsInt();
                maximum = minimum;
            } else {
                String[] bounds = value.getAsString().split("-", -1);
                if (bounds.length != 2) {
                    throw invalid();
                }
                minimum = Integer.parseInt(bounds[0]);
                maximum = Integer.parseInt(bounds[1]);
            }
        } catch (RuntimeException error) {
            throw invalid();
        }
        if (minimum < 100 || maximum > 599 || minimum > maximum) {
            throw invalid();
        }
        return new DeclarativeCheckSpec.StatusRange(minimum, maximum);
    }

    private Pattern safeRegex(String value) {
        if (value == null) {
            return null;
        }
        if (value.length() == 0
                || value.length() > 512
                || value.indexOf('(') >= 0
                || value.indexOf(')') >= 0
                || value.indexOf('|') >= 0
                || value.indexOf('{') >= 0
                || value.indexOf('}') >= 0
                || value.matches(".*\\\\[1-9].*")
                || unsafeQuantifiers(value)) {
            throw invalid();
        }
        try {
            return Pattern.compile(value);
        } catch (PatternSyntaxException error) {
            throw invalid();
        }
    }

    private boolean unsafeQuantifiers(String value) {
        int quantifiers = 0;
        int unbounded = 0;
        boolean escaped = false;
        boolean characterClass = false;
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (current == '\\') {
                escaped = true;
                continue;
            }
            if (current == '[') {
                characterClass = true;
            } else if (current == ']') {
                characterClass = false;
            } else if (!characterClass && (current == '*' || current == '+' || current == '?')) {
                quantifiers++;
                if (current == '*' || current == '+') {
                    unbounded++;
                }
            }
        }
        return escaped || characterClass || quantifiers > 4 || unbounded > 1;
    }

    private DeclarativeCheckSpec.JsonAssertion jsonAssertion(JsonObject value) {
        only(value, new String[] {"path", "exists", "equals"});
        String path = string(value, "path", true);
        if (!JSON_PATH.matcher(path).matches()) {
            throw invalid();
        }
        boolean exists = value.has("exists") ? bool(value, "exists", true) : true;
        JsonElement equal = value.has("equals") ? value.get("equals").deepCopy() : null;
        if (equal != null && !exists) {
            throw invalid();
        }
        return new DeclarativeCheckSpec.JsonAssertion(path, exists, equal);
    }

    private DeclarativeCheckSpec.XmlAssertion xmlAssertion(JsonObject value) {
        only(value, new String[] {"element", "exists", "equals"});
        String element = string(value, "element", true);
        if (!XML_ELEMENT.matcher(element).matches()) {
            throw invalid();
        }
        boolean exists = value.has("exists") ? bool(value, "exists", true) : true;
        String equal = string(value, "equals", false);
        if (equal != null && !exists) {
            throw invalid();
        }
        return new DeclarativeCheckSpec.XmlAssertion(element, exists, equal);
    }

    private int timeout(JsonObject value, String key) {
        int timeout = integer(value, key, true);
        if (timeout < 1 || timeout > MAX_TIMEOUT_MS) {
            throw invalid();
        }
        return timeout;
    }

    private String port(JsonElement value) {
        if (value == null || !value.isJsonPrimitive()) {
            throw invalid();
        }
        if (value.getAsJsonPrimitive().isNumber()) {
            long fixed;
            try {
                fixed = value.getAsLong();
                if (Double.compare(value.getAsDouble(), (double) fixed) != 0) {
                    throw invalid();
                }
            } catch (RuntimeException error) {
                throw invalid();
            }
            if (fixed < 1 || fixed > 65535) {
                throw invalid();
            }
            return String.valueOf(fixed);
        }
        if (!value.getAsJsonPrimitive().isString()) {
            throw invalid();
        }
        String configured = value.getAsString();
        if (configured.length() == 0
                || configured.length() > 128
                || configured.indexOf("${secret:") >= 0) {
            throw invalid();
        }
        return configured;
    }

    private Map<String, String> stringMap(JsonObject parent, String key) {
        if (!parent.has(key)) {
            return Collections.emptyMap();
        }
        JsonObject value = object(parent.get(key));
        Map<String, String> result = new LinkedHashMap<String, String>();
        for (Map.Entry<String, JsonElement> entry : value.entrySet()) {
            if (!entry.getValue().isJsonPrimitive()
                    || !entry.getValue().getAsJsonPrimitive().isString()
                    || entry.getKey().length() == 0
                    || entry.getKey().length() > 200) {
                throw invalid();
            }
            result.put(entry.getKey(), entry.getValue().getAsString());
        }
        return result;
    }

    private void configurationRequired(JsonObject value) {
        if (!value.has("configuration_required")) {
            return;
        }
        JsonArray names = array(value, "configuration_required", true);
        if (names.size() == 0 || names.size() > 40) {
            throw invalid();
        }
        Set<String> unique = new HashSet<String>();
        for (JsonElement name : names) {
            if (!name.isJsonPrimitive() || !name.getAsJsonPrimitive().isString()) {
                throw invalid();
            }
            String text = name.getAsString();
            if (text.length() == 0 || text.length() > 160 || !unique.add(text)) {
                throw invalid();
            }
        }
    }

    private boolean lineBreak(String value) {
        return value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0;
    }

    private boolean sensitive(String name) {
        String lower = name.toLowerCase(java.util.Locale.ENGLISH).replace("-", "").replace("_", "");
        return lower.indexOf("authorization") >= 0
                || lower.indexOf("token") >= 0
                || lower.indexOf("apikey") >= 0
                || lower.indexOf("secret") >= 0
                || lower.indexOf("password") >= 0
                || lower.indexOf("servicekey") >= 0
                || lower.indexOf("accesskey") >= 0;
    }

    private boolean containsSensitiveMarker(String value) {
        String lower = value.toLowerCase(java.util.Locale.ENGLISH);
        return lower.indexOf("authorization") >= 0
                || lower.indexOf("token") >= 0
                || lower.indexOf("api_key") >= 0
                || lower.indexOf("apikey") >= 0
                || lower.indexOf("secret") >= 0
                || lower.indexOf("password") >= 0
                || lower.indexOf("servicekey") >= 0
                || lower.indexOf("accesskey") >= 0;
    }

    private String readLimited(Reader input) throws IOException {
        if (input == null) {
            throw invalid();
        }
        StringBuilder value = new StringBuilder();
        char[] buffer = new char[2048];
        int count;
        while ((count = input.read(buffer)) >= 0) {
            if (value.length() + count > MAX_CONFIG_CHARS) {
                throw invalid();
            }
            value.append(buffer, 0, count);
        }
        return value.toString();
    }

    private JsonElement parse(String value) {
        try {
            return new JsonParser().parse(value);
        } catch (RuntimeException error) {
            throw invalid();
        }
    }

    private JsonObject object(JsonElement value) {
        if (value == null || !value.isJsonObject()) {
            throw invalid();
        }
        return value.getAsJsonObject();
    }

    private JsonArray array(JsonObject value, String key, boolean required) {
        if (!value.has(key)) {
            if (required) {
                throw invalid();
            }
            return new JsonArray();
        }
        JsonElement element = value.get(key);
        if (!element.isJsonArray()) {
            throw invalid();
        }
        return element.getAsJsonArray();
    }

    private String string(JsonObject value, String key, boolean required) {
        if (!value.has(key) || value.get(key).isJsonNull()) {
            if (required) {
                throw invalid();
            }
            return null;
        }
        JsonElement element = value.get(key);
        if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
            throw invalid();
        }
        return element.getAsString();
    }

    private boolean bool(JsonObject value, String key, boolean required) {
        if (!value.has(key)) {
            if (required) {
                throw invalid();
            }
            return false;
        }
        JsonElement element = value.get(key);
        if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isBoolean()) {
            throw invalid();
        }
        return element.getAsBoolean();
    }

    private int integer(JsonObject value, String key, boolean required) {
        Long number = longValue(value, key, required);
        if (number == null
                || number.longValue() < Integer.MIN_VALUE
                || number.longValue() > Integer.MAX_VALUE) {
            throw invalid();
        }
        return number.intValue();
    }

    private Long longValue(JsonObject value, String key, boolean required) {
        if (!value.has(key)) {
            if (required) {
                throw invalid();
            }
            return null;
        }
        JsonElement element = value.get(key);
        try {
            if (!element.isJsonPrimitive() || !element.getAsJsonPrimitive().isNumber()) {
                throw invalid();
            }
            long number = element.getAsLong();
            if (Double.compare(element.getAsDouble(), (double) number) != 0) {
                throw invalid();
            }
            return Long.valueOf(number);
        } catch (RuntimeException error) {
            throw invalid();
        }
    }

    private void only(JsonObject value, String[] allowed) {
        Set<String> names = new HashSet<String>();
        Collections.addAll(names, allowed);
        for (Map.Entry<String, JsonElement> entry : value.entrySet()) {
            if (!names.contains(entry.getKey())) {
                throw invalid();
            }
        }
    }

    private void validateDirection(CheckCategory category, CheckDirection direction) {
        boolean internal = category == CheckCategory.INTERNAL && direction == null;
        boolean api = category == CheckCategory.API && direction != null;
        if (!internal && !api) {
            throw invalid();
        }
    }

    private static Set<String> lowerSet(String[] values) {
        Set<String> result = new HashSet<String>();
        Collections.addAll(result, values);
        return Collections.unmodifiableSet(result);
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("INVALID_CHECK_DECLARATION");
    }

    private static final class Common {
        final String id;
        final String name;
        final CheckCategory category;
        final CheckDirection direction;
        final String type;
        final boolean enabled;

        Common(
                String id,
                String name,
                CheckCategory category,
                CheckDirection direction,
                String type,
                boolean enabled) {
            this.id = id;
            this.name = name;
            this.category = category;
            this.direction = direction;
            this.type = type;
            this.enabled = enabled;
        }
    }
}
