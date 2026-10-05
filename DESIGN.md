---
version: alpha
name: Hermes Monitoring
description: 중립 표면과 절제된 보라색 포인트를 사용하는 데이터 밀도 높은 모니터링 콘솔.
colors:
  primary: "#5B21B6"
  primary-hover: "#4C1D95"
  primary-soft: "#F5F3FF"
  ink: "#101828"
  text-secondary: "#475467"
  text-muted: "#667085"
  canvas: "#F7F7F9"
  surface: "#FFFFFF"
  surface-subtle: "#F2F4F7"
  border: "#E4E7EC"
  border-strong: "#D0D5DD"
  success: "#16794B"
  success-soft: "#EAF7F0"
  warning: "#9A5B00"
  warning-soft: "#FFF5DB"
  danger: "#B42318"
  danger-soft: "#FDECEA"
  info: "#2457A7"
  info-soft: "#EAF2FF"
typography:
  display:
    fontFamily: "Outfit Variable, Noto Sans KR Variable, sans-serif"
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  heading-1:
    fontFamily: "Outfit Variable, Noto Sans KR Variable, sans-serif"
    fontSize: 1.75rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  heading-2:
    fontFamily: "Outfit Variable, Noto Sans KR Variable, sans-serif"
    fontSize: 1.125rem
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Outfit Variable, Noto Sans KR Variable, sans-serif"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Outfit Variable, Noto Sans KR Variable, sans-serif"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  circle: 999px
spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  page-desktop: 24px
  page-tablet: 24px
  page-mobile: 16px
components:
  app-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  navigation:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
  navigation-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
  table-header:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.ink}"
  muted-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  focus-marker:
    backgroundColor: "{colors.border-strong}"
    height: 2px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xs}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xs}"
    padding: 12px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: 12px
  status-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.circle}"
    padding: 8px
  status-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.circle}"
    padding: 8px
  status-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.circle}"
    padding: 8px
  status-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    rounded: "{rounded.circle}"
    padding: 8px
---

## Overview

Hermes Monitoring은 장식보다 이상 징후, 최근성, 원인 탐색과 안전한 조작을 우선한다. 공개 Codeit Design System에서 확인한 semantic token, 4·8 간격, neutral 기반 표면, 절제된 보라 포인트와 명확한 상태 원칙을 현재 제품 화면에 적용한다.

## Colors

- `primary`는 활성 내비게이션, 링크, 단일 주요 액션, 선택 상태에만 쓴다.
- canvas/surface/border로 깊이를 만들고 보라색 면적을 넓히지 않는다.
- success/warning/danger/info는 색상과 함께 텍스트·아이콘·상태명을 항상 제공한다.
- 흰 배경 본문은 ink, 보조문은 text-secondary를 사용한다. text-muted는 14px 이상 또는 비핵심 설명에만 쓴다.

## Typography

TailAdmin의 Outfit 가변 폰트와 한글용 Noto Sans KR 가변 폰트를 Fontsource 패키지에서 빌드하고 자체 서버에서 제공한다. 런타임 외부 폰트 요청은 없다. SIL OFL 1.1 원문을 빌드 자산에 포함한다. 숫자는 `font-variant-numeric: tabular-nums`로 정렬한다. 페이지 제목은 28px, 본문·입력·메뉴는 14px이며 모바일 텍스트 입력은 16px이다.

## Layout

- PC ≥1200px: 232px 좌측 rail + 유동 본문, 본문 padding 40px, 최대 읽기 폭 1440px.
- Tablet 768–1199px: 76px compact rail + 본문 padding 32px, 모든 조작 유지.
- Mobile <768px: 상단 제품 bar + 5개 메뉴 가로 scroll, padding 16px. 운영 설정은 read-only 안내와 데이터 조회 중심이다.
- 요약은 한 줄 status strip, 핵심 표, 비대칭 차트 영역 순서로 배치한다. 같은 크기 카드 반복이나 거대 숫자 카드를 금지한다.

## Elevation & Depth

기본 표면은 border로 구분한다. 고정 header는 `0 1px 0 rgba(27,26,31,.08)`, drawer/modal/toast에만 `0 12px 32px rgba(27,26,31,.14)`를 허용한다. glass, blur, glow, 다중 그림자, 장식 gradient는 사용하지 않는다.

## Shapes

input/button/chip은 8px, 긴 notice는 12px, section은 16px, drawer/login panel은 20px이다. 중첩 박스는 바깥보다 한 단계 작은 radius를 사용한다. status chip만 pill을 허용한다.

## Components

- **Navigation:** 정확히 5개 top menu. active는 보라색 가는 indicator+굵은 텍스트, 비활성은 neutral이다.
- **Page header:** breadcrumb, 24px 제목, 한 문장 설명, 필요한 action 하나를 포함한다.
- **Summary strip:** 실제 API가 제공하는 네 지표만 문장형 구획으로 표시한다.
- **Table:** caption/thead/tbody semantic을 보존하고 compact row, sticky header, tabular number, row hover를 사용한다. 모바일은 가로 scroll한다.
- **Status chip:** 아이콘/텍스트/색을 함께 제공하고 같은 화면에서 모두 pill shape로 통일한다.
- **Input/Select:** 44px 높이와 8px 모서리, 항상 label 또는 aria-label, 오류 helper text, 3px focus ring을 제공한다. 모든 Select 팝업은 Radix의 키보드·포커스 동작과 TailAdmin Dropdown 디자인을 사용한다.
- **Tabs:** 3개 instance tab 중 하나가 항상 selected이며 underline과 `aria-selected`를 사용한다.
- **Drawer/Modal:** focus trap, ESC 닫기, 80vh 이하, header/body/action 구획을 갖는다.
- **Toast/Alert:** 결과는 짧은 문장, 지속 오류와 stale은 본문 내 notice로 남긴다.
- **Loading/Empty/Error:** skeleton 또는 진행상태, 다음 행동이 있는 empty, 재시도 가능한 error, 마지막 정상 시각을 말하는 stale을 구분한다.

## Do's and Don'ts

- Do: 실제 API 필드만 보여주고 최근 시각과 상태 이유를 가까이 둔다.
- Do: Monitor의 상태 탐색을 1–2회 클릭으로 유지하고 Operate는 설정에서 분리한다.
- Do: 키보드 순서, focus-visible, reduced-motion, 44px 모바일 target을 보장한다.
- Don't: 임의 metric, 장식 icon tile, 동일 카드 grid, 과도한 pill, 보라색 면적, gradient/glass를 만들지 않는다.
- Don't: Codeit 로고·명칭·카피·이미지·폰트·코드를 복제하지 않는다.
