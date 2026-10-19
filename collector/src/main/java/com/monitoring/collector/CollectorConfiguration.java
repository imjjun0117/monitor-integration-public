package com.monitoring.collector;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import javax.servlet.ServletContext;

// 공통 설정 조회 및 프로젝트 확장 없이 기본 Collector 구성
public final class CollectorConfiguration {
    private final Properties values = new Properties();

    public CollectorConfiguration(ServletContext context, String location) throws Exception {
        if (location == null || location.trim().length() == 0) {
            return;
        }
        InputStream input =
                location.startsWith("/WEB-INF/")
                        ? context.getResourceAsStream(location)
                        : new FileInputStream(location);
        if (input == null) {
            throw new FileNotFoundException("MONITOR_CONFIG_UNAVAILABLE");
        }
        try {
            values.load(input);
        } finally {
            input.close();
        }
    }

    public String get(String key, String fallback) {
        return values.getProperty(key, fallback).trim();
    }

    // 프로젝트 Configurer에서 전달한 공통 설정 적용
    public void override(Map<String, String> configuration) {
        values.putAll(configuration);
    }

    public void configure(MonitorCollectorBuilder builder, ServletContext context)
            throws Exception {
        builder.identity(get("monitor.project-id", ""), get("monitor.instance-id", ""));
        builder.token(get("monitor.token", ""));
        for (String name : new String[] {"webapp", "attachments"}) {
            String path = get("monitor.disk." + name + ".path", "");
            if (path.length() > 0) {
                builder.disk(name, get("monitor.disk." + name + ".name", name), new File(path));
            }
        }
        String declarations = get("monitor.checks.resource", "");
        if (declarations.length() > 0) {
            InputStream input = context.getResourceAsStream(declarations);
            if (input == null) {
                throw new FileNotFoundException("CHECK_CONFIG_UNAVAILABLE");
            }
            Map<String, String> properties = new LinkedHashMap<String, String>();
            for (String key : values.stringPropertyNames()) {
                properties.put(key, values.getProperty(key));
            }
            try {
                for (MonitorCheck check :
                        new DeclarativeCheckLoader(properties, new EnvironmentSecretProvider())
                                .load(input)) {
                    builder.check(check);
                }
            } finally {
                input.close();
            }
        }
    }

    public String websocketUrl() throws Exception {
        String value = get("monitor.central.url", "");
        if (value.length() == 0) {
            return "";
        }
        URI uri = new URI(value);
        boolean local =
                Boolean.parseBoolean(get("monitor.websocket.allow-local-ws", "false"))
                        && "ws".equals(uri.getScheme())
                        && ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()));
        if ((!"wss".equals(uri.getScheme()) && !local)
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getQuery() != null
                || uri.getFragment() != null) {
            throw new IllegalArgumentException("INVALID_CENTRAL_URL");
        }
        return value;
    }
}
