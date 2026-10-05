# 최종 릴리스 검증 기록

검증 기준: 2026-09-04 KST, macOS, JDK 21.0.12.1, PostgreSQL 17.11, Node 24.20.0, Trivy 0.74.0.

## 독립 검토 상태

fresh-context CLI 검토를 우선 시도했습니다. Codex read-only 실행은 420초 제한에서 결과 없이 종료됐고 Claude read-only 실행은 로그인되지 않아 종료됐습니다. 따라서 성공으로 가장하지 않고 아래 fail-closed exhaustive checklist를 수행했습니다.

- **제품 blocker 0**: 시작/health, 데이터베이스 migration, 네 agent 경계, 인증된 브라우저 흐름, artifact hash 검증 모두 통과.
- **제품 major 0**: API/UI 계약, 비밀정보 경계, 취약점, process/volume 안전 종료, immutable runtime을 확인.
- **제품 minor 0**: 이번 검토에서 남은 actionable 제품 finding 없음.
- **외부 제한**: 승인 Java 7/8 actual runtime matrix, 실제 샘플 프로젝트 24시간 shadow 검증, 기존 `.env`의 누락 sample key migration은 별도 제한으로 유지.

## Exhaustive checklist

| 영역 | 확인 | 결과 |
|---|---|---|
| Artifact | center/agent SHA-256 및 byte size manifest create/verify | PASS |
| Runtime dependency | fat JAR nested Tomcat core/el/websocket 11.0.25 및 실제 startup banner | PASS |
| Backend | Java 31+2+61 = 94/94 | PASS |
| Frontend | Vitest 17/17, TypeScript 및 production build | PASS |
| Repository | Node contract/security/operations 66/66 | PASS |
| E2E | 인증 Chromium, real PostgreSQL, 네 real agent, restart/DB outage | 7/7 PASS, 113.42초 |
| Runtime smoke | backend health 10/10 HTTP 200(49 bytes), frontend HTTP 200, agent 4/4 HTTP 200 | PASS |
| Dependency security | production SBOM 104 packages, HIGH 0, CRITICAL 0, allowlist 0 | PASS |
| Secret/log security | production/log secret scanner | 0건/PASS |
| Data integrity | Flyway 8 migrations, PostgreSQL concurrency 및 restart recovery tests | PASS |
| Operations | tracked process-tree shutdown, sample profile down, 기본 volume 보존 | PASS |
| VCS safety | ignored local env/tools/run/build/dependencies와 staged 목록을 commit 직전 별도 확인 | REQUIRED GATE |

## 산출물

- `.run/final/monitor-center-final.jar`: 33,285,281 bytes, SHA-256 `8d232eb96deefecc3e11cbd3aa8746785d094413a4270a21a347b86b972e04cc`
- `.run/final/monitor-agent-final.jar`: 348,007 bytes, SHA-256 `64cf4e5f3fc35ce1e0de321bd601197ee70998fa3d7da6f5187518b648c134e9`
- `.run/final/build-manifest.json`: 위 두 파일을 상대 경로로 검증하며 ignored local evidence로 유지.

## 2026-09-04 dev lifecycle 보강

- PowerShell focused: `dev-up` 5/5 PASS(8.89초), graceful/force escalation 2/2 PASS(5.74초), parser 12/12 PASS.
- Repository: Node 68/68 PASS, secret scan PASS, file manifest 295/295, `git diff --check` PASS.
- Full reactor: `./mvnw -B clean verify` exit 0/247.04초; agent 31/31, testapp 2/2, center 61/61, frontend 17/17.
- Runtime: clean stopped start exit 0/12.78초, idempotent rerun 2회 exit 0/3.04초·2.92초와 tracked process 보존, graceful down exit 0/3.03초와 force warning 0건, DB volume 보존, restart exit 0/12.25초.
- 최종 tracked backend/frontend process는 모두 생존하며 각각 `8080`/`5173` listener tree를 소유했습니다. backend/frontend 및 agent 4개는 HTTP 200, PostgreSQL은 healthy였습니다.

## 2026-09-07 로그인·SPA 재설계 검증

| 게이트 | 실제 결과 |
|---|---|
| Design spec | `npx -y @google/design.md lint DESIGN.md`: error 0, warning 0 |
| 공개 근거 | `docs/design-reference.md` citation ledger strict 검증 PASS; proprietary asset/package 도입 0 |
| TDD | frontend shell 최초 2 FAIL→15/15 PASS; custom login integration 최초 1 FAIL→1/1 PASS |
| Full Maven | pre-review `./mvnw -B clean verify`: agent 31/31, testapp 2/2, center 64/64, frontend 19/19, 총 116 tests PASS, 1분 24초; post-review frontend 19/19 + lint/build PASS |
| Repository | `node --test tests/*.test.mjs`: 72/72 PASS |
| Direct fail-closed review | staged production sink scan 7 categories 0, secret scan PASS; mobile CSS-only read-only와 Linux Playwright path portability를 발견·수정, 최종 blocker 0/major 0 |
| Dependency | npm audit 0, npm license 211 packages PASS, Trivy production SBOM 104 packages/HIGH 0/CRITICAL 0/18.267초 |
| Real E2E | native macOS Chrome + PostgreSQL 17 + 4 HTTP agents: 8/8 PASS, 2.0분 |
| Accessibility | login axe serious 0, dashboard axe violation 0, 1440/1024/390 horizontal document overflow 0 |
| Screenshots | `docs/screenshots/redesign/` login/dashboard 각 1440·1024·390, 총 6개 |
| External HTTPS | root HTML 302→상대 `/login`, login 200/custom Korean, unauth dashboard API 401 `UNAUTHORIZED`, tunnel 1개, agents 4개 |
| Artifact | `.run/redesign/monitor-center-redesign-final-v2.jar` 33,285,548 bytes, SHA-256 `880534c6f9f37e1e19616573c7c33f788585b44ff2db72957f81f27eaf9005f9` |
| Bundle | static 2,302,074→2,179,838 bytes(-5.31%); initial JS -26.90%; initial CSS -49.89%. 각 artifact 1회 size 비교, render 미측정 |
| Slop audit | login 8→1, dashboard 7→2; gradient/glass/decorative tile/giant stat/equal card grid/invented metric 0 |

검증에는 당시 발급된 임시 Quick Tunnel URL을 사용했습니다. Quick Tunnel endpoint는 임시 값이므로 URL 자체를 저장소에 기록하지 않습니다. Quick Tunnel의 SLA 없음 정책은 변하지 않는다. credential, `.env` 내용, cookie/token은 기록하지 않았다.
