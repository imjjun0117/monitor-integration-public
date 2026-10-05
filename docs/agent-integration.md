# Java 애플리케이션에 모니터링 SDK 적용하기

이 문서는 `monitor-agent.jar`를 기존 Java 웹 애플리케이션의 라이브러리로 등록하고, 개발자가 기존 Service·Controller·JSP 구조에 맞춰 모니터링 API를 작성하는 방법을 설명합니다.

- SDK 공개 패키지: `com.hermes.monitoring.agent`
- Java bytecode: Java 7 호환
- 권장 운영 폴링 주기: 중앙 서버에서 인스턴스별 60초
- SDK가 URL이나 Controller를 자동 생성하지 않음
- `com.hermes.monitoring.agent.servlet.MonitorServlet` adapter는 선택 기능

## 1. SDK 설치

### Maven repository를 사용하는 프로젝트

사내 Maven repository에 JAR를 배포한 뒤 기존 프로젝트 `pom.xml`에 등록합니다.

```xml
<dependency>
    <groupId>com.hermes.monitoring</groupId>
    <artifactId>monitor-agent</artifactId>
    <version>0.1.0-SNAPSHOT</version>
</dependency>
```

Maven 좌표는 기존 빌드 호환성을 위해 유지하지만 Java import는 `com.hermes.monitoring.agent`을 사용합니다.

### 로컬 JAR를 사용하는 레거시 WAR

검증된 JAR를 다음 위치에 복사합니다.

```text
WEB-INF/lib/monitor-agent-0.1.0-SNAPSHOT.jar
```

운영 서버에서 JAR를 직접 빌드하지 말고 CI 또는 검증된 빌드 환경의 SHA-256 확인 산출물을 사용합니다. JAR를 넣는 것만으로 endpoint가 자동 생성되지는 않습니다. 개발자가 기존 Spring Controller나 자체 Servlet에서 SDK를 호출합니다.

## 2. 한 애플리케이션에 MonitorRuntime 하나만 생성

`MonitorRuntime`은 check executor를 소유하므로 요청마다 만들면 안 됩니다. 애플리케이션당 singleton 한 개를 만들고 종료할 때 `runtime.shutdown()`을 호출합니다.

```java
package sample.monitoring;

import com.hermes.monitoring.agent.DbPoolMetricsProvider;
import com.hermes.monitoring.agent.MonitorAgentBuilder;
import com.hermes.monitoring.agent.MonitorCheck;
import com.hermes.monitoring.agent.MonitorRuntime;
import java.io.File;

public final class MonitorService {
    private final MonitorRuntime runtime;

    public MonitorService(String token,
                          DbPoolMetricsProvider poolProvider,
                          MonitorCheck projectCheck) {
        MonitorAgentBuilder builder = new MonitorAgentBuilder()
            .identity("sample", "prod-01")
            .token(token)
            .disk("data", "/data", new File("/data"));

        if (poolProvider != null) builder.dbPool(poolProvider);
        if (projectCheck != null) builder.check(projectCheck);
        runtime = builder.build();
    }

    public MonitorRuntime runtime() {
        return runtime;
    }

    public void destroy() {
        runtime.shutdown();
    }
}
```

Spring bean으로 등록한다면 기본 singleton scope를 사용하고 기존 애플리케이션 종료 callback에서 `destroy()`를 호출합니다. Spring XML 예시는 다음과 같습니다.

```xml
<bean id="monitorService"
      class="sample.monitoring.MonitorService"
      destroy-method="destroy">
    <constructor-arg ref="monitorToken" />
    <constructor-arg ref="sampleDbPoolMetricsProvider" />
    <constructor-arg ref="sampleHealthCheck" />
</bean>
```

토큰은 Git, Java source, JSP, WAR에 하드코딩하지 않습니다. WAS 외부 보안 설정에서 읽어 constructor로 전달합니다.

## 3. Spring MVC Controller 작성

중앙 서버는 등록한 base URL 뒤에 `/monitor/v1/`과 endpoint를 붙입니다. 기존 애플리케이션의 context path가 `/`이면 다음 네 경로를 구현합니다.

- `GET /monitor/v1/info`
- `GET /monitor/v1/snapshot`
- `POST /monitor/v1/checks/run`
- `GET /monitor/v1/checks/results`

### 인증과 요청 크기 제한은 Controller보다 먼저 실행

`@RequestBody`는 Controller 메서드에 들어오기 전에 역직렬화됩니다. 따라서 중앙 수집 경로의 인증과 요청 크기 제한은 기존 보안 Filter chain에서 `DispatcherServlet`보다 먼저 처리해야 합니다. 아래 예시는 핵심 동작만 보여 줍니다. 프로젝트의 기존 Filter 등록 방식으로 `/monitor/v1/*`에만 연결합니다.

```java
package ipm.web.monitoring;

import com.hermes.monitoring.agent.MonitorRuntime;
import java.io.IOException;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import sample.monitoring.MonitorService;

public final class MonitorSecurityFilter implements Filter {
    private static final int MAX_BODY_BYTES = 16 * 1024;
    private final MonitorService service;

    public MonitorSecurityFilter(MonitorService service) {
        this.service = service;
    }

    public void init(FilterConfig config) {
    }

    public void doFilter(ServletRequest request,
                         ServletResponse response,
                         FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        httpResponse.setHeader("Cache-Control", "no-store");
        httpResponse.setCharacterEncoding("UTF-8");
        httpResponse.setContentType("application/json; charset=UTF-8");

        MonitorRuntime runtime = service.runtime();
        String token = httpRequest.getHeader("X-Monitor-Token");
        if (!runtime.isAuthorized(token)) {
            send(httpResponse, HttpServletResponse.SC_UNAUTHORIZED, "AUTH_ERROR");
            return;
        }

        int contentLength = httpRequest.getContentLength();
        if (contentLength > MAX_BODY_BYTES) {
            send(httpResponse, HttpServletResponse.SC_BAD_REQUEST, "BODY_TOO_LARGE");
            return;
        }
        chain.doFilter(request, response);
    }

    private void send(HttpServletResponse response, int status, String code)
            throws IOException {
        response.setStatus(status);
        response.getWriter().write("{\"code\":\"" + code + "\"}");
    }

    public void destroy() {
    }
}
```

`Content-Length`가 없는 chunked 요청도 우회하지 못하도록 Tomcat·앞단 reverse proxy에서 `/monitor/v1/checks/run` 요청 본문을 **16 KiB 이하로 강제**합니다. Filter만으로 이 제한을 대체하지 않습니다. 외부 또는 서버 간 통신은 평문 HTTP가 아니라 인증서 검증이 적용된 **HTTPS**를 사용합니다. 가능한 경우 mTLS나 인증된 사설 터널을 사용하고 중앙 서버 IP만 방화벽에서 허용합니다.

모든 endpoint는 다음 순서를 지킵니다.

1. `Cache-Control: no-store` 설정
2. `X-Monitor-Token` 읽기
3. SDK 호출 전에 `MonitorRuntime.isAuthorized()` 검사
4. 실패하면 SDK를 호출하지 않고 HTTP 401
5. 성공한 경우에만 SDK 호출
6. endpoint 전용 `MonitorPayloadWriter`로 UTF-8 JSON 직렬화

### SDK 응답 전용 JSON writer

SDK 반환 객체에는 계약 이름과 같은 private field가 포함되어 있으므로 전역 Jackson 설정에 기대지 않습니다. 아래처럼 endpoint 전용 writer를 두고 field만 직렬화합니다. 이 writer에는 `MonitorRuntime` 자체를 넘기지 않고 `info()`, `snapshot()`, `startChecks()`, `results()`의 반환값만 넘깁니다.

```java
package ipm.web.monitoring;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

public final class MonitorPayloadWriter {
    private final ObjectMapper mapper;

    public MonitorPayloadWriter() {
        mapper = new ObjectMapper();
        mapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.NONE);
        mapper.setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY);
    }

    public String write(Object value) throws JsonProcessingException {
        return mapper.writeValueAsString(value);
    }
}
```

```java
package ipm.web.monitoring;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.hermes.monitoring.agent.MonitorRuntime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import sample.monitoring.MonitorService;

@Controller
@RequestMapping("/monitor/v1")
public final class MonitorController {
    private final MonitorService service;
    private final MonitorPayloadWriter payloadWriter;

    public MonitorController(MonitorService service,
                             MonitorPayloadWriter payloadWriter) {
        this.service = service;
        this.payloadWriter = payloadWriter;
    }

    @RequestMapping(value = "/info", method = RequestMethod.GET)
    @ResponseBody
    public String info(
            @RequestHeader(value = "X-Monitor-Token", required = false) String token,
            HttpServletResponse response) throws JsonProcessingException {
        noStore(response);
        authorizeOrThrow(token);
        MonitorRuntime runtime = service.runtime();
        return payloadWriter.write(runtime.info());
    }

    @RequestMapping(value = "/snapshot", method = RequestMethod.GET)
    @ResponseBody
    public String snapshot(
            @RequestHeader(value = "X-Monitor-Token", required = false) String token,
            HttpServletResponse response) throws JsonProcessingException {
        noStore(response);
        authorizeOrThrow(token);
        MonitorRuntime runtime = service.runtime();
        return payloadWriter.write(runtime.snapshot());
    }

    @RequestMapping(value = "/checks/run", method = RequestMethod.POST)
    @ResponseBody
    public ResponseEntity<String> runChecks(
            @RequestHeader(value = "X-Monitor-Token", required = false) String token,
            @RequestBody CheckRunRequest request,
            HttpServletResponse response) throws JsonProcessingException {
        noStore(response);
        authorizeOrThrow(token);
        validateRunRequest(request);
        MonitorRuntime runtime = service.runtime();
        MonitorRuntime.CheckRun result = runtime.startChecks(request.getCheckIds());
        HttpStatus status = result.hasAcceptedChecks()
            ? HttpStatus.ACCEPTED
            : result.hasOnlyCapacityRejections()
                ? HttpStatus.TOO_MANY_REQUESTS
                : HttpStatus.BAD_REQUEST;
        return new ResponseEntity<String>(payloadWriter.write(result), status);
    }

    @RequestMapping(value = "/checks/results", method = RequestMethod.GET)
    @ResponseBody
    public String results(
            @RequestHeader(value = "X-Monitor-Token", required = false) String token,
            @RequestParam(value = "job_id", required = false) String jobId,
            @RequestParam(value = "since", required = false) String since,
            HttpServletRequest request,
            HttpServletResponse response) throws JsonProcessingException {
        noStore(response);
        authorizeOrThrow(token);
        validateResultsQuery(request.getQueryString());
        MonitorRuntime runtime = service.runtime();
        return payloadWriter.write(runtime.results(jobId, since));
    }

    @RequestMapping(value = "/**")
    @ResponseBody
    public String notFound(
            @RequestHeader(value = "X-Monitor-Token", required = false) String token,
            HttpServletResponse response) {
        noStore(response);
        authorizeOrThrow(token);
        throw new MonitorNotFoundException();
    }

    private void authorizeOrThrow(String token) {
        if (!service.runtime().isAuthorized(token)) {
            throw new MonitorUnauthorizedException();
        }
    }

    private void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json; charset=UTF-8");
    }

    public static final class CheckRunRequest {
        @JsonProperty("check_ids")
        private List<String> checkIds;

        @JsonProperty("requested_by")
        private String requestedBy;

        public List<String> getCheckIds() {
            return checkIds;
        }

        public String getRequestedBy() {
            return requestedBy;
        }

        @JsonAnySetter
        public void rejectUnknownField(String name, Object value) {
            throw new MonitorInvalidRequestException();
        }
    }

    private void validateRunRequest(CheckRunRequest request) {
        if (request == null || !"monitor-center".equals(request.getRequestedBy())
                || request.getCheckIds() == null
                || request.getCheckIds().isEmpty()
                || request.getCheckIds().size() > 20) {
            throw new MonitorInvalidRequestException();
        }
        Set<String> unique = new HashSet<String>();
        for (String checkId : request.getCheckIds()) {
            if (checkId == null
                    || !checkId.matches("[a-z0-9][a-z0-9._-]{1,63}")
                    || !unique.add(checkId)) {
                throw new MonitorInvalidRequestException();
            }
        }
    }

    private void validateResultsQuery(String query) {
        if (query == null || query.length() == 0) return;
        if (query.indexOf('&') >= 0) throw new MonitorInvalidRequestException();
        int separator = query.indexOf('=');
        if (separator <= 0 || separator == query.length() - 1) {
            throw new MonitorInvalidRequestException();
        }
        String key = query.substring(0, separator);
        if (!"job_id".equals(key) && !"since".equals(key)) {
            throw new MonitorInvalidRequestException();
        }
    }

    static final class MonitorUnauthorizedException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    static final class MonitorInvalidRequestException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    static final class MonitorNotFoundException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
```

Controller·역직렬화 오류도 `{ "code": "..." }` 형식으로 고정하기 위해 프로젝트의 기존 예외 처리기에 다음 정책을 합칩니다.

```java
package ipm.web.monitoring;

import java.util.Collections;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;

@ControllerAdvice(basePackages = "ipm.web.monitoring")
public final class MonitorErrorHandler {
    @ExceptionHandler(MonitorController.MonitorUnauthorizedException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> unauthorized() {
        return error(HttpStatus.UNAUTHORIZED, "AUTH_ERROR");
    }

    @ExceptionHandler({
        MonitorController.MonitorInvalidRequestException.class,
        HttpMessageNotReadableException.class
    })
    @ResponseBody
    public ResponseEntity<Map<String, String>> invalidRequest() {
        return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
    }

    @ExceptionHandler(MonitorController.MonitorNotFoundException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> notFound() {
        return error(HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @ExceptionHandler(Exception.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> internalError() {
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR");
    }

    private ResponseEntity<Map<String, String>> error(HttpStatus status, String code) {
        return new ResponseEntity<Map<String, String>>(
            Collections.singletonMap("code", code),
            status
        );
    }
}
```

위 Controller 예시는 `requested_by`, check ID 개수·형식·중복을 SDK 호출 전에 검증하며 `/checks/results`에는 `job_id` 또는 `since` 하나만 허용합니다. 다른 query parameter나 두 parameter의 동시 입력은 HTTP 400으로 거절합니다. 기존 SDK/Servlet 계약과 동일하게 `since` 값의 형식이 잘못된 경우에는 HTTP 200과 빈 결과 배열을 반환합니다.

> 주의: 위 `MonitorPayloadWriter`는 SDK 반환 객체만 field 기반으로 직렬화하기 위한 전용 writer입니다. 전역 ObjectMapper 설정은 변경하지 않습니다. 실제 HTTP 응답을 아래 JSON Schema와 fixture로 검증한 뒤 운영에 반영하고, SDK 내부 relocated Gson package는 직접 import하지 않습니다.

## 4. HTTP 상태와 오류 계약

| 상황 | HTTP 상태 | 예시 |
|---|---:|---|
| 정상 조회 | HTTP 200 | info, snapshot, results |
| check 실행 접수 | HTTP 202 | 하나 이상 실행 접수 |
| 잘못된 JSON·query key·request schema | HTTP 400 | `{"code":"INVALID_REQUEST"}` |
| 미등록 check만 요청 | HTTP 400 | `CheckRun`의 `rejected` 응답 |
| 토큰 없음·불일치 | HTTP 401 | `{"code":"AUTH_ERROR"}` |
| 존재하지 않는 endpoint | HTTP 404 | `{"code":"NOT_FOUND"}` |
| 실행 용량 제한으로 전부 거절 | HTTP 429 | `CheckRun`의 `rejected` 응답 |
| 프로젝트 adapter 예외 | HTTP 500 | `{"code":"INTERNAL_ERROR"}` |

오류에는 stack trace, SQL, 파일 절대경로, token, password, API key를 넣지 않습니다. 메시지는 제한된 안정 코드만 반환합니다.

응답 계약의 기준 파일:

- `contracts/agent-info.schema.json`
- `contracts/agent-snapshot.schema.json`
- `contracts/check-run.schema.json`
- `contracts/check-result.schema.json`

`info()`와 `snapshot()`의 Map을 임의 구조로 바꾸지 않고 위 Schema를 만족하도록 직렬화합니다.

## 5. 프로젝트 전용 MonitorCheck 작성

```java
package sample.monitoring;

import com.hermes.monitoring.agent.CheckCategory;
import com.hermes.monitoring.agent.CheckContext;
import com.hermes.monitoring.agent.CheckDirection;
import com.hermes.monitoring.agent.CheckResult;
import com.hermes.monitoring.agent.MonitorCheck;

public final class SampleHealthCheck implements MonitorCheck {
    public String getId() {
        return "sample-health";
    }

    public String getName() {
        return "샘플 프로젝트 내부 상태";
    }

    public CheckCategory getCategory() {
        return CheckCategory.INTERNAL;
    }

    public CheckDirection getDirection() {
        return null;
    }

    public CheckResult execute(CheckContext context) {
        long startedAt = System.currentTimeMillis();
        if (System.currentTimeMillis() >= context.getDeadlineMillis()) {
            return new CheckResult(getId(), "DOWN", 0L, "CHECK_DEADLINE_EXCEEDED");
        }

        boolean healthy = checkProjectStateReadOnly();
        long duration = System.currentTimeMillis() - startedAt;
        return new CheckResult(
            getId(),
            healthy ? "UP" : "DOWN",
            duration,
            healthy ? "OK" : "PROJECT_STATE_UNAVAILABLE"
        );
    }

    private boolean checkProjectStateReadOnly() {
        // 쓰기나 사용자 행위를 만들지 않는 프로젝트 전용 조회를 구현합니다.
        return true;
    }
}
```

- 내부 점검은 `CheckCategory.INTERNAL`, direction은 `null`입니다.
- API 점검은 `CheckCategory.API`와 `CheckDirection.INTERNAL` 또는 `EXTERNAL`을 명시합니다.
- 점검은 `CheckContext.getDeadlineMillis()`를 존중합니다.
- 결제·문자 발송·본인인증·데이터 변경 같은 쓰기 요청을 점검으로 사용하지 않습니다.
- 반환 message는 `CheckResult`에서 공통 masking되지만 애초에 비밀정보를 넣지 않습니다.

## 6. 프로젝트 전용 DB Pool 지표 작성

```java
package sample.monitoring;

import com.hermes.monitoring.agent.DbPoolMetrics;
import com.hermes.monitoring.agent.DbPoolMetricsProvider;
import org.apache.commons.dbcp.BasicDataSource;

public final class SampleDbPoolMetricsProvider
        implements DbPoolMetricsProvider {
    private final BasicDataSource dataSource;

    public SampleDbPoolMetricsProvider(BasicDataSource dataSource) {
        this.dataSource = dataSource;
    }

    public DbPoolMetrics collect() {
        return new DbPoolMetrics(
            "main",
            "샘플 프로젝트 DataSource",
            Integer.valueOf(dataSource.getNumActive()),
            Integer.valueOf(dataSource.getNumIdle()),
            Integer.valueOf(dataSource.getMaxActive()),
            null,
            null
        );
    }
}
```

지원하지 않는 값은 `0`으로 만들지 말고 `null`로 반환합니다. `0`은 실제 측정값이고 `null`은 미지원이라는 계약을 유지합니다.

## 7. JSP는 view로만 사용

JSP에서 `MonitorRuntime`을 새로 만들거나 token·DB 연결·check 실행을 처리하지 않습니다. Controller가 인증과 SDK 호출을 끝낸 뒤 필요한 view model만 JSP에 전달합니다.

```java
@RequestMapping(value = "/admin/monitor", method = RequestMethod.GET)
public String monitorView(Model model) {
    model.addAttribute("snapshot", service.runtime().snapshot());
    return "admin/monitor";
}
```

```jsp
<%-- JSP는 view 출력만 담당합니다. --%>
<p>수집 시각: ${snapshot.observed_at}</p>
```

이 관리 화면은 기존 관리자 인증과 권한 검사를 통과한 사용자에게만 노출합니다. 중앙 수집용 token을 JSP, HTML, JavaScript에 출력하지 않습니다.

## 8. 60초 폴링 설정

SDK 내부에는 scheduler를 만들지 않습니다. 중앙 Monitor Center의 인스턴스 설정에서 다음 값을 저장합니다.

```text
poll_interval_seconds = 60
```

SDK는 호출받을 때만 데이터를 수집합니다. 60초 설정 변경에는 애플리케이션 재배포나 Tomcat 재시작이 필요하지 않습니다. 중앙의 stale/down 기준은 `max(폴링 주기 × 3, 60초)`이므로 60초 폴링에서는 180초입니다.

## 9. Servlet adapter는 선택 기능

기존 Controller를 만들 수 없는 Servlet 2.5 프로젝트만 다음 adapter를 선택할 수 있습니다.

```text
com.hermes.monitoring.agent.servlet.MonitorServlet
```

이 경우에만 `web.xml`에 Servlet과 `/monitor/v1/*` mapping을 추가합니다. Spring Controller나 프로젝트 전용 Servlet에서 SDK를 직접 호출한다면 공통 Servlet adapter 등록은 필요하지 않습니다.

## 10. 배포 전 체크리스트

- JAR SHA-256 검증
- 애플리케이션당 `MonitorRuntime` 한 개
- token 32 UTF-8 bytes 이상, 외부 보안 설정에서 주입
- 모든 중앙 수집 endpoint에서 `isAuthorized()` 선검사
- 실패 시 SDK 미호출 및 HTTP 401
- 성공·실패 모두 `Cache-Control: no-store`
- 응답 `application/json; charset=UTF-8`
- 네 JSON Schema 및 fixture 검증
- 외부 API·배치·쓰기 점검 기본 비활성
- 중앙 서버 IP만 방화벽 허용
- 중앙 인스턴스 폴링 주기 60초
- 애플리케이션 종료 시 `runtime.shutdown()`
- 기존 Controller/JSP/DB/Scouter regression 확인

실제 프로젝트 확장 코드는 `pilot/sample`을 함께 참고하십시오.
