# Hermes Monitoring 대시보드 재설계 명세

## 1. 제품 목표

Hermes Monitoring은 ‘지금 문제가 있는가 → 어디인가 → 왜인가 → 안전하게 무엇을 할 것인가’를 빠르게 판단하는 운영 제품이다. **Monitor(종합 현황·프로젝트·API 모니터링·인증서 관리)**를 1차, **Operate(설정)**를 2차로 둔다. 현재 API, 인증, CSRF, 쿠키, 상대 HTTPS redirect와 모든 route는 그대로 유지한다.

## 2. 정보 구조와 흐름

### 정확히 5개 상위 메뉴

1. **종합 현황** `/`: 전체 상태와 네 요약값, 검색·상태 필터·정렬·페이지 이동을 갖춘 전체 프로젝트 자원 비교표, 선택 프로젝트의 실측 추이.
2. **프로젝트** `/projects`: 프로젝트 → 인스턴스 → 인스턴스 상세의 drill-down.
3. **API 모니터링** `/api-monitoring`: 5개 filter → dense table → 상세 drawer → 즉시 재점검.
4. **인증서 관리** `/certificates`: 2개 filter → 인증서 table → 즉시 재검사.
5. **설정** `/settings/*`: 프로젝트·인스턴스·임계치·인증서 대상의 4개 하위 tab/form.

### 핵심 사용자 흐름

- 로그인 → 종합 현황의 이상 요약 → 프로젝트 행 → 인스턴스 행 → `JVM·서버 자원 / DB Pool / 내부 점검` 3개 tab.
- API 모니터링 → filter 조합 → 행의 API명 → drawer → 실측 history → 즉시 재점검 → 진행/성공/timeout 피드백.
- 인증서 관리 → 프로젝트/상태 filter → 대상 검사 → 갱신 결과 확인.
- 설정 → 하위 tab → label이 명시된 form → 검증 → 저장 피드백. write-only token은 절대 재표시하지 않는다.

## 3. 공통 셸

- 좌측 rail에 제품명, ‘MONITOR’ 그룹 4개, ‘OPERATE’ 그룹 1개, 하단 session/logout을 둔다.
- active route는 `aria-current=page`, 3px indicator와 굵기 변화로 표시한다.
- 본문 상단에 breadcrumb, 24px page title, 1문장 설명, 데이터 갱신 주기를 표시한다.
- route는 기존처럼 `React.lazy`로 분할하고 Suspense fallback은 화면 문맥을 유지하는 loading 상태다.
- 1440px은 232px rail + 20px 본문, 1024px은 76px icon/short-label rail + 20px 본문으로 모든 조작이 가능해야 한다. 본문의 최대 너비 제한은 두지 않는다.
- 390px은 상단 제품 bar와 가로 scroll menu를 사용한다. 조회 화면은 완전 사용 가능하며, 설정의 변경 조작은 read-only 안내를 우선한다.

## 4. 화면 명세

### 로그인

- Spring 기본 `Please sign in` 화면은 제거한다.
- 좌측/상단에는 Hermes Monitoring의 기능 설명과 보안 원칙, 우측/하단에는 username/password form을 둔다.
- 한 개의 primary ‘로그인’, 명시적 label, 오류 문장, 16px input, 자동완성 속성, focus-visible을 제공한다.
- 외부 logo/image/font 없이 CSS와 텍스트만 사용하고 credential은 브라우저에 저장하도록 유도하지 않는다.

### 종합 현황

- 거대 stat card 대신 네 구획의 짧은 summary strip을 사용한다: 프로젝트 수, 정상 인스턴스/전체, 실패 API, 만료 예정 인증서.
- 전체 프로젝트 상태와 CPU·RAM·Heap·디스크 최고 사용률을 한 행에서 비교한다. 최고 사용률은 수집된 인스턴스 기준이며, 일부 미수집/미지원은 표시하고 미확인 값을 0으로 대체하지 않는다.
- 검색은 프로젝트명/ID와 인스턴스/호스트를 대상으로 하며, 상태 필터와 장애·경고 우선/이름/자원 사용률 정렬을 제공한다. 목록은 20개씩 페이지 이동하며 높이는 440px 이내로 유지한다. 이상 목록도 높이를 제한한다.
- 프로젝트별 상세 차트를 모두 펼치지 않는다. 선택 프로젝트 하나의 인스턴스 이력만 조회하고 CPU·RAM·Heap·디스크 차트 4개를 표시한다. 기본 선택은 장애·경고 우선이다.
- 전체 프로젝트의 최신 자원 비교는 dashboard 응답의 인스턴스별 값으로 구성한다. 프로젝트 검색·정렬·페이지 이동만으로 다른 프로젝트의 resource history 요청을 발생시키지 않는다.
- 감시 디스크는 볼륨별로 구분하며, RAM/Heap은 실제 사용량과 전체/최대 용량을 함께 표시한다. 기간은 24시간/7일을 제공한다.
- 데이터가 없으면 다음 행동으로 ‘설정에서 프로젝트 등록’을 안내한다.

### 프로젝트·인스턴스

- 프로젝트와 인스턴스 모두 table drill-down을 유지한다.
- 상태, 최근 수집, CPU/Heap, pool/check는 한 행에서 scan 가능해야 한다.
- 인스턴스 상세의 3개 tab은 URL query와 동기화하고 keyboard 이동을 보존한다.
- metric definition list는 compact facts panel, disk/pool/check는 table, CPU·RAM·Heap·디스크 history는 2열 chart grid로 구성한다.

### API 모니터링

- 5개 filter는 field label을 유지하고 desktop에서는 한 줄 toolbar, tablet에서는 3+2, mobile에서는 세로로 바뀐다.
- table 행에서 name만 drawer action이다. drawer는 오른쪽 최대 480px의 native dialog이며, 본문 scroll, ESC·닫기 button, 배경 조작 차단과 focus 복귀를 보장한다.
- 즉시 재점검의 pending/timeout/error는 색만이 아닌 문장으로 알린다.

### 인증서 관리

- project/status filter와 11열 table을 유지한다. host, 만료, 상태, 작업의 시각 우선순위를 높인다.
- 긴 subject/issuer는 한 줄 ellipsis+title을 사용하고 mobile은 가로 scroll한다.

### 설정

- 4개 하위 tab은 underline navigation과 `aria-current`를 사용한다.
- form은 section card가 아니라 얇은 divider와 명확한 heading으로 구분한다. label/helper/error/action을 일관되게 정렬한다.
- 저장 primary는 section 우측, 위험/비활성은 secondary/danger로 구분한다.

## 5. 상태 체계

- **Loading:** `role=status`, 의미 있는 ‘데이터를 불러오는 중입니다’와 skeleton row. layout shift를 줄인다.
- **Empty:** ‘데이터 없음’과 원인/다음 행동. 임의 fixture를 보여주지 않는다.
- **Error:** `role=alert`, 실패 대상과 재시도 button. cached data가 있으면 제거하지 않는다.
- **Stale:** 마지막 정상 데이터를 표시한다는 문장, warning icon, 마지막 갱신 맥락. 장애로 오인시키지 않는다.
- **Success:** form/recheck 완료는 2–3초 toast. 중요한 결과는 table 자체에도 남는다.
- **Unknown:** 회색 상태 chip과 ‘미수집/미지원’을 구분한다.

## 6. 토큰과 접근성

정확한 값은 root `DESIGN.md`가 규범이다. WCAG AA를 최소 기준으로 한다. 본문 대비 4.5:1, 큰 텍스트 3:1, focus indicator 3:1 이상을 목표로 한다. 색+아이콘+텍스트를 함께 쓰며 `prefers-reduced-motion`에서 animation/transition을 제거한다. table은 caption 또는 `aria-label`, heading hierarchy, landmark, skip link를 갖는다.

### TailAdmin 공통 컴포넌트 (2026-10-03)

- 무료 MIT React 소스의 Button/InputField/Select/Badge/Table/Alert/Modal을 `frontend/src/components/ui`에 적용한다. 출처와 라이선스는 `frontend/THIRD_PARTY_NOTICES.md`에 보관한다.
- Tailwind CSS 4의 brand/status 토큰을 기존 Hermes 팔레트에 연결한다. 보라색 액션, 파란색 자원 그래프, 중립 배경과 본문 전체 너비를 유지한다.
- 기본 입력·선택·버튼 높이는 44px, 페이지 이동 버튼은 36px, radius는 control 8px/card 12–16px이다. 컴포넌트마다 vendor CSS를 덮어쓰지 않는다.
- controlled 폼, 서버 응답, 수집 간격, 프로젝트 검색·페이지 이동은 그대로 연결한다. table은 native table semantics를 사용한다.
- 모달은 native `dialog.showModal()`의 포커스 격리·ESC 처리·배경 inert를 사용하고 닫으면 이전 컨트롤로 돌아간다. 탭은 방향키/Home/End를 지원한다.
- 차트는 TailAdmin 카드·선·축·툴팁 표현을 적용하고 ECharts 엔진을 유지한다. 용량 기준 축, 인스턴스별 실제 시각, null 공백, 미지원 표시 규칙을 보존한다.
- 데스크톱 사이드바는 290px/92px 접기·펼치기, 1024px 미만은 모달 메뉴를 사용한다. 설정 하위 메뉴와 계정 메뉴에 키보드 이동을 제공한다.
- 영문·숫자는 Outfit, 한글은 Noto Sans KR 가변 폰트를 적용한다. 빌드 시 패키지의 woff2 파일·unicode-range CSS·OFL 고지를 public/assets로 복사하며 로그인과 모든 페이지에서 자체 제공한다.
- 모든 선택창은 Radix Select의 포커스·방향키·typeahead를 사용하고 TailAdmin Dropdown 표면·선택 항목으로 표시한다. native dialog 안의 팝업은 해당 dialog에 포털을 붙인다.

## 7. 비주얼 품질 금지 목록

- random gradient, glass/blur/glow, 동일 크기 card grid, 거대 숫자 카드, 장식 icon tile 금지.
- 실제 API에 없는 uptime percentage, trend, revenue류 metric 금지.
- 페이지마다 다른 radius/status color/버튼 위계 금지.
- 과도한 pill과 빈 공간, 의미 없는 영문 eyebrow, 마케팅 문구 금지.
- Codeit logo/name/content/asset/package와 독점 화면 복제 금지.

## 8. 검증 기준

- RED visual/behavior test가 먼저 실패하고 구현 후 통과한다.
- unit, TypeScript, production build, Java/repository/security/Trivy, authenticated real PostgreSQL+4 agent E2E가 통과한다.
- native macOS Chrome/Safari만 사용해 1440/1024/390 screenshot, horizontal overflow, console error, axe, keyboard, reduced-motion을 확인한다.
- 5개 메뉴, 3개 tab, filters, drawer, settings forms, loading/empty/error/stale/success를 dogfood한다.
- external tunnel의 `/`, `/login`, 인증 없는 dashboard redirect/401 경계를 재검증한다.
- slop score 목표는 로그인 8→2 이하, dashboard 7→2 이하이다. 점수는 구성적 tell 수(giant card, equal grid, gradient/glass, decorative tile, excessive pill, invented metric, vague copy, hierarchy failure)로 산정한다.
