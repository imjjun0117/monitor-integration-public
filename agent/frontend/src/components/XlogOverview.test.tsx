import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { DefaultService } from '../generated';
import XlogOverview from './XlogOverview';
import type { XlogItem, XlogZoom } from './XlogChart';

const { chartProps } = vi.hoisted(() => ({ chartProps: vi.fn() }));
vi.mock('./XlogChart', () => ({
  default: (props: {
    items: XlogItem[];
    zoom?: XlogZoom;
    onZoomChange?: (zoom?: XlogZoom) => void;
  }) => {
    chartProps(props);
    return <div role="img" aria-label="XLog 요청 응답시간 분포 차트" />;
  },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  chartProps.mockClear();
});

test('empty polling preserves absolute zoom, exposes reset, and reapplies it when records return', async () => {
  const item: XlogItem = {
    id: 1,
    project_id: 'sample',
    instance_id: 'prod',
    project_name: 'Sample',
    instance_name: 'Production',
    received_at: '2026-01-01T00:00:00Z',
    payload: { started_at: 5_500_000, duration_ms: 80, method: 'GET', path: '/', status: 200 },
  };
  const data = {
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 1, errors: 0, average_ms: 80, p95_ms: 80 },
    items: [item],
  };
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue(data);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <XlogOverview project="sample" instance="prod" detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('img', { name: 'XLog 요청 응답시간 분포 차트' });
  const zoom = { start: 5_400_000, end: 5_700_000 };
  act(() => chartProps.mock.lastCall?.[0].onZoomChange(zoom));
  act(() =>
    client.setQueryData(['xlog', 'sample', 'prod', 60, '', false, 0], { ...data, items: [] }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('img', { name: 'XLog 요청 응답시간 분포 차트' }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: '확대 초기화' })).toBeVisible();
  act(() =>
    client.setQueryData(['xlog', 'sample', 'prod', 60, '', false, 0], { ...data, items: [item] }),
  );
  await waitFor(() => expect(chartProps.mock.lastCall?.[0].zoom).toEqual(zoom));
  act(() =>
    client.setQueryData(['xlog', 'sample', 'prod', 60, '', false, 0], { ...data, items: [] }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '확대 초기화' }));
  expect(screen.queryByRole('button', { name: '확대 초기화' })).not.toBeInTheDocument();
  act(() => client.setQueryData(['xlog', 'sample', 'prod', 60, '', false, 0], data));
  await waitFor(() => expect(chartProps.mock.lastCall?.[0].zoom).toBeUndefined());
});

test('filter changes reset saved XLog zoom instead of reusing unrelated time selections', async () => {
  const item: XlogItem = {
    id: 1,
    project_id: 'sample',
    instance_id: 'prod',
    project_name: 'Sample',
    instance_name: 'Production',
    received_at: '2026-01-01T00:00:00Z',
    payload: { started_at: 5_500_000, duration_ms: 80, method: 'GET', path: '/', status: 200 },
  };
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 1, errors: 0, average_ms: 80, p95_ms: 80 },
    items: Array.from({ length: 1000 }, (_, index) => ({ ...item, id: 1000 - index })),
  });
  const client = new QueryClient();
  const renderOverview = (filters: {
    project: string;
    instance: string;
    minutes: number;
    path: string;
    errorsOnly: boolean;
  }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <XlogOverview {...filters} detailed />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const filters = { project: 'sample', instance: 'prod', minutes: 60, path: '', errorsOnly: false };
  const view = render(renderOverview(filters));
  await screen.findByRole('img', { name: 'XLog 요청 응답시간 분포 차트' });
  for (const next of [
    { ...filters, errorsOnly: true },
    { ...filters, errorsOnly: true, project: 'other' },
    { ...filters, errorsOnly: true, project: 'other', instance: 'other-instance' },
    { ...filters, errorsOnly: true, project: 'other', instance: 'other-instance', minutes: 15 },
    {
      ...filters,
      errorsOnly: true,
      project: 'other',
      instance: 'other-instance',
      minutes: 15,
      path: '/filtered',
    },
    filters,
  ]) {
    act(() => chartProps.mock.lastCall?.[0].onZoomChange({ start: 5_400_000, end: 5_700_000 }));
    view.rerender(renderOverview(next));
    await waitFor(() => expect(chartProps.mock.lastCall?.[0].zoom).toBeUndefined());
  }
  act(() => chartProps.mock.lastCall?.[0].onZoomChange({ start: 5_400_000, end: 5_700_000 }));
  fireEvent.click(screen.getByRole('button', { name: '이전 기록' }));
  await waitFor(() => expect(chartProps.mock.lastCall?.[0].zoom).toBeUndefined());
});

test('overview uses central records, preserves scope links and opens a selected request', async () => {
  const read = vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 0,
    summary: { count: 1, errors: 1, average_ms: 123, p95_ms: 123 },
    items: [
      {
        id: 1,
        project_id: 'sample',
        instance_id: 'prod',
        project_name: 'Sample',
        instance_name: 'Production',
        received_at: new Date().toISOString(),
        payload: {
          started_at: Date.now(),
          duration_ms: 123,
          method: 'GET',
          path: '/sample',
          status: 500,
        },
      },
    ],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview project="sample" instance="prod" detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText(/웹소켓 연결 끊김/);
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ project: 'sample', instance: 'prod', minutes: 60 }),
  );
  expect(screen.getByRole('link', { name: 'HTTP 오류 1건 보기' })).toHaveAttribute(
    'href',
    '/xlog?project=sample&instance=prod&errorsOnly=true',
  );
  expect(
    screen.getByRole('table', { name: 'XLog 요청 목록' }).closest('.ant-pro-table'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'GET /sample' }));
  const detail = await screen.findByRole('dialog', { name: '요청 정보' });
  expect(detail.closest('.ant-modal')).toBeInTheDocument();
  expect(detail.querySelector('.ant-pro-descriptions')).toBeInTheDocument();
  expect(detail).toHaveTextContent('123 ms');
});

test('detailed view separates KPI, chart, and requests into individual card surfaces', async () => {
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 0,
    eligible_instances: 0,
    connected_instances: 0,
    summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
    items: [],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  for (const label of ['XLog 요청 요약', 'XLog 요청 응답시간 분포', 'XLog 요청 목록']) {
    const region = await screen.findByRole('region', { name: label });
    expect(region).toHaveClass('ant-card');
    expect(region.parentElement?.closest('.ant-card')).toBeNull();
  }
});

test('compact dashboard XLog has only its containing card', async () => {
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 0,
    eligible_instances: 0,
    connected_instances: 0,
    summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
    items: [],
  });
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview compact />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('region', { name: 'XLog 그래프' });
  expect(container.querySelectorAll('.ant-card')).toHaveLength(1);
});

test('request list and selected detail show the same Korean local time in 24-hour notation', async () => {
  const startedAt = new Date(2026, 9, 1, 20, 35, 5).getTime();
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 1, errors: 0, average_ms: 123, p95_ms: 123 },
    items: [
      {
        id: 1,
        project_id: 'sample',
        instance_id: 'prod',
        project_name: 'Sample',
        instance_name: 'Production',
        received_at: new Date(startedAt).toISOString(),
        payload: {
          started_at: startedAt,
          duration_ms: 123,
          method: 'GET',
          path: '/sample',
          status: 200,
        },
      },
    ],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const row = (await screen.findByRole('button', { name: 'GET /sample' })).closest('tr')!;
  const listTime = within(row).getByRole('cell', { name: '20:35:05' });
  expect(listTime).not.toHaveTextContent(/AM|PM|오전|오후/i);

  fireEvent.click(within(row).getByRole('button', { name: 'GET /sample' }));
  const modal = await screen.findByRole('dialog', { name: '요청 정보' });
  const modalTime = within(modal).getByText(/20:35:05/);
  expect(modalTime).not.toHaveTextContent(/AM|PM|오전|오후/i);
});

test('detailed XLog shows the observed earliest and latest returned request times, not query bounds', async () => {
  const times = [
    new Date(2026, 9, 1, 20, 35, 5).getTime(),
    new Date(2026, 9, 1, 19, 15, 0).getTime(),
    new Date(2026, 9, 1, 20, 50, 0).getTime(),
  ];
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 3, errors: 0, average_ms: 123, p95_ms: 123 },
    items: times.map((started_at, index) => ({
      id: index + 1,
      project_id: 'sample',
      instance_id: 'prod',
      project_name: 'Sample',
      instance_name: 'Production',
      received_at: new Date(started_at).toISOString(),
      payload: {
        started_at,
        duration_ms: 123,
        method: 'GET',
        path: `/sample-${index}`,
        status: 200,
      },
    })),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview detailed minutes={15} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const list = await screen.findByRole('region', { name: 'XLog 요청 목록' });
  const range = within(list).getByText(/표시된 요청 시각/);
  expect(range).toHaveTextContent(/19:15:00.*20:50:00/);
  expect(range).not.toHaveTextContent('20:35:05');
});

test('detailed XLog separates summary, scatter and request list with the requested range', async () => {
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
    items: [],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview project="sample" instance="prod" minutes={15} detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('region', { name: 'XLog 요청 요약' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'XLog 요청 응답시간 분포' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'XLog 요청 목록' })).toBeVisible();
  expect(screen.getByText(/최근 15분의 보관 중인 수집 데이터 기준/)).toBeVisible();
  expect(screen.queryByText(/표시된 요청 시각/)).not.toBeInTheDocument();
});

test('compact dashboard keeps the XLog region when collection is disabled', async () => {
  vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 0,
    eligible_instances: 0,
    connected_instances: 0,
    summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
    items: [],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview compact project="sample" instance="prod" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const region = await screen.findByRole('region', { name: 'XLog 그래프' });
  expect(region).toHaveTextContent('XLog 미사용입니다. 저장된 이력은 조회할 수 있습니다.');
  expect(within(region).queryByRole('img')).not.toBeInTheDocument();
});

test('disabled overview hides empty XLog without starting any collector command', async () => {
  const read = vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 0,
    eligible_instances: 0,
    connected_instances: 0,
    summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
    items: [],
  });
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

test('request list pages by 20 and stays within bounds when records shrink', async () => {
  const items = Array.from({ length: 45 }, (_, index) => ({
    id: 45 - index,
    project_id: 'sample',
    instance_id: 'prod',
    project_name: 'Sample',
    instance_name: 'Production',
    received_at: new Date().toISOString(),
    payload: {
      started_at: Date.now(),
      duration_ms: 123,
      method: 'GET',
      path: '/request-' + index,
      status: 200,
    },
  }));
  const data = {
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 45, errors: 0, average_ms: 123, p95_ms: 123 },
    items,
  };
  const read = vi.spyOn(DefaultService, 'getXlog').mockResolvedValue(data);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <XlogOverview project="sample" instance="prod" detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findByRole('button', { name: 'GET /request-0' });
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(20);
  expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  expect(screen.getByText('1 / 3 페이지')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(20);
  expect(screen.getByRole('button', { name: 'GET /request-20' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'GET /request-0' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(5);
  expect(screen.getByText('3 / 3 페이지')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }));
  expect(screen.getByRole('button', { name: 'GET /request-20' })).toBeInTheDocument();
  expect(read).toHaveBeenCalledTimes(1);

  act(() => {
    client.setQueryData(['xlog', 'sample', 'prod', 60, '', false, 0], {
      ...data,
      items: items.slice(0, 5),
    });
  });
  await waitFor(() => expect(screen.getByText('1 / 1 페이지')).toBeInTheDocument());
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(5);
  expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  expect(screen.getByRole('img', { name: 'XLog 요청 응답시간 분포 차트' })).toBeInTheDocument();
});
