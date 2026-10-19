package com.monitoring.collector;

import java.io.ByteArrayInputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import javax.servlet.ServletContext;
import org.junit.Test;
import static org.junit.Assert.*;

public class CollectorConfigurationTest {
    @Test
    public void projectPropertiesProvideTransportWithoutAnotherFileAndExcludeSecrets()
            throws Exception {
        java.util.Properties properties = new java.util.Properties();
        properties.setProperty(
                "monitor.central.url", "wss://monitor.example.com/collector/connect");
        properties.setProperty("monitor.log.allowed-roots", "/var/log/tomcat");
        properties.setProperty("checking.token", "private-project-token");
        MonitorCollectorBuilder builder = new MonitorCollectorBuilder().configuration(properties);
        CollectorConfiguration configuration = new CollectorConfiguration(null, null);
        configuration.override(builder.configuration());
        assertEquals("wss://monitor.example.com/collector/connect", configuration.websocketUrl());
        assertEquals("/var/log/tomcat", configuration.get("monitor.log.allowed-roots", ""));
        assertFalse(builder.configuration().containsKey("checking.token"));
        properties.setProperty("monitor.central.url", "ws://remote.example/collector/connect");
        configuration.override(
                new MonitorCollectorBuilder().configuration(properties).configuration());
        try {
            configuration.websocketUrl();
            fail("Unencrypted remote WebSocket must be rejected");
        } catch (IllegalArgumentException expected) {
            assertEquals("INVALID_CENTRAL_URL", expected.getMessage());
        }
    }

    @Test
    public void applicationAttributesRemainIsolatedBetweenRuntimes() {
        MonitorRuntime first =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "dev")
                        .token("01234567890123456789012345678901")
                        .attributes("development", "/sample")
                        .build();
        MonitorRuntime second =
                new MonitorCollectorBuilder()
                        .identity("sample-b", "prod")
                        .token("01234567890123456789012345678901")
                        .attributes("production", "")
                        .build();
        try {
            java.util.Map<?, ?> attributes = (java.util.Map<?, ?>) first.info().get("attributes");
            assertEquals("development", attributes.get("environment"));
            assertEquals("/sample", attributes.get("context_path"));
            assertEquals(
                    "production",
                    ((java.util.Map<?, ?>) second.info().get("attributes")).get("environment"));
        } finally {
            first.shutdown();
            second.shutdown();
        }
    }

    @Test
    public void loadsWebInfPropertiesWithoutProjectJavaAndKeepsTransportIdle() throws Exception {
        CollectorConfiguration config =
                configuration(
                        "monitor.project-id=sample-a\n"
                                + "monitor.instance-id=prod\nmonitor.token=01234567890123456789012345678901\n"
                                + "monitor.central.url=wss://monitor.example.com/collector/connect\n");
        MonitorCollectorBuilder builder = new MonitorCollectorBuilder();
        config.configure(builder, null);
        MonitorRuntime runtime = builder.build();
        try {
            assertEquals("wss://monitor.example.com/collector/connect", config.websocketUrl());
            assertTrue(runtime.isAuthorized("01234567890123456789012345678901"));
            CollectorConnection connection =
                    new CollectorConnection(runtime, new LogReader(""), config.websocketUrl());
            assertEquals("IDLE", connection.status().get("state"));
            assertFalse(connection.isXlogEnabled());
            connection.destroy();
        } finally {
            runtime.shutdown();
        }
    }

    @Test
    public void plaintextRemoteUrlAndEmbeddedCredentialsAreRejected() throws Exception {
        for (String url :
                new String[] {
                    "ws://monitor.example.com/collector/connect",
                    "wss://user:secret@monitor.example.com/collector/connect",
                    "wss://monitor.example.com/collector/connect?token=secret"
                }) {
            try {
                configuration("monitor.central.url=" + url).websocketUrl();
                fail("Unsafe transport URL accepted");
            } catch (IllegalArgumentException expected) {
                assertEquals("INVALID_CENTRAL_URL", expected.getMessage());
            }
        }
    }

    private CollectorConfiguration configuration(final String text) throws Exception {
        ServletContext context =
                (ServletContext)
                        Proxy.newProxyInstance(
                                getClass().getClassLoader(),
                                new Class<?>[] {ServletContext.class},
                                new InvocationHandler() {
                                    public Object invoke(Object proxy, Method method, Object[] args)
                                            throws Exception {
                                        if ("getResourceAsStream".equals(method.getName())) {
                                            assertEquals(
                                                    "/WEB-INF/dcp/properties/monitor.properties",
                                                    args[0]);
                                            return new ByteArrayInputStream(
                                                    text.getBytes("ISO-8859-1"));
                                        }
                                        return null;
                                    }
                                });
        return new CollectorConfiguration(context, "/WEB-INF/dcp/properties/monitor.properties");
    }
}
