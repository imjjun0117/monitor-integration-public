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
