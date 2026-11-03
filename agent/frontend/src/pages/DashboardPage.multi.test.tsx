import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { getDashboard, getIncidents } from '../api';
import { PermissionContext } from '../components/PermissionContext';
import type { ManagedMenu } from '../generated';
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
  queue: false,
  malformedQueue: false,
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
const getDbPools = vi.fn(async (_project: string, _instance: string, _period: string) => ({
  items: [{ pool_id: 'main', name: 'Main', active: 3, max_size: 10, idle: null, waiters: 2 }],
  history: [],
  stale: false,
}));
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
  getDbPools: (...args: unknown[]) => getDbPools(...(args as [string, string, string])),
  getIncidents: vi.fn(async () => {
    if (state.malformedQueue) {
      return { page: 0, size: 50, total: 0 };
    }
    return {
      items: state.queue
        ? [
            {
              incident_id: 17,
              project_id: 'alpha',
              instance_id: 'up',
              state: 'IN_PROGRESS',
              assignee: 'operator',
              kind: 'METRIC',
              subject_name: 'JVM Heap',
              latest_observation: {
                status: 'WARN',
                metric_key: 'JVM_HEAP',
                value: 0.8,
                warning_value: 0.75,
              },
              opened_at: '2026-09-09T00:00:00Z',
            },
          ]
        : [],
      total: state.queue ? 101 : 0,
      page: 0,
      size: 50,
    };
  }),
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
  getDbPools.mockClear();
  vi.mocked(getDashboard).mockClear();
  vi.mocked(getIncidents).mockClear();
  state.failures.clear();
  state.stale = false;
  state.empty = false;
  state.many = false;
  state.balances = false;
  state.queue = false;
  state.malformedQueue = false;
});
afterEach(cleanup);
function view(url = '/', permissions?: { isAdmin: boolean; menus: ManagedMenu[] }) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]}>
        <PermissionContext.Provider
          value={{
            role: permissions?.isAdmin ? 'ADMIN' : 'OPERATOR',
            username: 'tester',
            isAdmin: permissions?.isAdmin ?? true,
            canWrite: false,
            menus: permissions?.menus,
          }}
        >
          <ProjectScopeProvider>
            <ProjectSelector />
            <DashboardPage />
          </ProjectScopeProvider>
        </PermissionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function menu(menuId: string, canRead: boolean): ManagedMenu {
  return {
    menuId,
    label: menuId,
    route: `/${menuId}`,
    sortOrder: 0,
    enabled: true,
    canRead,
    canWrite: false,
  };
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

test('dashboard shows selected pool operations without replacing missing idle with zero', async () => {
  view();
  await ready();
  const pools = await screen.findByRole('region', { name: 'DB 연결 풀' });
  expect(getDbPools).toHaveBeenCalledWith('alpha', 'up', '15m');
  expect(within(pools).getByText('Main')).toBeVisible();
  expect(within(pools).getByText('3 / 10')).toBeVisible();
  expect(within(pools).getByText('미수집')).toBeVisible();
  expect(within(pools).getByText('2')).toBeVisible();
});

test('resource request failure without cached observations never claims last good data', async () => {
  state.failures.add('up');
  view();
  const panel = await screen.findByRole('region', { name: 'Alpha / Up' });
  expect(await within(panel).findByText('인스턴스 자원을 불러오지 못했습니다.')).toBeVisible();
  expect(
    within(panel).queryByText('마지막 정상 자원 데이터를 표시합니다.'),
  ).not.toBeInTheDocument();
});

test('dashboard queue shows incident handling separately from collection and limits page counts', async () => {
  state.queue = true;
  view();
  await ready();
  const queue = await screen.findByRole('region', { name: '지금 처리할 장애' });
  expect(getIncidents).toHaveBeenCalledWith('alpha', 'ACTIVE', 0);
  expect(within(queue).getByText('조치 중')).toBeVisible();
  expect(within(queue).getByText('operator')).toBeVisible();
  expect(within(queue).getByRole('link', { name: /JVM Heap/ })).toHaveAttribute(
    'href',
    '/incidents/17?project=alpha',
  );
  expect(within(queue).getByText(/첫 페이지에서 선택 인스턴스 1건/)).toBeVisible();
  expect(within(queue).queryByText('101건')).not.toBeInTheDocument();
  expect(screen.getByText('수집 상태')).toBeVisible();
});

test('dashboard-only operator sees permission states without denied incident or project requests and links', async () => {
  view('/', {
    isAdmin: false,
    menus: [menu('dashboard', true), menu('incidents', false), menu('projects', false)],
  });
  const summary = await screen.findByLabelText('선택 인스턴스 요약');
  expect(summary.querySelectorAll(':scope > .ant-card')).toHaveLength(2);
  expect(screen.getByRole('region', { name: '지금 처리할 장애' })).toHaveTextContent(
    '장애 목록 조회 권한이 없습니다.',
  );
  expect(screen.getByRole('region', { name: 'DB 연결 풀' })).toHaveTextContent(
    'DB 연결 풀 조회 권한이 없습니다.',
  );
  expect(screen.getByRole('region', { name: 'Alpha / Up' })).toHaveTextContent(
    '인스턴스 자원 조회 권한이 없습니다.',
  );
  expect(screen.queryByRole('link', { name: '장애 관리대장 →' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /인스턴스 상세/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '풀 상세 →' })).not.toBeInTheDocument();
  expect(getIncidents).not.toHaveBeenCalled();
  expect(getDbPools).not.toHaveBeenCalled();
  expect(getResources).not.toHaveBeenCalled();
});

test.each([
  ['allowed operator', false, true],
  ['admin override', true, false],
])('%s retains incident, DB pool, and resource data', async (_, isAdmin, canRead) => {
  state.queue = true;
  view('/', {
    isAdmin,
    menus: [menu('dashboard', true), menu('incidents', canRead), menu('projects', canRead)],
  });
  await ready();
  expect(await screen.findByText('Main')).toBeVisible();
  expect(screen.getByRole('link', { name: '장애 관리대장 →' })).toBeVisible();
  expect(screen.getByRole('link', { name: /JVM Heap/ })).toBeVisible();
  expect(getIncidents).toHaveBeenCalledWith('alpha', 'ACTIVE', 0);
  expect(getDbPools).toHaveBeenCalledWith('alpha', 'up', '15m');
  expect(getResources).toHaveBeenCalledWith('alpha', 'up', '15m');
});

test('dashboard queue reports malformed incident pages without crashing or claiming zero incidents', async () => {
  state.malformedQueue = true;
  view();
  await ready();
  const queue = await screen.findByRole('region', { name: '지금 처리할 장애' });
  expect(await within(queue).findByText('장애 목록을 불러오지 못했습니다.')).toBeVisible();
  expect(within(queue).queryByText(/첫 페이지에서 선택 인스턴스 0건/)).not.toBeInTheDocument();
});

test('dashboard displays operational summaries in official Ant Design cards without changing links', async () => {
  view();
  await ready();
  const period = screen.getByRole('combobox', { name: '관제 조회 기간' });
  const periodLabel = document.querySelector('label[for="dashboard-period"]');
  const periodHelp = screen.getByText('최근 수집 데이터 기준');
  expect(periodLabel).toBeVisible();
  expect(periodLabel).toHaveTextContent('조회 기간');
  expect(periodLabel).toContainElement(periodHelp);
  expect(periodHelp).toBeVisible();
  expect(period).toHaveAccessibleDescription('최근 수집 데이터 기준');
  const summary = screen.getByLabelText('선택 인스턴스 요약');
  expect(summary.querySelectorAll(':scope > .ant-card')).toHaveLength(2);
  expect(summary.querySelectorAll('.ant-statistic')).toHaveLength(3);
  expect(within(summary).getByRole('link', { name: '실패 API 0개 목록' })).toHaveAttribute(
    'href',
    '/api-monitoring?project=alpha&instance=up&status=DOWN&usage=used',
  );
});

test('dashboard scope explains how to act on the selected instance', async () => {
  view();
  await ready();
  expect(
    screen.getByText('선택한 인스턴스의 상태를 확인하고 이상 근거에서 바로 조치로 이동합니다.'),
  ).toBeVisible();
});

test('dashboard keeps three scoped filter fields in one toolbar', async () => {
  view();
  await ready();
  const toolbar = screen.getByRole('form', { name: '대시보드 조회 범위' });
  expect(within(toolbar).getByRole('combobox', { name: '대시보드 프로젝트 필터' })).toBeVisible();
  expect(within(toolbar).getByRole('combobox', { name: '인스턴스 선택' })).toBeVisible();
  expect(within(toolbar).getByRole('combobox', { name: '관제 조회 기간' })).toBeVisible();
});

test('priority and monitoring cards follow the dashboard reading order', async () => {
  view();
  const panel = await ready();
  const priority = screen.getByRole('region', { name: '지금 처리할 장애' });
  const summary = screen.getByLabelText('선택 인스턴스 요약');
  const pool = await screen.findByRole('region', { name: 'DB 연결 풀' });
  const issues = screen.getByRole('region', { name: '상태 이상 목록' });
  expect(priority.closest('.dashboard-priority-grid')).toContainElement(summary);
  expect(summary).toHaveTextContent('외부 서비스 정보');
  expect(priority.compareDocumentPosition(pool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(panel).toContainElement(pool);
  expect(panel.compareDocumentPosition(issues) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    within(panel).getByTestId('chart-CPU').closest('.dashboard-resource-grid'),
  ).toContainElement(within(panel).getByTestId('chart-디스크'));
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
