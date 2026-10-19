# 요청 기반 WSS 연결·XLog 적용 가이드

## 동작 규칙

- **Agent**: 중앙 대시보드 서버. **Collector**: 대상 WAS에 넣는 JAR.
- WAS 시작·재배포만으로 연결하지 않는다. 대시보드에서 **연결 시작**을 누르면 Agent가 기존 HTTPS API로 일회용 연결 승인을 전달한다.
- Collector는 설정 파일에 고정한 Agent 주소로 연결을 **1회** 시도한다. 실패·단절·Agent 종료 후 자동 재시도하지 않는다. 다시 연결하려면 대시보드에서 연결 시작을 누른다. WAS 재기동은 필요하지 않다.
- HTTP와 WSS를 인스턴스별로 선택한다. 기존 인스턴스 기본값은 HTTP이며, WSS로 바꾸면 주기적인 HTTP 자원 조회를 중단한다. 연결 시작 승인 API는 HTTPS를 사용한다.
- WSS 연결 중에는 인스턴스의 수집 주기에 맞춰 자원을 전송한다. 내부 점검·외부 API 점검은 기존 자동 실행 사용 여부와 주기를 유지하며, 명령·결과를 같은 소켓으로 주고받는다.
- XLog는 프로젝트별 사용·미사용 설정이다. 기본은 미사용. 사용이면 연결된 인스턴스에서 화면을 닫아도 계속 수집한다. 미사용 또는 단절이면 수집을 중단하고 대상 WAS의 대기 버퍼를 비운다.
- 실시간 파일 로그는 해당 화면을 조회할 때만 기존 조회 주기로 읽는다. 새로 추가된 구간을 같은 소켓으로 보내며, 화면을 닫으면 로그 파일 조회도 중단된다. 파일 전체를 반복해서 보내지 않는다.

## 반영 파일

### Agent

1. 공개 샘플 저장소의 `public`에서 소스를 받아 독립된 테스트 환경에 적용한다.
2. 기존 DB를 백업한다. 새 `V18__collector_transport.sql`은 프로젝트 XLog 설정, 인스턴스 전송 방식, 수신 기록 테이블과 감사 항목을 추가한다. 기존 Flyway 파일이나 체크섬을 수정하지 않는다.
3. Agent 전체를 빌드하고 배포한다. 실행 시 Flyway가 V18을 적용한다. 기존 프로젝트·계정·토큰은 유지된다.
4. HTTPS/WSS를 제공하는 기존 프록시에서 `/collector/connect`의 WebSocket Upgrade가 Agent까지 전달되어야 한다. Agent가 직접 TLS를 제공하는 구성도 가능하다.
5. Agent를 재기동한 후 각 WSS 인스턴스를 수동으로 연결한다. 재기동했다고 대상에 연결 시작 요청을 자동으로 보내지 않는다.

현재 `compose.server.yaml`의 Caddy `reverse_proxy`는 WebSocket Upgrade를 전달한다. 다른 프록시를 사용할 때는 해당 경로의 Upgrade 전달과 idle timeout을 확인한다.

### 대상 WAS

| 파일 | 위치 | 구분 |
| --- | --- | --- |
| `collector/target/collector-0.1.0-SNAPSHOT.jar` | 대상 웹앱 `WEB-INF/lib/` | 기존 Collector JAR 교체 |
| `monitor.properties` | 기존 `dcp.properties`와 같은 설정 디렉터리 또는 별도 보호된 경로 | 신규 또는 기존 설정 파일에 키 추가 |
| `web.xml` | 대상 웹앱 `WEB-INF/web.xml` | `configLocation`과 선택적 XLog 필터 등록 |

동일한 Collector 클래스가 들어 있는 구버전 JAR을 함께 두지 않는다. `original-collector-*.jar`은 반영하지 않는다. JAR 안에 Gson과 WebSocket 클라이언트를 별도 패키지로 포함하므로 별도 라이브러리를 추가할 필요가 없다.

기존 프로젝트 Configurer와 API 점검 클래스는 유지할 수 있다. **Configurer의 클래스명·패키지·배치 경로를 변경하지 않는다.** 이 경우 `configurerClass`도 기존 값을 유지한다. Configurer는 프로젝트 특화 점검과 DB Pool 연결을 계속 담당하고, 공통 WSS 설정은 아래 `configLocation`에서 읽는다.

기본 CPU·RAM·JVM·디스크·XLog만 사용하는 신규 프로젝트는 Configurer 없이 JAR + properties + web.xml로 연결할 수 있다. 기존 애플리케이션의 Spring 설정이나 Controller를 수정할 필요가 없다. 프로젝트 전용 API와 DB Pool은 기존 확장 코드 또는 선언형 점검으로 구성한다.

## properties 작성

다음은 **Configurer 없이 사용하는 신규 프로젝트** 예시다. 아래 표시한 토큰과 URL은 실제 값으로 바꾼다. 환경변수 치환을 자동으로 수행하지 않으므로 `${TOKEN}` 문자열을 그대로 넣지 않는다.

```properties
monitor.project-id=sample-a
monitor.instance-id=prod
monitor.token=REPLACE_WITH_A_RANDOM_TOKEN_OF_AT_LEAST_32_BYTES

# Collector가 접속할 고정 Agent 주소. 토큰은 URL에 넣지 않는다.
monitor.central.url=wss://monitor.example.com/collector/connect

# WAS 계정에서 읽을 수 있는 디렉터리만 지정. 여러 경로는 세미콜론 구분.
monitor.log.allowed-roots=/usr/local/tomcat/logs

monitor.disk.webapp.path=/usr/local/tomcat/webapps/ROOT
monitor.disk.webapp.name=Webapp disk
monitor.disk.attachments.path=/data/uploads
monitor.disk.attachments.name=Attachment disk
```

**기존 Configurer 사용 프로젝트**는 기존 토큰·프로젝트 식별 키를 유지하고, `monitor.central.url`과 `monitor.log.allowed-roots`를 기존 설정 파일에 추가하면 된다. 토큰은 Configurer가 읽던 값과 대시보드에 등록한 값이 같아야 한다. 다른 프로젝트의 토큰을 재사용하지 않는다.

Windows properties에서는 역슬래시가 이스케이프 문자다. 경로는 다음처럼 `/`로 작성한다.

```properties
monitor.log.allowed-roots=D:/WEB/tomcat/logs
monitor.disk.webapp.path=D:/WEB/sample/app
monitor.disk.attachments.path=D:/WEB/sample/data
```

`Properties.load(InputStream)` 규격을 사용한다. 한글 값은 `\uXXXX` 이스케이프를 사용하거나 기존 Configurer의 표시명을 유지한다. Linux와 Windows의 경로를 혼합하지 않는다.

로컬 통신만 시험하는 경우에 한해 다음을 사용한다. 원격 `ws://`는 이 설정을 켜도 거부한다. 운영에는 사용하지 않는다.

```properties
monitor.central.url=ws://127.0.0.1:8080/collector/connect
monitor.websocket.allow-local-ws=true
```

## web.xml 변경

아래 Servlet이 이미 있으면 새로 하나 더 등록하지 말고 **기존 등록에 `configLocation`만 추가**한다. 기존 `configurerClass`는 그대로 둔다. 신규 기본 구성은 아래처럼 Configurer 없이 작성한다.

```xml
<servlet>
    <servlet-name>monitor</servlet-name>
    <servlet-class>com.monitoring.collector.servlet.MonitorServlet</servlet-class>
    <init-param>
        <param-name>configLocation</param-name>
        <param-value>/WEB-INF/dcp/properties/monitor.properties</param-value>
    </init-param>
    <load-on-startup>1</load-on-startup>
</servlet>
<servlet-mapping>
    <servlet-name>monitor</servlet-name>
    <url-pattern>/monitor/v1/*</url-pattern>
</servlet-mapping>
```

`/WEB-INF/...`는 **현재 웹앱 루트 기준**이다. 예를 들어 설정을 `D:/WEB/sample/app/WEB-INF/dcp/properties/monitor.properties`에 두면 위 `configLocation` 그대로 사용한다. `WEB-INF/classes`로 이동할 필요가 없다. 절대 파일 경로를 사용할 수도 있다. 상대 파일 경로는 피한다.

XLog 사용 시 다음 필터를 등록한다. **Servlet 3.0 이상(Tomcat 7 이상), Java 7 이상**이 필요하다. Tomcat 10+의 `jakarta.servlet` 웹앱용 JAR은 아니다.

```xml
<filter>
    <filter-name>monitorXlog</filter-name>
    <filter-class>com.monitoring.collector.servlet.XlogFilter</filter-class>
    <async-supported>true</async-supported>
</filter>
<filter-mapping>
    <filter-name>monitorXlog</filter-name>
    <url-pattern>/*</url-pattern>
    <dispatcher>REQUEST</dispatcher>
</filter-mapping>
```

XLog 필터 매핑을 기존 필터 매핑보다 앞에 두면 전체 필터 체인의 처리 시간을 포함한다. `ASYNC`, `FORWARD`, `INCLUDE`, `ERROR` 매핑을 추가하지 않는다. 비동기 요청은 AsyncListener로 종료 시점을 기록하여 중복 집계를 피한다. 이 필터 때문에 기존 다른 필터의 async 설정을 임의로 변경하지 않는다.

JAR 교체·web.xml 변경 후 WAS를 한 번 재기동한다. 이후 연결 시작·종료와 XLog 사용 변경에는 재기동이 필요하지 않다.

## 대시보드 적용 순서

1. 기존처럼 프로젝트와 인스턴스를 등록한다. Collector의 식별 값과 동일한 ID, 기존 HTTPS 기본 URL, 토큰을 입력한다.
2. 인스턴스 상세 상단에서 **수집 방식 → WSS 연결**을 선택한다. 이 선택만으로 연결하지 않는다.
3. **연결 시작**을 누르고 `연결됨`을 확인한다. 자원 화면에서 최근 수집 시각이 갱신되는지 확인한다.
4. 프로젝트 관리 또는 인스턴스 상세의 **프로젝트 XLog → 사용**을 선택한다. 프로젝트 내 연결된 모든 인스턴스에 적용된다.
5. 대상 웹 페이지를 요청한 뒤 **XLog** 탭에서 요청 경로·HTTP 상태·처리 시간을 확인한다. 차트는 가로축 시작 시각, 세로축 처리 시간(ms)이며 오류 응답은 붉은 점으로 표시한다.
6. 실시간 로그에 파일 경로와 인코딩, 조회 주기, 사용 여부를 등록한다. Linux Tomcat 예: `/usr/local/tomcat/logs/catalina.out`. Collector의 허용 디렉터리 안에 있어야 한다.
7. 실시간 로그 화면에서 받은 WSS 로그 구간은 **저장된 로그**에서도 확인한다. HTTP 모드의 기존 로그 조회는 임시 공유 버퍼 방식 그대로다.
8. 연결 종료 후 자원이 더 수집되지 않고 XLog가 늘어나지 않는지 확인한다. 다시 연결 시작을 누르면 수동으로 재개한다.

브라우저가 Agent의 상태·저장 결과를 조회하는 갱신 요청은 대상 WAS로 전달되지 않는다. 파일 로그 읽기와 점검 명령은 WSS를 이용하지만, 파일 로그 화면을 계속 열어 놓으면 설정한 주기마다 대상 파일을 읽는다.

## 자원·보관 한도

| 항목 | 현재 한도·정책 |
| --- | --- |
| 연결 시도 | 요청당 1회, TCP 연결 3초·핸드셰이크 읽기 5초·전체 연결 시작 10초 제한 |
| 연결 유지 | 약 30초마다 짧은 heartbeat/ping. 무응답 시 약 65~75초 이후 종료, 자동 재시도 없음 |
| XLog 대상 버퍼 | 최대 500건, 초과 시 오래 기다리지 않고 새 기록 제외 |
| XLog 전송 | 최대 50건을 약 1초 간격으로 묶음 전송. 초과 제외 건수 표시 |
| 대상 명령 대기열 | 실행 스레드 1개·대기 명령 16개 |
| 송신 프레임 대기열 | 8개. 송신은 전용 작업에서 수행하고 업무 요청에서 네트워크를 기다리지 않음 |
| 파일 로그 | 한 번에 최대 128 KiB, 기존 커서로 추가 구간만 조회, 파일 읽기 동시 실행 제한 |
| 중앙 연결 | 최대 64개(연결 시도 포함) |
| 중앙 명령 | 연결별 최대 16개 대기, 응답 5초 제한 |
| 중앙 기록 작업 | 스레드 2개·대기 작업 100개. 초과 시 연결 종료 |
| 수신 데이터 | 소켓 메시지 최대 1 MiB, XLog 한 묶음 최대 50건·경로 최대 512자 |
| 중앙 보관 | 최대 24시간, 인스턴스별 XLog 최근 5,000건·로그 구간 최근 100개 |
| 보관 정리 | 30초 간격. 정리 직전에는 건수 한도를 일시적으로 초과할 수 있음 |

메모리·스레드·읽기·전송량을 제한하지만 **부하가 0인 기능은 아니다.** 요청이 초당 50건 이상이면 요약 일부가 제외될 수 있어 전수 감사 로그로 사용하면 안 된다. 이 구현의 XLog는 웹 요청 요약이며 Scouter처럼 SQL·메서드 호출 추적을 제공하지 않는다.

원문 파일 로그는 토큰·개인정보가 포함될 수 있다. 기존 로그 허용 경로를 유지하고 저장된 로그 접근도 관리자·운영자로 제한한다. XLog는 쿼리·본문·쿠키·헤더를 수집하지 않지만 URL 경로 자체에 개인정보가 있는 서비스에서는 사용 전 검토한다. 보관한 기록은 XLog를 미사용으로 변경해도 보관 정책에 따라 남는다.

## 연결 실패 확인

| 상황 | 확인 |
| --- | --- |
| INIT_FAILED | properties 실제 경로, `configLocation`, 기존 Configurer 클래스·의존성·토큰 확인 |
| 연결 시작 실패 | Agent에서 대상 HTTPS API 접근 및 토큰 확인, Collector 최신 JAR과 URL 설정 확인 |
| 연결 시도 후 실패 | 대상에서 Agent 443 아웃바운드, DNS, 인증서 신뢰·호스트명, 프록시 Upgrade 확인 |
| 연결됐으나 끊김 | 프록시 idle timeout·보안 정책, 느린 수신·대기열 상한, Agent 상태 확인 |
| XLog 없음 | 프로젝트 XLog 사용, 연결 상태, web.xml 필터 등록과 대상 웹 요청 발생 확인 |
| 로그 없음 | 로그 사용 여부, 허용 경로·파일 권한·인코딩, 실시간 로그 화면 조회 확인 |

WSS도 네트워크팀과 보안 장비에서 감지·차단할 수 있다. 443이라는 이유만으로 아웃바운드나 WebSocket이 허용되는 것은 아니다. Java 코드만으로 인프라 정책을 우회하지 않는다. Java 7에서는 TLS 1.2를 명시적으로 사용하며 기본 신뢰 저장소와 호스트명 검증을 유지한다. 오래된 JRE의 CA 저장소에 필요한 루트 인증서가 없으면 연결이 실패할 수 있다. 승인된 경로에서 테스트하며 TLS 인증서 검증을 끄지 않는다.

## 검증과 되돌리기

로컬 기능 검증 결과와 아직 필요한 운영 검증은 [검증 기록](collector-wss-verification.md)에 정리했다. 빌드한 JAR의 Java 7 바이트코드·API 호환성 검사는 실제 Java 7 WAS의 TLS·업무 부하 검증을 대신하지 않는다.

저장소 루트에서 JDK 21로 다음을 실행한다. Collector만 빌드할 때는 `./mvnw -pl collector verify`, Windows에서는 `./mvnw.cmd -pl collector verify`를 사용한다.

```shell
./mvnw -pl agent,collector,collector-testapp -am verify
```

전체 빌드는 프런트엔드를 포함한다. 실제 반영할 Collector 파일은 `collector/target/collector-0.1.0-SNAPSHOT.jar`이며 `original-` 파일은 배포하지 않는다. 로컬 전달용 일반 디렉터리는 `.run/collector-wss-deploy/`에 준비하며 Git에는 포함하지 않는다.

적용 전 업무 요청 지연·CPU·Heap·스레드 수를 기록하고, 같은 트래픽에서 XLog 미사용/사용을 비교한다. 연결 종료와 Agent 종료 후 추가 연결이 발생하지 않는지도 확인한다. 프로젝트별 실제 운영 부하 수치는 현장 검증 전에는 보장하지 않는다.

문제가 있으면 XLog를 미사용으로 바꾸고 연결 종료한다. 기존 HTTP 수집으로 돌아가려면 수집 방식을 HTTP 조회로 변경한다. JAR 자체를 되돌리는 경우 백업 JAR과 web.xml을 복원하고 WAS를 재기동한다. V18 테이블이 추가된 상태로 기존 기능을 이용할 수 있으므로 운영 DB에서 Flyway 이력을 임의로 삭제하지 않는다.

## 기존 프로젝트 properties 통합

프로젝트 Configurer에서 기존 Properties를 `builder.configuration(properties)`로 전달하면 공통 통신·로그 설정을 함께 사용할 수 있다. 전달 대상은 `monitor.central.url`, `monitor.log.allowed-roots`, `monitor.websocket.allow-local-ws`이며 업무 API 키는 복사하지 않는다. 이 경우 Servlet의 별도 `configLocation`은 생략할 수 있다. 별도 설정 파일을 쓰는 기존 프로젝트 구성도 유지된다.
