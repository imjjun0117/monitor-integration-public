package com.monitoring.collector;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.servlet.ServletContext;
import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class SamplePilotConfigurerIntegrationTest {
    private static final String TOKEN = "01234567890123456789012345678901";

    @Test
    public void compiledPilotConfigurerLoadsAndRegistersEnabledLocalDeclarations()
            throws Exception {
        File pilot = new File("../pilot/sample").getCanonicalFile();
        File output = temporaryDirectory();
        compilePilot(pilot, output);
        URLClassLoader classes =
                new URLClassLoader(new URL[] {output.toURI().toURL()}, getClass().getClassLoader());
        try {
            Class<?> type = classes.loadClass("sample.monitoring.SampleMonitorConfigurer");
            MonitorCollectorConfigurer configurer = (MonitorCollectorConfigurer) type.newInstance();
            MonitorCollectorBuilder builder = new MonitorCollectorBuilder();
            configurer.configure(builder, servletContext(pilot));
            MonitorRuntime runtime = builder.build();
            List<?> checks = (List<?>) runtime.info().get("checks");
            assertEquals(1, checks.size());
            @SuppressWarnings("unchecked")
            Map<String, Object> definition = (Map<String, Object>) checks.get(0);
            assertEquals("data-mount-access", definition.get("check_id"));
            assertEquals("INTERNAL", definition.get("category"));
            assertEquals(null, definition.get("direction"));
            assertEquals("ACCEPTED", runtime.runCheck("data-mount-access"));
            CheckResult result = await(runtime, "data-mount-access");
            assertEquals("UP", result.getStatus());
            runtime.shutdown();
        } finally {
            classes.close();
        }
    }

    private void compilePilot(File pilot, File output) throws Exception {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        assertNotNull("tests require a JDK", compiler);
        StandardJavaFileManager files = compiler.getStandardFileManager(null, null, null);
        try {
            Iterable<? extends javax.tools.JavaFileObject> sources =
                    files.getJavaFileObjectsFromFiles(
                            Arrays.asList(
                                    new File(pilot, "src/Dbcp1PoolAdapter.java"),
                                    new File(pilot, "src/SampleMonitorConfigurer.java")));
            List<String> options =
                    Arrays.asList(
                            "-classpath",
                            System.getProperty("java.class.path"),
                            "-d",
                            output.getAbsolutePath());
            Boolean success = compiler.getTask(null, files, null, options, null, sources).call();
            assertEquals("pilot sources did not compile", Boolean.TRUE, success);
        } finally {
            files.close();
        }
    }

    private CheckResult await(MonitorRuntime runtime, String id) throws Exception {
        long deadline = System.currentTimeMillis() + 1_000L;
        while (System.currentTimeMillis() < deadline) {
            for (CheckResult result : runtime.results()) {
                if (id.equals(result.getCheckId())) {
                    return result;
                }
            }
            Thread.sleep(10L);
        }
        throw new AssertionError("missing result for " + id);
    }

    private ServletContext servletContext(final File pilot) {
        final Map<String, String> parameters = new HashMap<String, String>();
        parameters.put("monitor.token", TOKEN);
        parameters.put("monitor.project-id", "sample");
        parameters.put("monitor.instance-id", "local-01");
        parameters.put("monitor.disk.data.path", pilot.getAbsolutePath());
        parameters.put("monitor.checks.resource", "/pilot-checks.json");
        InvocationHandler handler =
                new InvocationHandler() {
                    public Object invoke(Object proxy, Method method, Object[] arguments)
                            throws Exception {
                        String name = method.getName();
                        if ("getInitParameter".equals(name)) {
                            return parameters.get(arguments[0]);
                        }
                        if ("getInitParameterNames".equals(name)) {
                            Enumeration<String> values =
                                    Collections.enumeration(parameters.keySet());
                            return values;
                        }
                        if ("getResourceAsStream".equals(name)
                                && "/pilot-checks.json".equals(arguments[0])) {
                            InputStream input =
                                    new FileInputStream(new File(pilot, "monitor-checks.json"));
                            return input;
                        }
                        if ("getAttribute".equals(name)) {
                            return null;
                        }
                        return defaultValue(method.getReturnType());
                    }
                };
        return (ServletContext)
                Proxy.newProxyInstance(
                        getClass().getClassLoader(),
                        new Class<?>[] {ServletContext.class},
                        handler);
    }

    private Object defaultValue(Class<?> type) {
        if (!type.isPrimitive()) {
            return null;
        }
        if (Boolean.TYPE.equals(type)) {
            return Boolean.FALSE;
        }
        if (Character.TYPE.equals(type)) {
            return Character.valueOf('\0');
        }
        if (Byte.TYPE.equals(type)) {
            return Byte.valueOf((byte) 0);
        }
        if (Short.TYPE.equals(type)) {
            return Short.valueOf((short) 0);
        }
        if (Integer.TYPE.equals(type)) {
            return Integer.valueOf(0);
        }
        if (Long.TYPE.equals(type)) {
            return Long.valueOf(0L);
        }
        if (Float.TYPE.equals(type)) {
            return Float.valueOf(0.0f);
        }
        return Double.valueOf(0.0d);
    }

    private File temporaryDirectory() throws Exception {
        File value =
                new File(
                        System.getProperty("java.io.tmpdir"),
                        "hermes-pilot-classes-" + System.nanoTime());
        if (!value.mkdir()) {
            throw new IllegalStateException("TEMP_DIRECTORY_FAILED");
        }
        value.deleteOnExit();
        return value;
    }
}
