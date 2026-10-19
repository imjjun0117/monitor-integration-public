# 요청 기반 WebSocket·XLog 검증 기록

검증일: 2026-10-05. 가상 프로젝트와 로컬 테스트 계정을 사용했다. 운영 고객의 주소·토큰·로그는 증거에 포함하지 않는다.

## 기능 검증

실제 Tomcat 웹앱의 `WEB-INF/lib`에 배포용 Collector JAR을 넣고 `/WEB-INF/dcp/properties/monitor.properties`를 읽었다. 프로젝트 Configurer 없이 기본 구성이 초기화되는 것을 확인했다. 중앙 Agent와 실제 브라우저를 연결한 시험은 localhost `ws://`를 사용했다. 운영 인증서의 WSS 성공을 주장하는 시험은 아니다.

| 항목 | 확인 결과 |
| --- | --- |
| 최초 실행 | Collector가 IDLE로 대기하고 연결을 시작하지 않음 |
| 명시적 시작 | 대시보드의 연결 시작 클릭 후 연결됨으로 전환 |
| 자원 전송 | 중앙 resources에 최근 snapshot 저장 |
| 웹 요청 요약 | 동기 요청 5건·비동기 요청 1건 기록 |
| 비동기 상태 | 실제 HTTP 202와 저장된 XLog 상태 202 일치 |
| 정보 최소화 | 요청 쿼리 문자열이 XLog에 포함되지 않음 |
| 파일 로그 | WSS 명령으로 추가 구간을 읽고 중앙 LOG 기록 저장 |
| XLog 미사용 | 새 요청 후 기록 건수가 늘어나지 않음 |
| 명시적 종료 | CLOSED로 전환, XLog 미사용·버퍼 정리, 자동 재연결 없음 |
| 화면 | 라이트·다크 모드 확인, 브라우저 콘솔 오류 0건 |

브라우저 검증 스크립트·결과·화면은 로컬 `.run/wss-fixture/`에 보관한다. 이 디렉터리에는 테스트 설정이 포함될 수 있어 Git에 올리지 않는다. 자동 테스트의 유지 가능한 근거는 아래 소스 파일에 있다.

## 자동 검증

- Collector 테스트 57개 통과. 중복 시작, 인증 ticket, 실패 후 재시도 금지, XLog 500건 버퍼와 제외 건수, 비동기 종료 중복 방지, 초기화 실패 처리와 기존 HTTP 동작을 검증했다. 웹앱별 환경·context path가 다른 인스턴스에 섞이지 않는 것도 확인했다.
- 화면 테스트 138개 통과. 새 연결 패널은 진입만으로 시작 API를 호출하지 않으며, 조회 권한으로 연결·XLog 설정을 변경하지 못한다.
- 중앙 테스트 161개 통과. 계약·권한 테스트는 새 경로의 CSRF, 프로젝트 범위, 역할 권한, 로그 원문 조회 제한과 감사 이력을 검증한다.
- Collector `verify`의 Java 7 API 검사 통과. 배포 클래스의 major version은 51이다. 이는 Java 7 JVM에서의 실제 TLS 시험을 대신하지 않는다.
- OpenAPI 검사, 생성 코드 일치 검사, TypeScript 검사와 프런트엔드 빌드를 실행한다.

주요 테스트 파일:

- `collector/src/test/java/com/monitoring/collector/CollectorConnectionTest.java`
- `collector/src/test/java/com/monitoring/collector/servlet/XlogFilterTest.java`
- `collector/src/test/java/com/monitoring/collector/servlet/MonitorServletInitializationTest.java`
- `agent/src/test/java/com/monitoring/agent/transport/CollectorTransportHubTest.java`
- `agent/src/test/java/com/monitoring/agent/security/ProjectRolesIntegrationTest.java`
- `agent/frontend/src/components/TransportPanel.test.tsx`

## 운영 적용 전 남은 검증

1. 대상 Java 7/8 WAS에서 인증서 신뢰·TLS 1.2·프록시 Upgrade와 아웃바운드 목적지 허용을 확인한다.
2. 동일 업무 트래픽에서 XLog 미사용·사용의 CPU, Heap, GC, 스레드 수와 업무 응답시간을 비교한다.
3. 중앙 강제 종료, 느린 수신, 장기 단절, 반복 WAS 재배포를 시험한다. 로컬 기능 테스트만으로 장기 누수나 운영 부하를 보장하지 않는다.
4. 초당 50건을 넘는 웹 요청과 대량 로그에서 제외 건수·대기열 상한·파일 회전 처리를 확인한다.

XLog는 웹 요청 요약이다. SQL·메서드 호출 추적 또는 무손실 감사 로그는 제공하지 않는다. 파일 로그는 조회 화면을 열어 둔 동안 설정 주기로 추가 구간을 읽는다. HTTP 요청이 줄어도 WSS 데이터와 heartbeat가 발생하므로 전체 네트워크 비용의 감소율은 따로 측정해야 한다.

반영 절차는 [적용 가이드](collector-wss-deployment.md)를 따른다.
