# SM 통합 모니터링

여러 Java 웹 프로젝트의 상태를 한 화면에서 보는 로컬 MVP입니다. Agent는 Java 21/Spring Boot/PostgreSQL, 화면은 React/TailAdmin 기반 Tailwind CSS와 ECharts, Collector는 Java 7 바이트코드를 목표로 합니다.

기존 Java 웹 애플리케이션에 agent를 넣는 방법은 [SDK 적용 가이드](docs/agent-integration.md)를 확인하십시오. Maven/로컬 JAR 설치, Spring MVC endpoint, 인증, 사용자 정의 점검과 DB pool metric 예제를 한 곳에서 설명합니다.

## 시작

Windows PowerShell 7에서 다음을 실행합니다.

```powershell
.\scripts/setup-local.ps1
.\scripts/dev-up.ps1
```

브라우저: `http://localhost:8080` (개발 화면은 `http://localhost:5173`)

기본 실행은 샘플 없이 직접 등록하는 모드입니다. 샘플 프로젝트와 Collector가 필요하면 `.env`의 `HERMES_SAMPLE_FIXTURES_ENABLED`를 `true`로 설정하고 stack을 재시작합니다. PostgreSQL 데이터는 `hermes-postgres-data` named volume에 보존됩니다.

Collector 접속 허용 IP와 도메인은 [`config/agent-allowlist.json`](config/agent-allowlist.json)에서 관리합니다. 목록 변경은 재시작 없이 다음 연결 요청부터 반영됩니다. 파일 형식과 경로 설정은 [운영 가이드](docs/operations.md#agent-연결-allowlist)를 확인하세요.

로그인은 제품 전용 한국어 화면이며 인증 뒤 정확히 5개 상위 메뉴(종합 현황, 프로젝트, API 모니터링, 인증서 관리, 설정)를 제공합니다. 1440px/1024px에서 전체 운영 기능을 사용할 수 있고, 768px 미만 모바일은 안전한 조회 중심 모드입니다. 디자인 규범은 [`DESIGN.md`](DESIGN.md), 공개 Codeit Design System 근거와 자산 재사용 금지는 [`docs/design-reference.md`](docs/design-reference.md), 상세 화면·상태 기준은 [`docs/dashboard-redesign-spec.md`](docs/dashboard-redesign-spec.md)를 확인하십시오.

같은 신뢰된 개인 Wi-Fi에서 통합 대시보드만 공유하려면 기존 stack을 종료한 뒤 명시적으로 LAN 모드를 켭니다.

```powershell
.\scripts\dev-down.ps1
.\scripts\dev-up.ps1 -Lan
# 자동 감지가 모호할 때만, 이 host가 실제 소유한 private IPv4를 지정
.\scripts\dev-up.ps1 -Lan -LanAddress 192.168.1.20
```

출력된 `http://<LAN-IP>:8080`은 로그인이 필요하고 session/CSRF 보호를 그대로 사용합니다. PostgreSQL `5432`, Vite `5173`, sample agent `18081`~`18084`는 계속 `127.0.0.1` 전용입니다. 공용 Wi-Fi에서는 사용하지 마십시오. 원복은 `.\scripts\dev-down.ps1` 후 `.\scripts\dev-up.ps1`입니다.

종료는 `.\scripts\dev-down.ps1`, 전체 검증은 `.\scripts\verify.ps1`입니다. 빠른 production dependency 보안 게이트만 실행하려면 `.\scripts\dependency-vulnerability-gate.ps1`을 사용하며 JSON/SARIF는 `.run/security`에 생성됩니다. 이 게이트는 무료 Trivy DB 오류와 High/Critical 발견을 모두 실패 처리합니다. `.env`는 비밀 파일이므로 공유하거나 커밋하지 마십시오.

## 공개 샘플 범위

이 저장소는 운영 저장소의 Git 이력을 포함하지 않는 공개 샘플입니다. 프로젝트명, 배치명, 서버 주소는 예시이며 실제 고객사 구성을 나타내지 않습니다. Java 패키지는 역할에 따라 `com.monitoring.agent`와 `com.monitoring.collector`를 사용합니다. 운영 배포는 Private 저장소에서 수행합니다. 운영 설정, 토큰, 데이터베이스 백업과 실제 로그를 커밋하지 마십시오. 화면 캡처는 가상 프로젝트를 사용한 이전 UI 예시입니다.

역할·패키지·기존 설치 전환 방법은 [Agent와 Collector](docs/roles-and-packages.md)를 확인하세요.
