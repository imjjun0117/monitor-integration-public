# 결정 기록

## 2026-09-03 샘플 프로젝트 단계 5 제한

- 이유: 실제 샘플 프로젝트 저장소 경로와 서버 접근권한이 제공되지 않았습니다.
- 변경: 이 저장소 안에 비활성 기본값의 configurer, DBCP1 reflection adapter, web.xml 조각, 점검 목록, shadow 비교 도구만 만들었습니다.
- 영향: 실제 설치와 24시간 비교는 완료되지 않았습니다.
- 후속: 승인된 경로에서 사람이 적용하고 24시간 결과를 기록합니다.

## 2026-09-03 로컬 도구 제한

- 이유: 호스트에 JDK와 `pwsh`가 없었습니다.
- 변경: Node 기반 계약/프론트 검증을 실행하고 JDK 21은 저장소 안 임시 도구로 내려받아 Maven 검증을 수행했습니다. JDK 21 `javac`가 source/target 7을 제거했으므로 source/target 1.7은 그대로 두고 Maven Compiler의 Eclipse ECJ 경로를 사용했습니다. Animal Sniffer `java17` 서명과 `javap` major version 51 검사를 추가했습니다. 시스템 전역은 바꾸지 않았습니다.
- 영향: JDK 21 로컬 전체 Maven 빌드, Java 7 API 서명 검사, Java 7 bytecode 생성은 통과했습니다. 승인된 실제 Java 7/8 런타임 실행은 별도 환경이 필요합니다.
- 후속: Windows + JDK 21 + 승인된 JDK 7/8 CI에서 `scripts/verify.ps1`을 실행합니다.

## 2026-09-03 프론트 보안 패치

- 이유: 초기 잠금 버전에서 npm audit High/Critical이 발견되었습니다.
- 변경: 기준 문서가 허용한 최신 고정 버전(React 19.2.8, TypeScript 7.0.2, Vite 8.2.2, ECharts 6.1.0)과 보안 수정 React Router/Vitest로 올렸습니다.
- 영향: 기능 계약은 같고 알려진 npm 취약점은 0건입니다.
- 후속: 이후 변경은 Renovate/Dependabot으로만 진행합니다.

## 2026-09-04 무료 dependency vulnerability source of truth

- 이유: API key 없는 OWASP Dependency-Check 최초 NVD 동기화가 9분에도 3%에 머물러 모든 로컬/PR 검증을 장기 차단했고, 취약점이 없는지 실제로 확정하지 못했습니다.
- 변경: 공식 checksum으로 고정한 Trivy 0.74.0을 ignored `.tools`에 격리하고, CycloneDX Maven Plugin 2.9.3 reactor SBOM과 npm 11 production lockfile SBOM을 HIGH/CRITICAL 기준으로 검사하는 PowerShell gate를 `verify.ps1` 및 CI required job에 연결했습니다. OWASP 12.2.2는 `periodic-owasp` profile과 주간 schedule로 이동했습니다.
- 영향: dev/test dependency는 배포 취약점 source of truth에서 제외되지만 기존 test/license/npm audit는 유지됩니다. 최초 실제 scan은 104 package에서 Tomcat 11.0.24의 Critical 3건을 찾아 exit 1이었고, embed 3종을 11.0.25로 정렬한 뒤 High 0/Critical 0, exit 0이 됐습니다. scanner/DB/report 오류도 계속 실패합니다.
- 후속: 매주 OWASP/NVD 결과와 Trivy 차이를 검토하고, 새로운 예외가 필요하면 CVE 근거·owner·만료일이 있는 명시적 allowlist 변경만 review합니다. 현재 allowlist는 0건입니다.

## 2026-09-07 PatternFly 동작과 공개 Codeit 원칙의 시각 분리

- 이유: 기존 UI는 PatternFly 기본 masthead/sidebar와 최소 CSS만 사용해 제품 고유 계층이 없었고 Spring 기본 영문 로그인 화면이 외부에 노출됐습니다.
- 변경: PatternFly의 table, tabs, drawer, form, alert 접근성 동작과 API 연결은 유지하되, 공개 Codeit Design System에서 확인한 semantic token, 4·8 spacing, 40/32/16 responsive padding, neutral surface, 절제된 violet interaction, line icon, status label 원칙을 Hermes 전용 토큰과 구성으로 다시 작성했습니다. Codeit 로고·명칭·카피·asset·font·CSS/JS/package는 가져오지 않았습니다.
- 영향: 상위 메뉴는 정확히 5개로 유지하고 Monitor 4개/Operate 1개로 위계화했습니다. 로그인은 custom Spring page, dashboard는 concise summary strip→dense table→비대칭 chart, 1024px compact rail, 390px read-only navigation/table scroll로 변경했습니다.
- 근거: `docs/design-reference.md`, `DESIGN.md`, `docs/dashboard-redesign-spec.md`. 공개 사이트에서 재사용 라이선스를 확인하지 못한 asset은 모두 제외했습니다.
- 검증: design.md lint는 error/warning 0, login axe와 dashboard axe 위반 0, 1440/1024/390 horizontal overflow 0입니다. 실제 4-agent E2E에서 login·5메뉴·3탭·5필터·drawer·settings·인증서·DB stale 경로를 검증했습니다.
- 성능: 같은 최종 Mac artifact의 정적 파일 합계는 이전 immutable JAR 2,302,074 bytes에서 새 build 2,179,838 bytes로 122,236 bytes(5.31%) 감소했습니다. 초기 index JS는 356,320→260,476 bytes(26.90%), index CSS는 556,232→278,752 bytes(49.89%)입니다. 각 artifact 1회 산출물 크기 비교이며 render speed 개선은 주장하지 않습니다.
