# Agent와 Collector

| 구성 | 역할 | 모듈 | Java 패키지 | 빌드 산출물 |
|---|---|---|---|---|
| Agent | 중앙 수집 서버와 대시보드 | `agent` | `com.monitoring.agent` | `agent/target/agent-0.1.0-SNAPSHOT.jar` |
| Collector | 대상 WAS 내부의 자원·점검·로그 수집 | `collector` | `com.monitoring.collector` | `collector/target/collector-0.1.0-SNAPSHOT.jar` |
| 예제 WAS | Collector 적용 검증 | `collector-testapp` | `com.monitoring.collector.testapp` | `collector-testapp/target/collector-testapp-0.1.0-SNAPSHOT.war` |

Maven groupId는 `com.monitoring`, 루트 artifactId는 `monitoring`입니다. Java 7 호환 범위는 Collector와 예제 WAS이며 Agent는 Java 21을 사용합니다.

## 기존 설치에서 전환

Agent와 기존 Collector의 HTTP 연동 규격, `/monitor/v1` 경로, 토큰 헤더 및 JSON 필드명은 유지합니다. 중앙 서버부터 전환하더라도 기존 Collector와 통신할 수 있습니다.

대상 WAS에 새 Collector JAR을 설치할 때는 프로젝트 Configurer도 함께 다시 컴파일해야 합니다. import는 `com.monitoring.collector`, 빌더는 `MonitorCollectorBuilder`, SPI는 `MonitorCollectorConfigurer`를 사용합니다. Servlet 등록 클래스는 `com.monitoring.collector.servlet.MonitorServlet`입니다. Configurer의 자체 패키지는 바꾸지 않아도 되지만 `web.xml`의 `configurerClass`는 컴파일 결과의 실제 클래스 경로와 일치해야 합니다.

기존 수집 JAR과 새 Collector JAR을 같은 `WEB-INF/lib`에 중복 설치하지 않습니다. Configurer와 Servlet 설정을 함께 반영하고 WAS를 재시작한 뒤 `/monitor/v1/info`와 `/monitor/v1/snapshot`을 확인합니다.

기존 운영 환경의 설정 키, DB 이름·계정, Docker 데이터 볼륨, 세션 키는 호환을 위해 유지합니다. 이들 설정에 남아 있는 이전 접두어는 Java 패키지명이 아닙니다. DB 데이터나 기존 토큰을 새로 등록할 필요는 없습니다.

빌드는 프로젝트 루트에서 `./mvnw.cmd package`로 실행합니다. 프론트엔드 작업 경로는 `agent/frontend`입니다.
