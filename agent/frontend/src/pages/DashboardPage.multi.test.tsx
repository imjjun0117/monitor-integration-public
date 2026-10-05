import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { getDashboard } from '../api';
import { selectOption } from '../test-select';
import { ServiceMetric, Status } from '../generated';

function metric(key: string, label: string, value: number | null, unit: string): ServiceMetric {
  return {
    key,
    label,
    value,
    unit,
    kind: ServiceMetric.kind.NUMBER,
    direction: ServiceMetric.direction.LOW,
    status: value == null ? Status.UNKNOWN : Status.UP,
    warning: null,
    critical: null,
  };
}

const GB = 1024 ** 3;
const state = vi.hoisted(() => ({
  failures: new Set<string>(),
  stale: false,
  empty: false,
  many: false,
  balances: false,
}));
const getResources = vi.fn(async (_projectId: string, instanceId: string, _period: string) => {
  if (state.failures.has(instanceId)) {
    throw new Error('unavailable');
  }
  return {
    latest: {
      system_cpu_ratio: 0.2,
      physical_memory_used_bytes: 12 * GB,
      physical_memory_total_bytes: 16 * GB,
      heap_used_bytes: GB,
      heap_max_bytes: 4 * GB,
      central_received_at: '2026-09-09T01:00:00Z',
    },
    history: [
      {
        sampled_at: '2026-09-09T00:00:00Z',
        system_cpu_ratio: 0,
        physical_memory_used_bytes: 8 * GB,
        physical_memory_total_bytes: 16 * GB,
        heap_used_bytes: 2 * GB,
        heap_max_bytes: 8 * GB,
      },
      {
        sampled_at: '2026-09-09T01:00:00Z',
        system_cpu_ratio: 0.2,
        physical_memory_used_bytes: 12 * GB,
        physical_memory_total_bytes: null,
        heap_used_bytes: GB,
        heap_max_bytes: 0,
      },
    ],
    disks: [
      { path_id: 'data', path_display: 'D:/data', used_bytes: 50 * GB, total_bytes: 100 * GB },
      { path_id: 'logs', path_display: 'E:/logs', used_bytes: 5 * GB, total_bytes: 10 * GB },
    ],
    disk_history: [
      {
        sampled_at: '2026-09-09T00:00:00Z',
        path_id: 'data',
        used_bytes: 50 * GB,
        total_bytes: 100 * GB,
      },
      {
        sampled_at: '2026-09-09T00:00:00Z',
        path_id: 'logs',
        used_bytes: 5 * GB,
        total_bytes: 10 * GB,
      },
      {
        sampled_at: '2026-09-09T01:00:00Z',
        path_id: 'logs',
        used_bytes: 6 * GB,
        total_bytes: null,
      },
    ],
    stale: state.stale,
  };
});
const dashboard = {
  get service_balances() {
    return state.balances
      ? [
          {
            project_id: 'alpha',
            instance_id: 'up',
            check_id: 'popbill',
            name: '팝빌',
            category: 'API',
            direction: 'EXTERNAL',
            status: 'UP',
            history: [],
            checked_at: '2026-10-03T12:00:00Z',
            service_info: {
              title: '팝빌',
              dashboard: true,
              status: Status.UP,
              collected: 3,
              metrics: [
                metric('balance', '잔액', 500, 'P'),
                metric('charged', '최근 충전', 50000, 'P'),
                metric('sms', '문자 잔여량', 25, '건'),
              ],
            },
          },
          {
            project_id: 'beta',
            instance_id: 'warn',
            check_id: 'other-vendor',
            name: '다른 업체',
            category: 'API',
            direction: 'EXTERNAL',
            status: 'UNKNOWN',
            history: [],
            service_info: {
              title: '다른 업체',
              dashboard: true,
              status: Status.UNKNOWN,
              collected: 0,
              metrics: [metric('remaining', '잔여 건수', null, '건')],
            },
          },
        ]
      : [];
  },
  projects: [
    {
      project_id: 'alpha',
      display_name: 'Alpha',
      status: 'DOWN',
      instances: [
        {
          project_id: 'alpha',
          instance_id: 'up',
          display_name: 'Up',
          status: 'UP',
          host_name: 'host-up',
          last_seen_at: '2026-09-09T00:00:00Z',
        },
        {
          project_id: 'alpha',
          instance_id: 'down',
          display_name: 'Down',
          status: 'DOWN',
          last_seen_at: '2026-09-09T00:00:00Z',
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          project_id: 'alpha',
          instance_id: `extra-${i}`,
          display_name: `Extra ${i}`,
          status: 'UP',
          last_seen_at: null,
        })),
      ],
    },
    {
      project_id: 'beta',
      display_name: 'Beta',
      status: 'WARN',
      instances: [
        {
          project_id: 'beta',
          instance_id: 'warn',
          display_name: 'Warn',
          status: 'WARN',
          last_seen_at: null,
        },
      ],
    },
  ],
  failed_api_count: 0,
  expiring_certificate_count: 0,
  status_causes: [],
  history: { resources: [], api: [] },
};
vi.mock('../api', () => ({
  getDashboard: vi.fn(async () =>
    state.empty
      ? {
          ...dashboard,
          projects: [{ ...dashboard.projects[0], instances: [] }],
        }
      : state.many
        ? {
            ...dashboard,
            projects: [
              ...dashboard.projects,
              ...Array.from({ length: 98 }, (_, index) => ({
                project_id: `project-${index}`,
                display_name: `Project ${index}`,
                status: 'UP',
                instances: [
                  {
                    project_id: `project-${index}`,
                    instance_id: `server-${index}`,
                    display_name: `Server ${index}`,
                    status: 'UP',
                    last_seen_at: null,
                  },
                ],
              })),
            ],
          }
        : dashboard,
  ),
  getResources: (...args: unknown[]) => getResources(...(args as [string, string, string])),
}));
vi.mock('../components/MetricChart', () => ({
  metricSeriesStyle: (index: number) => ({
    color: `#00000${index}`,
    borderStyle: ['solid', 'dashed', 'dotted'][index % 3],
  }),
  default: ({
    title,
    series,
  }: {
    title: string;
    series: Array<{ name: string; styleIndex: number; points: object[] }>;
  }) => <div data-testid={`chart-${title}`}>{JSON.stringify(series)}</div>,
}));

beforeEach(() => {
  getResources.mockClear();
  state.failures.clear();
  state.stale = false;
  state.empty = false;
  state.many = false;
  state.balances = false;
});
afterEach(cleanup);
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
async function readyProject(name: string) {
  if (!screen.queryByRole('region', { name })) {
    fireEvent.click(await screen.findByRole('button', { name: name + ' 자원 보기' }));
  }
  const project = await screen.findByRole('region', { name });
  await waitFor(() =>
    expect(within(project).getByTestId('chart-시스템 CPU')).toHaveTextContent('"value":0'),
  );
  return project;
}

test('default overview compares all projects without auto-selecting a server or requesting instance history', async () => {
  state.many = true;
  view();
  const overview = await screen.findByRole('region', { name: '전체 프로젝트 자원 추이' });
  expect(screen.queryByRole('region', { name: 'Alpha' })).toBeNull();
  expect(getResources).not.toHaveBeenCalled();
  for (const title of ['CPU', 'RAM', 'JVM Heap', '디스크']) {
    expect(JSON.parse(within(overview).getByTestId('chart-' + title).textContent!)).toHaveLength(
      100,
    );
  }
  const alpha = await readyProject('Alpha');
  expect(alpha).toBeInTheDocument();
  expect(getResources).toHaveBeenCalledTimes(7);
  fireEvent.click(screen.getByRole('button', { name: '전체 프로젝트 보기' }));
  expect(screen.queryByRole('region', { name: 'Alpha' })).toBeNull();
  expect(screen.getByRole('region', { name: '전체 프로젝트 자원 추이' })).toBeInTheDocument();
});

test('overview shows different vendors from multiple projects together before selecting a detail', async () => {
  state.balances = true;
  view();
  const table = await screen.findByRole('table', { name: '전체 프로젝트 외부 서비스 정보' });
  expect(within(table).getByRole('link', { name: 'alpha 팝빌 상세' })).toHaveAttribute(
    'href',
    '/api-monitoring?project=alpha&instance=up&check=popbill',
  );
  expect(within(table).getByRole('link', { name: 'beta 다른 업체 상세' })).toHaveAttribute(
    'href',
    '/api-monitoring?project=beta&instance=warn&check=other-vendor',
  );
  expect(within(table).getByText('500 P')).toBeVisible();
  expect(within(table).getByText('미수집')).toBeVisible();
  expect(getResources).not.toHaveBeenCalled();
});

test('shows every project in overview but fetches history only for the selected project', async () => {
  view();
  const alpha = await readyProject('Alpha');
  expect(screen.getByRole('button', { name: 'Beta 자원 보기' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Beta' })).not.toBeInTheDocument();
  expect(getResources).toHaveBeenCalledTimes(7);
  expect(within(alpha).getByRole('list', { name: 'Alpha 인스턴스 현황' }).children).toHaveLength(7);
  for (const title of ['시스템 CPU', 'RAM 사용률', 'JVM Heap 사용률', '디스크 사용률']) {
    const series = JSON.parse(within(alpha).getByTestId(`chart-${title}`).textContent!);
    expect(series).toHaveLength(title === '디스크 사용률' ? 14 : 7);
    expect(series.some((item: { name: string }) => item.name.startsWith('Extra 4'))).toBe(true);
  }
  expect(getResources).not.toHaveBeenCalledWith('beta', 'warn', '24h');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText(/최대 6개/)).not.toBeInTheDocument();
  expect(within(alpha).getByRole('link', { name: 'Down' })).toHaveAttribute(
    'href',
    '/projects/alpha/instances/down',
  );
});

test('selected project shows balances immediately and links to the exact API details', async () => {
  state.balances = true;
  view();
  await readyProject('Alpha');
  const panel = screen.getByRole('region', { name: '선택 프로젝트 서비스 정보' });
  expect(within(panel).getByText('잔액').closest('div')).toHaveTextContent('500P');
  expect(within(panel).getByText('최근 충전').closest('div')).toHaveTextContent('50,000P');
  expect(within(panel).getByText('문자 잔여량').closest('div')).toHaveTextContent('25건');
  expect(within(panel).getByRole('link')).toHaveAttribute(
    'href',
    '/api-monitoring?project=alpha&instance=up&check=popbill',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Beta 자원 보기' }));
  await readyProject('Beta');
  expect(within(panel).queryByText('잔액')).toBeNull();
  expect(within(panel).getByText('잔여 건수').closest('div')).toHaveTextContent('미수집');
  expect(within(panel).getByRole('link')).toHaveAttribute(
    'href',
    '/api-monitoring?project=beta&instance=warn&check=other-vendor',
  );
  expect(within(panel).queryByText('0')).toBeNull();
});

test('selects another project and changes the period without polling hidden project history', async () => {
  view();
  await readyProject('Alpha');
  fireEvent.click(screen.getByRole('button', { name: 'Beta 자원 보기' }));
  await readyProject('Beta');
  expect(screen.queryByRole('region', { name: 'Alpha' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Beta' })).toBeInTheDocument();
  getResources.mockClear();
  await selectOption(screen.getByLabelText('관제 조회 기간'), '일주일');
  await waitFor(() => expect(getResources).toHaveBeenCalledWith('beta', 'warn', '7d'));
  expect(getResources).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Alpha 자원 보기' }));
  await readyProject('Alpha');
  expect(getResources).toHaveBeenCalledWith('alpha', 'extra-4', '7d');
});

test('uses each sample capacity, preserves zero and unknown values, and separates disk volumes', async () => {
  view();
  const alpha = await readyProject('Alpha');
  const read = (title: string) =>
    JSON.parse(within(alpha).getByTestId(`chart-${title}`).textContent!);
  expect(
    read('시스템 CPU')[0].points.map((point: { value: number | null }) => point.value),
  ).toEqual([0, 0.2]);
  expect(
    read('RAM 사용률')[0].points.map((point: { value: number | null }) => point.value),
  ).toEqual([0.5, null]);
  expect(
    read('JVM Heap 사용률')[0].points.map((point: { value: number | null }) => point.value),
  ).toEqual([0.25, null]);
  const disks = read('디스크 사용률');
  expect(disks[0].name).toContain('D:/data');
  expect(disks[1].name).toContain('E:/logs');
  expect(disks[0].styleIndex).not.toBe(disks[1].styleIndex);
  expect(disks[0].points.map((point: { value: number | null }) => point.value)).toEqual([0.5]);
  expect(disks[1].points.map((point: { value: number | null }) => point.value)).toEqual([
    0.5,
    null,
  ]);
  const up = within(alpha).getByRole('link', { name: 'Up' }).closest('li')!;
  expect(up).toHaveTextContent('12 GB / 16 GB');
  expect(up).toHaveTextContent('1 GB / 4 GB');
  expect(up).toHaveTextContent('50 GB / 100 GB');
});

test('one failed instance does not hide other instances and stale data is clearly marked', async () => {
  state.failures.add('down');
  state.stale = true;
  view();
  const alpha = await readyProject('Alpha');
  const down = within(alpha).getByRole('link', { name: 'Down' }).closest('li')!;
  await waitFor(() => expect(down).toHaveTextContent('자원 조회 실패'));
  expect(down.querySelector('meter')).toBeNull();
  const up = within(alpha).getByRole('link', { name: 'Up' }).closest('li')!;
  expect(up).toHaveTextContent('마지막 정상 데이터');
  expect(up.querySelector('time')).toHaveAttribute('dateTime', '2026-09-09T01:00:00Z');
  const series = JSON.parse(within(alpha).getByTestId('chart-시스템 CPU').textContent!);
  expect(series).toHaveLength(7);
  expect(series.find((item: { name: string }) => item.name === 'Down (down)').points).toEqual([]);
});

test('shows a useful resource error when every instance fails instead of plotting zeros', async () => {
  for (const project of dashboard.projects) {
    for (const instance of project.instances) {
      state.failures.add(instance.instance_id);
    }
  }
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'Alpha 자원 보기' }));
  await waitFor(() =>
    expect(screen.getAllByText('프로젝트 자원을 불러오지 못했습니다.')).toHaveLength(1),
  );
  expect(screen.queryByTestId('chart-시스템 CPU')).not.toBeInTheDocument();
  expect(screen.queryByRole('meter')).not.toBeInTheDocument();
});

test('keeps a project with no instances visible without requesting invented targets', async () => {
  state.empty = true;
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'Alpha 자원 보기' }));
  expect(await screen.findByText('등록된 인스턴스가 없습니다.')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Alpha' })).toBeInTheDocument();
  expect(getResources).not.toHaveBeenCalled();
});

test('one hundred projects keep only one detail panel and do not trigger one hundred history requests', async () => {
  state.many = true;
  view();
  await readyProject('Alpha');
  expect(
    screen
      .getByRole('table', { name: '프로젝트 상태와 자원 사용률 비교' })
      .querySelectorAll('tbody tr'),
  ).toHaveLength(20);
  expect(screen.getAllByTestId('chart-시스템 CPU')).toHaveLength(1);
  expect(getResources).toHaveBeenCalledTimes(7);
  fireEvent.change(screen.getByLabelText('프로젝트 검색'), { target: { value: 'project-97' } });
  const target = await screen.findByRole('button', { name: 'Project 97 자원 보기' });
  expect(getResources).toHaveBeenCalledTimes(7);
  fireEvent.click(target);
  await readyProject('Project 97');
  expect(getResources).toHaveBeenCalledTimes(8);
  expect(getResources).toHaveBeenLastCalledWith('project-97', 'server-97', '24h');
  expect(screen.queryByRole('region', { name: 'Alpha' })).not.toBeInTheDocument();
});

test('main chart requests the selected month and year ranges', async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByLabelText('차트 조회 기간');
  await selectOption(screen.getByLabelText('차트 조회 기간'), '한 달');
  await waitFor(() => expect(getDashboard).toHaveBeenCalledWith('30d'));
  await selectOption(await screen.findByLabelText('차트 조회 기간'), '1년');
  await waitFor(() => expect(getDashboard).toHaveBeenCalledWith('365d'));
});
