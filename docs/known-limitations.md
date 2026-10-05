# 외부 환경으로 남은 제한

- 공식 PowerShell 7.6.5 Intel macOS portable archive를 ignored `.tools/pwsh`에 격리 설치해 parser와 실제 script 실행을 확인했습니다. 시스템 전역 설치는 없습니다. `dev-up.ps1`은 focused 5/5, 실행 중 stack PID 보존 재호출 2/2, clean stop/start/restart 검증을 통과했고, `verify.ps1`은 먼저 새 취약점 게이트를 exit 0으로 완료한 뒤 승인 Java 7 home 부재에서 fail-closed했습니다.
- Unix의 foreign-listener 소유권 확인은 외부 `lsof` 실행 파일에 의존하며 없거나 오류가 나면 `dev-up.ps1`은 자동 시작하지 않고 fail-closed합니다. Windows에서는 `Get-NetTCPConnection`/CIM process parent 정보를 사용합니다.
- 조직 승인 Java 7 및 Java 8 runtime이 없어 동일 agent JAR의 승인 runtime matrix는 CI에 남아 있습니다. 로컬의 비승인 Java 8u492에서는 최종 shaded JAR compatibility probe가 실제 PASS했고, JDK 21에서는 Java 7 API signature와 JAR 전체 class major 51 검사를 수행했습니다. 이는 승인 Java 7/8 인수 gate를 대체하지 않습니다.
- 실제 샘플 프로젝트 저장소 경로와 서버 접근 권한이 없어 운영 설치 및 기존 JSP와 신규 점검의 24시간 shadow 비교는 실행할 수 없습니다.
- 필수 Trivy gate는 무료 OCI vulnerability DB 및 Java DB의 네트워크 가용성에 의존하며 다운로드/갱신 오류를 성공 처리하지 않습니다. CycloneDX 외부 생성 SBOM을 읽을 때 Trivy 0.74.0이 일부 SHA-384/SHA3 digest를 지원하지 않는다는 경고를 내지만 package PURL/version 기반 취약점 매칭과 JSON/SARIF 생성은 완료됐습니다. OWASP/NVD는 매주 별도 defense-in-depth이므로 그 외부 feed 제한도 남습니다.
- 오래된 로컬 `.env`에는 현재 `.env.example`의 `HERMES_SAMPLE_AGENT_TOKEN` key가 없을 수 있습니다. `setup-local.ps1`은 사용자 데이터를 자동 수정하지 않고 fail-closed하므로 운영자가 sample key 이름을 비교해 직접 migration해야 합니다. `dev-down.ps1`은 종료 작업에 한해 process-local 비밀이 아닌 placeholder를 사용하므로 이 누락과 관계없이 volume을 보존한 정상 종료가 가능합니다.
