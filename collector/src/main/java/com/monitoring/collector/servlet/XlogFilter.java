package com.monitoring.collector.servlet;

import com.monitoring.collector.CollectorConnection;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.servlet.AsyncEvent;
import javax.servlet.AsyncListener;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletContext;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpServletResponseWrapper;

// 연결 중 사용 설정된 요청 요약만 기록하고 본문·쿼리·헤더는 수집하지 않음
public final class XlogFilter implements Filter {
    private ServletContext context;

    public void init(FilterConfig config) {
        context = config.getServletContext();
    }

    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        Object configured = context.getAttribute(CollectorConnection.CONTEXT_KEY);
        if (!(configured instanceof CollectorConnection)
                || !(request instanceof HttpServletRequest)) {
            chain.doFilter(request, response);
            return;
        }
        final CollectorConnection connection = (CollectorConnection) configured;
        final HttpServletRequest http = (HttpServletRequest) request;
        String path = http.getRequestURI();
        if (!connection.isXlogEnabled() || path.startsWith(http.getContextPath() + "/monitor/")) {
            chain.doFilter(request, response);
            return;
        }
        final long generation = connection.xlogGeneration();
        final long startedAt = System.currentTimeMillis();
        final long startedNanos = System.nanoTime();
        final String recordedPath = path.length() > 512 ? path.substring(0, 512) : path;
        final AtomicBoolean recorded = new AtomicBoolean();
        final Response status = new Response((HttpServletResponse) response);
        final Runnable finish =
                new Runnable() {
                    public void run() {
                        if (!recorded.compareAndSet(false, true)) {
                            return;
                        }
                        Map<String, Object> value = new LinkedHashMap<String, Object>();
                        value.put("started_at", Long.valueOf(startedAt));
                        value.put(
                                "duration_ms",
                                Long.valueOf(
                                        Math.max(0, System.nanoTime() - startedNanos) / 1000000L));
                        value.put("method", http.getMethod());
                        value.put("path", recordedPath);
                        value.put(
                                "status",
                                Integer.valueOf(status.failed ? 500 : status.getStatus()));
                        connection.record(generation, value);
                    }
                };
        try {
            chain.doFilter(request, status);
        } catch (IOException error) {
            status.failed = true;
            throw error;
        } catch (ServletException error) {
            status.failed = true;
            throw error;
        } catch (RuntimeException error) {
            status.failed = true;
            throw error;
        } finally {
            if (request.isAsyncStarted()) {
                final AsyncListener listener =
                        new AsyncListener() {
                            public void onComplete(AsyncEvent event) {
                                finish.run();
                            }

                            public void onTimeout(AsyncEvent event) {
                                // 타임아웃 처리 후 완료 콜백에서 최종 HTTP 상태 조회
                            }

                            public void onError(AsyncEvent event) {
                                // 오류 페이지·비동기 재처리 완료 후 중복 없이 기록
                            }

                            public void onStartAsync(AsyncEvent event) {
                                event.getAsyncContext().addListener(this);
                            }
                        };
                try {
                    request.getAsyncContext().addListener(listener);
                } catch (IllegalStateException alreadyCompleted) {
                    finish.run();
                }
            } else {
                finish.run();
            }
        }
    }

    public void destroy() {
    }

    private static final class Response extends HttpServletResponseWrapper {
        private volatile boolean failed;

        Response(HttpServletResponse response) {
            super(response);
        }
    }
}
