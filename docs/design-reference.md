# Hermes Monitoring 디자인 근거

## 조사 범위와 방법

2026-09-07에 macOS 네이티브 Safari에서 `https://design.codeit.com/`을 직접 열어 공개 사이트임을 확인하고, 같은 공개 URL의 정적 HTML을 내려받아 토큰명·수치·동작 문구를 대조했다. Parallels의 Windows 브라우저는 사용하지 않았다. 공개 페이지에 없는 값은 추정하지 않았다.

## 공개 파운데이션 근거

- 색상은 HEX를 화면마다 직접 쓰지 않고 primitive와 semantic token으로 분리한다. 공개 HTML에 노출된 primary scale은 `#FBF5FF`, `#F8ECFF`, `#E9CCFF`, `#D4A4FF`, `#CD96F8`, `#C47CFD`, `#B363FD`, `#A64EFF`, `#8F00FF`, `#760DDE`, `#6500C2`, `#54009E`, neutral은 `#FBFBFB`, `#F6F6F6`, `#EDEDF0`, `#DDDEE4`, `#D5D6DD`, `#C2C3CD`, `#ADAEB8`, `#888893`, `#66666E`, `#4A494F`, `#333236`이다. semantic 명명은 `txt-*`, `bg-*`, `border-*`, `status-positive`, `status-negative` 패턴이다.[1]
- 공개 Typography URL은 존재하고 HTML에서 Pretendard 400/500/600/700 계열 선언이 확인되지만, 본문 토큰 표는 정적 응답에 노출되지 않았다. 라이선스가 페이지에서 명시되지 않아 폰트 파일을 복제·번들하지 않는다.[2]
- radius primitive는 PC/Tablet 기준 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 999px이고, semantic은 XS 8, S 12, M 16, L 20, XL 28, circle 999px이다. 작은 label/button은 XS, 작은 박스는 M, 긴 banner/info는 S를 권장한다.[3]
- breakpoint는 PC ≥1200px, Tablet 768–1199px, Mobile <768px이다. container padding은 40/32/16px, 최소 폭은 1200/768/375px로 공개되어 있다.[4]
- spacing은 4·8 배수 중심이며 `spacing-2/4/6/8/10/12/16/20/24/32/40/48/64/80/120/160/200/240`을 제공한다. 8 이상은 모바일에서 한 단계 축소되고, content gap은 XL 32, L 24, M 16, S 12, XS 8px이다.[5]
- icon은 24px 그리드, XS/S/M/L/XL=12/16/20/24/28px, 기본 line style, normal 1.3px·bold 1.8px stroke, 둥근 끝을 권장한다. 아이콘 단독 액션은 icon button으로 제공한다.[6]
- 공개 내비게이션에는 Elevation foundation 항목이 없고 별도 elevation 토큰도 확인되지 않았다. 따라서 그림자는 Codeit 값으로 주장하지 않고, Hermes가 표면 분리 목적에만 최소한으로 정의한다.

## 공개 컴포넌트 근거

- Button은 Primary/Secondary/Tertiary/Text/Icon 위계를 가지며 label이 필수다. L/M/S 최소 가로 padding은 24/16/12px, full width는 모바일 권장, primary를 여러 개 나열하지 않는다.[7]
- Text Field는 label/helper/error를 구조적으로 제공하고 모바일 자동 확대 방지를 위해 16px을 유지한다. 오류는 색만으로 표현하지 않는다.[8]
- Select는 L/S, default/disabled/hover/focus/error 상태를 갖고 짧은 선택지를 사용한다. 공개 가이드는 모바일에서 bottom sheet 전환을 권장하지만, 본 제품은 네이티브 select의 접근성과 비용을 보존한다.[9]
- Table은 header/body row, 정렬·행 선택·label/button 조합을 허용한다. empty section을 제공하고 모바일은 fill이 아니라 가로 스크롤 방식으로 유지한다.[10]
- Tabs는 하나가 반드시 selected이고 underline/count 옵션이 있다. 방향키 또는 Tab 키 이동과 한 줄 label을 요구한다.[11]
- Label은 상태·분류를 빠르게 스캔하기 위한 비행동 요소다. 같은 목록에서 shape를 통일하고, 서로 다른 상태에 같은 색을 쓰지 않는다.[12]
- Pagination은 첫/이전/번호/다음/마지막 의미와 disabled 상태를 구분하고 콘텐츠 하단 중앙 정렬을 권장한다.[13]
- Modal은 header/footer/backdrop이 핵심이며 최대 높이 80vh, ESC 닫기, 스크롤 시 header 경계가 필요하다. close와 취소를 중복하지 않는다.[14]
- Toast는 작업 결과를 짧고 명확하게 2–3초 보여 주며 중요한 결정을 전달하지 않는다.[15] 지속 안내는 닫기 가능한 snackbar가 적합하다.[16]
- Dropdown은 최대 높이 182px, 5개 이상이면 scroll, 많은 항목이면 search, 긴 label은 한 줄+tooltip을 권장한다.[17]

## Hermes에 허용한 변환

1. **허용:** 토큰 계층, 4·8 간격 리듬, 반응형 padding, 절제된 violet 포인트, neutral 중심 화면, 라인 아이콘, 명확한 상태/포커스, 데이터 밀도 높은 표와 underline tabs.
2. **변환:** Hermes 고유 색상명과 값, 운영 정보 구조, 5개 메뉴, 3개 인스턴스 탭, 차트와 상태 의미를 새로 설계한다. Codeit 화면을 복제하지 않는다.
3. **금지:** Codeit 로고·명칭·카피·이미지·Framer asset·폰트 URL·CSS/JS·아이콘 파일·컴포넌트 패키지의 복제 또는 런타임 호출.
4. **라이선스 판단:** 공개 사이트에서 재사용 라이선스나 배포 가능한 UI 패키지를 확인하지 못했다. 따라서 외부 자산은 가져오지 않고, 이미 프로젝트에 포함된 MIT PatternFly와 Apache-2.0 ECharts 및 시스템 폰트만 사용한다.
5. **원본성:** 공개 원칙과 수치적 리듬은 참고 근거이며, 최종 구성·카피·CSS·컴포넌트는 Hermes Monitoring을 위해 작성한다.

## Sources

[1] https://design.codeit.com/foundations/color
[2] https://design.codeit.com/foundations/typography
[3] https://design.codeit.com/foundations/radius
[4] https://design.codeit.com/foundations/layout
[5] https://design.codeit.com/foundations/spacing
[6] https://design.codeit.com/foundations/iconography
[7] https://design.codeit.com/components/buttons/detail
[8] https://design.codeit.com/components/textfield
[9] https://design.codeit.com/components/select
[10] https://design.codeit.com/components/table
[11] https://design.codeit.com/components/tabs
[12] https://design.codeit.com/components/label
[13] https://design.codeit.com/components/pagination
[14] https://design.codeit.com/components/modal
[15] https://design.codeit.com/components/toast
[16] https://design.codeit.com/components/snackbar
[17] https://design.codeit.com/components/dropdown
