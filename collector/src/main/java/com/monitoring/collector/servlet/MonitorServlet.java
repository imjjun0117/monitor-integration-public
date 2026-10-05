package com.monitoring.collector.servlet;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.monitoring.collector.MonitorCollectorBuilder;
import com.monitoring.collector.MonitorCollectorConfigurer;
import com.monitoring.collector.MonitorRuntime;
import com.monitoring.collector.LogReader;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.servlet.ServletException;
import javax.servlet.ServletInputStream;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

// Collector 인증 및 자원·점검·로그 요청 처리
public final class MonitorServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;
    private static final int MAX_BODY = 16 * 1024;
    private static final int MAX_CHECK_IDS = 20;
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private final Gson gson = new GsonBuilder().serializeNulls().create();
    private MonitorRuntime runtime;
    private LogReader logs;
    private String initializationError;
    private String initializationReason;
    private String initializationExceptionType;

    // 프로젝트 설정 클래스를 읽어 Collector와 로그 조회 초기화
    public void init() {
        try {
            String configurerClass = getInitParameter("configurerClass");
            MonitorCollectorBuilder builder = new MonitorCollectorBuilder();
            ClassLoader loader = Thread.currentThread().getContextClassLoader();
            if (loader == null) {
                loader = MonitorServlet.class.getClassLoader();
            }
            MonitorCollectorConfigurer configurer =
                    (MonitorCollectorConfigurer)
                            Class.forName(configurerClass, true, loader).newInstance();
            configurer.configure(builder, getServletContext());
            runtime = builder.build();
            logs = new LogReader(getInitParameter("logAllowedRoots"));
        } catch (Exception error) {
            initializationFailed(error);
        } catch (LinkageError error) {
            initializationFailed(error);
        }
    }

    // 초기화 실패 원인을 구분하여 응답 정보 및 WAS 로그 기록
    private void initializationFailed(Throwable error) {
        initializationError =
                "TOKEN_TOO_SHORT".equals(error.getMessage())
                                || "INVALID_IDENTITY".equals(error.getMessage())
                        ? error.getMessage()
                        : "INIT_FAILED";
        initializationReason =
                error instanceof FileNotFoundException
                        ? "CONFIG_FILE_UNAVAILABLE"
                        : error instanceof ClassNotFoundException
                                ? "CONFIGURER_CLASS_NOT_FOUND"
                                : error instanceof UnsupportedClassVersionError
                                        ? "JAVA_VERSION_UNSUPPORTED"
                                        : error instanceof NoClassDefFoundError
                                                ? "CLASS_DEPENDENCY_MISSING"
                                                : error instanceof LinkageError
                                                        ? "CLASS_LINKAGE_ERROR"
                                                        : error instanceof SecurityException
                                                                ? "INITIALIZATION_ACCESS_DENIED"
                                                                : "MONITOR_CONFIG_REQUIRED"
                                                                                .equals(
                                                                                        error
                                                                                                .getMessage())
                                                                        ? "CONFIG_LOCATION_UNAVAILABLE"
                                                                        : !"INIT_FAILED"
                                                                                        .equals(
                                                                                                initializationError)
                                                                                ? initializationError
                                                                                : "INITIALIZATION_EXCEPTION";
        initializationExceptionType = error.getClass().getName();
        getServletContext()
                .log("Monitor agent initialization failed [" + initializationReason + "]", error);
    }

    // 응답 형식 설정 후 초기화 상태와 요청 토큰 검증
    protected void service(HttpServletRequest request, HttpServletResponse response)
            throws IOException, ServletException {
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json; charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        if (runtime == null) {
            response.setStatus(503);
            Map<String, String> failure = new LinkedHashMap<String, String>();
            failure.put("code", initializationError);
            failure.put("reason", initializationReason);
            failure.put("exception_type", initializationExceptionType);
            json(response, failure);
            return;
        }
        if (!runtime.isAuthorized(request.getHeader("X-Monitor-Token"))) {
            send(response, 401, "AUTH_ERROR");
            return;
        }
        super.service(request, response);
    }

    // Collector 정보·자원·점검 결과 조회 요청 처리
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        String path = request.getPathInfo();
        if ("/info".equals(path)) {
            json(response, runtime.info());
            return;
        }
        if ("/snapshot".equals(path)) {
            json(response, runtime.snapshot());
            return;
        }
        if ("/checks/results".equals(path)) {
            if (!isAllowedResultsQuery(request.getQueryString())) {
                send(response, 400, "INVALID_QUERY");
                return;
            }
            json(
                    response,
                    runtime.results(request.getParameter("job_id"), request.getParameter("since")));
            return;
        }
        send(response, 404, "NOT_FOUND");
    }

    // 로그 조회 및 점검 실행 요청 처리
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if ("/logs/read".equals(request.getPathInfo())) {
            readLog(request, response);
            return;
        }
        if (!"/checks/run".equals(request.getPathInfo())) {
            send(response, 404, "NOT_FOUND");
            return;
        }
        byte[] body;
        try {
            body = readLimited(request.getInputStream());
        } catch (BodyTooLargeException error) {
            send(response, 400, "BODY_TOO_LARGE");
            return;
        }
        RunRequest run;
        try {
            run = parseRunRequest(new String(body, UTF8));
        } catch (RuntimeException error) {
            send(response, 400, "INVALID_JSON");
            return;
        }
        if (!valid(run)) {
            send(response, 400, "INVALID_REQUEST");
            return;
        }
        MonitorRuntime.CheckRun result = runtime.startChecks(run.check_ids);
        response.setStatus(runStatus(result));
        json(response, result);
    }

    // 요청 필드 검증 후 허용된 로그 파일 구간 반환
    private void readLog(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        try {
            JsonObject value =
                    new JsonParser()
                            .parse(new String(readLimited(request.getInputStream()), UTF8))
                            .getAsJsonObject();
            if (value.size() != 3
                    || !value.has("path")
                    || !value.has("encoding")
                    || !value.has("cursor")) {
                send(response, 400, "INVALID_LOG_REQUEST");
                return;
            }
            Map<String, Object> result =
                    logs.read(
                            value.get("path").getAsString(),
                            value.get("encoding").getAsString(),
                            value.get("cursor").isJsonNull()
                                    ? null
                                    : value.get("cursor").getAsString());
            result.put("identity", runtime.info().get("identity"));
            json(response, result);
        } catch (BodyTooLargeException invalid) {
            send(response, 400, "BODY_TOO_LARGE");
        } catch (RuntimeException invalid) {
            send(response, 400, "INVALID_LOG_REQUEST");
        } catch (IOException error) {
            String code = error.getMessage();
            if (code == null || !code.matches("[A-Z_]{3,40}")) {
                code = "LOG_FILE_UNAVAILABLE";
            }
            // 기존 JSP 오류 페이지로 전달하지 않고 JSON으로 파일 조회 실패 원인 반환
            json(response, Collections.singletonMap("code", code));
        }
    }

    // 최대 요청 크기를 넘으면 본문 읽기 중단
    private byte[] readLimited(ServletInputStream input) throws IOException, BodyTooLargeException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[2048];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > MAX_BODY) {
                throw new BodyTooLargeException();
            }
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    static boolean acceptsRunRequestJson(String value) {
        try {
            return valid(parseRunRequest(value));
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static RunRequest parseRunRequest(String value) {
        JsonElement parsed = new JsonParser().parse(value);
        if (!parsed.isJsonObject()) {
            throw new IllegalArgumentException("INVALID_JSON");
        }
        JsonObject object = parsed.getAsJsonObject();
        Set<String> keys =
                object.entrySet().isEmpty() ? Collections.<String>emptySet() : object.keySet();
        if (keys.size() != 2 || !keys.contains("check_ids") || !keys.contains("requested_by")) {
            throw new IllegalArgumentException("UNKNOWN_FIELD");
        }
        return new Gson().fromJson(object, RunRequest.class);
    }

    // 점검 ID 형식·중복·최대 개수 및 요청 주체 검증
    private static boolean valid(RunRequest run) {
        if (run == null
                || run.check_ids == null
                || run.check_ids.isEmpty()
                || run.check_ids.size() > MAX_CHECK_IDS
                || !"agent".equals(run.requested_by)) {
            return false;
        }
        java.util.HashSet<String> unique = new java.util.HashSet<String>();
        for (String checkId : run.check_ids) {
            if (checkId == null
                    || !checkId.matches("[a-z0-9][a-z0-9._-]{1,63}")
                    || !unique.add(checkId)) {
                return false;
            }
        }
        return true;
    }

    static boolean isAllowedResultsQuery(String query) {
        if (query == null || query.length() == 0) {
            return true;
        }
        if (query.indexOf('&') >= 0) {
            return false;
        }
        int separator = query.indexOf('=');
        if (separator <= 0 || separator == query.length() - 1) {
            return false;
        }
        String key = query.substring(0, separator);
        return "job_id".equals(key) || "since".equals(key);
    }

    private static int runStatus(MonitorRuntime.CheckRun run) {
        if (run.hasAcceptedChecks()) {
            return 202;
        }
        if (run.hasOnlyCapacityRejections()) {
            return 429;
        }
        return 400;
    }

    private void json(HttpServletResponse response, Object value) throws IOException {
        response.getWriter().write(gson.toJson(value));
    }

    private void send(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        json(response, Collections.singletonMap("code", code));
    }

    public void destroy() {
        if (runtime != null) {
            runtime.shutdown();
        }
    }

    private static final class RunRequest {
        List<String> check_ids;
        String requested_by;
    }

    private static final class BodyTooLargeException extends Exception {
        private static final long serialVersionUID = 1L;
    }
}
