# 문제 해결 기록

각 기록은 같은 네 항목으로 작성합니다.

## Java 7 Collector 로컬 컴파일

1. **기능 정보**: 단계 2 `collector`의 Java 7 바이트코드/API 호환과 JDK 21 로컬 Maven 검증입니다.
2. **발생한 문제**: `./mvnw verify`에서 `Source option 7 is no longer supported`와 `Target option 7 is no longer supported`가 발생했습니다. JDK 21 `javac`가 source/target 7을 제거한 것이 원인입니다.
3. **해결 방법**: `collector/pom.xml`의 source/target 1.7은 유지하고 Eclipse ECJ compiler를 사용했습니다. Animal Sniffer `java17` API 서명 검사를 추가했습니다. source/target을 8로 올리지 않은 이유는 배포 계약을 지키기 위해서입니다.
4. **해결 결과**: `./mvnw -pl collector verify`가 `BUILD SUCCESS`, 테스트 3건 PASS, Animal Sniffer PASS였습니다. `javap -verbose .../MonitorRuntime.class`는 `major version: 51`을 출력했습니다.

## Servlet 2.5 테스트 WAR

1. **기능 정보**: 단계 2 `collector-testapp`의 Servlet 2.5 WAR 패키징입니다.
2. **발생한 문제**: 전체 Maven 빌드에서 `webxml attribute is required`로 실패했습니다. `WEB-INF/web.xml`이 실제 WAR 소스에 없었습니다.
3. **해결 방법**: `collector-testapp/src/main/webapp/WEB-INF/web.xml`을 만들고 `MonitorServlet`, configurer init-param, `/monitor/v1/*` mapping을 명시했습니다. 테스트용 `TestConfigurer`도 추가했습니다.
4. **해결 결과**: 수정 뒤 전체 `./mvnw verify`에서 `collector-testapp SUCCESS`와 전체 `BUILD SUCCESS`를 확인했습니다.

## 프론트 TypeScript lint

1. **기능 정보**: 단계 4 React/TypeScript/PatternFly 빌드의 `npm run lint` 게이트입니다.
2. **발생한 문제**: TypeScript 7에서 PatternFly CSS side-effect import를 찾지 못해 `TS2882`가 발생했습니다. 이후 Maven과 수동 `npm ci`를 동시에 실행했을 때 `node_modules` 경합으로 모듈 전체를 찾지 못하는 오류도 발생했습니다.
3. **해결 방법**: `src/vite-env.d.ts`에 CSS module 선언을 추가했고, 동시에 두 `npm ci`를 실행하지 않도록 검증을 직렬화했습니다.
4. **해결 결과**: `npm run lint`가 exit 0, `npm run test:run` 3건 PASS, `npm run build`가 exit 0으로 끝났습니다.

## 프론트 취약 의존성

1. **기능 정보**: 단계 4/CI의 npm High/Critical 취약점 차단입니다.
2. **발생한 문제**: 최초 `npm audit`에서 React Router, Vite, Vitest 등에 High/Critical을 포함한 5건이 나왔습니다.
3. **해결 방법**: `package.json`과 lockfile을 React 19.2.8, TypeScript 7.0.2, Vite 8.2.2, ECharts 6.1.0 및 보안 수정 React Router/Vitest로 정확히 고정했습니다.
4. **해결 결과**: `npm audit --audit-level=high`가 exit 0과 `found 0 vulnerabilities`를 출력했습니다.

## Vitest와 Playwright 테스트 분리

1. **기능 정보**: 단계 4 단위 테스트와 E2E 테스트의 독립 실행입니다.
2. **발생한 문제**: Vitest가 `e2e/core-flow.spec.ts`까지 읽어 Playwright의 `test()`를 잘못 실행했고 Maven unit-test 게이트가 실패했습니다.
3. **해결 방법**: `vite.config.ts`에서 Vitest include를 `src/**/*.test.ts(x)`로 제한했습니다. Playwright는 `e2e` 디렉터리만 별도 실행합니다.
4. **해결 결과**: 전체 `./mvnw verify`가 `BUILD SUCCESS`였고, `npm run test:e2e`는 2건 PASS였습니다.

## 화면 접근성

1. **기능 정보**: 단계 4 Playwright + axe 접근성 게이트입니다.
2. **발생한 문제**: 첫 E2E에서 `document-title`, `html-has-lang` 두 serious 위반이 발견됐습니다.
3. **해결 방법**: `frontend/index.html`에 `lang="ko"`, UTF-8, viewport, 의미 있는 `<title>`을 추가했습니다.
4. **해결 결과**: `npm run test:e2e` 재실행에서 핵심 이동과 axe 검사 2건이 모두 PASS했습니다.

## Flyway가 시작 전에 실행되지 않음

1. **기능 정보**: 단계 3 새 PostgreSQL에서 Flyway → 관리자 seed → scheduler 순서의 실제 Spring Boot 시작 검증입니다. 검증 시각은 2026-09-03 15:22~15:27 KST, 중앙 포트는 loopback `8080`, DB 포트는 loopback `5432`였습니다.
2. **발생한 문제**: 15:22:06 시작한 JAR은 `Started AgentApplication in 5.433 seconds (process running for 6.759)`를 남긴 뒤 약 14초 생존하고 exit code `1`로 종료됐습니다. 누락 relation은 정확히 3종 `certificate_targets`, `instances`, `app_users`였습니다. 원인은 Spring Boot 4 구성에서 Flyway core/PG 모듈과 SQL 2개는 JAR에 있었지만 migration initializer가 활성화되지 않아, 15초 snapshot/5분 API/6시간 인증서 scheduler와 `AdminSeeder`가 빈 schema를 먼저 조회한 것입니다.
3. **해결 방법**: 먼저 `MigrationStartupIntegrationTest`를 추가해 빈 Testcontainers PostgreSQL 17.11에서 같은 실패를 재현했습니다(1건 중 error 1, exit code `1`, Maven 39.698초). 이어 `FlywayConfiguration.java`에 `classpath:db/migration`을 고정한 `Flyway` init-method `migrate` bean을 추가했습니다. 모든 singleton 초기화 중 migration 2개가 끝난 뒤 context refresh와 scheduler 등록이 진행되도록 선택했습니다. 예외를 삼키거나 scheduler 시작을 늦춰 증상을 숨기지 않았습니다.
4. **해결 결과**: 같은 통합 명령은 테스트 1/1 PASS, 실패/오류/skip 0, exit code `0`, Maven 50.712초였습니다. 전체 `./mvnw verify`는 54.711초 및 최종 46.093초에 exit code `0`, 3개 모듈 모두 SUCCESS였습니다. 새 DB 실제 JAR은 `Started ... in 5.134 seconds (process running for 5.985)`였고 26초 확인 시 계속 생존했습니다. `GET http://127.0.0.1:8080/actuator/health`는 HTTP `200`, `status=UP`이었습니다. DB에는 필수 table 5종과 fixture 프로젝트 2개/인스턴스 4개, 성공 migration 2개가 있었습니다. JAR에는 SQL 2개, `flyway-core-12.4.0.jar`, `flyway-database-postgresql-12.4.0.jar`가 있었습니다. 전후 relation 오류는 3종→0종, startup exit code는 1→0(생존), health는 응답 불가→200으로 바뀌었습니다.

## `.env`의 BCrypt 달러 문자

1. **기능 정보**: 단계 0 PowerShell 자동 설정과 Docker Compose 환경 파일 처리입니다.
2. **발생한 문제**: 평문 `.env`의 BCrypt `$` 구간을 Compose가 변수로 해석해 경고를 출력했습니다. 또한 개발 백엔드 프로세스에 `.env`를 넣는 단계가 빠져 있었습니다.
3. **해결 방법**: `setup-local.ps1`은 값을 작은따옴표로 감싸 저장하고, `setup-local.ps1`/`dev-up.ps1`이 따옴표를 제거해 현재 프로세스 환경으로 안전하게 적재하도록 바꿨습니다. 기존 `.env`는 덮어쓰지 않습니다.
4. **해결 결과**: 같은 형식으로 Compose를 다시 시작했을 때 BCrypt 변수 확장 경고 없이 PostgreSQL `pg_isready`가 `accepting connections`를 반환했습니다. `pwsh` 자체 실행은 호스트에 실행 파일이 없어 미완료입니다.

## 실행 중 JAR 덮어쓰기와 health hang

1. **기능 정보**: 단계 3/6의 패키징된 중앙 JAR 장기 생존 및 `127.0.0.1:8080/actuator/health` 연속 HTTP 응답 검증입니다. health timeout은 5,000ms, 통합 테스트 연속 요청은 3회, 외부 smoke는 전후 각 5회입니다.
2. **발생한 문제**: 첫 수정 JAR은 시작 뒤 uptime 253초까지 살아 있었지만 health가 5.000498초 후 HTTP `000`, curl exit `28`, response 0 bytes로 timeout 됐습니다. 로그 누락 class는 1종 `ch.qos.logback.classic.spi.ThrowableProxy`였습니다. 원인은 실행 중인 Spring Boot fat JAR 경로를 이후 `mvn verify`가 교체하여, nested JAR classloader가 지연 로딩 시 바뀐 archive offset을 읽은 것입니다. 최종 JAR 자체에는 `logback-classic-1.5.38.jar`가 있었습니다.
3. **해결 방법**: `tools/check-health.mjs`를 먼저 만들고 기존 PID에 실행해 5초 timeout/exit 1을 재현했습니다. 실행 중인 PID를 종료한 뒤 최종 JAR을 `.run/package-smoke/agent.jar`로 복사해 immutable 경로에서 재기동했습니다. `MigrationStartupIntegrationTest`에는 5초 제한의 health 연속 3회 검사를 추가했고, `scripts/build.ps1`은 `.run/pids`가 있으면 빌드를 거부하도록 바꿨습니다. class 누락을 dependency 추가로 숨기지 않은 이유는 실제 원인이 archive 교체였기 때문입니다.
4. **해결 결과**: 첫 복사본은 840초 가까이 정상 생존한 뒤 graceful shutdown됐고, 최종 산출물 복사본도 시작 뒤 uptime 166초에 running이었습니다. 이전 복사본의 15/15 health 요청과 최종 복사본의 10/10 요청이 모두 HTTP 200/49 bytes였습니다. 최종 두 묶음 응답시간은 288/13/10/10/9ms와 91/10/7/9/12ms, 실패 0, 각 제한 5,000ms입니다. 전후 health는 HTTP 000→200, exit 28→0, bytes 0→49, 누락 class 1종→0종이 됐습니다. 통합 HTTP/DB/CSRF 테스트는 최종 3/3 PASS입니다.

## 비동기 check endpoint가 실행을 접수하지 않음

1. **기능 정보**: 단계 2 Collector `/checks/run`과 `/checks/results`, bounded executor의 등록 check 실행 계약입니다. body 제한은 16KB, 한 요청 check ID 제한은 20개, 전체 deadline은 10초입니다.
2. **발생한 문제**: Servlet이 202를 반환했지만 항상 빈 `accepted_check_ids`를 내보내 실제 check를 executor에 넣지 않았습니다. 새 행동 테스트 첫 실행은 정의되지 않은 `runCheck/results` 메서드 3건으로 test compilation FAIL, exit code 1, 1.742초였습니다.
3. **해결 방법**: 테스트를 먼저 추가해 등록 ID 접수, 미등록 ID 거부, 최신 결과 보관을 고정했습니다. `MonitorRuntime`에 check lookup/submit/results를 추가하고, `MonitorServlet`은 실제 byte 기준 16KB 제한, JSON/requested_by 검증, 최대 20개, job UUID, accepted/rejected 결과를 구현했습니다. 토큰 reflection도 public constant-time 경계 호출로 제거했습니다.
4. **해결 결과**: `./mvnw -pl collector verify` 재실행은 Agent 테스트 4/4 PASS, 실패/오류/skip 0, Animal Sniffer PASS, exit code 0, 3.840초였습니다. 미등록 check는 실행되지 않고 `NOT_REGISTERED`, 중복은 `ALREADY_RUNNING`입니다.

## 중앙 변경·즉시 실행 API 누락

1. **기능 정보**: 단계 3 중앙의 인스턴스 변경/연결 시험, API 즉시 점검, 인증서 CRUD/즉시 검사, 임계치 변경 REST 기능입니다. 수동 API 점검 rate limit은 check별 30,000ms입니다.
2. **발생한 문제**: OpenAPI에는 경로가 있었지만 구현 class 4개가 없어 stage3c 계약 테스트가 2건 중 실패 2, 통과 0, exit code 1, 112.291ms였습니다.
3. **해결 방법**: 실패 테스트를 먼저 만든 뒤 `InstanceActionsController`, `CheckActionsController`, `CertificateController`, `ThresholdController`를 추가했습니다. token은 응답하지 않고 변경 때만 암호화하며, check ID는 DB 등록 여부를 먼저 확인하고, TLS는 시스템 trust/hostname 검증을 사용합니다.
4. **해결 결과**: `node --test tests/stage3c.test.mjs`는 2/2 PASS, 실패 0, exit code 0, 117.313ms였습니다. 첫 Java compile에서 JSON 문자열 escape 오류 10건으로 exit 1/1.439초가 발생해 ObjectMapper 기반 직렬화/파싱으로 바꿨고, `./mvnw -pl agent compiler:compile`은 source 19개, exit code 0, `BUILD SUCCESS`, 2.000초였습니다.

## 통합 테스트 fixture 격리

1. **기능 정보**: 단계 3 Testcontainers에서 migration fixture 수와 인증/CSRF API를 한 context에서 검증하는 테스트 격리입니다.
2. **발생한 문제**: CSRF 성공 테스트가 프로젝트 1개를 추가한 뒤 정리하지 않아 fixture count 테스트가 예상 2, 실제 3으로 실패했습니다. focused suite 3건 중 실패 1, exit code 1, Maven 35.356초였습니다.
3. **해결 방법**: 상태 변경 검증 직후 시험용 `csrf-test` 프로젝트를 명시적으로 삭제해 테스트 간 DB 상태를 원래 fixture 2개로 복원했습니다. 기대값을 3으로 느슨하게 바꾸지 않아 fixture 계약을 유지했습니다.
4. **해결 결과**: 같은 `./mvnw -pl agent -Dtest=MigrationStartupIntegrationTest test`는 3/3 PASS, 실패/오류/skip 0, exit code 0, test 10.52초, Maven 49.305초였습니다. 프론트 단위 테스트도 같은 실행에서 3/3 PASS했습니다.

## PowerShell 실행 파일 부재

1. **기능 정보**: 단계 0/6 최종 `setup-local.ps1`, `dev-up.ps1`, `verify.ps1` 실제 실행 게이트입니다.
2. **발생한 문제**: 2026-09-03 KST 최종 시도에서 호스트에 `pwsh` 실행 파일이 없었습니다. 세 명령 모두 `/bin/bash: pwsh: command not found`, exit code 127이었고 재시도는 각 1회입니다.
3. **해결 방법**: 시스템 전역 패키지를 임의 설치하지 않았습니다. 대신 각 PowerShell 스크립트를 작성하고, 동일 하위 동작을 로컬 JDK 21, Docker Compose, Maven, npm, Playwright 명령으로 개별 실행해 검증했습니다. Windows/PowerShell 문법의 실제 런타임 검증은 승인된 환경으로 남겼습니다.
4. **해결 결과**: PowerShell 3개 자체는 FAIL/blocked(3/3, exit 127)이며 성공으로 보고하지 않습니다. 대체 게이트는 Maven 3모듈 SUCCESS 54.676초, Node 계약 28/28 PASS, frontend unit 3/3, E2E 2/2, audit 0건, 실제 health 10/10 PASS였습니다. 수동 `pg_dump -Fc`/`pg_restore -l`도 exit 0이고 dump 크기는 30,560 bytes였습니다.

## portable PowerShell 인계 게이트

1. **기능 정보**: 2026-09-04 13:24~13:36 KST에 Intel Mac용 공식 PowerShell 7.6.5 portable archive를 ignored `.tools/pwsh`에만 설치했습니다. 공식 release asset과 `hashes.sha256`을 사용했고 archive SHA-256은 expected/actual 모두 `3db1d177ab39511c1b6b73b05a1630a5db4e8dce22857ca76f14c5d98f2733fd`였습니다. 8개 PowerShell script parser 검사는 8/8 PASS, exit 0입니다.
2. **발생한 문제**: 첫 `setup-local.ps1`은 native stderr를 pipeline으로 즉시 가공해 `$LASTEXITCODE`를 잃고 정상 JDK 21을 거부했습니다(exit 1, 1.51초). 또한 setup/dev-up이 Unix에서도 `mvnw.cmd`를 고정 사용했습니다. 수정 후 기존 `.env`에는 새 sample token key가 없어 setup이 Compose 보간에서 exit 1(1.60초)로 닫혔습니다. 임시 process 환경으로 누락 key를 보완한 실행은 OWASP Dependency-Check의 NVD 386,224-record 갱신에서 376초 동안 대기해 일정상 process manager로 종료했으며 numeric exit는 보고되지 않았습니다(`completion=killed`). 검사를 통과한 것으로 취급하지 않습니다.
3. **해결 방법**: Java version native command의 exit를 먼저 검사한 뒤 첫 줄을 가공하고, setup/dev-up이 `$IsWindows`에 따라 `mvnw.cmd` 또는 `mvnw`를 선택하도록 test-first로 최소 수정했습니다. 회귀 테스트는 최초 0/2 FAIL(exit 1)에서 2/2 PASS(exit 0, 97.7ms)로 바뀌었습니다. 기존 `.env`는 수정하지 않고 누락 sample 값은 해당 실행의 process 환경에만 제공했습니다. 기존 immutable 8080 server를 정상 종료한 뒤 dev-up을 실행했고 DB volume 삭제나 `dev-down -DeleteData`는 사용하지 않았습니다.
4. **해결 결과**: `.env` SHA-256은 setup 전/후 모두 `[설정 지문 제외]`로 동일합니다. `dev-up.ps1`은 2026-09-04 13:32:54 KST에 exit 0/6.93초였고 backend `127.0.0.1:8080`, frontend `127.0.0.1:5173`가 실행됐습니다. 13:35:47 KST health는 HTTP 200/`UP`, frontend는 HTTP 200입니다. `verify.ps1`은 13:35:47 KST에 승인 `HERMES_JAVA7_HOME` 부재 단계에서 fail-closed exit 1/1.14초였으며 우회하지 않았습니다. 따라서 PowerShell parser와 dev-up gate는 PASS, setup 전체/NVD와 verify 승인-runtime gate는 BLOCKED입니다.

## dev-up 잘못된 성공과 죽은 PID 기록

1. **기능 정보**: macOS PowerShell 7.6.5와 Windows 호환 `scripts/dev-up.ps1`의 기존 healthy stack idempotency, foreign/stale port fail-closed, backend/frontend/DB/네 sample agent readiness, atomic PID 기록과 partial-start rollback입니다. 기본 readiness 제한은 120초이며 2026-09-04 KST에 실제 `8080`/`5173` stack과 격리 fixture를 검증했습니다.
2. **발생한 문제**: 실행 중 stack에서 기존 listener process가 정상인데도 dev-up은 새 process identifier를 즉시 기록하고 exit `0`을 2.45초에 반환했습니다. 새 process 둘은 곧 종료했고 로그도 비어 있어 `.run/pids`가 죽은 프로세스를 가리켰습니다. 원인은 `Start-Process` 반환을 서비스 성공으로 간주하여 process 생존, listener 소유권, HTTP/DB/agent readiness를 전혀 확인하지 않고 pid-file을 덮어쓴 것입니다.
3. **해결 방법**: PowerShell fixture 행동 테스트를 먼저 추가해 healthy 재실행의 PID 보존, untracked foreign listener 거부, stale PID 파일 보존, startup 실패 시 sibling 정리·로그 flush·PID 미기록, agent `X-Monitor-Token` readiness를 RED로 재현했습니다. exclusive lock 아래 기존 PID와 listener process tree 소유권을 확인하고, 기존 stack은 readiness만 재검증하여 유지합니다. 새 stack은 시작 전 포트를 확인하고 모든 readiness와 프로세스 생존을 통과한 뒤 같은 디렉터리의 임시 파일을 atomic move합니다. 실패 시 이번 실행에서 만든 process tree와 새 Compose service만 rollback하고 기존 service/PID는 보존합니다. Backend 개발 실행에는 별도 Vite가 담당하는 frontend Maven lifecycle을 `-Dfrontend.skip=true`로 제외해 clean build 직후에도 중복 `npm ci`가 readiness 시간을 소비하지 않게 했습니다.
4. **해결 결과**: focused PowerShell은 최초 helper 부재 exit `1`, stale 파일 삭제 RED exit `1`, Spring actuator byte response readiness RED exit `1`, agent auth header RED exit `1`, healthy Compose 재생성 RED exit `1`을 각각 확인한 뒤 최종 5/5 PASS, exit `0`, 8.89초였습니다. clean build 직후 최초 실제 start는 중복 `npm ci` 때문에 120초 readiness 후 rollback되어 exit `1`/125.31초였고 죽은 PID 파일과 listener는 0개였습니다. lifecycle 분리 뒤 clean stopped start는 exit `0`/12.78초, volume 보존 재시작은 exit `0`/12.25초였으며 모두 backend/frontend HTTP 200과 process tree 소유를 확인했습니다. 실제 healthy stack 재호출 두 번은 exit `0`/3.04초와 `0`/2.92초로 tracked process가 동일했습니다. 원래 잘못 기록된 새 죽은 process는 0개가 됐고 readiness 전 pid-file 기록은 1곳→0곳입니다. 성능 개선은 같은 조건의 before/after 측정이 아니므로 주장하지 않습니다.

## dev-down graceful 종료와 bounded force escalation

1. **기능 정보**: `scripts/dev-down.ps1`과 공용 process helper가 tracked backend/frontend 자식 tree를 종료하고, 기본 종료에서 PostgreSQL volume을 보존한 뒤 최종 `dev-up.ps1` restart로 서비스 복구하는 운영 경계입니다. Unix는 TERM 후 process별 최대 5초, 강제 종료 후 최대 2초를 기다리며 Windows는 `CloseMainWindow()` 후 같은 bounded escalation을 적용합니다.
2. **발생한 문제**: 기존 stack 종료에서 old tracked process가 process manager 관측 exit `-9`로 끝났고 직후 `8080` health와 `5173`은 HTTP `000`/connection refused였습니다. 이는 종료 검증 중 예상된 down 구간이었지만, 기존 `dev-down.ps1`은 자식부터 곧바로 `Stop-Process`만 호출하여 graceful 요청, bounded wait, 불응 process에만 force하는 단계와 관측 경고가 없었습니다.
3. **해결 방법**: production 수정 전에 TERM을 처리해 marker를 남기는 cooperative process와 TERM을 무시하는 process 행동 테스트를 추가해 `Stop-ProcessTreeGracefully` 부재 RED(exit `1`)를 확인했습니다. 공용 helper는 자식부터 Unix TERM/Windows window close를 보내고 제한 안에 종료되지 않은 PID만 `Stop-Process -Force`로 escalation하며 강제 종료 수를 반환합니다. `dev-down.ps1`은 강제 종료가 있을 때만 PID와 count를 warning으로 남기고 기존 sample-profile down 및 기본 volume 보존 계약은 유지합니다.
4. **해결 결과**: focused signal test는 cooperative TERM 1건과 TERM-ignore force escalation 1건, 총 2/2 PASS, exit `0`, 최종 5.74초였습니다. 실제 tracked stack의 dev-down은 exit `0`/3.03초, force warning 0건, 여섯 port free, `monitoring_hermes-postgres-data` volume 보존이었습니다. 이어 restart는 exit `0`/12.25초로 두 tracked process를 readiness 뒤 기록했고 process 생존, listener tree 소유, backend/frontend HTTP 200, PostgreSQL healthy, agent 4개 running을 확인했습니다. old 관측 exit는 `-9/-9`였고 새 실제 cooperative 종료의 force escalation count는 0개입니다.

## 일반 확인 방법

- JDK: `java -version`이 21인지 확인합니다.
- DB: `docker compose ps`와 `docker compose exec -T postgres pg_isready -U hermes -d hermes_monitor`를 확인합니다.
- Collector 주소: `ADDRESS_NOT_ALLOWED`면 필요한 CIDR만 명시적으로 추가합니다.
- 스키마: `SCHEMA_ERROR`면 agent major와 fixture를 확인합니다. 기존 최신값은 유지됩니다.

## 독립 QA: Collector 계약과 Java 7 실행 산출물

1. **기능 정보**: `/info`, `/snapshot`, `/checks/run`, `/checks/results`의 JSON Schema v1, UTC, 제한값, executor 종료와 동일 shaded JAR의 Java 7 바이트코드 계약입니다.
2. **발생한 문제**: QA 실행에서 snapshot 필수 JVM/OS 필드는 4개만 있었고 DB Pool/check 필드가 camelCase/비계약 형식이었으며, 임의 query가 HTTP 200을 받았습니다. shaded JAR 224개 class 중 1개 `module-info.class`가 major 53이었습니다.
3. **해결 방법**: JVM/OS/disk/DB Pool/recent check를 snake_case DTO로 투영하고 `observed_at`을 UTC로 고정했습니다. results query는 `job_id` 또는 `since`만 허용하고 body 16KB/check ID 20개 제한과 bounded executor의 종료 확인을 테스트했습니다. shade filter로 multi-release/module descriptor를 제거하고 JAR 전체 class 검사기를 추가했습니다.
4. **해결 결과**: agent 행동 테스트 4→9건이 모두 통과했고, 최종 JAR class 226/226개가 major 51이며 major 53은 1→0개입니다. 기능/보안 계약 수정으로 별도 성능 개선 수치는 측정하지 않았습니다.

## 독립 QA: 중앙 검증·수집·저장·점검 polling

1. **기능 정보**: 중앙의 fail-closed JSON Schema 경계, 1MB 응답 제한, identity 확인, bounded outbound/single-flight, 하나의 transaction으로 latest와 1분 history를 저장하는 production 수집 경로입니다.
2. **발생한 문제**: 중앙은 `schema_version.startsWith("1.")`만 검사했고 수집이 직렬이었으며, disk/DB Pool/check row는 모두 0건이었습니다. check 실행은 202 접수 뒤 결과를 저장하지 않았고 retention은 존재하지 않는 `sampled_at` 때문에 PostgreSQL 오류가 났습니다.
3. **해결 방법**: classpath의 실제 JSON Schema 2종을 적용하고 필수 필드/schema major/identity를 검증했습니다. 크기 제한 HTTP client, 기본 10-thread bounded executor와 instance key single-flight를 분리했습니다. snapshot에서 JVM/물리 메모리/disk/pool/check definition/result의 latest와 1분 sample을 transaction 저장하고, check job을 1초 간격 최대 15초 poll하여 저장하도록 했습니다. retention은 check history에만 `checked_at`, 나머지 3개 history에 `sampled_at`을 사용합니다.
4. **해결 결과**: center JUnit/Testcontainers 테스트가 7→22건으로 늘어 모두 통과했습니다. 고정 시각의 같은 snapshot 2회를 저장해 latest JVM/disk/pool/check 각 1행과 각 history 1행을 확인했고, 실패 전이는 WARN/WARN/DOWN 후 성공 즉시 UP으로 복구했습니다. 기능/동시성 안전 수정이며 같은 조건의 성능 before/after는 측정하지 않았습니다.

## 독립 QA: OpenAPI와 생성 TypeScript

1. **기능 정보**: 중앙 REST의 DTO, page/size/sort/filter, 실제 HTTP status와 TypeScript 계약 생성 게이트입니다.
2. **발생한 문제**: OpenAPI 25행은 response DTO와 공통 paging 파라미터가 없었고 인증서 즉시 검사는 문서 202와 구현 200이 달랐습니다. 생성기는 YAML 정규식으로 path 문자열만 만들었습니다.
3. **해결 방법**: OpenAPI 3.1에 재사용 schema/parameter/error/status를 정의하고 구현 응답과 맞췄습니다. `openapi-typescript-codegen` 표준 generator와 `--check` immutable diff 검사를 사용하고 Redocly validation을 추가했습니다.
4. **해결 결과**: OpenAPI validation, generated diff, 9개 핵심 schema와 4개 공통 parameter 계약 테스트가 모두 통과했고 인증서 즉시 검사 구현/문서는 모두 HTTP 202입니다. 성능 영향 없음.

## 독립 QA: 실 API UI와 4개 sample agent E2E

1. **기능 정보**: 인증된 browser→Spring Boot→PostgreSQL→4개 Tomcat sample agent production 경로와 종합/프로젝트/인스턴스 3탭/API/인증서/설정 화면입니다.
2. **발생한 문제**: 프론트는 dashboard fixture fallback만 사용해 실제 최신/history row가 0이어도 Playwright 2건이 통과했고, 상세/필터/Drawer/CRUD/차트는 stub이었습니다.
3. **해결 방법**: production fixture fallback을 제거하고 모든 화면을 세션 인증 real API에 연결했습니다. loading/error/empty/stale, text 상태, 접근성, ECharts와 route lazy loading을 추가했습니다. Playwright webServer는 격리 PostgreSQL volume, 임시 test credential, 4개 sample agent, 중앙 재시작을 직접 관리하고 DB row gate를 선행합니다.
4. **해결 결과**: frontend unit 3→5건과 authenticated Playwright 2/2가 통과했습니다. E2E DB는 재시작 전 latest/history/disk latest/history/DB Pool latest/history/check latest/history가 각각 4/4/4/4/4/4/8/8행이었고, 재시작 후 4/4/4/4/4/4/8/10행으로 모두 복구되었습니다. route lazy build에서 초기 JS는 524.63kB→356.90kB로 167.73kB(31.97%) 감소했습니다. 측정 환경은 같은 Mac/JDK 21/Node 24.20.0, 명령은 `npm run build`, 각 1회이며 이 수치는 초기 JS chunk 비교에만 사용합니다.

## 독립 QA: 보안·라이선스·백업/복구 품질 게이트

1. **기능 정보**: secret/log scan, dependency audit/license, schema/OpenAPI/generated diff, Java runtime availability, binary-safe PostgreSQL backup/restore와 CI matrix입니다.
2. **발생한 문제**: `verify.ps1`은 Java 7/8 availability, secret, OpenAPI/generated diff, license를 검사하지 않았고 testapp에 32자 기본 token이 있었습니다. CI에도 Java 7/8 runtime matrix가 없었으며 backup은 restore 검증이 없었습니다.
3. **해결 방법**: testapp token을 필수 환경변수로 바꾸고 production source/log secret scanner를 추가했습니다. `verify.ps1`은 승인된 Java 7/8 home이 없으면 fail-closed하고 전체 class major, schema/OpenAPI/generated diff, audit/license/E2E를 실행합니다. CI는 동일 artifact의 Java 7/8 matrix를 두며 backup archive 검증과 명시적 restore 스크립트를 추가했습니다.
4. **해결 결과**: repository 계약 테스트 47/47, secret scan 0건, npm High/Critical 0건, npm license 211 package 및 Maven license 23종 검사가 통과했습니다. 동등 하위 명령의 실제 backup/restore 시험은 custom archive 31,887 bytes를 만들고 새 검증 DB에 single transaction으로 복구해 Flyway 4행/프로젝트 2행/인스턴스 4행을 확인한 뒤 검증 DB를 제거했습니다. 승인 Java 7/8 runtime과 PowerShell은 현재 호스트에 없어 성공으로 기록하지 않습니다. 성능 영향 없음.

## 설정 화면의 실제 편집과 write-only token

1. **기능 정보**: 프로젝트, 인스턴스, 임계치, 인증서 대상 설정의 생성·편집·검증·저장·loading/error 표시와 agent token write-only 처리입니다.
2. **발생한 문제**: 추가한 focused UI 행동 3건은 최초 3/3 FAIL이었습니다. 인스턴스 환경/API 점검 여부는 편집할 수 없고 변경 token은 성공 뒤 input에 남았으며, `CERTIFICATE_DAYS`의 30/7 역방향 임계치를 일반 metric처럼 거부했고, 새 인증서의 360분 간격을 편집할 input이 없었습니다.
3. **해결 방법**: 인스턴스의 환경·URL·poll interval·API 점검·enabled와 인증서의 프로젝트·host·SNI·port·interval·enabled를 편집 가능하게 만들었습니다. 저장 성공 시 token state를 즉시 빈 문자열로 지우고 조회 DTO에는 token을 추가하지 않았습니다. ID/URL/UTF-8 32-byte token/port/interval과 certificate-day 역방향 임계치를 client와 server 경계에서 검증했습니다.
4. **해결 결과**: 같은 frontend suite가 6 PASS/3 FAIL/20.00초에서 최종 9/9 PASS/7.96초로 바뀌었고 `npm run lint`도 exit 0입니다. token 조회·재채움 필드는 0개이며 갱신 token은 성공 직후 input 길이 32자에서 0자로 지워지는 행동 테스트를 통과했습니다.

## OpenAPI와 전체 runtime operation 계약

1. **기능 정보**: session을 포함한 중앙 API 25개 operation의 실제 success status, JSON content type, 빈 body, 재귀 required field와 생성 TypeScript 계약입니다.
2. **발생한 문제**: 첫 exhaustive 통합 실행은 앞선 9개 operation까지만 검증한 뒤 10번째 instance connection-test가 HTTP 400 `INVALID_REQUEST`를 반환해 1/1 FAIL, 8.327초였습니다. 원인은 Java compiler에 `-parameters`가 없는 상태에서 이름 없는 `@PathVariable` 7개를 runtime reflection에 의존한 것이며, dashboard row와 여러 응답의 실제 필수 key도 schema required 목록과 달랐습니다.
3. **해결 방법**: 모든 path variable 이름을 명시하고 API 전용 401/403 JSON handler를 추가했습니다. OpenAPI에 실제 error status/content를 기록하고 dashboard 전용 DTO 및 project/instance/check/certificate/threshold required key를 runtime projection과 일치시킨 뒤 표준 생성기를 다시 실행했습니다. 통합 검사는 OpenAPI YAML을 읽어 모든 operation을 실제 MockMvc로 호출하고 응답 schema의 required를 재귀 검사합니다.
4. **해결 결과**: 동일 통합 gate는 success 25회와 401/403 error 38회, 총 63회 runtime 응답을 검증해 1/1 PASS, 실패/오류/skip 0, test 6.034초였습니다. runtime 400 mismatch는 1건에서 0건, success 검증 완료 operation은 9개에서 25개로 바뀌었고 `generate:api:check`와 Redocly validation은 exit 0입니다.

## 인증서 비동기 실행·주기·최신값

1. **기능 정보**: 인증서 즉시 검사 202 접수, bounded executor 종료, target별 분 단위 주기, 성공/실패 latest의 전체 인증서 필드입니다.
2. **발생한 문제**: controller는 TLS handshake와 DB 저장을 끝낸 뒤에야 202를 반환했고 scheduler 고정 delay가 21,600,000ms라 360분보다 짧은 target interval을 지킬 수 없었습니다. 실패 UPSERT는 이전 subject/issuer/serial/validity/signature 값을 남겼고 executor lifecycle이 없었습니다. 이 계약을 먼저 고정한 테스트는 최초 Java compile error 15건으로 실패했습니다.
3. **해결 방법**: 4-worker/100-queue executor와 중복 target single-flight, capacity rejection, 최대 5초 graceful shutdown을 가진 service로 검사를 옮겼습니다. scheduler scan을 기본 60,000ms로 바꾸고 DB target 기본은 360분으로 유지했습니다. 성공은 subject/issuer/full hex serial/notBefore/notAfter/days/chain/hostname/signature/status를 저장하며 실패는 nullable 9개 필드를 모두 NULL로 교체하고 DOWN을 저장합니다.
4. **해결 결과**: scheduler 관찰 주기는 21,600,000ms에서 60,000ms로 360배 짧아졌습니다. blocked TLS 동안 submit 반환 제한 500ms, worker 1/queue 1에서 세 번째 요청 rejection, executor 종료, 성공 10개 인증서 값과 실패 nullable 9개/DOWN을 검증했습니다. 인증서 focused 테스트는 compile error 15건에서 7/7 PASS로 바뀌었고, 실제 DB 실패 latest도 25-operation 통합 gate에서 통과했습니다.

## DNS rebinding 방어와 연결 IP 고정

1. **기능 정보**: agent HTTP/HTTPS outbound의 단일 DNS resolution, allowlist 판정, 실제 socket IP pinning, HTTP Host와 TLS peer/SNI 보존 정책입니다.
2. **발생한 문제**: 기존 코드는 allowlist 검사 때 hostname을 한 번 resolve한 뒤 Java `HttpClient`가 같은 hostname을 다시 resolve해 실제 연결 IP가 바뀔 수 있었습니다. 즉 allowlist 판정과 연결이 독립적인 2개 DNS 단계였으며, IPv4/IPv6는 CIDR만 확인했고 broad loopback/metadata 정책은 명시되지 않았습니다.
3. **해결 방법**: DNS answer 전체를 한 번에 resolve·검증한 `ResolvedTarget`의 IP로 raw socket을 직접 연결했습니다. HTTPS는 그 connected socket을 원래 hostname으로 wrap해 endpoint identification과 SNI를 유지하고 redirect는 계속 거부합니다. metadata/link-local/any-local/multicast는 항상 거부하고 loopback은 IPv4 `/32` 또는 IPv6 `/128` exact allowlist에서만 허용합니다.
4. **해결 결과**: resolver가 첫 호출에 `127.0.0.1`, 두 번째 호출에 metadata IP를 반환하도록 만든 결정적 TOCTOU 시험에서 DNS 단계/호출은 2/2에서 1/1로, 실제 local server 연결은 1회, `Host: rebind.test:<port>`는 보존됐습니다. IPv4 exact loopback, IPv6 `::1/128`, broad loopback 거부, metadata 거부, TLS logical peer/SNI, 302 미추적 검사로 focused suite는 신규 0건에서 4건으로 늘어 모두 PASS했습니다.

## Docker context와 Maven 취약점 차단

1. **기능 정보**: Docker build context 최소화와 Maven High/Critical dependency vulnerability fail-closed gate 및 CI NVD 운영 정책입니다.
2. **발생한 문제**: `.dockerignore` 규칙은 0개였고 Maven 알려진 취약점 gate, NVD cache, CI rate-limit 직렬화도 각각 0개였습니다. 이를 고정한 새 repository test는 최초 0/3 PASS, 3/3 FAIL, 107.161ms였습니다.
3. **해결 방법**: 18개 ignore 규칙으로 Git/local env/tool/cache/build 결과를 제외하되 testapp WAR 1개만 다시 포함했습니다. OWASP Dependency-Check 12.2.2 aggregate를 verify에 1회 연결하고 CVSS 7.0 이상 및 feed/analyzer error를 실패시켰습니다. CI는 NVD 갱신 concurrency 1, UTC 주 단위 DB-only cache, 24시간 freshness, 8,000ms delay, 10회 retry와 선택적 environment API key 정책을 사용합니다.
4. **해결 결과**: 같은 repository test는 3/3 PASS, 실패 0, 99.160ms였습니다. 취약점 차단 gate는 0개에서 1개, Docker ignore는 0개에서 18개, NVD 동시 갱신 허용 수는 무제한에서 1개로 바뀌었습니다. 최종 실제 `./mvnw -B clean verify`는 로컬에 NVD cache/API key가 없어 약 9분 동안 385,855건 중 10,000건(3%)을 받은 뒤 외부 갱신 지연으로 중단했으며 성공으로 기록하지 않습니다. 동일 코드는 `-Ddependency-check.skip=true`로 나머지 reactor 4/4와 테스트를 검증했지만 이는 취약점 scan 통과를 의미하지 않습니다.

## 2차 Major 1: production migration과 sample seed 격리

1. **기능 정보**: production Flyway는 schema와 기본 임계치만 만들며, sample 2프로젝트/4인스턴스는 `local`·`e2e` profile에서 명시적으로만 seed합니다.
2. **발생한 문제**: 모든 환경에서 실행되는 fixture migration 1개가 sample 프로젝트 2개와 인스턴스 4개를 운영 DB에 삽입했습니다.
3. **해결 방법**: fixture SQL을 Flyway에서 제거하고 profile·flag 이중 조건의 idempotent `SampleFixtureSeeder`로 옮겼으며 production 빈 DB 통합 테스트를 추가했습니다.
4. **해결 결과**: production migration의 sample 행은 프로젝트 2→0, 인스턴스 4→0이고, 명시적 local/e2e seed는 2/4행을 유지합니다. production/seed focused 테스트 3/3 PASS입니다.

## 2차 Major 2: agent job correlation과 deadline

1. **기능 정보**: check 실행 결과는 접수 `job_id`에 귀속되고 각 job의 단일 10초 deadline 안에서 bounded worker가 실행·취소합니다.
2. **발생한 문제**: job별 결과 map과 강제 취소 task가 각각 0개여서 다른 job의 최신 결과가 중앙 polling에 섞이고 장기 check가 계속 실행될 수 있었습니다.
3. **해결 방법**: bounded coordinator/worker executor, job별 result map, deadline timeout과 `Future.cancel(true)`를 추가하고 `/checks/results?job_id=`를 해당 map에 연결했습니다.
4. **해결 결과**: job correlation 행동 테스트 2/2 PASS, 서로 다른 job의 교차 결과 1→0건, 30초 blocking check의 관측 종료는 무제한→10초 이내로 고정됐습니다.

## 2차 Major 3: check-run strict body와 partial snapshot

1. **기능 정보**: check-run body는 두 허용 field만 받고 snapshot은 collector별 성공/실패를 `partial`과 `collection_errors`로 표현합니다.
2. **발생한 문제**: unknown top-level field 1개가 포함돼도 접수됐고 collector 예외가 있어도 `partial=false`, error 0개로 반환됐습니다.
3. **해결 방법**: JSON object key allowlist를 검증하고 JVM/system/disk/DB collector를 독립 수집하여 실패 코드를 제한된 배열에 넣었습니다.
4. **해결 결과**: unknown-field 요청은 HTTP 202→400, 단일 collector 실패 snapshot은 partial false→true와 error 0→1개가 됐으며 관련 agent suite 16/16 PASS입니다.

## 2차 Major 4: agent token fail-closed

1. **기능 정보**: token은 UTF-8 기준 최소 32바이트여야 runtime이 생성되며 잘못된 설정에서는 servlet이 503 설정 오류로 닫힙니다.
2. **발생한 문제**: 빈 token과 31바이트 token 두 경계가 build를 통과해 인증 비교가 가능한 상태였습니다.
3. **해결 방법**: builder 생성 경계에서 byte 길이를 검증하고 초기화 실패를 비밀정보 없는 `CONFIG_ERROR`로 분류했습니다.
4. **해결 결과**: 허용되던 잘못된 token 2종→0종이며 빈 값/31바이트/32바이트 경계 테스트 3/3 PASS, agent 전체 16/16 PASS입니다.

## 2차 Major 5: direct check schema와 latest 경쟁

1. **기능 정보**: 중앙의 직접 polling 결과도 JSON Schema를 통과한 뒤 저장하고 latest는 더 새로운 `checked_at`만 갱신합니다.
2. **발생한 문제**: direct result schema validator가 0개였고 늦게 도착한 오래된 결과 1개가 최신 행을 덮을 수 있었습니다.
3. **해결 방법**: `check-result.schema.json`을 validator/polling 경계에 연결하고 UPSERT에 `excluded.checked_at >= current.checked_at` 조건을 넣었습니다.
4. **해결 결과**: malformed direct 결과 저장은 1→0건, newer-then-older 경쟁 후 latest 역전은 1→0건이며 schema/경쟁 focused 테스트가 모두 PASS했습니다.

## 2차 Major 6: retention backlog 반복 drain

1. **기능 정보**: 30일 초과 history를 작은 `SKIP LOCKED` batch로 반복 삭제하되 한 실행의 row/time budget과 remaining 관측값을 둡니다.
2. **발생한 문제**: 하루 1회 table당 최대 10,000행만 삭제해 10,001행 backlog에서도 1행이 다음 날까지 남았습니다.
3. **해결 방법**: batch 10,000행, 실행 최대 100,000행/시간 예산까지 반복하고 각 table의 삭제·잔여 수를 metric/log용 결과로 집계했습니다.
4. **해결 결과**: 10,001행 예시의 1회 잔여는 1→0행, 한 실행 삭제 상한은 10,000→100,000행이며 반복/상한/remaining focused 테스트가 PASS했습니다.

## 2차 Major 7: instance poll interval과 stale 기준

1. **기능 정보**: instance별 `poll_interval_seconds`로 due 시각을 예약하고 stale/down은 `max(3×poll interval, 60초)`를 공통 사용합니다.
2. **발생한 문제**: 수집 due 판정은 `last_seen_at`을 사용하고 화면/SQL stale은 고정 60초여서 120초 사용자 주기 인스턴스가 정상 주기 중 DOWN이 됐습니다.
3. **해결 방법**: `last_polled_at` migration과 atomic due claim을 추가하고 Java/SQL/API stale 판정식을 동일 규칙으로 교체했습니다.
4. **해결 결과**: 120초 주기의 DOWN 경계는 60→360초, 기본 15초 주기는 60초를 유지하며 custom/default 경계 테스트 4/4 PASS입니다.

## 2차 Major 8: DB threshold 우선순위의 실제 평가

1. **기능 정보**: metric 판정은 DB의 `INSTANCE → PROJECT → GLOBAL` 순서로 warning/critical 값을 resolve합니다.
2. **발생한 문제**: 저장된 threshold 조회 API는 있었지만 snapshot 평가의 hard-coded threshold 5곳에는 반영되지 않았습니다.
3. **해결 방법**: `ThresholdResolver`를 persistence에 주입하고 system/JVM/disk/pool 판정마다 scope 우선순위를 조회하도록 연결했습니다.
4. **해결 결과**: DB threshold를 사용하는 평가 지점은 0→5곳이고 API 변경 직후 같은 0.75 값의 상태가 UP→WARN으로 바뀌는 통합 테스트가 PASS했습니다.

## 2차 Major 10: 표준 generated service client

1. **기능 정보**: frontend HTTP 호출은 OpenAPI 표준 생성기의 model/core/service를 사용하고 handwritten layer는 화면 친화 wrapper만 제공합니다.
2. **발생한 문제**: 생성 service 파일은 0개였고 `api.ts`에 수기 `/api/v1/` endpoint 문자열 18개가 중복됐습니다.
3. **해결 방법**: `openapi-typescript-codegen`의 core/services/models 출력을 활성화하고 CSRF credential 설정과 `DefaultService` 호출로 교체했습니다.
4. **해결 결과**: generated service는 0→1개, `api.ts`의 수기 `/api/v1/` 문자열은 18→0개이며 generator immutable check와 TypeScript lint가 PASS했습니다.

## 2차 Major 12: 로그인 SPA landing

1. **기능 정보**: 로그인 성공은 JSON 응답 화면이 아니라 production SPA root `/`로 이동합니다.
2. **발생한 문제**: 성공 handler가 브라우저에 JSON endpoint 결과를 직접 표시해 SPA 첫 화면 이동이 0회였습니다.
3. **해결 방법**: Spring Security success 처리를 `defaultSuccessUrl("/", true)`로 바꾸고 실패만 일반화된 401 JSON으로 유지했습니다.
4. **해결 결과**: 성공 응답 landing은 JSON 1→0개, `/` redirect는 0→1개이며 runtime/OpenAPI login 계약 테스트가 PASS했습니다.

## 2차 Major 14: secret masking 전 경계

1. **기능 정보**: header/query/body/error/log 문자열에서 authorization, token, api_key, apikey, secret, password, serviceKey, accessKey 값을 마스킹합니다.
2. **발생한 문제**: 단일 정규식은 공백·JSON·query 구분의 secret 4형식 중 3형식을 남길 수 있었습니다.
3. **해결 방법**: key/value 구분자별 masking과 URL query 제거를 적용하고 check result message 및 error/log publication 전 경계에서 공통 masker를 호출했습니다.
4. **해결 결과**: leak fixture의 노출 secret은 3→0개이고 header/query/JSON/form/error 변형 테스트와 agent 전체 16/16 PASS입니다.

# 독립 재리뷰 Major 후속 수정

## 종료를 무시하는 check의 격리

1. **기능 정보**: 10초 deadline 후에도 interrupt를 무시하는 check는 bounded worker 안에 격리하고 같은 check의 재접수를 막습니다.
2. **발생한 문제**: timeout 결과 저장 직후 running guard가 해제되어, 끝나지 않은 worker가 1개 있어도 같은 check를 다시 접수할 수 있었습니다.
3. **해결 방법**: running guard 해제를 실제 worker `finally`로 옮기고 supervisor는 deadline 결과만 저장하도록 분리했습니다.
4. **해결 결과**: interrupt 무시 check의 deadline 결과는 10초 이내 유지되고, 실제 worker 종료 전 중복 접수는 ACCEPTED 1건→0건입니다. agent focused suite 19/19 PASS입니다.

## snapshot 전 collector의 partial 계약

1. **기능 정보**: JVM, system, disk, DB pool 수집 각각의 실패를 snapshot `partial`과 제한된 `collection_errors`로 반환합니다.
2. **발생한 문제**: DB pool 외 세 collector 실패는 snapshot 전체를 중단했으며 해당 실패를 표현하는 행동 테스트는 0건이었습니다.
3. **해결 방법**: 네 수집 경계를 독립 보호하고 실패 code를 추가하되 가능한 다른 수치는 계속 반환하도록 했습니다.
4. **해결 결과**: 보호되는 collector 경계는 1→4개이고 collector 실패 계약 테스트는 0→1건 추가되어 center validator/agent suite가 모두 PASS했습니다.

## escaped JSON과 API-key masking

1. **기능 정보**: result message의 escaped JSON, `X-Api-Key`, query/form/header 형태를 중앙 저장 전까지 마스킹합니다.
2. **발생한 문제**: escaped quote와 `X-Api-Key` 두 변형은 기존 masker를 우회할 수 있었습니다.
3. **해결 방법**: JSON escape-aware value 패턴과 hyphenated API-key 이름을 공통 keyword 처리에 포함했습니다.
4. **해결 결과**: 재리뷰 leak fixture의 노출 변형은 2→0개이고 SecretMasker 테스트는 2→3건, agent 전체 19/19 PASS입니다.

## 인증서 임계치와 scoped 설정

1. **기능 정보**: `CERTIFICATE_DAYS`는 DB scope 우선순위를 적용하고 UI에서 GLOBAL/PROJECT/INSTANCE key를 편집합니다.
2. **발생한 문제**: 인증서 상태는 DB 설정 1종을 무시해 30/7을 고정 사용했고 UI의 scope key 입력은 0개였습니다.
3. **해결 방법**: 인증서 checker/service에 threshold resolver를 연결하고 설정 row에 project/instance scope key input과 validation을 추가했습니다.
4. **해결 결과**: 인증서 DB threshold 적용 경로는 0→1개, scope key 편집 종류는 0→2개이며 center 51/51과 frontend 11/11 테스트가 PASS했습니다.

## 인증서 target 변경과 in-flight 결과 경쟁

1. **기능 정보**: target 변경 시 기존 latest를 무효화하고 check 결과는 접수 당시 target version/identity가 여전히 일치할 때만 저장합니다.
2. **발생한 문제**: target 수정 뒤 latest 1행이 남고 이전 target의 in-flight 결과 1건이 새 target latest를 덮을 수 있었습니다.
3. **해결 방법**: `target_version` migration, update 시 version 증가/latest 삭제, result store의 version·host·port·SNI 조건부 저장을 추가했습니다.
4. **해결 결과**: target 수정 직후 stale latest는 1→0행, 이전 version 결과 저장은 1→0행이며 certificate focused 테스트는 7→14건으로 늘어 모두 PASS했습니다.

## OpenAPI concrete model과 runtime 검증 확대

1. **기능 정보**: metric/disk/pool/history를 구체 schema로 생성하고 runtime response의 required/type/format/enum을 계약과 대조합니다.
2. **발생한 문제**: 핵심 generated model 8개가 `Record<string, any>`였고 runtime contract는 required key 위주였습니다.
3. **해결 방법**: 8개 concrete schema에 `additionalProperties:false`와 field type/format/enum을 정의하고 spec-driven validator와 route/error coverage를 확대했습니다.
4. **해결 결과**: `Record<string, any>` 핵심 model은 8→0개이고 repository 계약은 54→56건, center 통합/단위는 40→51건으로 늘어 모두 PASS했습니다.

## generated client immutable gate 순서

1. **기능 정보**: Maven은 committed generated client를 쓰기 전에 `generate:api:check`로 검증합니다.
2. **발생한 문제**: Maven의 source-writing generation 1회가 stale 파일을 먼저 덮어써 이후 diff check가 항상 통과할 수 있었습니다.
3. **해결 방법**: Maven lifecycle의 쓰기 generation을 제거하고 `npm ci` 뒤 immutable check만 실행하도록 변경했습니다.
4. **해결 결과**: Maven 선행 overwrite는 1→0회이며 clean reactor에서 `check-generated-api`가 generation 없이 실행됐고 `generate:api:check`가 PASS했습니다.

## 최종 fail-closed race·escape 재리뷰

1. **기능 정보**: interrupt 무시 check의 start/cancel 원자성, 다중 escape secret, 인증서 target 변경과 stale result 저장의 transaction 직렬화입니다.
2. **발생한 문제**: 독립 재리뷰는 start/cancel 사이 race 1곳, escaped JSON suffix leak 2형식, 인증서 SELECT와 target update 사이 stale INSERT race 1곳을 Major로 재현했습니다.
3. **해결 방법**: worker 시작/cancel state를 같은 monitor로 동기화하고 escaped JSON delimiter의 backslash 수를 검사했습니다. 인증서 조건부 INSERT는 target row를 `FOR KEY SHARE`로 잠가 key-changing update/delete와 직렬화했습니다.
4. **해결 결과**: 최종 독립 fail-closed 재리뷰는 Major 3→0, `passed=false→true`였습니다. agent 20/20, center 51/51, repository 56/56, E2E 2/2가 PASS했고 당시 남은 리뷰 항목은 실제 PostgreSQL 인증서 동시성 시험 보강 Minor 1건이었습니다.

## 실제 PostgreSQL 인증서 target 변경 동시성 검증

1. **기능 정보**: PostgreSQL 17.11 Testcontainers에서 `CertificateResultStore`의 조건부 latest 저장과 target 편집 transaction(`UPDATE` 후 stale latest `DELETE`)을 서로 다른 JDBC connection·transaction·thread로 실행하며, 기존 `FOR KEY SHARE` 직렬화 경계를 검증합니다. 테스트 barrier는 insert trigger의 advisory transaction lock이고 두 worker의 진입은 `CountDownLatch`, 실제 DB 대기는 `pg_stat_activity.wait_event`로 확인합니다.
2. **발생한 문제**: 기존 검증은 mock SQL 문자열과 순차 DB 결과만 다뤄, 조건부 `SELECT`가 이전 `target_version`을 읽은 뒤 INSERT 전에 target 편집이 commit되는 실제 경쟁을 증명하지 못한 Minor 1건이 남았습니다. 테스트 작성 후 `FOR KEY SHARE`를 의도적으로 제거한 RED에서 편집 backend가 2,000ms 안에 `transactionid` lock wait에 진입하지 않아 1/1 FAIL했고(test 6.803s, Maven 11.137s), 잠금이 없으면 편집이 barrier를 추월한다는 잘못된 경계를 결정적으로 재현했습니다.
3. **해결 방법**: production SQL은 변경하지 않고 `CertificateResultStorePostgresConcurrencyTest` 1건을 추가했습니다. store가 old version을 선택하고 advisory barrier에서 멈춘 상태를 확인한 뒤 edit를 시작하여 `FOR KEY SHARE`가 edit를 `transactionid` wait에 두는지 확인하고, barrier 해제 후 old 결과 INSERT 1행→edit UPDATE 1행→latest DELETE 1행 순으로 commit되는지 검증합니다. commit 뒤 latest 0행, old version 재저장 0행, new version 저장 1행을 확인합니다. polling/latch 대기는 2,000ms, PostgreSQL `lock_timeout` 3,000ms, `statement_timeout` 4,000ms, Future/종료 상한은 5,000ms로 제한했습니다.
4. **해결 결과**: 기존 `FOR KEY SHARE`를 복원한 GREEN은 1/1 PASS(test 4.622s, Maven 8.066s)했고 deadlock·무한대기·DB timeout은 0건입니다. 인증서 focused는 13/13 PASS(7.805s), center 전체는 52/52 PASS(15.870s), frontend를 제외한 최종 reactor는 agent 20/20 + testapp 2/2 + center 52/52 = 74/74 PASS(17.897s)했습니다. stale old version은 편집 commit 뒤 latest를 0건 덮었고 Minor 잔여는 1→0건입니다. 성능 영향 미측정.

## 최종 QA Major 1: check 실행 HTTP 상태 계약

1. **기능 정보**: agent Servlet의 `POST /monitor/v1/checks/run`은 형식/등록 오류 400, 전부 실행중·rate/capacity 거절 429, 하나 이상 실제 접수 202를 반환합니다. mixed 요청은 실제 접수가 하나라도 있으면 202이며, 접수 0건일 때 비등록이 섞이면 400입니다.
2. **발생한 문제**: 실제 sample agent에서 미등록 ID 1건이 `accepted_check_ids=0`인데도 HTTP 202였습니다. 원인은 Servlet이 executor 결과를 받기 전에 상태를 202로 고정한 것이며 기존 테스트는 HTTP 경계를 호출하지 않았습니다.
3. **해결 방법**: `MonitorRuntime.CheckRun`에 접수/거절 분류를 추가하고 Servlet이 실행 결과 뒤 상태를 결정하도록 바꿨습니다. embedded real HTTP server와 Servlet request/response를 지나는 `MonitorServletHttpStatusIntegrationTest`에서 malformed, unknown-only, all-capacity, accepted, mixed를 고정했습니다.
4. **해결 결과**: `./mvnw -pl collector clean test -Ddependency-check.skip=true`에서 Servlet HTTP integration 1/1과 agent 전체 31/31이 PASS했습니다. 미등록-only 상태는 202→400, ALREADY_RUNNING-only는 202→429, accepted 포함은 202를 유지했습니다.

## 최종 QA Major 2·3: direction과 선언형 production 점검

1. **기능 정보**: 모든 `MonitorCheck`가 direction을 명시하고 INTERNAL category는 null, API category는 INTERNAL/EXTERNAL 중 하나만 허용합니다. deployment-owned `monitor-checks.json`은 HTTP/TCP/file/directory/batch 점검을 Java 7 production 코드로 등록하고 secret을 실행 시점에만 해석합니다.
2. **발생한 문제**: API direction이 EXTERNAL로 고정됐고 loader/SecretProvider/executor가 없었습니다. `MonitorCheck.getDirection()`을 먼저 필수화한 RED compile은 `TestConfigurer`의 abstract method 미구현 1건으로 `BUILD FAILURE`였으며 기존 파일럿 JSON은 실행 경로와 분리돼 있었습니다.
3. **해결 방법**: `CheckDirection`, 필수 `MonitorCheck.getDirection()`, schema 조건, DB V7 constraint를 추가했습니다. loader는 등록 파일만 읽고 read-only HTTP(GET/HEAD/POST, query/header/body, timeout/status/text/안전 regex/JSON/XML), TCP, file/directory, batch freshness를 bounded deadline 안에서 실행합니다. redirect/trust-all/URL 원격 주입을 허용하지 않고 1MB 응답 제한, XXE 차단, runtime SecretProvider와 제한된 결과 code를 적용했습니다. 샘플 프로젝트 Configurer는 JSON을 실제 읽으며 설정 없는 항목은 `configuration_required`와 disabled 상태로 명시했습니다.
4. **해결 결과**: agent 선언형/HTTPS/direction/파일럿 행동 테스트 10건을 포함해 31/31 PASS, testapp 2/2 PASS, Animal Sniffer PASS였습니다. `VerifyCollectorJar`는 shaded JAR 250 class 전부 major 51을 확인했고 로컬 Java 8 호환 probe도 PASS했습니다. 승인 Java 7과 승인 Java 8 gate는 외부 제한으로 유지합니다.

## 최종 QA Major 4: 실제 production E2E 확대

1. **기능 정보**: 격리 PostgreSQL 17, 네 real lightweight HTTP agent, immutable center JAR, 인증된 Chromium을 연결해 API 5필터/재점검, 인증서, 설정/token, DB 장애 UI를 검증합니다.
2. **발생한 문제**: 첫 확대 실행은 6건 중 4 PASS/2 FAIL이었습니다. SPA `/certificates` 직접 reload가 404였고 DB 중단 시 React Query 재시도로 stale 안내가 50초 안에 나타나지 않았습니다.
3. **해결 방법**: 알려진 SPA route를 `index.html`로 forward하고 resource query는 기존 데이터를 보존하면서 실패를 즉시 표면화하도록 retry를 끈 뒤 15초 polling은 유지했습니다. E2E는 API의 project/instance/direction/status/name query, INTERNAL/EXTERNAL 행, 재점검 202와 최대 15초 polling, trusted TLS 성공/닫힌 포트 실패/재검사, project/instance/threshold/certificate 저장, token 교체 후 빈 input과 응답 비노출, PostgreSQL stop/start 및 stale 데이터를 검사합니다.
4. **해결 결과**: `npm run test:e2e`는 6/6 PASS(1.8분)했습니다. DB latest/history/disk/pool/check row는 center 재시작 전후 각각 최소 4/4/4/4/12행이었고, DB 중단 stale UI는 49.9초에 검증된 뒤 health 200으로 복구했습니다.

## 최종 QA Major 5와 품질 Minor: 책임 분리와 경고 제거

1. **기능 정보**: backend controller/query/service, frontend settings tab/form, HTTP parser, production formatting, shade/Mockito/unchecked cast와 chart bundle 품질입니다.
2. **발생한 문제**: `ProjectController` 456줄, `SettingsPage` 630줄, API history N+1, parser 책임 혼합, shade overlap 3건, unchecked cast 3건, Mockito dynamic attach 경고, production 160자 초과 38줄, ECharts chunk 1,118.84kB가 확인됐습니다.
3. **해결 방법**: dashboard/project/resource/check controller-query-service를 분리하고 check history를 page 전체 batch SQL 1회로 바꿨습니다. HTTP response parsing을 `HttpResponseParser`로 추출해 malformed status/header/chunk/content-length, timeout, 1MB 경계를 행동 테스트했습니다. Settings는 네 tab component와 form helper로 분리했습니다. shade metadata filter, Mockito premain javaagent, wildcard checked casts와 모든 production 160자 초과 line을 정리하고 chart engine을 별도 lazy chunk로 분리했습니다.
4. **해결 결과**: `ProjectController`는 456→93줄, `SettingsPage`는 630→23줄입니다. center 59/59, frontend 16/16 PASS였고 shade overlap 3→0, testapp unchecked cast 3→0, Mockito dynamic attach 경고 1→0입니다. mutable production/script의 160자 초과 line은 38→0이며, 이미 배포된 Flyway V1/V4의 16개 checksum 고정 SQL line만 migration 무결성을 위해 원문 유지했습니다. 동일 Mac/Node 24.14/Vite 8.2.2에서 `npm run build` 각 1회 기준 chart chunk는 1,118.84→495.88kB, 622.96kB(55.68%) 감소했고 500k 경고가 1→0이었습니다.

## 80 real HTTP agent 성능 수용

1. **기능 정보**: PostgreSQL 17과 production center JAR이 하나의 lightweight real HTTP server에 경로로 분리된 80 agent equivalent를 수집하는 로컬 MVP 부하입니다.
2. **발생한 문제**: 기존에는 80-agent p95/queue/첫 데이터 실측이 없었습니다. harness 첫 RED 두 번은 Compose 필수 sample token 보간 누락과 class 초기화 순서로 종료됐고, 다음 RED 두 번은 Spring CSRF cookie token masking을 하지 않아 POST 403이었습니다.
3. **해결 방법**: 임의 token/DB/master/admin 값은 메모리에만 두고 격리 Compose volume과 immutable center copy를 사용했습니다. 80개 instance를 인증·CSRF 경로로 등록하고 5 collection cycle, 목록 40회, snapshot 400회를 측정했습니다. queue는 각 반복의 미완료 개수를 0까지 기록하고 nearest-rank p95를 계산했습니다.
4. **해결 결과**: `HERMES_JAVA21_HOME=.tools/jdk21/Contents/Home node tools/perf-80-agents.mjs`는 PASS했습니다. 목록 p95 4.21ms/500ms, agent snapshot p95 9.83ms/1,000ms, 첫 데이터 5회 52/15/12/12/14ms(p95=max 52ms)/2,000ms였습니다. queue는 `[80,0]`, `[80,74,51,35,11,0]`, `[80,60,45,22,0]`, `[80,64,40,20,0]`, `[80,61,48,20,0]`로 모든 반복에서 단조 감소 후 0이었습니다.

## Immutable artifact provenance

1. **기능 정보**: 실행 center/agent 산출물의 SHA-256, byte size와 manifest를 생성하고 실행 전 동일 bytes인지 검증합니다.
2. **발생한 문제**: 기존 `.run/final/agent-final.jar`는 생성 근거와 hash 검증 파일이 없어 이후 build가 실행 중 artifact를 바꿨는지 독립 확인할 수 없었습니다.
3. **해결 방법**: `tools/artifact-manifest.mjs`의 create/verify를 test-first로 추가하고 `build.ps1`/`verify.ps1`이 immutable 경로 복사 뒤 manifest 생성·검증을 수행하게 했습니다. 같은 길이의 artifact 내용을 바꾼 test가 `SHA256_MISMATCH`로 실패하는지 검사합니다.
4. **해결 결과**: `node --test tests/artifact-provenance.test.mjs`는 최초 missing tool로 0/1 FAIL 후 1/1 PASS했습니다. 최종 package 뒤 manifest의 center/agent SHA-256을 verify하고 그 center copy로 health를 재확인합니다.

## Flyway 기존 migration checksum 보존

1. **기능 정보**: 이미 적용된 Flyway V1/V4는 byte-level checksum이 운영 DB 이력과 일치해야 하며 새 direction 변경은 V7에서만 수행합니다.
2. **발생한 문제**: SQL formatting 뒤 immutable center JAR의 실제 production DB 시작이 V1 `48079118→-979759308`, V4 `1631685568→-1223262250` checksum mismatch로 종료됐습니다.
3. **해결 방법**: 기존 V1/V4의 원문 bytes를 복원하고 새 제약은 V7에 유지했습니다. 과거 migration을 repair하거나 validation을 끄지 않았습니다. 기존 compressed 16줄은 migration 무결성 때문에 formatting 대상에서 명시적으로 제외했습니다.
4. **해결 결과**: 복원 checksum은 V1 `48079118`, V4 `1631685568`로 기존 DB와 정확히 일치했습니다. production DB의 migration 7개가 검증됐고 fresh PostgreSQL `ProductionMigrationTest` 1/1 PASS, immutable JAR health HTTP 200 10/10이었습니다.

## Flyway migration 개수 고정 assertion 회귀

1. **기능 정보**: Spring Boot 시작 전에 `classpath:db/migration`의 production migration 전체가 PostgreSQL에 성공 적용됐는지 검증하는 `MigrationStartupIntegrationTest`입니다.
2. **발생한 문제**: V8 추가 뒤 테스트가 성공 migration 수를 `7`로 고정해 expected 7/actual 8로 1/1 FAIL했고, 전체 Maven은 agent 31/31 + testapp 2/2 + center 60/61, 합계 93/94에서 실패했습니다. migration 실행 자체가 아니라 production 목록 증가를 따라가지 못한 assertion이 원인이었습니다.
3. **해결 방법**: Flyway가 resolve한 versioned production migration 목록을 기준으로 각 state가 `SUCCESS`인지 검사하고, DB `flyway_schema_history`의 성공 version/description 순서가 그 목록과 정확히 같은지 및 실패 행이 0인지 확인하는 helper로 교체했습니다. 숫자 8을 다시 고정하지 않았습니다.
4. **해결 결과**: 동일 focused test는 RED 1/1 FAIL(46.308초)에서 GREEN 1/1 PASS(12.437초)로 바뀌었습니다. 최종 `./mvnw -B clean verify -Ddependency-check.skip=true`는 agent 31/31, testapp 2/2, center 61/61, 합계 94/94 PASS와 frontend 16/16 PASS, 1분 22초, `BUILD SUCCESS`였습니다. `ProductionMigrationTest` 2/2도 fresh V8의 project/instance 0/0과 historical V2의 project 2에서 V8의 project/instance 0/0으로 가는 upgrade를 유지했습니다. OWASP/NVD 검사는 외부 feed blocker 때문에 이 실행에서 명시적으로 skip했습니다.

## 인수 #7 전체 자원 metric과 24시간/7일 그래프

1. **기능 정보**: 격리 PostgreSQL 17, 네 real lightweight HTTP agent, 재시작한 immutable center JAR, 세션 인증 Chromium을 통과하는 CPU·물리 메모리·JVM Heap·디스크·DB Active/Idle/Max의 latest와 24h/7d API/UI E2E입니다.
2. **발생한 문제**: 최초 focused E2E는 물리 메모리 latest UI가 없어 1/1 FAIL(8.6초)했습니다. UI에는 물리 메모리와 디스크 및 DB Idle/Max 그래프가 없고 DB Pool 기간 선택도 24h로 고정돼 있었습니다. 보강 도중 null history를 `Number(null)=0`으로 요약해 미지원 값을 0으로 위조하는 별도 RED도 1/1 FAIL(8.4초)로 재현했습니다.
3. **해결 방법**: 기존 `MetricChart`, generated API client, resource/pool history API 패턴을 재사용해 물리 메모리 latest, 물리 메모리·disk별 그래프, DB Pool 24h/7d 선택과 Active/Idle/Max 그래프를 추가했습니다. E2E agent 중 지원 인스턴스는 CPU `0.2`, 메모리 `256000000/1024000000`, Heap `32000000/128000000`, disk `100000000/1000000000`, pool `1/2/10`을 보내고, 미지원 인스턴스는 null을 보내도록 했습니다. 차트 요약은 null을 숫자로 변환하기 전에 제외합니다.
4. **해결 결과**: focused E2E는 최종 1/1 PASS(42.2초 전체 harness), full `npm run test:e2e`는 7/7 PASS(2.2분)했습니다. 24h와 7d 각각 실제 API latest/history에서 위 7개 metric 값을 검증했고 화면의 7개 그래프가 1개 이상 실제 지점을 표시했습니다. null latest/table은 모두 `미지원`, null history 그래프 7개는 모두 `수집된 지점 없음`이며 `0`으로 표시되지 않았습니다. repository 검사는 57/57 PASS, TypeScript lint와 production build도 PASS했습니다.

## 인스턴스 상세 그래프 시간 순서와 최근 값

1. **기능 정보**: `ResourceQuery`가 최신 N개를 보장하기 위해 `sampled_at desc limit`로 반환하는 resource/disk/DB Pool history를 공용 `MetricChart`가 과거→최신 x축과 series로 표시하고, 최대 timestamp의 유효한 값을 `최근 값`으로 요약하는 계약입니다.
2. **발생한 문제**: 차트가 API 배열 순서를 그대로 사용해 최신→과거로 그렸고, 유효 숫자 배열의 마지막 원소를 최근 값으로 선택해 5-point 내림차순 입력에서 기대 `21` 대신 가장 오래된 `10`을 표시했습니다. 첫 focused unit RED는 0/1 PASS, 1/1 FAIL(1.63초)이었습니다. 공백 문자열도 `Number` 변환으로 `0`이 되는 두 번째 RED를 1/1 FAIL(1.32초)로 재현했으며 null/unsupported 값은 최근 후보와 유효 point 수에서 제외되어야 했습니다.
3. **해결 방법**: backend를 단순 `asc limit`로 바꾸면 기간 안의 가장 오래된 N개를 선택하는 계약 회귀가 생기므로 API의 내림차순 최신-N 계약은 유지했습니다. `MetricChart`가 timestamp 오름차순으로 복사 정렬하고 유효 숫자만 series 값으로 사용하며 null/빈 값/boolean/비수치 값은 `null` gap으로 유지합니다. 동일 timestamp는 API 입력 순서를 안정적으로 유지하고 그 timestamp에서 입력상 뒤에 있는 유효 값을 요약에 사용합니다.
4. **해결 결과**: 5-point unit fixture는 x축/series가 `00:00→01:00→02:00→02:00→03:00`, series가 `[10,null,20,21,null]`, 유효 지점 3개, 최근 값 `21`, 위조된 `0` 0개임을 검증해 최종 GREEN 1/1 PASS(1.36초)했습니다. 실제 PostgreSQL/immutable center JAR E2E는 API의 3개 point 내림차순을 확인하면서 UI 최근 값 `0.2`를 검증해 focused 1/1 PASS(37.7초), 최종 전체 E2E 7/7 PASS(1.8분)했습니다. frontend unit 17/17, center focused 3/3, repository 57/57, lint/build가 모두 PASS했습니다. 최종 immutable candidate는 33,626,249 bytes/SHA-256 `ed2af6fbe30e4e8fda6a88578e39580d7ad7110aa99a917a2357df61f63b3305`로 manifest 검증했으며 성능 before/after 비교는 수행하지 않았습니다.

## NVD 장기 대기 대체와 실제 Critical 제거

1. **기능 정보**: Maven reactor와 npm lockfile의 production dependency를 무료 DB로 검사하고 HIGH/CRITICAL, scanner/DB/report 오류를 fail-closed하는 PowerShell/CI gate입니다. Maven test와 npm dev scope는 제외하고 JSON/SARIF를 보존합니다.
2. **발생한 문제**: 기존 OWASP 12.2.2 기본 verify는 NVD key 없는 최초 동기화가 약 9분에도 385,855건 중 10,000건(3%)에 머물렀습니다. 새 Trivy gate의 최초 완전 scan은 Maven 77/npm 27, 합계 104 package에서 `tomcat-embed-core` 11.0.24의 Critical 3건(CVE-2026-65182, CVE-2026-65905, CVE-2026-68525)을 찾아 exit 1, 15.354초였습니다.
3. **해결 방법**: Trivy 0.74.0 공식 `macOS-64bit` archive를 `.tools/trivy`에 격리하고 release checksum과 pinned SHA-256 `472816f6888dda689d075c30254d4210b4d1035acf365aa72332f584c2f60485`를 이중 대조했습니다. CycloneDX Maven Plugin 2.9.3과 `npm sbom --omit=dev --package-lock-only` SBOM을 각각 JSON/SARIF로 scan합니다. Tomcat core/el/websocket 3종은 CVE fixed version 11.0.25로 함께 올렸고 allowlist는 만들지 않았습니다. OWASP/NVD는 `periodic-owasp` 주간 defense-in-depth로 옮겼습니다.
4. **해결 결과**: 수정 뒤 동일 PowerShell gate는 104 package, High 0/Critical 0, exit 0, warm-cache 6.960초였고 네 report와 summary/metrics가 `.run/security`에 생성됐습니다. `verify.ps1` 실제 경로도 gate를 High 0/Critical 0, 6.198초로 먼저 통과한 다음 승인 `HERMES_JAVA7_HOME` 부재를 숨기지 않고 전체 exit 1/7.35초로 닫혔습니다. repository tests는 64/64, frontend unit은 17/17, npm audit은 0건이며 secret scan은 PASS였습니다. 전체 Java reactor는 agent 31/31, testapp 2/2, center 61/61, 합계 94/94와 Tomcat 11.0.25 실제 기동을 확인해 exit 0/32.166초였습니다. 성능 개선은 NVD 실행과 같은 DB/조건 비교가 아니므로 주장하지 않습니다.

## 날짜 경계로 24시간 history fixture가 만료된 회귀

1. **기능 정보**: dependency 패치 뒤 전체 Maven 회귀에서 resource history의 24시간 기간 필터를 검증하는 `MigrationStartupIntegrationTest`입니다.
2. **발생한 문제**: 테스트가 `2026-09-03T01:30:45Z`를 고정 저장해 2026-09-04 실행 시 24시간 밖으로 나갔고, `$.history.length()` 기대 1/실제 0으로 focused 1/1 및 전체 center 60/61이 실패했습니다. production 코드나 Tomcat 패치가 원인이 아니었습니다.
3. **해결 방법**: 이미 실패하는 행동 테스트를 RED로 사용해 해당 fixture 시각만 `Instant.now().minusSeconds(30)`으로 바꿨습니다. 기간 필터 assertion과 production query는 변경하지 않았습니다.
4. **해결 결과**: 같은 focused test는 1/1 PASS, exit 0/10.556초였고 이어 전체 Maven reactor가 94/94 PASS, exit 0/32.166초였습니다.

## live sample 포트와 격리 Playwright 재실행 충돌

1. **기능 정보**: full frontend Playwright regression은 별도 PostgreSQL과 lightweight agents를 `18081`~`18084`, center를 `18080`에 띄우는 격리 harness입니다.
2. **발생한 문제**: 현재 운영 중인 sample containers가 `18081`~`18084`를 이미 사용해 agent 시작이 `EADDRINUSE`였고, `npm run test:e2e`는 test 실행 전 exit 1/79.30초로 fail-closed했습니다.
3. **해결 방법**: 현재 backend/frontend/DB/agents를 불필요하게 깨지 말라는 조건 때문에 기존 stack을 종료하거나 volume을 삭제하지 않았습니다. 이번 dependency 범위 밖에서 포트 계약을 임의 변경하거나 실패를 skip하지 않았습니다.
4. **해결 결과**: E2E 재실행은 **BLOCKED**로 남겼습니다. harness가 만든 별도 compose project/volume은 cleanup됐고 기존 `5173`, `8080`, `18081`~`18084` listener는 계속 실행 중입니다. repository 64/64, frontend unit 17/17/build/lint/schema/license/audit와 Maven 94/94는 별도로 PASS했습니다.

## Tomcat 11.0.25 최종 stack과 안전 종료 재검증

1. **기능 정보**: 2026-09-04 KST에 production PostgreSQL volume을 보존하며 기존 `8080`/`5173`/`18081`~`18084` stack을 종료하고, Tomcat 11.0.25 clean artifact, 실제 runtime, authenticated E2E와 최초 Git 기준선을 검증했습니다.
2. **발생한 문제**: 기존 `dev-down.ps1`은 wrapper PID만 종료해 이미 생성된 Java/Vite 자식 2개를 남겼고 sample profile을 지정하지 않아 agent container 4개도 남겼습니다. 또한 `build.ps1`은 macOS에서도 `mvnw.cmd`를 고정했고, 오래된 `.env`의 sample key 누락 시 개선된 sample-profile down이 Compose interpolation error를 성공처럼 반환했습니다. fresh-context Codex 검토는 420초 timeout, Claude 검토는 미로그인으로 결과를 만들지 못했습니다.
3. **해결 방법**: 실패하는 operations contract 2건을 먼저 추가했습니다. 종료는 tracked process tree를 자식부터 재귀 종료하고 sample profile 전체를 내리며 기본 경로에는 `--volumes`를 쓰지 않습니다. 오래된 `.env`는 바꾸지 않고 종료 process에만 동적 32자 placeholder를 주며 native exit를 검사합니다. build는 OS별 wrapper와 center/agent manifest를 사용합니다. 독립 CLI가 불가해 `docs/release-verification.md`에 fail-closed exhaustive checklist를 저장했습니다.
4. **해결 결과**: 종료 뒤 6개 port 모두 free, 보존 volume `monitoring_hermes-postgres-data` 존재를 확인했습니다. Trivy는 104 package/HIGH 0/CRITICAL 0/6.479초, Maven은 94/94와 frontend 17/17/294.83초, E2E는 7/7/113.42초, repository는 최종 66/66, secret scan은 0건/0.26초였습니다. immutable center는 33,285,281 bytes/SHA-256 `8d232eb96deefecc3e11cbd3aa8746785d094413a4270a21a347b86b972e04cc`이고 health 10/10, frontend 1/1, agents 4/4가 모두 HTTP 200이었습니다. 실제 banner와 nested JAR 3개는 Tomcat 11.0.25였습니다. 제품 검토 잔여는 blocker 0/major 0/minor 0입니다.

## opt-in LAN 대시보드 바인딩

1. **기능 정보**: 2026-09-05 KST에 같은 신뢰된 Wi-Fi에서 통합 Spring Boot 대시보드 `8080`만 host의 활성 private IPv4에 opt-in 바인딩하고, PostgreSQL `5432`, Vite `5173`, sample agent `18081`~`18084`는 loopback에 유지하는 운영 모드입니다.
2. **발생한 문제**: 구현 전 backend는 `127.0.0.1:8080`만 LISTEN하여 loopback health는 HTTP 200이었지만 host의 private LAN address에서는 HTTP 000/connection refused였습니다. 기본 application address와 dev-up readiness가 모두 loopback으로 고정된 것이 원인입니다. 첫 실제 재기동 2회는 오래된 `.env`의 sample token key 부재와 active Java 미설정 때문에 각각 exit 1/2초, exit 1/4초로 fail-closed했고 PID 파일을 남기지 않았습니다.
3. **해결 방법**: production 수정 전에 private/public/loopback/link-local/host ownership/자동 선택 테스트와 LAN 노출 계약 테스트를 RED로 추가했습니다. `-Lan` 또는 `-LanAddress`만 활성 interface의 RFC1918 IPv4를 선택하며 default gateway가 모호하거나 주소가 host 소유가 아니면 거부합니다. Spring에는 process-local `SERVER_ADDRESS`로 specific IP만 전달하고 listener ownership/readiness도 같은 IP로 검사합니다. `0.0.0.0`은 사용하지 않았고 Vite/Compose 바인딩, session/login/CSRF/actuator 정책, `.env`, firewall, DB volume은 변경하지 않았습니다.
4. **해결 결과**: validation 19/19, LAN 계약 3/3, dev-up 5/5, dev-down 2/2, repository 69/69와 PowerShell parser가 PASS했습니다. 보존 volume에서 host의 private LAN address를 자동 감지했고 첫 ready start는 exit 0/10초, 두 번째 호출은 exit 0/2초에 같은 tracked process를 유지했습니다. 실제 listener는 해당 private LAN address의 `8080` 하나이며 LAN health는 HTTP 200/49 bytes/7.719ms와 `UP`, browser `Accept: text/html` root는 HTTP 302 `/login`/5.033ms, login page는 HTTP 200/1,118 bytes/4.750ms와 login/CSRF field, unauthenticated API와 actuator info는 각각 HTTP 401입니다. `127.0.0.1:8080`은 HTTP 000/exit 7입니다. `5432`, `5173`, `18081`~`18084`는 모두 `127.0.0.1` LISTEN입니다. same-host LAN route의 실제 socket 검증이며 별도 물리 기기 접속은 사용자가 확인해야 합니다.

## Quick Tunnel 로그인 HTTPS downgrade

1. **기능 정보**: 2026-09-07 09:54~10:24 KST의 Cloudflare Quick Tunnel `trycloudflare.com` 외부 HTTPS 경계, Spring Security browser entry point, session/CSRF cookie와 임시 `tunnel` profile입니다.
2. **발생한 문제**: 수정 전 외부 `Accept: text/html` root는 HTTP 302이지만 `Location`이 임시 tunnel host의 absolute HTTP login URL이었고 `JSESSIONID`와 `XSRF-TOKEN`에 `Secure`가 없었습니다. Cloudflare가 외부 Host를 origin에 유지하되 origin hop은 HTTP인 상태에서 Spring의 absolute login URL 생성이 origin scheme을 사용한 것이 원인입니다. forwarded 처리를 무조건 켜면 LAN/인터넷 client의 임의 `X-Forwarded-*` host/proto poisoning 위험이 있어 사용하지 않았습니다.
3. **해결 방법**: 실제 integration test를 먼저 추가하여 malicious forwarded host/proto에도 `/login` relative redirect와 tunnel profile의 `Secure; HttpOnly; SameSite=Lax` session을 요구했고 최초 expected `/login`, actual absolute HTTP로 RED를 확인했습니다. security-chain 앞의 좁은 response wrapper는 query/fragment 없는 정확한 `/login` redirect만 relative로 정규화합니다. `application-tunnel.yml`은 opt-in일 때만 session/CSRF cookie에 Secure를 강제하고 기본/LAN mode 및 forwarded-header trust는 바꾸지 않습니다.
4. **해결 결과**: focused 1/1과 최종 clean reactor agent 31/31, testapp 2/2, center 64/64, frontend 17/17이 PASS했습니다. 최신 immutable center JAR은 33,291,853 bytes/SHA-256 `46048b2c11d8408cddc3cb2d50e624c3cecf4b9af7d7ca7069ea9b6fb4127cab`입니다. backend만 graceful 교체해 tracked backend/frontend/cloudflared process와 같은 임시 URL/LAN listener를 유지했습니다. 외부 3/3에서 root 302 `/login`, session flags PASS, login 200/form+CSRF/XSRF flags PASS, credential 없는 CSRF login POST 401, API 401, health 200/UP, security headers PASS였고 TLS 1.2 및 `trycloudflare.com` certificate를 검증했습니다. cloudflared는 1개입니다.

## 로컬 admin 비밀번호 reset 인계와 clean checkout 신뢰성

1. **기능 정보**: 2026-09-07 KST의 `AdminSeeder` 기본 사용자 `admin`, PostgreSQL `app_users` hash와 Mac/Windows portable PowerShell local reset workflow입니다. CLI 계약은 8자 이상 두 번의 secure 입력, 정확히 1행 transaction, BCrypt, 실패 rollback, 재시작 persistence입니다.
2. **발생한 문제**: clean `agent/target`에서 기존 script가 곧바로 Maven `exec:java`만 실행해 `ClassNotFoundException: com.monitoring.agent.security.AdminPasswordResetCli`로 exit 1/2.360초가 났고 PowerShell은 이를 일반 `admin 비밀번호 reset이 실패했습니다.`로 가렸습니다. `exec:java`가 compile/package lifecycle을 실행하지 않는 것이 확인된 원인입니다. 분리 probe에서 미리 compile된 상태의 같은 Maven stdin/JDBC runtime classpath/인용된 `.env` DB password/URL/user/BCrypt `CharSequence`/실제 schema는 exit 0이어서 배제했습니다. portable PowerShell의 점이 든 미인용 Maven property가 `.skip=true` lifecycle로 분리되는 별도 RED도 exit 1/2.837초로 확인했습니다.
3. **해결 방법**: repository test를 1/2 FAIL로 먼저 만들고, 비밀번호 입력 전에 `agent` Spring Boot JAR를 package하며 `'-Dfrontend.skip=true'`를 portable하게 단일 argument로 전달합니다. 입력 뒤에는 Maven stdin 경계를 제거하고 JAR의 `PropertiesLauncher`로 기존 `AdminPasswordResetCli`를 direct Java 실행합니다. build/artifact/reset-cli 실패는 `stage`, `code`, `exit`만 노출합니다. 두 `Read-Host -AsSecureString`, BSTR zero/dispose, stdin-only 전달, 기존 `FOR UPDATE`/1행 update/commit·rollback/BCrypt 구현은 유지했고 password argument/temp/log/API는 만들지 않았습니다.
4. **해결 결과**: 운영 PostgreSQL을 멈추지 않고 `pg_dump` stream으로 PostgreSQL 17.11 격리 DB에 16-table schema/data와 user 1행을 복제했으며 clone/운영 app-user digest가 reset 전 일치했습니다. clean target에서 exact portable path는 generated dummy를 PTY stdin으로만 두 번 받아 `ADMIN_PASSWORD_RESET_OK`, exit 0/154.178초였습니다. 격리 Spring Boot 실제 login은 old dummy HTTP 401, new dummy HTTP 302였고 backend 재시작 뒤 new dummy도 HTTP 302였습니다. 운영 app-user는 전/후 모두 1행이고 digest가 불변임을 비교로 확인했으며 digest 자체는 기록하지 않습니다. production backend/frontend process, private LAN listener, PostgreSQL healthy/46시간 uptime도 유지했습니다. focused repository test는 RED 1/2에서 GREEN 2/2(exit 0/100.133ms)가 됐고 direct packaged-Java probe는 exit 0/0.850초였습니다. 최종 repository 72/72, Maven reactor 97/97(agent 31, testapp 2, center 64), PowerShell parser 11/11, secret scan과 `git diff --check`가 모두 exit 0입니다. password/dummy leak은 masking 후 0건이며 실제 운영 password는 조회·출력·변경하지 않았습니다. 성능 영향 미측정입니다.

## 무료/오픈소스 비용 경계 감사

1. **기능 정보**: 2026-09-07 KST의 PostgreSQL, Docker/Compose, Temurin/OpenJDK, Maven, React/Vite/PatternFly/ECharts, Trivy, Cloudflare Quick Tunnel 및 외부 API check 비용·license 경계입니다.
2. **발생한 문제**: 도구별 무료/OSS 근거와 Docker Desktop 조건부 무료 범위, Quick Tunnel 임시 무료 제한, 외부 API 비용/부작용 fail-closed 정책이 한 문서에 없었습니다.
3. **해결 방법**: 각 upstream 공식 license/문서를 인용한 `docs/costs.md`를 추가했습니다. paid cloud/repository/scanner/Cloudflare plan/domain/Access는 금지하고 Docker Desktop 무료 자격이 불명확하면 사용 중단으로 기록했습니다. `api_checks_enabled` 기본 false를 확인했으며 비용·quota·부작용 가능 외부 target은 `disabled`/`configuration_required`로 유지하고 실제 호출하지 않았습니다. 기존 npm/Maven license, SBOM, Trivy gate는 유지합니다.
4. **해결 결과**: 비용 정책 contract 1/1과 citation ledger strict 검증이 PASS했고 repository Node 전체는 72/72 PASS입니다. 이번 작업에서 유료 service/API/license를 새로 구성하거나 호출하지 않았습니다. Docker Desktop 무료 자격은 사용자/조직 조건이므로 운영자가 공식 조건 충족 여부를 확인해야 하는 잔여 경고입니다.

## Codeit 근거 기반 로그인·SPA 재설계

1. **기능 정보**: custom `/login`, 5개 상위 메뉴 SPA shell, 3개 인스턴스 tab, filter/drawer/settings, loading/empty/error/stale/success 상태를 macOS 네이티브 Chrome, Spring Boot 4.1.1, React 19, PatternFly 6, ECharts, 실제 PostgreSQL 17과 4개 HTTP agent에서 검증했다. 기준은 `DESIGN.md`, `docs/design-reference.md`, `docs/dashboard-redesign-spec.md`다.

2. **발생한 문제**: 기존 외부 로그인은 Spring 기본 `Please sign in` 영문 form으로 제품 정체성, 한글 안내, 보안 맥락이 없었다. 초기 slop audit는 8/10이었다. SPA는 PatternFly 기본 shell과 9줄 CSS에 의존해 active 위치, breadcrumb, Monitor/Operate 위계, responsive 제품 구성이 없었고 초기 dashboard slop audit는 7/10이었다.

- 새 로그인 첫 axe RED에서 `#76747e`/`#f5f3ff` 12px 텍스트 대비 4.18:1이 발견됐다. 새 shell 첫 full E2E axe에서 context bar가 landmark 밖이라는 region 위반 1건이 발견됐다.
- E2E history seed가 agent sample과 같은 minute key로 충돌해 기대 3점/실제 2점, 이후 부분 seed가 최신값이 되어 memory/heap null을 만드는 비결정성이 있었다.
- production sample agent가 `18081`~`18084`를 점유해 isolated E2E lightweight agent가 `EADDRINUSE`로 시작하지 못했다.

3. **해결 방법**: Spring Security에 custom login page를 명시하고 controller가 실제 CSRF token을 HTML-escape해 form에 삽입했다. browser HTML 실패만 `/login?error`로 돌리고 기존 API JSON 401 계약은 유지했다. 기존 PatternFly table/tabs/drawer/form 접근성 동작과 real API를 재사용하면서 original Hermes token/CSS shell, active nav, skip link, location landmark, concise summary strip, asymmetric chart layout, responsive rail을 구현했다.

- login contrast는 `#66666e`로 높이고 context bar는 이름 있는 section landmark로 바꿨다. mobile table은 header를 유지한 가로 scroll과 sticky first column을 사용한다.
- E2E seed는 충돌을 피한 second offset과 완전한 metric row를 사용한다. full E2E 동안 기존 agent container 4개만 stop/start하고 DB/backend/tunnel/volume은 유지한다.

4. **해결 결과**: frontend shell RED는 15건 중 2 FAIL에서 15/15 PASS로 바뀌었다. login integration RED 1/1 FAIL은 custom page 구현 뒤 1/1 PASS였다. login axe는 contrast serious 1→0, dashboard axe region 1→0이며 screenshot test에서 1440/1024/390 document overflow는 모두 0이다.

- 실제 E2E 최종 full run은 custom login/responsive, 4-agent drill-down, 24h/7d 자원, 5-filter/drawer/recheck, settings/token, 인증서, PostgreSQL stale 복구, dashboard axe의 8/8 PASS(2.0분)다.
- 정적 artifact는 2,302,074→2,179,838 bytes(-122,236, -5.31%), 초기 JS 356,320→260,476(-26.90%), 초기 CSS 556,232→278,752 bytes(-49.89%)다. 각 build 1회 artifact size 비교이며 render 성능은 측정하지 않았다.
- slop audit는 로그인 8→1, dashboard 7→2다. 장식 gradient/glass/icon tile/거대 stat/equal card grid/invented metric은 0건이다.
