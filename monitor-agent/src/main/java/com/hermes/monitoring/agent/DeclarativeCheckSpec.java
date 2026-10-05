package com.hermes.monitoring.agent;

import com.google.gson.JsonElement;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

// 선언형 점검의 요청 및 판정 조건 정의
final class DeclarativeCheckSpec {
    final String id;
    final String name;
    final CheckCategory category;
    final CheckDirection direction;
    final String type;
    final String method;
    final String url;
    final Map<String, String> query;
    final Map<String, String> headers;
    final String body;
    final int connectTimeoutMillis;
    final int readTimeoutMillis;
    final Assertion assertion;
    final String host;
    final String port;
    final String path;
    final Long maxAgeMillis;

    private DeclarativeCheckSpec(
            String id,
            String name,
            CheckCategory category,
            CheckDirection direction,
            String type,
            String method,
            String url,
            Map<String, String> query,
            Map<String, String> headers,
            String body,
            int connectTimeoutMillis,
            int readTimeoutMillis,
            Assertion assertion,
            String host,
            String port,
            String path,
            Long maxAgeMillis) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.direction = direction;
        this.type = type;
        this.method = method;
        this.url = url;
        this.query = query;
        this.headers = headers;
        this.body = body;
        this.connectTimeoutMillis = connectTimeoutMillis;
        this.readTimeoutMillis = readTimeoutMillis;
        this.assertion = assertion;
        this.host = host;
        this.port = port;
        this.path = path;
        this.maxAgeMillis = maxAgeMillis;
    }

    static DeclarativeCheckSpec http(
            String id,
            String name,
            CheckCategory category,
            CheckDirection direction,
            String method,
            String url,
            Map<String, String> query,
            Map<String, String> headers,
            String body,
            int connectTimeoutMillis,
            int readTimeoutMillis,
            Assertion assertion) {
        return new DeclarativeCheckSpec(
                id,
                name,
                category,
                direction,
                "HTTP",
                method,
                url,
                query,
                headers,
                body,
                connectTimeoutMillis,
                readTimeoutMillis,
                assertion,
                null,
                null,
                null,
                null);
    }

    static DeclarativeCheckSpec tcp(
            String id,
            String name,
            CheckCategory category,
            CheckDirection direction,
            String host,
            String port,
            int connectTimeoutMillis) {
        return new DeclarativeCheckSpec(
                id,
                name,
                category,
                direction,
                "TCP",
                null,
                null,
                Collections.<String, String>emptyMap(),
                Collections.<String, String>emptyMap(),
                null,
                connectTimeoutMillis,
                0,
                null,
                host,
                port,
                null,
                null);
    }

    static DeclarativeCheckSpec path(
            String id,
            String name,
            CheckCategory category,
            CheckDirection direction,
            String type,
            String path,
            Long maxAgeMillis) {
        return new DeclarativeCheckSpec(
                id,
                name,
                category,
                direction,
                type,
                null,
                null,
                Collections.<String, String>emptyMap(),
                Collections.<String, String>emptyMap(),
                null,
                0,
                0,
                null,
                null,
                null,
                path,
                maxAgeMillis);
    }

    static final class Assertion {
        final List<StatusRange> statuses;
        final String contains;
        final Pattern regex;
        final JsonAssertion json;
        final XmlAssertion xml;

        Assertion(
                List<StatusRange> statuses,
                String contains,
                Pattern regex,
                JsonAssertion json,
                XmlAssertion xml) {
            this.statuses = statuses;
            this.contains = contains;
            this.regex = regex;
            this.json = json;
            this.xml = xml;
        }
    }

    static final class StatusRange {
        final int minimum;
        final int maximum;

        StatusRange(int minimum, int maximum) {
            this.minimum = minimum;
            this.maximum = maximum;
        }

        boolean contains(int status) {
            return status >= minimum && status <= maximum;
        }
    }

    static final class JsonAssertion {
        final String path;
        final boolean exists;
        final JsonElement equal;

        JsonAssertion(String path, boolean exists, JsonElement equal) {
            this.path = path;
            this.exists = exists;
            this.equal = equal;
        }
    }

    static final class XmlAssertion {
        final String element;
        final boolean exists;
        final String equal;

        XmlAssertion(String element, boolean exists, String equal) {
            this.element = element;
            this.exists = exists;
            this.equal = equal;
        }
    }
}
