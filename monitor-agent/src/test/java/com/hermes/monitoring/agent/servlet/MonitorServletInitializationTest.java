package com.hermes.monitoring.agent.servlet;

import com.hermes.monitoring.agent.MonitorAgentBuilder;
import com.hermes.monitoring.agent.MonitorAgentConfigurer;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.FileNotFoundException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.ArrayList;
import java.util.List;
import javax.servlet.ServletConfig;
import javax.servlet.ServletContext;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class MonitorServletInitializationTest {
    private static final String PRIVATE_DETAIL = "private-credential-and-path-must-not-be-in-json";

    @Test
    public void missingConfigurerIdentifiesTheClassFailureAndLogsTheException() throws Exception {
        verify(
                "not.present.MonitorConfigurer",
                "INIT_FAILED",
                "CONFIGURER_CLASS_NOT_FOUND",
                ClassNotFoundException.class);
    }

    @Test
    public void unreadableConfigurationKeepsDetailsInServerLogsOnly() throws Exception {
        verify(
                MissingFileConfigurer.class.getName(),
                "INIT_FAILED",
                "CONFIG_FILE_UNAVAILABLE",
                FileNotFoundException.class);
    }

    @Test
    public void missingDependencyReturnsJsonInsteadOfAnUncaughtLinkageError() throws Exception {
        verify(
                MissingDependencyConfigurer.class.getName(),
                "INIT_FAILED",
                "CLASS_DEPENDENCY_MISSING",
                NoClassDefFoundError.class);
    }

    @Test
    public void unsupportedBytecodeIdentifiesTheJavaVersion() throws Exception {
        verify(
                UnsupportedJavaConfigurer.class.getName(),
                "INIT_FAILED",
                "JAVA_VERSION_UNSUPPORTED",
                UnsupportedClassVersionError.class);
    }

    @Test
    public void shortTokenRetainsTheExistingErrorCode() throws Exception {
        verify(
                ShortTokenConfigurer.class.getName(),
                "TOKEN_TOO_SHORT",
                "TOKEN_TOO_SHORT",
                IllegalStateException.class);
    }

    @Test
    public void missingConfigurationLocationIsSpecific() throws Exception {
        verify(
                MissingLocationConfigurer.class.getName(),
                "INIT_FAILED",
                "CONFIG_LOCATION_UNAVAILABLE",
                IllegalStateException.class);
    }

    @Test
    public void unexpectedInitializerErrorsAreLoggedWithoutDisclosingMessages() throws Exception {
        verify(
                UnexpectedFailureConfigurer.class.getName(),
                "INIT_FAILED",
                "INITIALIZATION_EXCEPTION",
                NullPointerException.class);
    }

    @Test
    public void configurerInTheWebApplicationIsVisibleWhenSdkIsInParentLoader() throws Exception {
        final String configurer = MissingFileConfigurer.class.getName();
        URLClassLoader sdkLoader =
                new URLClassLoader(
                        new URL[] {
                            MonitorServlet.class
                                    .getProtectionDomain()
                                    .getCodeSource()
                                    .getLocation(),
                            JsonParser.class.getProtectionDomain().getCodeSource().getLocation(),
                            ServletConfig.class.getProtectionDomain().getCodeSource().getLocation()
                        },
                        null);
        URLClassLoader appLoader =
                new URLClassLoader(
                        new URL[] {getClass().getProtectionDomain().getCodeSource().getLocation()},
                        sdkLoader);
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        Object servlet = null;
        try {
            try {
                Class.forName(configurer, false, sdkLoader);
                fail("The SDK parent loader must not see web application classes");
            } catch (ClassNotFoundException expected) {
            }
            Thread.currentThread().setContextClassLoader(appLoader);
            final List<Throwable> logged = new ArrayList<Throwable>();
            final Class<?> contextType = sdkLoader.loadClass(ServletContext.class.getName());
            final Object context =
                    Proxy.newProxyInstance(
                            sdkLoader,
                            new Class<?>[] {contextType},
                            new InvocationHandler() {
                                public Object invoke(Object proxy, Method method, Object[] args) {
                                    if ("log".equals(method.getName())
                                            && args.length == 2
                                            && args[1] instanceof Throwable) {
                                        logged.add((Throwable) args[1]);
                                    }
                                    return null;
                                }
                            });
            Class<?> configType = sdkLoader.loadClass(ServletConfig.class.getName());
            Object config =
                    Proxy.newProxyInstance(
                            sdkLoader,
                            new Class<?>[] {configType},
                            new InvocationHandler() {
                                public Object invoke(Object proxy, Method method, Object[] args) {
                                    if ("getServletContext".equals(method.getName())) {
                                        return context;
                                    }
                                    if ("getInitParameter".equals(method.getName())) {
                                        return configurer;
                                    }
                                    return null;
                                }
                            });
            Class<?> servletType = sdkLoader.loadClass(MonitorServlet.class.getName());
            servlet = servletType.newInstance();
            servletType.getMethod("init", configType).invoke(servlet, config);
            final StringWriter body = new StringWriter();
            Class<?> responseType = sdkLoader.loadClass(HttpServletResponse.class.getName());
            Object response =
                    Proxy.newProxyInstance(
                            sdkLoader,
                            new Class<?>[] {responseType},
                            new InvocationHandler() {
                                public Object invoke(Object proxy, Method method, Object[] args) {
                                    if ("getWriter".equals(method.getName())) {
                                        return new PrintWriter(body);
                                    }
                                    return null;
                                }
                            });
            Method service =
                    servletType.getDeclaredMethod(
                            "service",
                            sdkLoader.loadClass(HttpServletRequest.class.getName()),
                            responseType);
            service.setAccessible(true);
            service.invoke(servlet, null, response);
            JsonObject json = new JsonParser().parse(body.toString()).getAsJsonObject();
            assertEquals("CONFIG_FILE_UNAVAILABLE", json.get("reason").getAsString());
            assertEquals(1, logged.size());
            assertTrue(logged.get(0) instanceof FileNotFoundException);
        } finally {
            if (servlet != null) {
                servlet.getClass().getMethod("destroy").invoke(servlet);
            }
            Thread.currentThread().setContextClassLoader(previous);
            appLoader.close();
            sdkLoader.close();
        }
    }

    @Test
    public void absentContextClassLoaderRetainsTheSdkLoaderFallback() throws Exception {
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        try {
            Thread.currentThread().setContextClassLoader(null);
            verify(
                    MissingFileConfigurer.class.getName(),
                    "INIT_FAILED",
                    "CONFIG_FILE_UNAVAILABLE",
                    FileNotFoundException.class);
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
    }

    private void verify(final String configurer, String code, String reason, Class<?> exceptionType)
            throws Exception {
        final List<Throwable> logged = new ArrayList<Throwable>();
        final ServletContext context =
                (ServletContext)
                        Proxy.newProxyInstance(
                                ServletContext.class.getClassLoader(),
                                new Class<?>[] {ServletContext.class},
                                new InvocationHandler() {
                                    public Object invoke(
                                            Object proxy, Method method, Object[] args) {
                                        if ("log".equals(method.getName())
                                                && args.length == 2
                                                && args[1] instanceof Throwable) {
                                            assertTrue(
                                                    ((String) args[0])
                                                            .startsWith(
                                                                    "Monitor agent initialization failed ["));
                                            logged.add((Throwable) args[1]);
                                        }
                                        return null;
                                    }
                                });
        ServletConfig config =
                new ServletConfig() {
                    public String getServletName() {
                        return "monitor";
                    }

                    public ServletContext getServletContext() {
                        return context;
                    }

                    public String getInitParameter(String name) {
                        return "configurerClass".equals(name) ? configurer : null;
                    }

                    public java.util.Enumeration<String> getInitParameterNames() {
                        return java.util.Collections.enumeration(
                                java.util.Collections.singleton("configurerClass"));
                    }
                };
        final StringWriter body = new StringWriter();
        final int[] status = {200};
        HttpServletResponse response =
                (HttpServletResponse)
                        Proxy.newProxyInstance(
                                HttpServletResponse.class.getClassLoader(),
                                new Class<?>[] {HttpServletResponse.class},
                                new InvocationHandler() {
                                    public Object invoke(
                                            Object proxy, Method method, Object[] args) {
                                        if ("getWriter".equals(method.getName())) {
                                            return new PrintWriter(body);
                                        }
                                        if ("setStatus".equals(method.getName())) {
                                            status[0] = ((Integer) args[0]).intValue();
                                        }
                                        return null;
                                    }
                                });
        MonitorServlet servlet = new MonitorServlet();
        servlet.init(config);
        try {
            servlet.service((HttpServletRequest) null, response);
            assertEquals(503, status[0]);
            JsonObject json = new JsonParser().parse(body.toString()).getAsJsonObject();
            assertEquals(code, json.get("code").getAsString());
            assertEquals(reason, json.get("reason").getAsString());
            assertEquals(exceptionType.getName(), json.get("exception_type").getAsString());
            assertFalse(body.toString().contains(PRIVATE_DETAIL));
            assertFalse(body.toString().contains(configurer));
            assertEquals(1, logged.size());
            assertTrue(exceptionType.isInstance(logged.get(0)));
            assertNotNull(logged.get(0).getStackTrace());
        } finally {
            servlet.destroy();
        }
    }

    public static final class MissingFileConfigurer implements MonitorAgentConfigurer {
        public void configure(MonitorAgentBuilder builder, ServletContext context)
                throws Exception {
            throw new FileNotFoundException(PRIVATE_DETAIL);
        }
    }

    public static final class MissingDependencyConfigurer implements MonitorAgentConfigurer {
        public void configure(MonitorAgentBuilder builder, ServletContext context) {
            throw new NoClassDefFoundError(PRIVATE_DETAIL);
        }
    }

    public static final class UnsupportedJavaConfigurer implements MonitorAgentConfigurer {
        public void configure(MonitorAgentBuilder builder, ServletContext context) {
            throw new UnsupportedClassVersionError(PRIVATE_DETAIL);
        }
    }

    public static final class ShortTokenConfigurer implements MonitorAgentConfigurer {
        public void configure(MonitorAgentBuilder builder, ServletContext context) {
            builder.identity("sample-campus", "prod").token("short");
        }
    }

    public static final class MissingLocationConfigurer implements MonitorAgentConfigurer {
        public void configure(MonitorAgentBuilder builder, ServletContext context) {
            throw new IllegalStateException("MONITOR_CONFIG_REQUIRED");
        }
    }

    public static final class UnexpectedFailureConfigurer implements MonitorAgentConfigurer {
        public void configure(MonitorAgentBuilder builder, ServletContext context) {
            throw new NullPointerException(PRIVATE_DETAIL);
        }
    }
}
