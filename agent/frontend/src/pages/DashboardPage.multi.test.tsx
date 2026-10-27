import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { getDashboard } from '../api';
import { selectOption } from '../test-select';
import { ProjectScopeProvider, ProjectSelector } from '../components/ProjectScope';
import { ServiceMetric, Status } from '../generated';
vi.mock('../components/XlogOverview', () => ({ default: () => null }));

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
  getProjects: async () => ({ items: dashboard.projects }),
  getInstances: async (project: string) => ({
    items: state.empty
      ? []
      : (dashboard.projects.find((item) => item.project_id === project)?.instances ?? []),
  }),
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
  sessionStorage.clear();
  getResources.mockClear();
  vi.mocked(getDashboard).mockClear();
  state.failures.clear();
  state.stale = false;
  state.empty = false;
  state.many = false;
  state.balances = false;
});
afterEach(cleanup);
function view(url = '/') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]}>
        <ProjectScopeProvider>
          <ProjectSelector />
          <DashboardPage />
        </ProjectScopeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function ready(name = 'Alpha / Up') {
  const panel = await screen.findByRole('region', { name });
  await within(panel).findByTestId('chart-CPU');
  return panel;
}

test('initial dashboard selects one project and one instance without querying every server', async () => {
  state.many = true;
  view();
  const panel = await ready();
  expect(screen.getByLabelText('프로젝트 선택').closest('.ant-select')).toHaveTextContent('Alpha');
  expect(screen.getByLabelText('인스턴스 선택').closest('.ant-select')).toHaveTextContent('Up');
  expect(getResources).toHaveBeenCalledTimes(1);
  expect(getResources).toHaveBeenCalledWith('alpha', 'up', '15m');
  expect(
    vi.mocked(getDashboard).mock.calls.every((args) => args[1] === 'alpha' && args[2] === 'up'),
  ).toBe(true);
  expect(screen.queryByRole('region', { name: '전체 프로젝트 자원 추이' })).toBeNull();
  for (const title of ['CPU', 'RAM', 'JVM Heap', '디스크']) {
    const series = JSON.parse(within(panel).getByTestId('chart-' + title).textContent!);
    expect(series).toHaveLength(title === '디스크' ? 2 : 1);
  }
});

test('dashboard displays operational summaries in official Ant Design cards without changing links', async () => {
  view();
  await ready();
  expect(screen.getByText('조회 기간', { selector: 'label' })).toBeVisible();
  expect(screen.getByText('최근 수집 데이터 기준')).toBeVisible();
  const summary = screen.getByLabelText('선택 인스턴스 요약');
  expect(summary.querySelectorAll('.ant-card')).toHaveLength(4);
  expect(summary.querySelectorAll('.ant-statistic')).toHaveLength(3);
  expect(within(summary).getByRole('link', { name: '실패 API 0개 목록' })).toHaveAttribute(
    'href',
    '/api-monitoring?project=alpha&instance=up&status=DOWN&usage=used',
  );
});

test('dropdown search selects another project then its first instance and clears the previous target', async () => {
  view();
  await ready();
  const projectPicker = screen.getByRole('combobox', { name: '프로젝트 선택' });
  fireEvent.mouseDown(projectPicker);
  fireEvent.change(projectPicker, {
    target: { value: 'beta' },
  });
  expect(screen.queryByRole('option', { name: 'Alpha' })).toBeNull();
  fireEvent.click(
    (await screen.findByText('Beta', { selector: '.ant-select-item-option-content' })).closest(
      '.ant-select-item-option',
    )!,
  );
  await ready('Beta / Warn');
  expect(getResources).toHaveBeenCalledWith('beta', 'warn', '15m');
  expect(screen.queryByRole('region', { name: 'Alpha / Up' })).toBeNull();
});

test('instance dropdown searches its ID and changes only the selected instance', async () => {
  view();
  await ready();
  getResources.mockClear();
  expect(screen.getByText('인스턴스', { selector: 'label' })).toBeVisible();
  const picker = screen.getByRole('combobox', { name: '인스턴스 선택' });
  expect(picker.closest('.ant-select')).toBeInTheDocument();
  fireEvent.mouseDown(picker);
  fireEvent.change(picker, {
    target: { value: 'extra-4' },
  });
  fireEvent.click(
    (await screen.findByText('Extra 4', { selector: '.ant-select-item-option-content' })).closest(
      '.ant-select-item-option',
    )!,
  );
  await ready('Alpha / Extra 4');
  expect(getResources).toHaveBeenCalledTimes(1);
  expect(getResources).toHaveBeenCalledWith('alpha', 'extra-4', '15m');
});

test('explicit instance and period survive initial entry and period changes stay scoped', async () => {
  view('/?project=beta&instance=warn&period=30d');
  await ready('Beta / Warn');
  expect(getResources).toHaveBeenCalledWith('beta', 'warn', '30d');
  getResources.mockClear();
  await selectOption(screen.getByLabelText('관제 조회 기간'), '1년');
  expect(screen.getByLabelText('관제 조회 기간').closest('.ant-select')).toHaveTextContent('1년');
  await waitFor(() => expect(getResources).toHaveBeenCalledWith('beta', 'warn', '365d'));
  expect(getResources).toHaveBeenCalledTimes(1);
});

test('only selected instance service balance is shown with its exact API link', async () => {
  state.balances = true;
  view();
  await ready();
  const panel = screen.getByRole('region', { name: '선택 프로젝트 서비스 정보' });
  expect(within(panel).getByText('잔액').closest('div')).toHaveTextContent('500P');
  expect(within(panel).getByRole('link')).toHaveAttribute(
    'href',
    '/api-monitoring?project=alpha&instance=up&check=popbill',
  );
  expect(screen.queryByText('다른 업체')).toBeNull();
});

test('zero usage, per-sample capacities and separate disk volumes remain accurate', async () => {
  view();
  const panel = await ready();
  const read = (title: string) =>
    JSON.parse(within(panel).getByTestId('chart-' + title).textContent!);
  expect(read('CPU')[0].points.map((point: { value: unknown }) => point.value)).toEqual([0, 0.2]);
  expect(read('RAM')[0].points.map((point: { value: unknown }) => point.value)).toEqual([
    0.5,
    null,
  ]);
  expect(read('JVM Heap')[0].points.map((point: { value: unknown }) => point.value)).toEqual([
    0.25,
    null,
  ]);
  expect(read('디스크')).toHaveLength(2);
});

test('selected instance errors do not fetch a different server or plot false zero values', async () => {
  state.failures.add('up');
  view();
  expect(await screen.findByText('인스턴스 자원을 불러오지 못했습니다.')).toBeVisible();
  expect(getResources).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('chart-CPU')).toBeNull();
});

test('project without instances does not invent a target or request resource history', async () => {
  state.empty = true;
  view();
  await waitFor(() =>
    expect(screen.getByLabelText('프로젝트 선택').closest('.ant-select')).toHaveTextContent(
      'Alpha',
    ),
  );
  expect(await screen.findByText('프로젝트와 인스턴스를 선택하세요.')).toBeVisible();
  expect(getResources).not.toHaveBeenCalled();
  expect(getDashboard).not.toHaveBeenCalled();
});

test('short live ranges request only the selected server and can return to historical ranges', async () => {
  view('/?project=beta&instance=warn&period=5m');
  await ready('Beta / Warn');
  expect(getResources).toHaveBeenCalledWith('beta', 'warn', '5m');
  await selectOption(screen.getByLabelText('관제 조회 기간'), '최근 1시간');
  await waitFor(() => expect(getResources).toHaveBeenCalledWith('beta', 'warn', '1h'));
  await selectOption(screen.getByLabelText('관제 조회 기간'), '하루');
  await waitFor(() => expect(getResources).toHaveBeenCalledWith('beta', 'warn', '24h'));
});
