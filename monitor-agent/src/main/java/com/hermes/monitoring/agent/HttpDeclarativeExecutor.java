package com.hermes.monitoring.agent;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.Map;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.helpers.DefaultHandler;

// 선언형 HTTP 점검 실행 및 응답 조건 검증
final class HttpDeclarativeExecutor {
    static final int MAX_REQUEST_CHARS = 64 * 1024;
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private final DeclarativeCheckSpec spec;
    private final TemplateResolver resolver;
    private final HttpCheckDetails details;

    HttpDeclarativeExecutor(DeclarativeCheckSpec spec, TemplateResolver resolver) {
        this.spec = spec;
        this.resolver = resolver.forExecution();
        this.details = new HttpCheckDetails(spec);
    }

    // 설정된 HTTP 요청 실행 및 응답 판정 조건 검사
    CheckResult execute(CheckContext context, long started) {
        HttpURLConnection connection = null;
        try {
            URL url = requestUrl();
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setConnectTimeout(boundedTimeout(spec.connectTimeoutMillis, context));
            connection.setReadTimeout(boundedTimeout(spec.readTimeoutMillis, context));
            connection.setRequestMethod(spec.method);
            for (Map.Entry<String, String> header : spec.headers.entrySet()) {
                String resolved = resolver.resolve(header.getValue());
                if (resolved.indexOf('\r') >= 0 || resolved.indexOf('\n') >= 0) {
                    throw new InvalidResolvedUrlException();
                }
                connection.setRequestProperty(header.getKey(), resolved);
                details.request_headers.put(header.getKey(), resolved);
            }
            if (spec.body != null) {
                details.request_body = resolver.resolve(spec.body);
                writeBody(connection, details.request_body, context);
            } else {
                connection.connect();
            }
            connection.setReadTimeout(boundedTimeout(spec.readTimeoutMillis, context));
            int status = connection.getResponseCode();
            details.status_code = status >= 100 && status <= 599 ? Integer.valueOf(status) : null;
            for (String header : new String[] {"Content-Type", "Content-Length", "Location"}) {
                String value = connection.getHeaderField(header);
                if (value != null) {
                    details.response_headers.put(header, value);
                }
            }
            connection.setReadTimeout(boundedTimeout(spec.readTimeoutMillis, context));
            byte[] body = readResponse(connection, status);
            details.response_bytes = Integer.valueOf(body.length);
            String contentType = connection.getContentType();
            details.response_body =
                    contentType == null
                                    || contentType.startsWith("text/")
                                    || contentType.contains("json")
                                    || contentType.contains("xml")
                            ? new String(body, responseCharset(contentType))
                            : "[Binary response omitted]";
            if (!expected(status)) {
                return result("DOWN", "HTTP_STATUS_MISMATCH", started);
            }
            String text = new String(body, responseCharset(contentType));
            if (spec.assertion.contains != null && text.indexOf(spec.assertion.contains) < 0) {
                return result("DOWN", "TEXT_ASSERTION_FAILED", started);
            }
            if (spec.assertion.regex != null && !spec.assertion.regex.matcher(text).find()) {
                return result("DOWN", "REGEX_ASSERTION_FAILED", started);
            }
            if (spec.assertion.json != null && !jsonMatches(text, spec.assertion.json)) {
                return result("DOWN", "JSON_ASSERTION_FAILED", started);
            }
            if (spec.assertion.xml != null && !xmlMatches(body, spec.assertion.xml)) {
                return result("DOWN", "XML_ASSERTION_FAILED", started);
            }
            return result("UP", "HTTP_ASSERTIONS_PASSED", started);
        } catch (TemplateResolver.MissingConfigurationException error) {
            return result("UNKNOWN", "CONFIGURATION_MISSING", started);
        } catch (SocketTimeoutException error) {
            return result("DOWN", "HTTP_TIMEOUT", started);
        } catch (ResponseTooLargeException error) {
            return result("DOWN", "HTTP_RESPONSE_TOO_LARGE", started);
        } catch (InvalidResolvedUrlException error) {
            return result("UNKNOWN", "CONFIGURATION_INVALID", started);
        } catch (java.net.UnknownHostException error) {
            return result("DOWN", "HTTP_DNS_ERROR", started);
        } catch (javax.net.ssl.SSLException error) {
            return result("DOWN", "HTTP_TLS_ERROR", started);
        } catch (java.net.ConnectException error) {
            return result("DOWN", "HTTP_CONNECTION_FAILED", started);
        } catch (Exception error) {
            return result("DOWN", "HTTP_REQUEST_FAILED", started);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    static void validateUrlTemplate(String template) {
        if (template.length() == 0 || template.length() > 4096) {
            throw invalid();
        }
        String candidate = template;
        if (candidate.startsWith("${")) {
            int end = candidate.indexOf('}');
            if (end < 0) {
                throw invalid();
            }
            candidate = "http://configured.invalid" + candidate.substring(end + 1);
        }
        while (candidate.indexOf("${") >= 0) {
            int start = candidate.indexOf("${");
            int end = candidate.indexOf('}', start + 2);
            if (end < 0) {
                throw invalid();
            }
            candidate = candidate.substring(0, start) + "configured" + candidate.substring(end + 1);
        }
        try {
            validateUri(new URI(candidate), false);
        } catch (Exception error) {
            throw invalid();
        }
    }

    private URL requestUrl() throws Exception {
        String base = resolver.resolve(spec.url);
        details.url = base;
        URI uri;
        try {
            uri = new URI(base);
            validateUri(uri, false);
        } catch (Exception error) {
            throw new InvalidResolvedUrlException();
        }
        StringBuilder value = new StringBuilder(base);
        boolean first = true;
        for (Map.Entry<String, String> entry : spec.query.entrySet()) {
            value.append(first ? '?' : '&');
            first = false;
            value.append(URLEncoder.encode(entry.getKey(), "UTF-8"));
            value.append('=');
            String resolved = resolver.resolve(entry.getValue());
            details.request_query.put(entry.getKey(), resolved);
            value.append(URLEncoder.encode(resolved, "UTF-8"));
            if (value.length() > 8192) {
                throw new InvalidResolvedUrlException();
            }
        }
        try {
            URI complete = new URI(value.toString());
            validateUri(complete, true);
            return complete.toURL();
        } catch (Exception error) {
            throw new InvalidResolvedUrlException();
        }
    }

    private static void validateUri(URI uri, boolean queryAllowed) {
        String scheme = uri.getScheme();
        if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || (!queryAllowed && uri.getRawQuery() != null)
                || uri.getRawFragment() != null) {
            throw invalid();
        }
    }

    private void writeBody(HttpURLConnection connection, String body, CheckContext context)
            throws Exception {
        byte[] encoded = body.getBytes(UTF8);
        if (encoded.length > MAX_REQUEST_CHARS) {
            throw new InvalidResolvedUrlException();
        }
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(encoded.length);
        connection.setReadTimeout(boundedTimeout(spec.readTimeoutMillis, context));
        OutputStream output = connection.getOutputStream();
        try {
            output.write(encoded);
        } finally {
            output.close();
        }
    }

    private byte[] readResponse(HttpURLConnection connection, int status) throws Exception {
        InputStream input =
                status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (input == null) {
            return new byte[0];
        }
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int total = 0;
            int count;
            while ((count = input.read(buffer)) >= 0) {
                total += count;
                if (total > MAX_RESPONSE_BYTES) {
                    throw new ResponseTooLargeException();
                }
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        } finally {
            input.close();
        }
    }

    private boolean expected(int status) {
        for (DeclarativeCheckSpec.StatusRange range : spec.assertion.statuses) {
            if (range.contains(status)) {
                return true;
            }
        }
        return false;
    }

    private boolean jsonMatches(String text, DeclarativeCheckSpec.JsonAssertion assertion) {
        try {
            JsonElement current = new JsonParser().parse(text);
            current = jsonPath(current, assertion.path);
            boolean exists = current != null;
            if (exists != assertion.exists) {
                return false;
            }
            return assertion.equal == null || assertion.equal.equals(current);
        } catch (RuntimeException error) {
            return false;
        }
    }

    private JsonElement jsonPath(JsonElement value, String path) {
        int index = 1;
        JsonElement current = value;
        while (index < path.length()) {
            if (path.charAt(index) == '.') {
                int end = index + 1;
                while (end < path.length() && path.charAt(end) != '.' && path.charAt(end) != '[') {
                    end++;
                }
                if (current == null || !current.isJsonObject()) {
                    return null;
                }
                JsonObject object = current.getAsJsonObject();
                String name = path.substring(index + 1, end);
                current = object.has(name) ? object.get(name) : null;
                index = end;
            } else {
                int end = path.indexOf(']', index);
                int item = Integer.parseInt(path.substring(index + 1, end));
                if (current == null || !current.isJsonArray()) {
                    return null;
                }
                JsonArray array = current.getAsJsonArray();
                current = item < array.size() ? array.get(item) : null;
                index = end + 1;
            }
        }
        return current;
    }

    private boolean xmlMatches(byte[] body, DeclarativeCheckSpec.XmlAssertion assertion) {
        try {
            DocumentBuilderFactory factory = secureDocumentBuilderFactory();
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setErrorHandler(new DefaultHandler());
            builder.setEntityResolver(
                    new org.xml.sax.EntityResolver() {
                        public InputSource resolveEntity(String publicId, String systemId) {
                            return new InputSource(new java.io.StringReader(""));
                        }
                    });
            Document document = builder.parse(new ByteArrayInputStream(body));
            NodeList values = document.getElementsByTagName(assertion.element);
            boolean exists = values.getLength() > 0;
            if (exists != assertion.exists) {
                return false;
            }
            if (assertion.equal == null) {
                return true;
            }
            Node node = values.item(0);
            return assertion.equal.equals(node.getTextContent());
        } catch (Exception error) {
            return false;
        }
    }

    private DocumentBuilderFactory secureDocumentBuilderFactory() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        try {
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        } catch (IllegalArgumentException ignored) {
        }
        try {
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        } catch (IllegalArgumentException ignored) {
        }
        return factory;
    }

    private int boundedTimeout(int configured, CheckContext context) throws SocketTimeoutException {
        long remaining = context.getDeadlineMillis() - System.currentTimeMillis();
        if (remaining <= 0L) {
            throw new SocketTimeoutException("deadline");
        }
        return (int) Math.max(1L, Math.min((long) configured, remaining));
    }

    private CheckResult result(String status, String code, long started) {
        return new CheckResult(
                spec.id,
                spec.category.name(),
                status,
                Math.max(0L, System.currentTimeMillis() - started),
                code,
                code,
                UtcClock.now(),
                details.sanitized(resolver));
    }

    private Charset responseCharset(String contentType) {
        if (contentType != null) {
            for (String part : contentType.split(";")) {
                String value = part.trim();
                if (value.toLowerCase(java.util.Locale.ENGLISH).startsWith("charset=")) {
                    try {
                        return Charset.forName(value.substring(8).replace("\"", ""));
                    } catch (RuntimeException ignored) {
                        return UTF8;
                    }
                }
            }
        }
        return UTF8;
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("INVALID_CHECK_DECLARATION");
    }

    private static final class ResponseTooLargeException extends IOException {
        private static final long serialVersionUID = 1L;
    }

    private static final class InvalidResolvedUrlException extends Exception {
        private static final long serialVersionUID = 1L;
    }
}
