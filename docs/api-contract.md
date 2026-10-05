# API 계약

Collector 계약은 `contracts/*.schema.json`, 중앙 API 계약은 `contracts/center-api.openapi.yaml`이 기준입니다. 중앙 API는 통합 검사에서 실제 status, JSON content type, 빈 body와 재귀 required field를 비교합니다. 인증 실패와 CSRF 거부는 각각 JSON `401`/`403`입니다. 상태는 `UP/WARN/DOWN/UNKNOWN`, 시간은 UTC ISO-8601, 비율은 0~1입니다. 미지원 값은 `null`과 `unsupported` 이유를 함께 보냅니다. 토큰은 create/update request에서만 허용되는 `writeOnly` 값이며 조회 응답, 결과 또는 로그에 넣지 않습니다.

점검 결과의 선택 필드 `http`는 인증 값을 가린 요청·응답 상세, `details`는 SDK 조회의 숫자·문자열·불리언·null 반환값입니다. 두 필드가 없는 기존 Collector도 허용합니다. 본문은 4,096자, 상세 값은 항목당 1,024자/최대 32개로 제한합니다. 중앙은 V10의 `check_results_latest.evidence_json`에 최신 상세만 보관하고 조회 시 `http`/`details`로 반환합니다. 직접 실행 결과와 snapshot의 recent_checks에서 같은 형식을 사용하며, 오래된 결과가 새 결과를 덮어쓰지 않습니다.

`GET /api/v1/dashboard`의 `service_balances`는 활성 프로젝트/인스턴스의 사용 중인 팝빌 점검 최신 결과를 `Check[]`로 반환합니다. 상세에 `balance`, `minimum_balance`, `ats/sms/lms_unit_cost`와 `ats/sms/lms_remaining_estimate`를 제공하며, 숫자 없는 기존 결과는 그대로 미수집입니다. `charge_history_complete=true`일 때만 `charged_points_30d`(승인된 포인트 충전 합계), `charge_count_30d`, `charge_period_start/end`(한국 날짜 yyyyMMdd)를 표시합니다. 충전 합계는 현재 잔액이나 전체 누적 충전량이 아닙니다. 전체 결제내역 확인이 실패한 경우 합계를 내보내지 않으며 담당자·메일 등 개인정보도 반환하지 않습니다. 대시보드 조회와 15초 화면 갱신은 외부 API를 실행하지 않습니다.

API 사용 여부는 `PUT /api/v1/api-checks/{projectId}/{instanceId}/{checkId}/usage`에 `{"enabled":false}` 또는 `true`를 보내 저장하며 성공 시 204입니다. 조회의 `monitoring_enabled`는 중앙 관리 설정으로, `GET /api/v1/api-checks?monitoringEnabled=false`에서 미사용 API와 기존 결과·이력을 확인할 수 있습니다. 필터를 생략하면 전체를 반환합니다. 미사용 API를 수동 실행하면 400 `API_CHECK_UNUSED`입니다. 이 설정은 Collector의 API 정의와 분리하여 재수집에도 유지합니다.

API 및 INTERNAL 설정은 `PUT /api/v1/api-checks/{projectId}/{instanceId}/{checkId}/settings`에 `{"monitoringEnabled":true,"automaticEnabled":true,"checkIntervalSeconds":3600}`을 보내며 성공 시 204다. 세 필드가 모두 필요하며 주기는 60~604800초다. 조회 응답의 `automatic_enabled`, `check_interval_seconds`, `automatic_allowed`로 저장된 자동 실행 여부, 유효 주기, 상위 인스턴스/프로젝트 허용 여부를 확인한다. 기존 `/usage`도 내부 점검에 적용하며 미사용 내부 점검의 수동 실행은 400 `CHECK_UNUSED`이다. 내부 점검 조회 역시 `monitoringEnabled` 필터를 지원한다. 대시보드 인스턴스의 `collection_status`는 개별 점검/자원 경고와 독립적인 Collector 수집 상태다.
