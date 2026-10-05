import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Check, Status, HttpCheckDetails, ServiceMetric } from '../generated';
import type { ApiCheck } from '../api';
import ApiCheckDetail, { checkName } from './ApiCheckDetail';

vi.mock('../components/chartEngine', () => ({
  createMetricChart: () => ({ dispose: vi.fn(), resize: vi.fn() }),
}));
afterEach(cleanup);
const base: ApiCheck = {
  project_id: 'sample',
  instance_id: 'dev',
  check_id: 'nice',
  name: 'NICE 본인인증 서버 도달성',
  category: Check.category.API,
  direction: 'EXTERNAL',
  status: Status.UP,
  duration_ms: 15,
  result_code: 'HTTP_ASSERTIONS_PASSED',
  message: 'HTTP_ASSERTIONS_PASSED',
  checked_at: '2026-10-03T12:36:00Z',
  history: [],
};
function show(check: ApiCheck) {
  const run = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ApiCheckDetail
        check={check}
        close={vi.fn()}
        run={run}
        running={false}
        waiting={false}
        timedOut={false}
      />
    </QueryClientProvider>,
  );
  return run;
}
test('explains the check scope and timings without inventing legacy HTTP details', () => {
  const run = show(base);
  expect(screen.getByText(/실제 본인인증 절차/)).toBeVisible();
  expect(screen.getByText('15 ms (0.015초)')).toBeVisible();
  expect(screen.getByText(/요청·응답 상세가 수집되지 않았습니다/)).toBeVisible();
  expect(screen.queryByText('HTTP 200')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '지금 테스트 실행' }));
  expect(run).toHaveBeenCalledOnce();
  expect(screen.queryByText(/도달성/)).not.toBeInTheDocument();
});
test('shows actual HTTP request and response and renders HTML as inert text', () => {
  show({
    ...base,
    http: {
      method: HttpCheckDetails.method.GET,
      url: 'https://nice.example/',
      request_headers: { Authorization: '***' },
      expected: 'HTTP 200-399',
      status_code: 302,
      response_body: '<script id="response-probe">alert(1)</script>',
      response_headers: { Location: 'https://nice.example/login' },
      response_bytes: 56,
    },
    history: [
      {
        checked_at: '2026-10-03T12:33:00Z',
        duration_ms: 49,
        status: Status.UP,
        result_code: 'HTTP_ASSERTIONS_PASSED',
      },
      {
        checked_at: '2026-10-03T12:36:00Z',
        duration_ms: 15,
        status: Status.UP,
        result_code: 'HTTP_ASSERTIONS_PASSED',
      },
    ],
  });
  expect(screen.getByText('HTTP 302')).toBeVisible();
  expect(screen.getByText(/alert\(1\)/)).toBeVisible();
  expect(document.querySelector('#response-probe')).toBeNull();
  expect(screen.getByText(/1,000 ms = 1초/)).toBeVisible();
  expect(screen.getByText(/실시간 연속 측정값은 아닙니다/)).toBeVisible();
});
test('distinguishes no received response from an empty HTTP body', () => {
  show({
    ...base,
    status: Status.DOWN,
    result_code: 'HTTP_TIMEOUT',
    http: { method: HttpCheckDetails.method.GET, url: 'https://nice.example/' },
  });
  expect(screen.getByText('응답 코드를 받지 못함')).toBeVisible();
  expect(screen.getByText('수신한 응답 본문이 없습니다.')).toBeVisible();
});
test('popbill shows real points, unit costs and individual estimated counts', () => {
  show({
    ...base,
    check_id: 'popbill',
    name: '팝빌',
    status: Status.WARN,
    result_code: null,
    message: 'POPBILL_BALANCE_LOW',
    details: {
      kind: 'POPBILL_BALANCE',
      balance: 500,
      balance_source: 'MEMBER',
      minimum_balance: 10000,
      ats_unit_cost: 10,
      ats_remaining_estimate: 50,
      sms_unit_cost: 20,
      sms_remaining_estimate: 25,
      lms_unit_cost: null,
      lms_remaining_estimate: null,
    },
    service_info: {
      title: '팝빌',
      description: '같은 과금 대상의 예상 건수는 합산하지 않습니다.',
      dashboard: true,
      status: Status.WARN,
      collected: 3,
      metrics: [
        ['잔여 포인트', 500, 'P'],
        ['알림톡 예상 건수', 50, '건'],
        ['SMS 예상 건수', 25, '건'],
        ['LMS 예상 건수', null, '건'],
      ].map(([label, value, unit], index) => ({
        key: `field_${index}`,
        label: String(label),
        value: value as number | null,
        unit: String(unit),
        kind: ServiceMetric.kind.NUMBER,
        direction: ServiceMetric.direction.LOW,
        warning: null,
        critical: null,
        status: value == null ? Status.UNKNOWN : Status.UP,
      })),
    },
  });
  expect(screen.getByText('잔여 포인트').closest('div')).toHaveTextContent('500P');
  expect(screen.getByText('알림톡 예상 건수').closest('div')).toHaveTextContent('50건');
  expect(screen.getByText('SMS 예상 건수').closest('div')).toHaveTextContent('25건');
  expect(screen.getByText('LMS 예상 건수').closest('div')).toHaveTextContent('미수집');
  expect(screen.getByText(/예상 건수는 합산하지 않습니다/)).toBeVisible();
});
test('SMART5 and SMART V have separate names and purposes', () => {
  expect(checkName({ ...base, check_id: 'smart', name: 'SMART 평가 서버 도달성' })).toBe(
    'SMART5 사이트 연결 확인',
  );
  show({ ...base, check_id: 'smartv-report', name: 'SMART V 기존 평가 보고서 조회' });
  expect(screen.getByText(/이미 발급된 평가번호/)).toBeVisible();
});

test('unused API keeps its last result and blocks manual execution', () => {
  const run = show({
    ...base,
    monitoring_enabled: false,
    status: Status.DOWN,
    result_code: 'HTTP_TIMEOUT',
  });
  expect(screen.getByText('미사용 API · 점검 중지')).toBeVisible();
  expect(screen.getByText('마지막 점검 결과')).toBeVisible();
  expect(screen.getByRole('button', { name: '지금 테스트 실행' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '지금 테스트 실행' }));
  expect(run).not.toHaveBeenCalled();
});

test('Seesaw HTTPS success does not claim working SMS authentication or a zero balance', () => {
  show({
    ...base,
    project_id: 'sample-campus',
    check_id: 'sms-seesaw',
    name: '시소톡 SMS 서버 HTTPS 연결',
    http: {
      method: HttpCheckDetails.method.GET,
      status_code: 401,
      response_body: '{"error":"authentication required"}',
    },
    details: { balance: null, remaining_messages: null, operation: 'HTTPS_CONNECTION_ONLY' },
  });
  expect(screen.getByText(/잔액 조회가 정상이라는 뜻은 아닙니다/)).toBeVisible();
  expect(screen.getByText('HTTP 401')).toBeVisible();
  expect(screen.queryByText('0P')).not.toBeInTheDocument();
});

test('SNS keeps provider authentication errors and masked request values visible', () => {
  show({
    ...base,
    project_id: 'sample-campus',
    check_id: 'sns-instagram',
    name: 'Instagram 미디어 API 조회',
    status: Status.DOWN,
    result_code: 'HTTP_STATUS_MISMATCH',
    http: {
      method: HttpCheckDetails.method.GET,
      status_code: 400,
      request_query: { access_token: '***' },
      response_body: '{"error":{"code":190,"message":"Invalid OAuth access token"}}',
    },
  });
  expect(screen.getByText(/인증·권한·API 버전 오류/)).toBeVisible();
  expect(screen.getByText('HTTP 400')).toBeVisible();
  expect(screen.getByText(/Invalid OAuth access token/)).toBeVisible();
  expect(screen.getByLabelText('주소에 붙인 입력값')).toHaveTextContent('***');
});
