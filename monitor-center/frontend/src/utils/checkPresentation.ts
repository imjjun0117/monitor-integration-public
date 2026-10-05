// 점검 결과 코드를 사용자 안내 문구로 변환
import type { ApiCheck } from '../api';

export function checkName(check: Pick<ApiCheck, 'check_id' | 'name'>) {
  if (check.check_id === 'smart') {
    return 'SMART5 사이트 연결 확인';
  }
  if (check.check_id === 'data-path' && check.name === 'Sample data path') {
    return '데이터 저장 경로 점검';
  }
  return check.name
    .replace(/서버 도달성/g, '서버 연결 확인')
    .replace(/ 도달성/g, ' 연결 확인')
    .replace(/로그 파일 신선도/g, '로그 파일 갱신 확인')
    .replace(/ 신선도/g, ' 점검');
}

export function checkFailure(code: string | null | undefined, checkId = '') {
  if (code === 'INTERNAL_CHECK_FAILED' && checkId.startsWith('batch-')) {
    return '배치 처리 이력 조회에 실패했습니다.';
  }
  return code ? (outcomes[code] ?? '점검 결과를 확인해야 합니다.') : '점검 결과를 확인해야 합니다.';
}

export function checkOutcome(
  check: Pick<ApiCheck, 'result_code' | 'message' | 'check_id' | 'details'>,
) {
  const code = check.result_code || check.message || '';
  if (check.check_id === 'sms-seesaw' && code === 'HTTP_ASSERTIONS_PASSED') {
    return '시소톡 서버에서 HTTPS 응답을 받았습니다. 문자 발송·계정 인증·잔액 조회가 정상이라는 뜻은 아닙니다.';
  }
  if (
    check.check_id === 'popbill' &&
    ['POPBILL_BALANCE_EMPTY', 'POPBILL_BALANCE_LOW'].includes(code) &&
    !['MEMBER', 'PARTNER'].includes(String(check.details?.balance_source)) &&
    check.details?.member_balance === undefined &&
    check.details?.partner_balance === undefined
  ) {
    return '이전 점검은 연동회원 잔액만 확인했습니다. 파트너 과금 여부와 파트너 잔액을 확인하려면 최신 수집 파일을 반영하고 다시 조회하세요.';
  }
  if (code === 'INTERNAL_CHECK_FAILED') {
    return checkFailure(code, check.check_id);
  }
  return outcomes[code] || check.message || '아직 점검 결과가 없습니다.';
}

const outcomes: Record<string, string> = {
  HTTP_ASSERTIONS_PASSED: '설정한 응답 확인 조건을 충족했습니다.',
  HTTP_STATUS_MISMATCH: '실제 HTTP 응답 코드가 정상 판정 기준과 다릅니다.',
  HTTP_TIMEOUT: '설정한 제한 시간 안에 연결 또는 응답 수신을 끝내지 못했습니다.',
  HTTP_REQUEST_FAILED: '요청을 완료하지 못했습니다.',
  HTTP_DNS_ERROR: '서버 주소를 IP 주소로 찾지 못했습니다.',
  HTTP_TLS_ERROR: 'HTTPS 보안 연결에 실패했습니다. 인증서와 Java 신뢰 저장소를 확인하세요.',
  HTTP_CONNECTION_FAILED: '서버에 연결하지 못했습니다. 주소·포트·방화벽을 확인하세요.',
  HTTP_RESPONSE_TOO_LARGE: '응답이 수집 가능한 최대 크기를 초과했습니다.',
  TEXT_ASSERTION_FAILED: '정상 응답에 있어야 할 문구가 없습니다.',
  REGEX_ASSERTION_FAILED: '응답 내용이 설정한 패턴과 다릅니다.',
  JSON_ASSERTION_FAILED: 'JSON 응답의 확인 항목이 정상 기준과 다릅니다.',
  XML_ASSERTION_FAILED: 'XML 응답의 확인 항목이 정상 기준과 다릅니다.',
  CONFIGURATION_MISSING:
    '점검에 필요한 설정이 없습니다. API 자체의 장애를 판단할 수 없는 상태입니다.',
  CONFIGURATION_INVALID: '점검 설정을 확인해야 합니다.',
  SNS_CONFIGURATION_UNAVAILABLE:
    '기존 SNS 설정을 DB에서 읽지 못했습니다. SNS 서비스와 DB 연결을 확인하세요.',
  SNS_RESPONSE_INVALID:
    'SNS 서버가 반환한 데이터 형식이 정상 조회 응답과 다릅니다. 받은 응답과 사용 중인 API 방식을 확인하세요.',
  POPBILL_BALANCE_LOW: '실제 과금 대상의 잔액이 충전 경고 기준보다 적은 발송 유형이 있습니다.',
  POPBILL_BALANCE_EMPTY:
    '실제 과금 대상의 잔액이 0인 발송 유형이 있습니다. 유형별 과금 대상과 잔액을 확인하세요.',
  POPBILL_BALANCE_OK: '각 발송 유형의 과금 대상 잔액이 충전 경고 기준 이상입니다.',
  POPBILL_BALANCE_QUERY_FAILED: '팝빌 잔여 포인트 조회에 실패했습니다.',
  POPBILL_BALANCE_INVALID: '팝빌에서 유효한 잔여 포인트 값을 받지 못했습니다.',
  POPBILL_BILLING_INFO_UNAVAILABLE:
    '팝빌 과금 대상(연동회원·파트너), 해당 잔액 또는 전송 단가를 확인하지 못했습니다.',
  POPBILL_UNIT_COST_UNAVAILABLE: '잔여 포인트는 조회했지만 일부 발송 단가를 조회하지 못했습니다.',
  POPBILL_CHARGE_HISTORY_UNAVAILABLE:
    '잔여 포인트는 조회했지만 최근 충전 이력을 조회하지 못했습니다.',
  TIMEOUT: '점검 결과가 제한 시간 안에 도착하지 않았습니다.',
  API_CHECK_ERROR: '점검 실행 또는 결과 수집에 실패했습니다.',
  TCP_TIMEOUT: '설정한 제한 시간 안에 연결하지 못했습니다.',
  TCP_CONNECTION_FAILED: '지정한 서버의 포트에 연결하지 못했습니다.',
  DIRECTORY_MISSING: '설정한 폴더가 존재하지 않습니다.',
  DIRECTORY_UNREADABLE: '설정한 폴더를 읽을 수 없습니다.',
  DIRECTORY_OK: '첨부파일 저장 폴더가 존재하고 읽을 수 있습니다.',
  FILE_MISSING: '설정한 파일이 존재하지 않습니다.',
  FILE_TOO_OLD: '파일이 설정한 시간 안에 갱신되지 않았습니다.',
  FILE_STALE: '파일이 설정한 시간 안에 갱신되지 않았습니다.',
  BATCH_FRESH: '배치 처리 이력이 설정한 기간 안에 갱신되었습니다.',
  BATCH_STALE: '배치 처리 이력이 설정한 기간 안에 갱신되지 않았습니다.',
  BATCH_HISTORY_MISSING: '배치 처리 날짜 기록이 없습니다.',
  DB_RESULT_MISSING: 'DB 조회 결과가 없습니다.',
  DB_QUERY_OK: 'DB 연결과 읽기 조회에 성공했습니다.',
  INTERNAL_CHECK_FAILED: '내부 점검 실행에 실패했습니다.',
  DISK_CAPACITY_OK: '디스크 여유 공간이 정상입니다.',
  DISK_CAPACITY_LOW: '디스크 사용률이 설정한 기준을 넘었습니다.',
  DISK_UNAVAILABLE: '디스크 용량을 확인할 수 없습니다.',
  CHECK_DEADLINE_EXCEEDED: '점검 실행 제한 시간을 초과했습니다.',
  FCM_CONFIGURATION_CHANGED:
    '기존 푸시 API 주소가 현재 코드에서 확인되지 않습니다. 변경된 연동 방식에 맞춰 점검을 갱신해야 합니다.',
  FCM_CONFIGURATION_UNAVAILABLE: '현재 웹앱의 푸시 연동 파일을 확인하지 못했습니다.',
  FCM_SEND_NOT_VERIFIED:
    '서버는 응답했지만 발송 성공을 확인할 수 없습니다. 이 점검은 푸시를 발송하지 않습니다.',
  CHECK_CONFIGURATION_INVALID: 'API 점검 설정을 읽지 못했습니다.',
  'Data path is available.': '데이터 저장 폴더가 존재하고 읽을 수 있습니다.',
  'Data path does not exist.': '데이터 저장 폴더가 존재하지 않습니다.',
  'Data path is not a directory.': '데이터 저장 경로가 폴더가 아닙니다.',
  'Data path is not readable.': '데이터 저장 폴더를 읽을 수 없습니다.',
};

export function automaticEnabled(check: ApiCheck) {
  return check.automatic_enabled ?? check.category === 'API';
}
export function checkInterval(check: ApiCheck) {
  return (
    check.check_interval_seconds ??
    (check.category === 'API' && check.direction === 'EXTERNAL' ? 86400 : 300)
  );
}
export function intervalLabel(seconds: number) {
  return seconds % 3600 === 0
    ? `${seconds / 3600}시간`
    : seconds % 60 === 0
      ? `${seconds / 60}분`
      : `${seconds}초`;
}
export function scheduleLabel(check: ApiCheck) {
  if (check.monitoring_enabled === false) {
    return '점검 중지';
  }
  if (!automaticEnabled(check)) {
    return '자동 미사용 · 수동 점검';
  }
  if (check.automatic_allowed === false) {
    return '자동 실행 일시 중지';
  }
  return `자동 사용 · ${intervalLabel(checkInterval(check))}마다`;
}
