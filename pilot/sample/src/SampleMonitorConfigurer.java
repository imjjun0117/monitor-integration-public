package sample.monitoring;

import com.hermes.monitoring.agent.DeclarativeCheckLoader;
import com.hermes.monitoring.agent.EnvironmentSecretProvider;
import com.hermes.monitoring.agent.MonitorAgentBuilder;
import com.hermes.monitoring.agent.MonitorAgentConfigurer;
import com.hermes.monitoring.agent.MonitorCheck;
import com.hermes.monitoring.agent.SecretProvider;
import java.io.File;
import java.io.InputStream;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.servlet.ServletContext;

public final class SampleMonitorConfigurer implements MonitorAgentConfigurer {
    private static final String DEFAULT_CHECK_RESOURCE = "/WEB-INF/monitor-checks.json";

    public SampleMonitorConfigurer() { }

    public void configure(MonitorAgentBuilder builder, final ServletContext context)
            throws Exception {
        builder.identity(value(context, "monitor.project-id", "sample"),
                value(context, "monitor.instance-id", "local-01"))
            .token(requiredToken(context))
            .disk("data", value(context, "monitor.disk.data.path", "/data"),
                new File(value(context, "monitor.disk.data.path", "/data")));

        Object pool = context.getAttribute("dataSource");
        if (pool != null) builder.dbPool(new Dbcp1PoolAdapter(pool));

        InputStream declarations = declarations(context);
        try {
            DeclarativeCheckLoader loader = new DeclarativeCheckLoader(
                nonSecretProperties(context), secretProvider(context));
            List<MonitorCheck> checks = loader.load(declarations);
            for (MonitorCheck check : checks) builder.check(check);
        } finally {
            declarations.close();
        }
    }

    private InputStream declarations(ServletContext context) {
        String location = value(context, "monitor.checks.resource", DEFAULT_CHECK_RESOURCE);
        InputStream input = location.startsWith("/")
            ? context.getResourceAsStream(location) : null;
        if (input == null) {
            ClassLoader loader = Thread.currentThread().getContextClassLoader();
            input = loader == null ? null : loader.getResourceAsStream(stripLeadingSlash(location));
        }
        if (input == null) throw new IllegalStateException("CHECK_CONFIG_MISSING");
        return input;
    }

    private Map<String, String> nonSecretProperties(ServletContext context) {
        Map<String, String> values = new LinkedHashMap<String, String>();
        Enumeration<?> names = context.getInitParameterNames();
        while (names != null && names.hasMoreElements()) {
            String name = String.valueOf(names.nextElement());
            String value = context.getInitParameter(name);
            if (value != null && !sensitive(name)) values.put(name, value);
        }
        putDefault(values, "monitor.disk.data.path", "/data");
        return values;
    }

    private SecretProvider secretProvider(final ServletContext context) {
        final SecretProvider environment = new EnvironmentSecretProvider();
        return new SecretProvider() {
            public String getSecret(String name) {
                Object injected = context.getAttribute("monitor.secret." + name);
                if (injected instanceof char[]) return new String((char[]) injected);
                if (injected instanceof CharSequence) return injected.toString();
                return environment.getSecret(name);
            }
        };
    }

    private String requiredToken(ServletContext context) {
        String token = context.getInitParameter("monitor.token");
        if (token == null || token.length() < 32) {
            throw new IllegalStateException("TOKEN_MISSING");
        }
        return token;
    }

    private String value(ServletContext context, String name, String fallback) {
        String configured = context.getInitParameter(name);
        return configured == null || configured.length() == 0 ? fallback : configured;
    }

    private boolean sensitive(String name) {
        String lower = name.toLowerCase(Locale.ENGLISH);
        return lower.indexOf("token") >= 0 || lower.indexOf("secret") >= 0
            || lower.indexOf("password") >= 0 || lower.indexOf("authorization") >= 0
            || lower.indexOf("apikey") >= 0 || lower.indexOf("api-key") >= 0
            || lower.indexOf("api_key") >= 0 || lower.indexOf("servicekey") >= 0
            || lower.indexOf("accesskey") >= 0;
    }

    private String stripLeadingSlash(String value) {
        return value.startsWith("/") ? value.substring(1) : value;
    }

    private void putDefault(Map<String, String> values, String name, String fallback) {
        if (!values.containsKey(name)) values.put(name, fallback);
    }
}
