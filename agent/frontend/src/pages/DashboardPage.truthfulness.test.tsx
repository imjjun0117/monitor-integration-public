import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import DashboardPage from './DashboardPage';

const state = vi.hoisted(() => ({ causes: [] as Array<Record<string, unknown>> }));
vi.mock('../api', () => ({
  getDashboard: vi.fn(async () => ({
    projects: [{ project_id: 'alpha', display_name: 'Alpha', status: 'WARN', instances: [] }],
    failed_api_count: 0,
    expiring_certificate_count: 0,
    history: { resources: [], api: [] },
    status_causes: state.causes,
  })),
  getResources: vi.fn(),
}));
vi.mock('../components/MetricChart', () => ({
  default: () => <div />,
  metricSeriesStyle: () => ({ color: '#0072B2', borderStyle: 'solid' }),
}));

afterEach(() => {
  cleanup();
  state.causes = [];
});
function cause(overrides: Record<string, unknown>) {
  return {
    project_id: 'alpha',
    instance_id: null,
    kind: 'CHECK',
    status: 'WARN',
    metric_key: null,
    check_category: 'API',
    subject_id: 'check-1',
    subject_name: 'Checkout',
    value: null,
    warning_value: null,
    critical_value: null,
    result_code: null,
    observed_at: null,
    ...overrides,
  };
}
function view() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('summary cards are links to the corresponding filtered detail lists', async () => {
  view();
  expect(await screen.findByRole('link', { name: /^프로젝트 1/ })).toHaveAttribute(
    'href',
    '/projects',
  );
  expect(screen.getByRole('link', { name: /^프로젝트 1/ }).textContent).toBe('1');
  expect(screen.getByRole('link', { name: /^수집 정상 서버/ }).textContent).toBe('0/0');
  expect(screen.getByRole('link', { name: /^수집 정상 서버/ })).toHaveAttribute(
    'href',
    '/instances?collection=UP',
  );
  expect(screen.getByRole('link', { name: /^실패 API/ })).toHaveAttribute(
    'href',
    '/api-monitoring?status=DOWN&usage=used',
  );
  expect(screen.getByRole('link', { name: /^만료 예정 인증서/ })).toHaveAttribute(
    'href',
    '/certificates?expiry=soon',
  );
});

test('project overview API count excludes INTERNAL checks', async () => {
  state.causes = [
    cause({ subject_id: 'api' }),
    cause({ subject_id: 'internal', check_category: 'INTERNAL' }),
  ];
  view();
  const row = (await screen.findByRole('button', { name: 'Alpha 자원 보기' })).closest('tr')!;
  expect(within(row).getAllByRole('cell').at(-2)).toHaveTextContent('1');
});

test('internal check shows its readable name and specific cause, not collection failure', async () => {
  state.causes = [
    cause({
      check_category: 'INTERNAL',
      subject_id: 'batch-cleanup',
      subject_name: '판매특허 정리 배치 신선도',
      result_code: 'INTERNAL_CHECK_FAILED',
      status: 'DOWN',
    }),
  ];
  view();
  expect(
    await screen.findByText('판매특허 정리 배치 점검 · 배치 처리 이력 조회에 실패했습니다.'),
  ).toBeVisible();
  expect(screen.queryByText(/분류되지 않은 수집 오류/)).not.toBeInTheDocument();
  expect(screen.queryByText('장애')).not.toBeInTheDocument();
});

test.each([
  ['API_CHECK_ERROR', 'API 점검 실패'],
  ['TIMEOUT', '응답 시간 초과'],
  ['AUTH_FAILED', '인증 실패'],
])(
  'API failure %s displays functional mapping instead of latency-only wording',
  async (resultCode, expected) => {
    state.causes = [
      cause({
        result_code: resultCode,
        metric_key: 'API_LATENCY_MS',
        value: 912,
        warning_value: 500,
        critical_value: 800,
      }),
    ];
    view();
    const reason = await screen.findByText(new RegExp(expected));
    expect(reason).not.toHaveTextContent('912ms');
  },
);

test('API threshold warning with no failure code displays measured latency and limits', async () => {
  state.causes = [
    cause({ metric_key: 'API_LATENCY_MS', value: 650, warning_value: 500, critical_value: 800 }),
  ];
  view();
  expect(await screen.findByText('Checkout 650ms (경고 500ms, 위험 800ms)')).toBeInTheDocument();
});

test.each([
  ['DOWN', '마지막 수집 이후 허용 시간 초과'],
  ['WARN', '수집이 일시적으로 지연되거나 누락됨'],
])('collection %s without a result code uses safe wording', async (status, expected) => {
  state.causes = [cause({ kind: 'COLLECTION', check_category: undefined, status })];
  view();
  const reason = await screen.findByText(expected);
  expect(reason).not.toHaveTextContent('원인 코드 없음');
});
