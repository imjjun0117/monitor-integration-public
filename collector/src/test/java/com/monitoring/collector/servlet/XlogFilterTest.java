package com.monitoring.collector.servlet;

import com.monitoring.collector.CollectorConnection;
import com.monitoring.collector.LogReader;
import com.monitoring.collector.MonitorCollectorBuilder;
import com.monitoring.collector.MonitorRuntime;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import javax.servlet.*;
import javax.servlet.http.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class XlogFilterTest {
    @Test
    public void asynchronousCompletionRecordsOnceAfterTheRequestCompletes() throws Exception {
        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "prod")
                        .token("01234567890123456789012345678901")
                        .build();
        final CollectorConnection connection =
                new CollectorConnection(runtime, new LogReader(""), "");
        field("state").set(connection, "CONNECTED");
        field("xlogEnabled").set(connection, true);
        final AsyncListener[] listener = new AsyncListener[1];
        final AsyncContext async =
                proxy(
                        AsyncContext.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                if ("addListener".equals(method.getName())) {
                                    listener[0] = (AsyncListener) args[0];
                                }
                                return null;
                            }
                        });
        XlogFilter filter = new XlogFilter();
        java.lang.reflect.Field contextField = XlogFilter.class.getDeclaredField("context");
        contextField.setAccessible(true);
        contextField.set(
                filter,
                proxy(
                        ServletContext.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                return connection;
                            }
                        }));
        HttpServletRequest request =
                proxy(
                        HttpServletRequest.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                if ("getRequestURI".equals(method.getName())) {
                                    return "/async-request";
                                }
                                if ("getContextPath".equals(method.getName())) {
                                    return "";
                                }
                                if ("getMethod".equals(method.getName())) {
                                    return "POST";
                                }
                                if ("isAsyncStarted".equals(method.getName())) {
                                    return true;
                                }
                                if ("getAsyncContext".equals(method.getName())) {
                                    return async;
                                }
                                throw new AssertionError(method.getName());
                            }
                        });
        final java.util.concurrent.atomic.AtomicInteger finalStatus =
                new java.util.concurrent.atomic.AtomicInteger(200);
        HttpServletResponse response =
                proxy(
                        HttpServletResponse.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                if ("setStatus".equals(method.getName())) {
                                    finalStatus.set(((Number) args[0]).intValue());
                                }
                                if ("getStatus".equals(method.getName())) {
                                    return finalStatus.get();
                                }
                                return null;
                            }
                        });
        try {
            filter.doFilter(
                    request,
                    response,
                    new FilterChain() {
                        public void doFilter(ServletRequest req, ServletResponse res) {
                            ((HttpServletResponse) res).setStatus(200);
                        }
                    });
            assertEquals(0, queue(connection).size());
            assertNotNull(listener[0]);
            response.setStatus(202);
            listener[0].onComplete(new AsyncEvent(async));
            listener[0].onComplete(new AsyncEvent(async));
            assertEquals(1, queue(connection).size());
            assertEquals(202, queue(connection).poll().get("status"));
        } finally {
            connection.destroy();
            runtime.shutdown();
        }
    }

    @Test
    public void requestSummaryExcludesSecretsAndOffDoesNotRecord() throws Exception {
        MonitorRuntime runtime =
                new MonitorCollectorBuilder()
                        .identity("sample-a", "prod")
                        .token("01234567890123456789012345678901")
                        .build();
        final CollectorConnection connection =
                new CollectorConnection(runtime, new LogReader(""), "");
        XlogFilter filter = new XlogFilter();
        final ServletContext context =
                proxy(
                        ServletContext.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                return "getAttribute".equals(method.getName()) ? connection : null;
                            }
                        });
        filter.init(
                proxy(
                        FilterConfig.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                return context;
                            }
                        }));
        HttpServletRequest request =
                proxy(
                        HttpServletRequest.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                if ("getRequestURI".equals(method.getName())) {
                                    return "/sample";
                                }
                                if ("getContextPath".equals(method.getName())) {
                                    return "";
                                }
                                if ("getMethod".equals(method.getName())) {
                                    return "GET";
                                }
                                if ("isAsyncStarted".equals(method.getName())) {
                                    return false;
                                }
                                throw new AssertionError(
                                        "Unexpected request access: " + method.getName());
                            }
                        });
        final java.util.concurrent.atomic.AtomicInteger finalStatus =
                new java.util.concurrent.atomic.AtomicInteger(200);
        HttpServletResponse response =
                proxy(
                        HttpServletResponse.class,
                        new InvocationHandler() {
                            public Object invoke(Object object, Method method, Object[] args) {
                                if ("setStatus".equals(method.getName())) {
                                    finalStatus.set(((Number) args[0]).intValue());
                                }
                                if ("getStatus".equals(method.getName())) {
                                    return finalStatus.get();
                                }
                                return null;
                            }
                        });
        FilterChain chain =
                new FilterChain() {
                    public void doFilter(ServletRequest req, ServletResponse res) {
                        ((HttpServletResponse) res).setStatus(403);
                    }
                };
        try {
            filter.doFilter(request, response, chain);
            assertEquals(0, queue(connection).size());
            field("state").set(connection, "CONNECTED");
            field("xlogEnabled").set(connection, true);
            filter.doFilter(request, response, chain);
            Map<String, Object> event = queue(connection).poll();
            assertEquals(5, event.size());
            assertEquals("/sample", event.get("path"));
            assertEquals(403, event.get("status"));
            assertEquals("GET", event.get("method"));
            assertTrue(((Long) event.get("duration_ms")) >= 0);
            connection.stop();
            filter.doFilter(request, response, chain);
            assertEquals(0, queue(connection).size());
        } finally {
            connection.destroy();
            runtime.shutdown();
        }
    }

    private static Field field(String name) throws Exception {
        Field field = CollectorConnection.class.getDeclaredField(name);
        field.setAccessible(true);
        return field;
    }

    @SuppressWarnings("unchecked")
    private static ArrayBlockingQueue<Map<String, Object>> queue(CollectorConnection connection)
            throws Exception {
        return (ArrayBlockingQueue<Map<String, Object>>) field("xlogs").get(connection);
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler);
    }
}
