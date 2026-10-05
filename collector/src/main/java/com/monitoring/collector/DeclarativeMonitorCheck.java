package com.monitoring.collector;

import java.io.File;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;

// 선언형 설정을 이용한 점검 실행
final class DeclarativeMonitorCheck implements DirectionalMonitorCheck {
    private static final long FUTURE_TOLERANCE_MS = 5L * 60L * 1000L;
    private final DeclarativeCheckSpec spec;
    private final TemplateResolver resolver;

    DeclarativeMonitorCheck(DeclarativeCheckSpec spec, TemplateResolver resolver) {
        this.spec = spec;
        this.resolver = resolver;
    }

    public String getId() {
        return spec.id;
    }

    public String getName() {
        return spec.name;
    }

    public CheckCategory getCategory() {
        return spec.category;
    }

    public CheckDirection getDirection() {
        return spec.direction;
    }

    public CheckResult execute(CheckContext context) {
        long started = System.currentTimeMillis();
        try {
            if (remaining(context) <= 0) {
                return result("DOWN", "CHECK_DEADLINE_EXCEEDED", started);
            }
            if ("HTTP".equals(spec.type)) {
                return new HttpDeclarativeExecutor(spec, resolver).execute(context, started);
            }
            if ("TCP".equals(spec.type)) {
                return tcp(context, started);
            }
            return path(started);
        } catch (TemplateResolver.MissingConfigurationException error) {
            return result("DOWN", "CONFIGURATION_MISSING", started);
        } catch (SocketTimeoutException error) {
            return result("DOWN", "TCP_TIMEOUT", started);
        } catch (Exception error) {
            String code = "TCP".equals(spec.type) ? "TCP_CONNECTION_FAILED" : "PATH_CHECK_FAILED";
            return result("DOWN", code, started);
        }
    }

    private CheckResult tcp(CheckContext context, long started) throws Exception {
        String host = resolver.resolve(spec.host);
        if (host.length() == 0
                || host.length() > 253
                || host.indexOf('/') >= 0
                || containsWhitespace(host)) {
            return result("DOWN", "CONFIGURATION_INVALID", started);
        }
        int port;
        try {
            port = Integer.parseInt(resolver.resolve(spec.port));
        } catch (NumberFormatException error) {
            return result("DOWN", "CONFIGURATION_INVALID", started);
        }
        if (port < 1 || port > 65535) {
            return result("DOWN", "CONFIGURATION_INVALID", started);
        }
        Socket socket = new Socket();
        try {
            socket.connect(
                    new InetSocketAddress(host, port),
                    boundedTimeout(spec.connectTimeoutMillis, context));
            return result("UP", "TCP_CONNECTED", started);
        } finally {
            try {
                socket.close();
            } catch (Exception ignored) {
            }
        }
    }

    private CheckResult path(long started) throws Exception {
        File value = new File(resolver.resolve(spec.path));
        if ("FILE".equals(spec.type)) {
            if (!value.isFile() || !value.canRead()) {
                return result("DOWN", "FILE_MISSING", started);
            }
            if (stale(value)) {
                return result("DOWN", "FILE_STALE", started);
            }
            return result("UP", "FILE_PRESENT", started);
        }
        if ("DIRECTORY".equals(spec.type)) {
            if (!value.isDirectory() || !value.canRead()) {
                return result("DOWN", "DIRECTORY_MISSING", started);
            }
            if (stale(value)) {
                return result("DOWN", "DIRECTORY_STALE", started);
            }
            return result("UP", "DIRECTORY_PRESENT", started);
        }
        if (!value.isFile() || !value.canRead() || value.lastModified() <= 0L) {
            return result("DOWN", "BATCH_MARKER_MISSING", started);
        }
        long age = System.currentTimeMillis() - value.lastModified();
        if (age < -FUTURE_TOLERANCE_MS) {
            return result("DOWN", "BATCH_TIME_INVALID", started);
        }
        if (age > spec.maxAgeMillis.longValue()) {
            return result("DOWN", "BATCH_STALE", started);
        }
        return result("UP", "BATCH_FRESH", started);
    }

    private boolean stale(File value) {
        if (spec.maxAgeMillis == null) {
            return false;
        }
        long modified = value.lastModified();
        return modified <= 0L
                || System.currentTimeMillis() - modified > spec.maxAgeMillis.longValue();
    }

    private int boundedTimeout(int configured, CheckContext context) throws SocketTimeoutException {
        long remaining = remaining(context);
        if (remaining <= 0L) {
            throw new SocketTimeoutException("deadline");
        }
        return (int) Math.max(1L, Math.min((long) configured, remaining));
    }

    private long remaining(CheckContext context) {
        return context.getDeadlineMillis() - System.currentTimeMillis();
    }

    private boolean containsWhitespace(String value) {
        for (int index = 0; index < value.length(); index++) {
            if (Character.isWhitespace(value.charAt(index))) {
                return true;
            }
        }
        return false;
    }

    private CheckResult result(String status, String code, long started) {
        return new CheckResult(
                spec.id,
                spec.category.name(),
                status,
                Math.max(0L, System.currentTimeMillis() - started),
                code,
                code,
                UtcClock.now());
    }
}
