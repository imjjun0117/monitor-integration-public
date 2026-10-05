# 운영과 백업

## API 점검 주기와 등록

API 정의는 에이전트 `/monitor/v1/info`에서 발견한다. 샘플 적용 코드와 설정은 샘플 프로젝트의 `doc/MONITOR_SDK_INTEGRATION.md`에 있다. 이미 등록한 인스턴스에는 API별 중앙 수동 등록이 필요 없다. 에이전트 설정에서 비활성화/삭제한 점검은 다음 수집에서 비활성화하고 결과 이력을 보존한다. 다시 제공하면 재활성화한다.

API 모니터링과 인스턴스 상세의 내부 점검에서 **점검 설정**을 열어 점검 사용 여부, 자동 실행 사용 여부, 주기(1분~7일)를 저장한다. 점검 자체를 미사용으로 바꾸면 자동·수동 실행과 상태 집계에서 제외하고 기존 결과와 이력은 보관한다. 점검 사용 상태에서 자동 실행만 미사용으로 바꾸면 수동 실행은 가능하다. API는 인스턴스 설정의 API 자동 점검도 켜져 있어야 자동 실행하며, 내부 점검은 해당 API 스위치와 독립적이다.

스케줄러는 10초마다 대상을 확인하며 마지막 결과의 중앙 수신 시각부터 설정한 주기가 지난 항목만 실행한다. 주기를 별도로 저장하기 전의 기본값은 내부 점검/내부 API 5분, 외부 API 24시간이다. 외부 기본값은 `HERMES_EXTERNAL_CHECK_INTERVAL_MS`로 설정한다(최소 300000ms). 수동 실행도 최신 점검 시각을 갱신하며 30초 재요청 제한을 적용한다. 큐 대기 중 사용 여부나 자동 실행을 끄면 에이전트 전송 전에 다시 확인해 실행을 취소한다. 이미 전송한 요청은 완료될 수 있다.

V12 마이그레이션은 기존 대표 인스턴스의 API 자동 실행만 유지하고, 다른 인스턴스/API와 내부 점검은 자동 미사용으로 시작한다. 이후 자동 실행을 켠 항목은 인스턴스별로 각자 실행한다. 새로 발견한 항목도 자동 미사용이므로 의도치 않은 외부 호출을 늘리지 않는다. `monitoring_enabled`, `automatic_enabled`, `check_interval_seconds`는 중앙 관리자 설정이며 에이전트 재수집·재배포·목록 제거 후 재등장에도 유지한다. 샘플 에이전트 재배포 없이 사용할 수 있고 실제 업무 프로그램의 API 호출 설정은 변경하지 않는다.

통합 대시보드는 서버 자원 수집 상태(`collection_status`)와 자원/내부 점검/API 문제를 분리해 표시한다. 수집 정상 서버 수와 내부 점검/API/인증서 이상 건수를 별도로 확인하고 서버 카드에서 문제 항목 이름과 원인을 확인한다. 점검 미사용은 즉시 대시보드 상태에서 제외되며 다음 자원 수집을 기다리지 않는다. 전체 `status`가 DOWN이어도 서버 자체의 종료를 의미하지 않으며 개별 점검 실패일 수 있다.
API 이름을 누르면 실제 요청 방식·주소·입력값·헤더·본문, HTTP 코드·응답 본문, 정상 판정 기준을 확인한다. 상세 수집 SDK가 반영되기 전의 결과는 상세 미수집으로 표시한다. 본문은 인증 정보와 개인정보를 가린 후 최대 4,096자만 보관하며, 구조가 깨져 안전하게 가릴 수 없는 JSON은 본문 생략 메시지로 표시한다. 최신 결과에만 상세를 보관하고 이력에는 상태·소요 시간만 저장한다. 시간 차트의 가로축은 실행 시각, 세로축은 요청부터 응답 확인까지 걸린 밀리초이며 연속 실시간 측정은 아니다.

샘플 팝빌 항목은 잔여 포인트와 실제 알림톡/SMS/LMS 단가를 SDK로 조회해 유형별 예상 발송 건수를 계산한다. SMART5 사이트 연결과 기존 특허 등급 조회, SMART V 기존 평가 보고서 조회는 별도 항목이다. 기존 조회 대상 설정은 샘플의 `monitor.smart5.regNo`, `monitor.smartv.vltnNo`이며 실제 번호가 없으면 미확인으로 표시한다. 배포 시 점검 클래스·JSON과 새 SDK JAR를 함께 반영한다.

## SSL 인증서 조회

설정 → 인증서 대상 관리에서 프로젝트, 호스트(스킴 없는 도메인), 포트, SNI, 주기를 등록한다. 중앙 서버가 직접 TLS 연결로 실제 인증서의 도메인 일치와 신뢰를 검증하고, 만료일·남은 일수·발급 기관을 저장한다. 샘플 SDK 변경 없이 동작한다. 인증서 관리에서 호스트를 누르면 상세를 확인하고 '지금 인증서 확인'으로 새로 조회할 수 있다. DNS·접속·시간 초과·TLS 검증 실패는 구분해 표시한다. 만료 경고/위험 기준은 임계치 설정의 CERTIFICATE_DAYS를 사용한다.

## 의존성 취약점 게이트

필수 게이트는 무료 Trivy 0.74.0과 production CycloneDX SBOM입니다. 다음 명령은 Maven reactor의 compile/runtime/provided 의존성(`includeTestScope=false`)과 npm lockfile의 production 의존성(`npm sbom --omit=dev --package-lock-only`)을 각각 스캔합니다. Maven test와 npm dev 의존성은 배포 산출물 정책상 이 게이트에서 제외되며, 기존 전체 test/license 검증은 계속 실행합니다.

```powershell
.\scripts\dependency-vulnerability-gate.ps1
```

스크립트는 OS/architecture별 공식 GitHub release archive를 ignored `.tools/trivy/0.74.0`에만 설치합니다. 공식 `trivy_0.74.0_checksums.txt`와 코드에 고정한 SHA-256이 모두 일치해야 압축을 풉니다. 시스템 전역 설치는 없습니다. Trivy DB와 Java DB 다운로드/파싱 실패, SBOM/JSON/SARIF 손상, scanner exit/report 불일치, HIGH 또는 CRITICAL 발견은 모두 실패입니다. `--ignore-unfixed`나 자동 allowlist는 사용하지 않습니다.

결과는 `.run/security/`의 `maven-cyclonedx.json`, `npm-cyclonedx.json`, ecosystem별 `*-trivy.json`/`*.sarif`, `dependency-vulnerability-summary.json`, `dependency-vulnerability-metrics.json`에 생성됩니다. `scripts/verify.ps1`은 승인 Java 7/8 home을 검사하기 전에 이 독립 게이트를 실행하므로 runtime blocker가 취약점 결과를 가리지 않습니다. CI의 required `dependency-vulnerability` job도 같은 PowerShell 경로를 실행하고 SARIF를 Security에 업로드합니다.

OWASP Dependency-Check 12.2.2/NVD는 source of truth가 아니라 매주 월요일 schedule의 defense-in-depth로 유지합니다. `periodic-owasp` Maven profile만 OWASP aggregate를 켜며 CVSS 7.0 이상, feed/analyzer 오류를 fail-closed 처리합니다. NVD cache는 직렬 concurrency group과 주 단위 key를 사용하고 key는 선택적 `NVD_API_KEY` secret으로만 전달합니다. 수동 실행은 `./mvnw -B -Pperiodic-owasp verify`이며 NVD 장애를 성공으로 바꾸지 않습니다.

## 실행과 종료

`./scripts/dev-up.ps1`로 시작하고 `./scripts/dev-down.ps1`로 종료합니다. 일반 종료는 DB volume을 지우지 않습니다.

### Agent 연결 allowlist

접속 허용 목록은 프로젝트 루트의 `config/agent-allowlist.json`에서 관리합니다.

```json
{
  "allowed_cidrs": ["127.0.0.1/32", "10.0.0.7/32"],
  "allowed_hosts": ["service.example", "agent.example.com"]
}
```

`allowed_cidrs`는 IP/CIDR 배열입니다. 단일 IPv4는 `/32`, IPv6는 `/128`을 붙입니다. `allowed_hosts`는 프로토콜·포트·경로 없이 정확한 도메인만 입력합니다. 공개 도메인은 HTTPS만 허용하며 DNS의 모든 A/AAAA 응답이 public/global이어야 합니다. wildcard, IP literal, userinfo는 허용하지 않습니다. 사설 주소가 필요한 경우 `allowed_cidrs`에 필요한 범위를 명시합니다. 메타데이터·link-local 주소 차단과 DNS pinning은 유지됩니다.

JSON 변경은 다음 연결 요청부터 적용되므로 재시작이 필요 없습니다. 잘못된 JSON이나 읽을 수 없는 파일은 연결을 차단하며 `ALLOWLIST_CONFIG_ERROR`로 안내합니다. 시작 시에도 파일을 검증합니다.

`.env`의 `HERMES_AGENT_ALLOWLIST_FILE=config/agent-allowlist.json`은 파일 위치만 지정합니다. `dev-up.ps1`은 프로젝트 루트 기준 상대 경로를 절대 경로로 바꿔 전달합니다. JAR를 직접 실행할 때는 절대 경로를 권장합니다. 파일을 지정하면 파일의 목록만 사용합니다. 파일을 지정하지 않은 기존 배포에서는 `HERMES_AGENT_ALLOWED_CIDRS` / `HERMES_AGENT_ALLOWED_HOSTS` 설정을 계속 사용할 수 있으며 이 환경 변수 방식은 재시작 후 반영됩니다.

기본 시작은 계속 Spring Boot `127.0.0.1:8080`입니다. 같은 신뢰된 개인 Wi-Fi의 다른 기기에서 통합 대시보드에 접속해야 할 때만 다음 opt-in 절차를 사용합니다.

```powershell
./scripts/dev-down.ps1
./scripts/dev-up.ps1 -Lan
# default-gateway LAN 주소가 여러 개면 host가 소유한 주소를 명시
./scripts/dev-up.ps1 -Lan -LanAddress 192.168.1.20
```

`-Lan`은 활성 interface의 private IPv4 중 default gateway를 가진 유일한 주소만 자동 선택합니다. `-LanAddress`도 private IPv4이며 현재 활성 host interface가 소유해야 합니다. 잘못된 값, `0.0.0.0`, loopback, link-local, multicast, 공인 IP와 모호한 자동 감지는 fail-closed합니다. LAN에는 Spring Boot `8080`만 specific address로 열립니다. PostgreSQL `5432`, Vite `5173`, sample agent `18081`~`18084`는 `127.0.0.1`에만 남습니다. 대시보드는 login/session/CSRF를 계속 요구하며 actuator 공개 범위는 health/info 정책을 바꾸지 않습니다. macOS firewall은 비활성화하지 마십시오. OS 권한 prompt가 뜨면 승인하지 말고 중단해 정책을 확인하십시오. 공용 Wi-Fi에서는 LAN 모드를 사용하지 마십시오.

### Cloudflare Quick Tunnel HTTPS 경계

Quick Tunnel은 임시 공개 노출이며 신뢰된 개인망에서만 명시적으로 `tunnel` Spring profile을 활성화합니다. 이 profile은 외부 HTTPS browser용 `JSESSIONID`와 `XSRF-TOKEN`에 `Secure`를 강제합니다. 로그인 redirect는 origin scheme/host나 `X-Forwarded-*`를 조립하지 않고 항상 상대 경로 `/login`입니다. 애플리케이션의 forwarded-header 처리는 활성화하지 않으므로 인터넷 또는 LAN client가 보낸 임의 `Forwarded`/`X-Forwarded-Proto`/`X-Forwarded-Host`는 scheme/host 결정에 신뢰되지 않습니다. Cloudflare header 값이나 cookie/token은 로그에 저장하지 마십시오.

```powershell
# 기존 stack을 정상 종료한 뒤에만 실행; DB volume은 보존
./scripts/dev-down.ps1
$env:SPRING_PROFILES_ACTIVE = 'tunnel'
./scripts/dev-up.ps1 -Lan
# 별도 terminal에서 cloudflared tunnel --no-autoupdate --url http://<선택된-private-LAN-IP>:8080
```

기본 loopback/LAN 평문 HTTP에서는 `tunnel` profile을 사용하지 않습니다. `Secure` cookie는 평문 HTTP에서 browser가 재전송하지 않으므로 direct LAN HTTP와 tunnel mode를 동시에 browser session 용도로 혼용하지 않습니다. direct LAN은 같은 신뢰된 개인 Wi-Fi에서만 허용되는 평문 정책이며, 공용 Wi-Fi/인터넷 직접 노출은 금지합니다. Quick Tunnel 종료 후 `SPRING_PROFILES_ACTIVE`를 제거하고 정상 down/up하여 기본/LAN 정책으로 돌아갑니다. Quick Tunnel URL은 임시이며 인증을 대체하지 않습니다.

loopback 기본 모드로 원복하려면 아래처럼 정상 종료 후 `-Lan` 없이 다시 시작합니다. DB volume은 삭제하지 않습니다.

```powershell
./scripts/dev-down.ps1
./scripts/dev-up.ps1
```

`dev-up.ps1`은 `.run/dev-up.lock`으로 동시 실행을 직렬화합니다. `.run/pids`가 있으면 backend/frontend PID가 살아 있고 각각 `8080`/`5173` listener process tree를 소유하며 backend health `UP`, frontend HTTP 200, PostgreSQL ready, sample agent 4개가 인증된 HTTP 200인지 확인합니다. 모두 정상이면 프로세스를 새로 만들지 않고 기존 PID를 유지한 채 exit 0입니다. PID가 stale하거나 포트가 다른 프로세스 소유이면 파일/프로세스를 덮어쓰거나 종료하지 않고 명확한 오류로 실패합니다.

새 시작은 local port가 비어 있는지 먼저 확인하고 Compose와 두 local process를 시작합니다. 기본 120초 안에 process 생존과 전체 readiness가 확인된 뒤에만 `.run/pids`를 같은 디렉터리의 임시 파일에서 atomic move합니다. 실패하면 이번 실행이 만든 backend/frontend process tree와 이전에 실행 중이지 않았던 Compose service만 정리하고 nonzero로 끝납니다. 원인 확인용 `.run/backend.out`, `backend.err`, `frontend.out`, `frontend.err`는 보존하며 내용이나 `.env` 비밀은 console에 출력하지 않습니다. 테스트 격리나 비기본 포트가 필요한 경우 `-BackendPort`, `-FrontendPort`, `-AgentPorts`, `-ReadinessTimeoutSeconds`를 지정할 수 있습니다.

macOS에서 시스템 전역 설치 없이 검증할 때는 공식 architecture별 PowerShell tar archive를 ignored `.tools/pwsh`에 풀고 release의 `hashes.sha256`과 archive SHA-256을 먼저 대조합니다. 이 저장소에서 검증한 Intel Mac 명령은 `.tools/pwsh/pwsh -NoProfile -File scripts/dev-up.ps1`입니다. active Java는 21이어야 하며 전체 `verify.ps1`에는 별도로 승인된 `HERMES_JAVA7_HOME`과 `HERMES_JAVA8_HOME`이 필요합니다.

과거에 만든 `.env`가 현재 `.env.example`의 필수 key를 빠뜨렸다면 파일을 자동 덮어쓰지 않습니다. key 이름만 비교해 운영자가 안전하게 migration한 뒤 실행합니다. 임시 검증용 값은 process 환경에만 둘 수 있지만 다음 실행에는 유지되지 않습니다.

### admin 비밀번호 재설정

초기 사용자명은 `AdminSeeder` 기본값인 `admin`입니다. 저장된 값은 BCrypt hash뿐이므로 기존 원문 비밀번호는 복구할 수 없습니다. 새 비밀번호는 반드시 사용자가 Mac/Windows 로컬 terminal에서 아래 명령을 직접 실행해 두 번 입력합니다.

```powershell
./scripts/reset-admin-password.ps1
```

입력은 `Read-Host -AsSecureString`으로 받고 command argument, process list, 임시 파일, log, shell history에 원문을 넣지 않습니다. 스크립트는 비밀번호를 받기 전에 reset CLI가 포함된 Spring Boot JAR를 clean checkout에서도 생성하고, 입력 뒤에는 Maven이 아니라 해당 JAR의 `PropertiesLauncher`로 CLI를 직접 실행합니다. 8자 미만 또는 확인 불일치, DB 비정상, admin 사용자 부재, update 행 수가 1이 아니면 transaction을 rollback하고 실패합니다. 성공 시 Spring과 동일한 `BCryptPasswordEncoder` hash로 DB `app_users`의 해당 admin 1행만 갱신합니다. `.env`의 초기 hash는 덮어쓰지 않으며 DB volume에 저장되므로 backend 재시작 후에도 유지됩니다. 공개 tunnel/API에는 password reset endpoint를 만들지 않습니다.

실패 시 비밀값 없이 다음 네 경계를 순서대로 확인합니다.

1. `ADMIN_PASSWORD_RESET_FAILED stage=build`: JDK 21과 Maven wrapper 실행 여부를 확인합니다. build는 입력 전에 실패하므로 비밀번호는 아직 평문으로 변환되지 않습니다.
2. `code=RESET_ARTIFACT_INVALID`: `monitor-center/target`의 reset JAR가 없거나 둘 이상입니다. 임의 JAR를 실행하지 말고 build 오류를 먼저 해결합니다.
3. `stage=reset-cli`와 `HERMES_DB_PASSWORD_REQUIRED`/DB 연결 오류: `.env` key 이름, 인용부호, `HERMES_DB_JDBC_URL`/port와 PostgreSQL readiness를 확인하되 값을 console에 출력하지 않습니다.
4. `ADMIN_USER_NOT_FOUND`/`ADMIN_PASSWORD_UPDATE_COUNT_INVALID`: `HERMES_ADMIN_USERNAME`에 해당하는 `app_users` 행이 정확히 1개인지 확인합니다. 스크립트는 이 경우 rollback하며 다른 사용자를 갱신하지 않습니다.

정상 종료는 tracked wrapper의 자식 process tree부터 Unix TERM(Windows GUI process는 `CloseMainWindow`)을 요청하고 process별 최대 5초 기다립니다. 응답하지 않은 process에만 force escalation하고 2초 더 확인하며, 강제 종료 수가 1개 이상이면 warning을 남깁니다. 그 뒤 `--profile samples down`으로 네 sample agent와 PostgreSQL container를 내립니다. `-DeleteData`를 명시하고 `DELETE`를 입력하지 않는 한 `--volumes`를 사용하지 않습니다. 오래된 `.env`의 sample token key가 없어도 종료 시에만 동적으로 만든 비밀이 아닌 placeholder로 Compose interpolation을 통과하며 사용자 `.env`는 변경하지 않습니다.

## Immutable 산출물

`scripts/build.ps1`은 host에 맞는 Maven wrapper를 선택해 clean package한 뒤 center와 agent JAR을 ignored `.run/final/`에 복사합니다. `tools/artifact-manifest.mjs`가 두 파일의 byte size와 SHA-256을 기록하고 즉시 재검증합니다. 실행 중 source-side `target`을 다시 빌드하지 말고 `.run/final/monitor-center-final.jar`만 실행합니다.

2026-09-04 최종 검증 산출물은 center 33,285,281 bytes/SHA-256 `8d232eb96deefecc3e11cbd3aa8746785d094413a4270a21a347b86b972e04cc`, agent 348,007 bytes/SHA-256 `64cf4e5f3fc35ce1e0de321bd601197ee70998fa3d7da6f5187518b648c134e9`입니다. center archive에는 `tomcat-embed-core`, `tomcat-embed-el`, `tomcat-embed-websocket` 11.0.25가 각각 1개 있으며 실제 startup banner도 `Apache Tomcat/11.0.25`였습니다.

## 백업

```powershell
.\scripts\backup-db.ps1
```

`backups` 아래 날짜가 붙은 PostgreSQL custom-format dump를 만듭니다. 스크립트는 컨테이너 안에서 `pg_restore --list`로 archive를 검사한 뒤 binary-safe `docker compose cp`로 꺼냅니다.

## 복구

복구 전 현재 DB를 한 번 더 백업하고 중앙 서버를 중지합니다. 파일과 파괴적 작업 확인 switch를 반드시 지정합니다.

```powershell
.\scripts\restore-db.ps1 -File .\backups\hermes-monitor-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

복구는 `--clean --if-exists --single-transaction --exit-on-error`를 사용하므로 실패한 복구는 한 transaction 전체가 rollback됩니다. 완료 뒤 `./scripts/verify.ps1`과 `/actuator/health`를 확인합니다.

## 팝빌 잔액의 과금 대상

팝빌 `getBalance`는 연동회원 잔액이고 `getPartnerBalance`는 파트너 잔액입니다. 파트너 화면의 잔액과 연동회원 잔액은 서로 다르며, 회원 잔액이 0이라는 이유만으로 파트너 과금 서비스의 잔액 소진을 판정하면 안 됩니다.

샘플 수집기는 알림톡·SMS·LMS별 `getChargeInfo`의 과금 유형을 확인합니다. `파트너`는 파트너 잔액, `연동`·`일반`은 회원 잔액으로 경고 기준과 예상 발송 건수를 계산합니다. 과금 정보나 해당 잔액을 확인하지 못하면 다른 종류의 잔액으로 대체하지 않습니다. 화면의 대표 잔액은 알림톡의 과금 대상 잔액이며, 각 발송 유형의 과금 대상도 별도로 표시합니다.

`getPaymentHistory`는 연동회원 결제내역만 제공합니다. 파트너 과금만 사용하는 경우 이 API를 호출하거나 회원의 충전 합계를 파트너 충전량으로 표시하지 않습니다. 파트너 충전 이력은 현재 수집하지 않으며, 과금 대상 필드가 없는 이전 에이전트의 결과에는 최신 파일 반영 안내를 표시합니다.

공식 정의: [팝빌 Java 포인트 관리](https://developers.popbill.com/reference/kakaotalk/java/common-api/point).

## 전체 프로젝트 종합현황

종합현황의 기본 화면은 **전체 프로젝트 비교**입니다. 전체 프로젝트 목록과 CPU·RAM·JVM Heap·디스크 추이, 외부 서비스 요약을 함께 표시합니다. 자원 추이는 최근 24시간의 프로젝트별 시간당 최고 사용률이며, 서로 다른 프로젝트의 값을 평균으로 합치지 않습니다. 수집이 없는 시간은 빈 구간입니다. 차트 범례에서 프로젝트 표시를 켜고 끌 수 있고, 범례 검색은 프로젝트 찾기에만 사용합니다.

프로젝트 목록은 검색·상태 필터·정렬과 20개 단위 페이지 이동을 지원합니다. 프로젝트를 선택하면 해당 서버들의 상세 사용량과 최근 24시간/7일 추이를 조회하며, **전체 프로젝트 보기**로 비교 화면에 돌아갑니다. 최초 진입에서는 모든 서버의 개별 이력 API를 호출하지 않습니다. 새 프로젝트는 설정에 등록한 후 수집이 시작되면 자동으로 비교에 포함됩니다.

## 업체가 다른 프로젝트의 서비스 정보 설정

API 모니터링에서 해당 항목의 **서비스 정보 설정**을 열어 서비스명, 표시 항목, 단위와 경고 기준을 지정합니다. 프로젝트·인스턴스·API별로 독립 저장되므로, 샘플은 팝빌이고 다른 프로젝트는 다른 문자 업체여도 같은 카드로 관리할 수 있습니다. 설정은 에이전트 재수집이나 항목 재발견으로 덮어쓰지 않습니다.

- **SDK 수집 결과**는 점검 결과의 `details`에서, **API JSON 응답**은 수신한 응답 본문에서 값을 읽습니다. 예를 들어 `{"data":{"remaining":37}}`이면 항목 경로는 `$.data.remaining`, 단위는 `건`입니다. 배열 항목은 `$.data.quotas[0].left`처럼 지정합니다.
- 숫자·문자·예/아니요 값을 지원합니다. 잔여량은 `기준 이하`, 사용률은 `기준 이상`으로 경고·위험 기준을 정합니다. 필수 값이 누락되면 **정보 미확인**으로 표시합니다. 누락·가림·잘린 JSON 응답·HTTP 오류를 0으로 대체하지 않습니다.
- **종합 대시보드에 표시**를 끄면 API 화면에만 남습니다. **정보 표시 해제**는 카드만 해제하고 API 사용 여부와 실행 주기는 유지합니다. API 미사용 항목은 종합 대시보드 카드에서 제외합니다.
- **설정 JSON · 다른 프로젝트에 재사용**에서 현재 설정을 복사하고 다른 API에 붙여 넣을 수 있습니다. 인증 정보나 실제 잔액은 설정 JSON에 넣지 않습니다.

다른 문자 업체의 예시 설정:

```json
{
  "title": "문자 서비스",
  "dashboard": true,
  "fields": [{
    "key": "sms_remaining",
    "label": "SMS 잔여 건수",
    "source": "RESPONSE_JSON",
    "path": "$.data.remaining",
    "kind": "NUMBER",
    "unit": "건",
    "direction": "LOW",
    "warning": 100,
    "critical": 0,
    "required": true
  }]
}
```

조건부 값은 항목에 `"when":{"path":"$.success","values":[true]}`를 추가하고, 코드 이름은 `"valueLabels":{"PARTNER":"파트너","MEMBER":"연동회원"}`처럼 설정합니다. 경로는 이름과 배열 인덱스만 지원하며 필터·수식은 지원하지 않습니다. 최대 16개 항목이며 카드의 추가 항목을 펼쳐 모두 볼 수 있습니다.

저장은 외부 API를 호출하지 않습니다. 기존 자동 실행 주기로 수집된 결과나 **지금 테스트 실행** 결과를 표시합니다. 업체별 인증·잔액 조회 요청 자체는 해당 에이전트 점검에 등록되어 있어야 합니다. 서비스 정보의 경고 기준은 카드의 **정보 경고/위험**에 적용하며, API 요청 상태와 서버 장애 집계를 변경하지 않습니다.

## UI 재설계 운영 검증

- 디자인 기준은 `DESIGN.md`, 공개 근거와 재사용 금지는 `docs/design-reference.md`, 화면·상태 acceptance는 `docs/dashboard-redesign-spec.md`에서 확인합니다.
- 로그인은 `/login`의 custom Korean page입니다. `Accept: text/html`로 `/` 접근 시 상대 `/login` redirect가 유지되어야 하고 API의 인증 실패는 기존 JSON 401을 유지해야 합니다.
- macOS E2E는 시스템에 설치된 네이티브 Chrome 실행 파일을 사용합니다. 이 저장소에서 검증한 경로는 `/Users/Shared/Relocated Items/Security/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`이며 다른 Mac에서는 `HERMES_E2E_CHROME_PATH`로 명시하도록 한다. Parallels 브라우저는 사용하지 않습니다.
- screenshot 기준은 `docs/screenshots/redesign/login-{1440,1024,390}.png`와 `dashboard-{1440,1024,390}.png`입니다. 민감한 운영 식별자나 credential을 포함하지 않습니다.
- 모바일 설정 화면은 의도적으로 read-only입니다. 조회와 상위 탐색은 유지하지만 변경은 768px 이상 viewport에서 수행합니다.
- full E2E는 production sample agent가 쓰는 `18081`~`18084`와 충돌합니다. 검증 창에는 네 agent container만 안전하게 중지하고 test harness 종료 후 반드시 다시 시작하며 PostgreSQL volume과 tunnel/backend는 삭제하지 않습니다.
