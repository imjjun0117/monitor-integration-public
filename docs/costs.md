# 비용·라이선스 운영 정책

기준 시각: 2026-09-07 KST. 이 프로젝트의 운영·개발 경계에서는 과금되는 서비스/API/유료 라이선스를 사용하지 않는다. 무료 범위를 벗어나거나 비용·quota·외부 부작용 여부가 불명확하면 실행하지 않고 `configuration_required`로 처리한다.

## 감사 결과

| 구성요소 | 공식 근거와 허용 범위 | 상태 |
|---|---|---|
| PostgreSQL | PostgreSQL 공식 문서는 PostgreSQL License를 BSD/MIT와 유사한 liberal open-source license로 설명한다.[1] 자체 local container만 사용한다. | 무료/OSS |
| Docker / Compose | Docker Desktop 공식 약관은 개인, 교육, 비상업 OSS 및 직원 250명 미만이면서 매출 미화 1,000만 달러 미만인 small business에 무료라고 명시한다.[2] 현재 사용자가 이 자격을 충족할 때만 Desktop을 사용한다. Compose 명령은 local container orchestration에만 사용하며 paid cloud 기능은 사용하지 않는다. | 조건부 무료; 자격 불명 시 사용 중단 |
| Eclipse Temurin / OpenJDK | Adoptium은 Temurin을 OpenJDK 기반 open-source Java runtime binary로 설명한다.[3] vendor support subscription 없이 local JDK만 사용한다. | 무료/OSS |
| Apache Maven | Maven 공식 project license는 Apache License 2.0이다.[4] local wrapper와 공개 Maven repository만 사용하고 유료 repository/service는 구성하지 않는다. | 무료/OSS |
| React | 공식 저장소 LICENSE는 MIT License다.[5] | 무료/OSS |
| Vite | 공식 저장소 LICENSE는 MIT License다.[6] | 무료/OSS |
| TailAdmin React / Tailwind CSS | TailAdmin 무료 React 컴포넌트는 MIT License이며[7] 원문 고지를 frontend/THIRD_PARTY_NOTICES.md에 포함한다. Tailwind CSS 패키지도 MIT이며 npm license gate로 확인한다. | 무료/OSS |
| Apache ECharts | 공식 저장소 LICENSE는 Apache License 2.0이다.[8] | 무료/OSS |
| Trivy | 공식 저장소 LICENSE는 Apache License 2.0이다.[9] local scanner와 무료 vulnerability DB만 사용하며 유료 Aqua service는 구성하지 않는다. | 무료/OSS |
| Cloudflare Quick Tunnel | Cloudflare 공식 문서는 Quick Tunnel을 계정 없이 실행하는 free tunnel로 설명하고 SLA/uptime을 보장하지 않는다고 명시한다.[10] 계정과 결제 설정이 없는 `trycloudflare.com` 임시 URL만 허용하며 유료 plan, domain, Access 설정은 금지한다. | 임시 무료 기능만 허용 |
| UI 재설계 자산 | 2026-10-03부터 TailAdmin 무료 MIT 컴포넌트, Tailwind CSS, Radix UI Select(MIT)를 적용한다. Outfit / Noto Sans KR 가변 폰트는 SIL OFL 1.1이며 로컬에서 제공한다. ECharts를 유지하고 TailAdmin Pro 자산은 도입하지 않는다. | 추가 비용 0 |

## 외부 호출과 라이선스 게이트

- `instances.api_checks_enabled`의 DB 기본값은 `false`다. 비용, quota, 쓰기 부작용 또는 운영 승인이 필요한 외부 API check는 계속 `disabled` 또는 `configuration_required`로 유지하고 이번 감사에서 실제 호출하지 않았다.
- certificate/API target도 운영자가 비용·quota·부작용 없는 대상을 명시적으로 승인하기 전에는 만들거나 실행하지 않는다.
- npm과 Maven dependency license gate, production SBOM, Trivy HIGH/CRITICAL fail-closed gate를 유지한다. 새 dependency는 무료/OSS license 확인 없이는 추가하지 않는다.
- Cloudflare Quick Tunnel은 인증·가용성 서비스를 구매하는 대안이 아니며 임시 검증 후 종료한다.

## Sources

[1] https://www.postgresql.org/about/licence/
[2] https://docs.docker.com/subscription/desktop-license/
[3] https://adoptium.net/temurin/
[4] https://maven.apache.org/ref/3.0/license.html
[5] https://raw.githubusercontent.com/facebook/react/main/LICENSE
[6] https://raw.githubusercontent.com/vitejs/vite/main/LICENSE
[7] https://github.com/TailAdmin/free-react-tailwind-admin-dashboard/blob/e888dd1716b9803b535c7c2fa4f2c6b7d39b3da9/LICENSE.md
[8] https://raw.githubusercontent.com/apache/echarts/master/LICENSE
[9] https://raw.githubusercontent.com/aquasecurity/trivy/main/LICENSE
[10] https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
