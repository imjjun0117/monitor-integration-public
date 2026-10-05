import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getApiChecks, getInstances, getProjects, saveApiCheckUsage, type ApiCheck } from '../api';
import { Check, Status, ServiceMetric } from '../generated';
import { selectOption } from '../test-select';
import ApiMonitoringPage from './ApiMonitoringPage';

vi.mock('../api', () => ({
  getApiChecks: vi.fn(),
  getInstances: vi.fn(),
  getProjects: vi.fn(),
  saveApiCheckUsage: vi.fn(),
  saveCheckSettings: vi.fn(),
  saveServiceProfile: vi.fn(),
  runApiCheck: vi.fn(),
}));
vi.mock('../components/chartEngine', () => ({
  createMetricChart: () => ({ dispose: vi.fn(), resize: vi.fn() }),
}));
let checks: ApiCheck[];
beforeEach(() => {
  vi.clearAllMocks();
  const base: ApiCheck = {
    project_id: 'market',
    instance_id: 'dev',
    check_id: 'partner',
    name: 'Partner API',
    category: Check.category.API,
    direction: 'EXTERNAL',
    status: Status.DOWN,
    duration_ms: 2000,
    result_code: 'HTTP_TIMEOUT',
    message: 'HTTP_TIMEOUT',
    checked_at: '2026-10-03T12:00:00Z',
    monitoring_enabled: true,
    history: [],
  };
  checks = [base, { ...base, check_id: 'unused', name: 'Unused API', monitoring_enabled: false }];
  vi.mocked(getProjects).mockResolvedValue({ items: [], page: 0, size: 200, total: 0 });
  vi.mocked(getInstances).mockResolvedValue({ items: [], page: 0, size: 200, total: 0 });
  vi.mocked(getApiChecks).mockImplementation(async (filters) => {
    const items = checks
      .filter((check) =>
        filters.usage === 'used'
          ? check.monitoring_enabled
          : filters.usage === 'unused'
            ? !check.monitoring_enabled
            : true,
      )
      .map((check) => ({ ...check }));
    return { items, page: 0, size: 200, total: items.length };
  });
  vi.mocked(saveApiCheckUsage).mockImplementation(async (check, enabled) => {
    checks = checks.map((row) =>
      row.check_id === check.check_id ? { ...row, monitoring_enabled: enabled } : row,
    );
  });
});
afterEach(cleanup);
function show(path = '/api-monitoring') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ApiMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

test('failed refresh keeps prior API results with a warning and retry', async () => {
  const client = show();
  expect(await screen.findByRole('button', { name: 'Partner API' })).toBeVisible();
  vi.mocked(getApiChecks).mockRejectedValue(new Error('Network unavailable'));
  await client.invalidateQueries({ queryKey: ['api-checks'] });
  expect(await screen.findByText('갱신에 실패해 이전 데이터를 표시합니다.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Partner API' })).toBeVisible();
  vi.mocked(getApiChecks).mockResolvedValue({
    items: checks,
    page: 0,
    size: 200,
    total: checks.length,
  });
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await waitFor(() =>
    expect(screen.queryByText('갱신에 실패해 이전 데이터를 표시합니다.')).not.toBeInTheDocument(),
  );
});

test('failed API summary link applies DOWN and used filters on entry', async () => {
  show('/api-monitoring?status=DOWN&usage=used');
  await waitFor(() =>
    expect(getApiChecks).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DOWN', usage: 'used' }),
    ),
  );
  expect(await screen.findByRole('button', { name: 'Partner API' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Unused API' })).not.toBeInTheDocument();
});

test('filter reset returns from a dashboard failure filter to all APIs', async () => {
  show('/api-monitoring?status=DOWN&usage=used');
  expect(await screen.findByRole('button', { name: 'Partner API' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
  expect(await screen.findByRole('button', { name: 'Unused API' })).toBeVisible();
  await waitFor(() =>
    expect(getApiChecks).toHaveBeenLastCalledWith({
      project: '',
      instance: '',
      direction: '',
      status: '',
      name: '',
      usage: '',
    }),
  );
  expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
});

test('dashboard link filters the target instance and opens balance details once', async () => {
  checks.push({
    ...checks[0],
    check_id: 'other-message-vendor',
    name: '다른 문자 업체',
    service_info: {
      title: '다른 문자 업체',
      description: '',
      dashboard: true,
      status: Status.UP,
      collected: 1,
      metrics: [
        {
          key: 'sms_count',
          label: 'SMS 발송 가능 건수',
          value: 10,
          unit: '건',
          status: Status.UP,
          kind: ServiceMetric.kind.NUMBER,
          direction: ServiceMetric.direction.LOW,
          warning: null,
          critical: null,
        },
      ],
    },
  });
  show('/api-monitoring?project=market&instance=dev&check=other-message-vendor');
  expect(await screen.findByRole('dialog', { name: 'API 점검 상세' })).toBeVisible();
  expect(getApiChecks).toHaveBeenCalledWith(
    expect.objectContaining({ project: 'market', instance: 'dev' }),
  );
  expect(screen.getAllByText('SMS 발송 가능 건수')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
test('switches an API to unused and retains historical details without allowing manual runs', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Partner API 미사용으로 전환' }));
  await screen.findByRole('button', { name: 'Partner API 사용으로 전환' });
  expect(saveApiCheckUsage).toHaveBeenCalledWith(
    expect.objectContaining({ check_id: 'partner', instance_id: 'dev' }),
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Partner API' }));
  expect(await screen.findByText('마지막 점검 결과')).toBeVisible();
  expect(screen.getByRole('button', { name: '지금 테스트 실행' })).toBeDisabled();
  expect(screen.getAllByText('HTTP_TIMEOUT').length).toBeGreaterThan(0);
});
test('usage filters allow finding and reactivating unused APIs', async () => {
  show();
  await screen.findByRole('button', { name: 'Partner API' });
  await selectOption(screen.getByLabelText('사용 여부 필터'), '미사용 API');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Partner API' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Unused API 사용으로 전환' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Unused API' })).toBeNull());
  expect(saveApiCheckUsage).toHaveBeenCalledWith(
    expect.objectContaining({ check_id: 'unused' }),
    true,
  );
  await selectOption(screen.getByLabelText('사용 여부 필터'), '사용 API');
  await screen.findByRole('button', { name: 'Unused API 미사용으로 전환' });
});
test('initial all-project API view has no vendor cards, but API details still show service information', async () => {
  checks[0].service_info = {
    title: '팝빌',
    description: '',
    dashboard: true,
    status: Status.UP,
    collected: 0,
    metrics: [],
  };
  show();
  const api = await screen.findByRole('button', { name: 'Partner API' });
  expect(screen.queryByRole('region', { name: /서비스 정보 · 팝빌/ })).not.toBeInTheDocument();
  fireEvent.click(api);
  expect(await screen.findByRole('region', { name: /서비스 정보 · 팝빌/ })).toBeVisible();
});

test('vendor cards appear after entering the owning project scope', async () => {
  checks[0].service_info = {
    title: '팝빌',
    description: '',
    dashboard: true,
    status: Status.UP,
    collected: 0,
    metrics: [],
  };
  show('/api-monitoring?project=market');
  expect(await screen.findByRole('region', { name: /서비스 정보 · 팝빌/ })).toBeVisible();
});

test('failed updates leave usage unchanged and explain the failure', async () => {
  vi.mocked(saveApiCheckUsage).mockRejectedValueOnce(new Error('unavailable'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Partner API 미사용으로 전환' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('사용 여부를 저장하지 못했습니다');
  expect(screen.getByRole('button', { name: 'Partner API 미사용으로 전환' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Partner API 사용으로 전환' })).toBeNull();
});
