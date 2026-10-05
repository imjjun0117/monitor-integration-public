package com.hermes.monitoring.center.collection;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

// 제한된 크기로 에이전트 HTTP 응답 분석
final class HttpResponseParser {
    static final int MAX_BODY_BYTES = 1024 * 1024;
    private static final int MAX_HEADER_BYTES = 64 * 1024;
    private static final String HEADER_NAME = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";

    byte[] read(InputStream rawInput, int expectedStatus) throws IOException {
        BufferedInputStream input = new BufferedInputStream(rawInput);
        LineReader lines = new LineReader(input);
        int status = readStatus(lines);
        Map<String, String> headers = readHeaders(lines);
        validateStatus(status, expectedStatus);

        String transferEncoding = headers.get("transfer-encoding");
        String contentLength = headers.get("content-length");
        if (transferEncoding != null && contentLength != null) {
            throw protocolError();
        }
        if (transferEncoding != null) {
            if (!"chunked".equalsIgnoreCase(transferEncoding)) {
                throw protocolError();
            }
            return readChunked(input);
        }
        if (contentLength != null) {
            return readContentLength(input, contentLength);
        }
        return readToEnd(input);
    }

    private int readStatus(LineReader lines) throws IOException {
        String statusLine = lines.readLine();
        if (statusLine == null
                || !statusLine.matches("HTTP/1\\.[01] [1-5][0-9]{2}( [\\t\\x20-\\x7e]*)?")) {
            throw protocolError();
        }
        return Integer.parseInt(statusLine.substring(9, 12));
    }

    private Map<String, String> readHeaders(LineReader lines) throws IOException {
        Map<String, String> headers = new LinkedHashMap<>();
        String line;
        while ((line = lines.readLine()) != null && !line.isEmpty()) {
            int separator = line.indexOf(':');
            if (separator <= 0) {
                throw protocolError();
            }
            String name = line.substring(0, separator);
            String rawValue = line.substring(separator + 1);
            if (!name.matches(HEADER_NAME) || containsInvalidHeaderValue(rawValue)) {
                throw protocolError();
            }
            String normalizedName = name.toLowerCase(Locale.ROOT);
            if (headers.putIfAbsent(normalizedName, rawValue.trim()) != null) {
                throw protocolError();
            }
        }
        if (line == null) {
            throw protocolError();
        }
        return headers;
    }

    private boolean containsInvalidHeaderValue(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if ((character < 0x20 && character != '\t') || character == 0x7f) {
                return true;
            }
        }
        return false;
    }

    private void validateStatus(int status, int expectedStatus) throws AgentClientException {
        if (status >= 300 && status < 400) {
            throw new AgentClientException("REDIRECT_REJECTED");
        }
        if (status == 401) {
            throw new AgentClientException("AUTH_ERROR");
        }
        if (status != expectedStatus) {
            throw protocolError();
        }
    }

    private byte[] readContentLength(InputStream input, String value) throws IOException {
        if (!value.matches("[0-9]+")) {
            throw protocolError();
        }
        final long length;
        try {
            length = Long.parseLong(value);
        } catch (NumberFormatException error) {
            throw protocolError();
        }
        if (length > MAX_BODY_BYTES) {
            throw new AgentClientException("RESPONSE_TOO_LARGE");
        }
        return readFixed(input, (int) length);
    }

    private byte[] readChunked(BufferedInputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        LineReader lines = new LineReader(input);
        while (true) {
            String sizeLine = lines.readLine();
            if (sizeLine == null) {
                throw protocolError();
            }
            int extension = sizeLine.indexOf(';');
            if (extension >= 0) {
                throw protocolError();
            }
            String sizeValue = sizeLine;
            if (!sizeValue.matches("[0-9A-Fa-f]+")) {
                throw protocolError();
            }
            long size = parseChunkSize(sizeValue);
            if (size > MAX_BODY_BYTES || output.size() + size > MAX_BODY_BYTES) {
                throw new AgentClientException("RESPONSE_TOO_LARGE");
            }
            if (size == 0) {
                readHeaders(lines);
                return output.toByteArray();
            }
            output.write(readFixed(input, (int) size));
            if (input.read() != '\r' || input.read() != '\n') {
                throw protocolError();
            }
        }
    }

    private long parseChunkSize(String value) throws AgentClientException {
        try {
            return Long.parseLong(value, 16);
        } catch (NumberFormatException error) {
            if (value.length() > 8) {
                throw new AgentClientException("RESPONSE_TOO_LARGE");
            }
            throw protocolError();
        }
    }

    private byte[] readFixed(InputStream input, int length) throws IOException {
        byte[] body = new byte[length];
        int offset = 0;
        while (offset < length) {
            int read = input.read(body, offset, length - offset);
            if (read == -1) {
                throw protocolError();
            }
            offset += read;
        }
        return body;
    }

    private byte[] readToEnd(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (output.size() + (long) read > MAX_BODY_BYTES) {
                throw new AgentClientException("RESPONSE_TOO_LARGE");
            }
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private AgentClientException protocolError() {
        return new AgentClientException("AGENT_HTTP_ERROR");
    }

    private static final class LineReader {
        private final InputStream input;
        private int bytesRead;

        private LineReader(InputStream input) {
            this.input = input;
        }

        private String readLine() throws IOException {
            ByteArrayOutputStream line = new ByteArrayOutputStream();
            int previous = -1;
            while (true) {
                int current = input.read();
                if (current == -1) {
                    return null;
                }
                bytesRead++;
                if (bytesRead > MAX_HEADER_BYTES) {
                    throw new AgentClientException("AGENT_HTTP_ERROR");
                }
                if (previous == '\r' && current == '\n') {
                    byte[] bytes = line.toByteArray();
                    return new String(bytes, 0, bytes.length - 1, StandardCharsets.US_ASCII);
                }
                line.write(current);
                previous = current;
            }
        }
    }
}
