import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ConfigProvider } from 'antd';
import App from './App';
import { selectOption } from './test-select';
// Canvas는 실제 브라우저에서 검증. 여기서는 화면 이동과 입력 동작 검증
vi.mock('./components/chartEngine', () => ({
  createMetricChart: () => ({ on: vi.fn(), dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }),
}));

import settingsPageSource from './pages/SettingsPage.tsx?raw';

const requests: string[] = [];
const methods: string[] = [];
const bodies: unknown[] = [];
let connectionFailureCode: string | undefined;
let websocketState = 'IDLE';

beforeEach(() => {
  sessionStorage.clear();
  requests.length = 0;
  methods.length = 0;
  bodies.length = 0;
  connectionFailureCode = undefined;
  websocketState = 'IDLE';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      methods.push(init?.method ?? 'GET');
      if (init?.body) {
        bodies.push(JSON.parse(String(init.body)));
      }
      if (url.endsWith('/session/me')) {
        return response({ username: 'admin', role: 'ADMIN' });
      }
      if (url.endsWith('/connection/start')) {
        websocketState = 'CONNECTED';
        return response({ state: websocketState, mode: 'WSS', dropped: 0 });
      }
      if (url.endsWith('/connection/stop')) {
        websocketState = 'CLOSED';
        return response({ state: websocketState, mode: 'WSS', dropped: 0 });
      }
      if (url.endsWith('/connection')) {
        return response({ state: websocketState, mode: 'WSS', dropped: 0 });
      }
      if (url.endsWith('/xlog-settings')) {
        return response({ enabled: false });
      }
      if (url.includes('/api/v1/xlog')) {
        return response({
          items: [],
          enabled_projects: 0,
          summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
        });
      }
      if (url.endsWith('/projects/sample-a/instances/live-01/test')) {
        if (connectionFailureCode !== undefined) {
          return {
            ok: false,
            status: 502,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () =>
              connectionFailureCode
                ? { code: connectionFailureCode, message: 'secret stack token=abc' }
                : {},
          } as Response;
        }
        return response({ status: 'UP' });
      }
      if (url.includes('/projects/sample-a/instances/live-01/resources')) {
        return response({
          stale: false,
          latest: {
            pid: 42,
            jvm_start_time: '2026-09-03T00:00:00Z',
            uptime_ms: 3_600_000,
            system_cpu_ratio: 0.2,
            physical_memory_used_bytes: 256_000_000,
            physical_memory_total_bytes: 1_024_000_000,
            process_cpu_ratio: 0.1,
            heap_used_bytes: 32_000_000,
            heap_max_bytes: 128_000_000,
            non_heap_used_bytes: 16_000_000,
            thread_live_count: 8,
            thread_peak_count: 12,
            gc_count: 2,
            gc_time_ms: 15,
          },
          disks: [
            {
              path_id: 'data',
              path_display: 'data',
              used_bytes: 100_000_000,
              total_bytes: 1_000_000_000,
              status: 'UP',
            },
            {
              path_id: 'application',
              path_display: '웹앱 저장 볼륨',
              used_bytes: 100_000_000,
              total_bytes: 1_000_000_000,
              status: 'UP',
            },
            {
              path_id: 'attachments',
              path_display: '첨부파일 저장 볼륨',
              used_bytes: 100_000_000,
              total_bytes: 1_000_000_000,
              status: 'UP',
            },
          ],
          history: [
            {
              sampled_at: '2026-09-03T01:00:00Z',
              system_cpu_ratio: 0.2,
              physical_memory_used_bytes: 256_000_000,
              heap_used_bytes: 32_000_000,
            },
          ],
          disk_history: [
            { sampled_at: '2026-09-03T01:00:00Z', path_id: 'data', used_bytes: 100_000_000 },
          ],
        });
      }
      if (url.includes('/projects/sample-a/instances/live-01/internal-checks')) {
        const ran = requests.some(
          (request, index) =>
            request.endsWith('/api-checks/sample-a/live-01/data-path/run') &&
            methods[index] === 'POST',
        );
        return response({
          items: [
            {
              check_id: 'data-path',
              name: '데이터 경로',
              category: 'INTERNAL',
              project_id: 'sample-a',
              instance_id: 'live-01',
              status: ran ? 'UP' : 'UNKNOWN',
              checked_at: ran ? '2026-10-03T09:00:00Z' : null,
            },
          ],
        });
      }
      if (url.endsWith('/api-checks/sample-a/live-01/data-path/run')) {
        return response({ status: 'ACCEPTED' });
      }
      if (url.endsWith('/projects/sample-a/instances/live-01/thresholds')) {
        return response({
          projectName: 'Sample A',
          instanceName: 'Live Agent',
          recipientEmails: [],
          metrics: [],
          ...(init?.body ? JSON.parse(String(init.body)) : {}),
        });
      }
      if (url.includes('/projects/sample-a/instances')) {
        return response({
          items: [
            {
              project_id: 'sample-a',
              instance_id: 'live-01',
              display_name: 'Live Agent',
              environment: 'test',
              host_name: 'agent-host',
              agent_base_url: 'http://127.0.0.1:18081',
              api_checks_enabled: true,
              poll_interval_seconds: 15,
              enabled: true,
              status: 'UP',
              system_cpu_ratio: 0.2,
              heap_ratio: 0.3,
              db_pool: '1/10',
              internal_checks: '1/1',
              last_seen_at: '2026-09-03T01:30:00Z',
            },
          ],
          page: 0,
          size: 50,
          total: 1,
        });
      }
      if (url.includes('/api-checks')) {
        return response({
          items: [
            {
              project_id: 'sample-a',
              instance_id: 'live-01',
              check_id: 'partner-api',
              name: 'Partner API',
              category: 'API',
              direction: 'EXTERNAL',
              status: 'UP',
              duration_ms: 12,
              result_code: '200',
              message: 'ok',
              checked_at: '2026-09-03T01:30:00Z',
              history: [],
            },
          ],
          page: 0,
          size: 50,
          total: 1,
        });
      }
      if (url.includes('/certificates')) {
        return response({
          items: [
            {
              certificate_target_id: 41,
              project_id: 'sample-a',
              hostname: 'old.example',
              port: 443,
              sni_hostname: 'old.example',
              check_interval_minutes: 360,
              enabled: true,
              status: null,
            },
          ],
          page: 0,
          size: 200,
          total: 1,
        });
      }
      if (url.includes('/settings/thresholds')) {
        if (init?.body) {
          return response(JSON.parse(String(init.body)));
        }
        return response([
          {
            scope: 'GLOBAL',
            projectId: null,
            instanceId: null,
            metricKey: 'SYSTEM_CPU',
            warningValue: 0.8,
            criticalValue: 0.9,
          },
          {
            scope: 'GLOBAL',
            projectId: null,
            instanceId: null,
            metricKey: 'CERTIFICATE_DAYS',
            warningValue: 30,
            criticalValue: 7,
          },
        ]);
      }
      if (url.includes('/projects')) {
        return response({
          items: [
            { project_id: 'sample-a', display_name: 'Sample A', enabled: true, status: 'UP' },
          ],
          page: 0,
          size: 50,
          total: 1,
        });
      }
      return response({
        projects: [],
        failed_api_count: 0,
        expiring_certificate_count: 0,
        history: { resources: [], api: [] },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('renders eight top-level navigation choices including incident management', async () => {
  app('/');
  await screen.findByRole('heading', { name: '종합 현황' });
  const navigation = screen.getByRole('menu', { name: '주 메뉴' });
  expect(navigation.querySelectorAll(':scope > li')).toHaveLength(8);
  for (const label of [
    '종합 현황',
    '장애 관리',
    '프로젝트',
    'API 모니터링',
    '인증서 관리',
    '설정',
  ]) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
});

test('official ProLayout navigation keeps scoped links and the current route', async () => {
  app('/api-monitoring?project=sample-a');
  await screen.findByRole('heading', { name: 'API 모니터링' });
  const layout = document.querySelector('.ant-pro-layout');
  expect(layout).toBeInTheDocument();
  expect(layout?.querySelector('.ant-pro-sider')).toBeInTheDocument();
  expect(layout?.querySelector('.ant-pro-sider .anticon')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'API 모니터링' })).toHaveAttribute(
    'href',
    '/api-monitoring?project=sample-a',
  );
  expect(document.getElementById('main-content')).toBeInTheDocument();
});

test('settings navigation expands on click and becomes inaccessible when collapsed', async () => {
  app('/');
  const toggle = await screen.findByRole('menuitem', { name: '설정' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('menuitem', { name: '프로젝트 관리' })).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('menuitem', { name: '프로젝트 관리' })).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('menuitem', { name: '프로젝트 관리' })).not.toBeInTheDocument();
});

test('shell exposes Monitoring brand without filler and keeps skip navigation and active location', async () => {
  app('/api-monitoring');
  await screen.findByRole('heading', { name: 'API 모니터링' });
  expect(screen.getByRole('link', { name: '본문으로 건너뛰기' })).toHaveAttribute(
    'href',
    '#main-content',
  );
  expect(screen.getAllByText('Monitoring')).toHaveLength(1);
  expect(screen.queryAllByRole('img', { name: 'Monitoring' })).toHaveLength(0);
  expect(screen.getByText('운영 모니터링')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'API 모니터링' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(document.getElementById('main-content')).toBeInTheDocument();
  expect(
    screen.queryByText('외부·내부 API 점검 결과를 조회하고 재점검합니다.'),
  ).not.toBeInTheDocument();
});

// Vitest의 첫 lazy route 변환은 병렬 실행 시 10초 이상 걸릴 수 있음. 링크 계약은 그대로 검증.
test('instance pages provide deterministic accessible parent links', async () => {
  app('/projects/sample-a');
  const projectsBack = await screen.findByRole(
    'link',
    { name: '프로젝트 목록으로' },
    { timeout: 25_000 },
  );
  expect(projectsBack).toHaveAttribute('href', '/projects?project=');
  projectsBack.focus();
  expect(projectsBack).toHaveFocus();

  cleanup();
  app('/projects/sample-a/instances/live-01');
  const instancesBack = await screen.findByRole(
    'link',
    { name: 'sample-a 인스턴스 목록으로' },
    { timeout: 10_000 },
  );
  expect(instancesBack).toHaveAttribute('href', '/projects/sample-a');
  instancesBack.focus();
  expect(instancesBack).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'sample-a / live-01' })).toBeInTheDocument();
}, 40_000);

test('instance disk chart uses the exact title and summary prefix without the disk identifier', async () => {
  app('/projects/sample-a/instances/live-01');

  expect(await screen.findByRole('region', { name: '디스크 사용량 그래프' })).toBeVisible();
  expect(screen.getByRole('tablist')).toHaveClass('ant-tabs-nav');
  expect(
    screen.getByRole('combobox', { name: '조회 기간' }).closest('.ant-select'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('table', { name: '디스크' }).closest('.ant-pro-table'),
  ).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '웹앱 디스크 그래프' })).toBeVisible();
  expect(screen.getByRole('region', { name: '첨부파일 디스크 그래프' })).toBeVisible();
  expect(screen.getByRole('img', { name: /^디스크 사용량: 1개 지점/ })).toBeVisible();
  expect(screen.getByText(/^디스크 사용량 텍스트 요약: 1개 지점/)).toBeVisible();
  expect(screen.queryByText(/디스크 사용량 \(data\)/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/디스크 사용량 \(data\)/)).not.toBeInTheDocument();
});

test('mobile shell marks operational mutation as desktop-only while keeping monitoring navigation', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      media: '(max-width: 767px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  app('/settings/projects');
  await screen.findByRole('heading', { name: '프로젝트 관리' });
  expect(await screen.findByText(/모바일에서는 조회만 지원/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '프로젝트 등록' })).toBeDisabled();
  expect(
    screen.getByRole('menu', { name: '주 메뉴' }).querySelectorAll(':scope > li'),
  ).toHaveLength(8);
});

test('loads project instances from the authenticated production API without fixtures', async () => {
  app('/projects/sample-a');
  expect(await screen.findByText('Live Agent')).toBeInTheDocument();
  expect(
    screen.getByRole('table', { name: '인스턴스 목록' }).closest('.ant-pro-table'),
  ).toBeInTheDocument();
  expect(requests.some((url) => url.includes('/api/v1/projects/sample-a/instances'))).toBe(true);
  expect(screen.queryByText('샘플 A 1')).not.toBeInTheDocument();
});

test('API filters and drawer operate on API results', async () => {
  app('/api-monitoring');
  expect(await screen.findByRole('cell', { name: /외부 API.*Partner API/ })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Partner API' }));
  expect(await screen.findByRole('heading', { name: 'Partner API' })).toBeInTheDocument();
  expect(screen.getByLabelText('프로젝트 필터')).toBeInTheDocument();
  expect(screen.getByLabelText('인스턴스 필터')).toBeInTheDocument();
  expect(screen.getByLabelText('내외부 필터')).toBeInTheDocument();
  expect(screen.getByLabelText('상태 필터')).toBeInTheDocument();
  expect(screen.getByLabelText('API 이름')).toBeInTheDocument();
});

test('API filters have persistent visible labels associated with every control', async () => {
  app('/api-monitoring');
  await screen.findByRole('button', { name: 'Partner API' });
  for (const label of ['프로젝트', '인스턴스', '구분', '상태', 'API 이름']) {
    const visibleLabel = screen
      .getAllByText(label, { selector: 'label' })
      .find((item) => item.getAttribute('for') !== 'global-project-select')!;
    expect(visibleLabel).toBeVisible();
    expect(visibleLabel).toHaveAttribute('for');
    expect(document.getElementById(visibleLabel.getAttribute('for')!)).toBeInTheDocument();
  }
  expect(screen.getByLabelText('프로젝트 필터')).toBeEnabled();
  expect(screen.getByLabelText('인스턴스 필터')).toBeDisabled();
  expect(screen.getByText('입력 즉시 결과에 적용됩니다.')).toBeVisible();
});

test('certificate filters and existing certificate settings rows keep visible associated labels', async () => {
  app('/certificates');
  await screen.findByRole('button', { name: '지금 확인' });
  for (const label of ['프로젝트', '상태']) {
    const visibleLabel = screen
      .getAllByText(label, { selector: 'label' })
      .find((item) => item.getAttribute('for') !== 'global-project-select')!;
    expect(visibleLabel).toBeVisible();
    expect(visibleLabel).toHaveAttribute('for');
  }

  cleanup();
  app('/settings/certificates');
  fireEvent.click(await screen.findByRole('button', { name: /인증서 .* 수정/ }));
  const certificateHost = await screen.findByLabelText(/인증서 .* 호스트/);
  expect(document.querySelector(`label[for="${certificateHost.id}"]`)).toBeVisible();
});

test('instance settings use labeled controls, guidance, and concise actions', async () => {
  app('/settings/instances');
  await screen.findByText('live-01');
  expect(screen.getByLabelText('소속 프로젝트').closest('.ant-select')).toHaveTextContent(
    'Sample A (sample-a)',
  );
  expect(screen.queryByLabelText('소속 프로젝트 ID')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('인스턴스 ID')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  for (const label of [
    '인스턴스 ID',
    '표시명',
    '환경',
    'Collector Base URL',
    'Collector 토큰',
    '폴링 간격(초)',
  ]) {
    expect(screen.getAllByText(label, { selector: 'label' })[0]).toBeVisible();
  }
  expect(screen.getByRole('textbox', { name: 'Collector Base URL' })).toHaveAttribute(
    'placeholder',
    '예: https://agent.example.com (최대 500자)',
  );
  expect(screen.getByRole('textbox', { name: '인스턴스 ID' })).toBeVisible();
  const polling = screen.getByRole('spinbutton', { name: '새 인스턴스 폴링 간격' });
  expect(polling).toHaveClass('ant-input-number-input');
  expect(polling).toHaveAttribute('aria-valuemin', '15');
  expect(polling).toHaveAttribute('placeholder', '15초 이상');
  expect(screen.getByText('중지하면 폴링을 멈추지만 기존 수집 데이터는 유지합니다.')).toBeVisible();
  expect(screen.getByRole('button', { name: '인스턴스 등록 확인' })).toBeVisible();
});

test('instance rows read as text until editing is requested', async () => {
  app('/settings/instances');
  const row = await screen.findByRole('row', { name: /live-01/ });
  expect(row.getElementsByTagName('input')).toHaveLength(0);
  expect(row.getElementsByTagName('select')).toHaveLength(0);
  expect(row).toHaveTextContent('http://127.0.0.1:18081');

  fireEvent.click(screen.getByRole('button', { name: '인스턴스 live-01 수정' }));
  expect(screen.getByLabelText('인스턴스 live-01 표시명')).toBeVisible();
  expect(screen.getByRole('button', { name: '인스턴스 live-01 저장' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('인스턴스 live-01 표시명')).not.toBeInTheDocument(),
  );
});

test('settings polish uses labeled selects, boolean payloads, and compact action groups', async () => {
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 수정' }));
  const api = screen.getByLabelText('인스턴스 live-01 API 자동 점검');
  const status = screen.getByLabelText('인스턴스 live-01 수집 상태');
  expect(
    screen.getAllByText(
      '이 인스턴스의 API 자동 실행을 허용합니다. 각 API의 사용 여부와 주기는 API 모니터링에서 설정합니다.',
    ).length,
  ).toBeGreaterThan(0);
  expect(api).toHaveAttribute('role', 'combobox');
  expect(status).toHaveAttribute('role', 'combobox');
  await selectOption(api, '사용 안 함');
  await selectOption(status, '중지');
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 live-01 저장' }));
  await waitFor(() =>
    expect(bodies).toContainEqual(
      expect.objectContaining({
        apiChecksEnabled: false,
        enabled: false,
      }),
    ),
  );
  const row = screen.getByRole('button', { name: '인스턴스 live-01 연결 관리' }).closest('tr');
  expect(row).toContainElement(screen.getByRole('button', { name: '인스턴스 live-01 수정' }));
  expect(screen.queryByRole('button', { name: '비활성화' })).not.toBeInTheDocument();
});

test('project settings rows expose project ID, XLog usage and delete action', async () => {
  app('/settings/projects');
  const table = await screen.findByRole('table', { name: '프로젝트 설정' });
  expect(table.querySelectorAll('th')).toHaveLength(3);
  expect(table).toHaveTextContent('XLog 수집');
  expect(table).toHaveTextContent('프로젝트');
  expect(table).toHaveTextContent('작업');
  expect(table).not.toHaveTextContent('표시명');
  expect(table).not.toHaveTextContent('프로젝트 상태');
  expect(screen.queryByLabelText('프로젝트 sample-a 표시명')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('프로젝트 sample-a 프로젝트 상태')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '프로젝트 sample-a 저장' })).not.toBeInTheDocument();
  const row = screen.getByRole('row', { name: /sample-a/ });
  expect(row.getElementsByTagName('input')).toHaveLength(0);
  expect(row.getElementsByTagName('select')).toHaveLength(0);
  expect(screen.getByRole('button', { name: '삭제' })).toBeVisible();
});

test('list connection management starts and stops without saving settings or running a diagnostic', async () => {
  app('/settings/instances');
  const manage = await screen.findByRole('button', { name: '인스턴스 live-01 연결 관리' });
  expect(requests.some((url) => url.endsWith('/connection'))).toBe(false);
  fireEvent.click(manage);
  const dialog = within(screen.getByRole('dialog', { name: '인스턴스 live-01 연결 관리' }));
  const start = await dialog.findByRole('button', { name: '연결 시작' });
  expect(requests.some((url) => url.endsWith('/connection/start'))).toBe(false);
  fireEvent.click(start);
  const stop = await dialog.findByRole('button', { name: '연결 종료' });
  await waitFor(() => expect(stop).toBeEnabled());
  fireEvent.click(stop);
  await dialog.findByRole('button', { name: '연결 시작' });
  for (const action of ['start', 'stop']) {
    expect(
      requests.some(
        (url, index) =>
          url.endsWith(`/projects/sample-a/instances/live-01/connection/${action}`) &&
          methods[index] === 'POST',
      ),
    ).toBe(true);
  }
  expect(methods).not.toContain('PUT');
  expect(requests.some((url) => url.endsWith('/test'))).toBe(false);
});

test('successful connection tests are acknowledged', async () => {
  cleanup();
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 연결 관리' }));
  fireEvent.click(await screen.findByRole('button', { name: '연결 확인' }));
  await waitFor(() => expect(screen.getByText('연결 테스트에 성공했습니다.')).toBeVisible());
});

test('settings tables and threshold toolbar retain complete labels', async () => {
  app('/settings/instances');
  const header = await screen.findByRole('columnheader', { name: '인스턴스' });
  expect(header.closest('table')?.closest('.ant-pro-table')).toBeInTheDocument();

  cleanup();
  app('/settings/thresholds');
  expect(await screen.findByRole('combobox', { name: '프로젝트' })).toBeVisible();
  expect(screen.getByLabelText('인스턴스')).toBeDisabled();
});

test('project permanent delete is default-safe and calls the explicit endpoint after confirmation', async () => {
  app('/settings/projects');
  fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
  expect(screen.getByRole('dialog', { name: '프로젝트 sample-a 영구 삭제' })).toBeVisible();
  expect(screen.getByText(/하위 인스턴스, 인증서, 모든 기록과 설정/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(requests.some((url) => url.endsWith('/projects/sample-a/permanent'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 sample-a 영구 삭제 확인' }));
  await waitFor(() =>
    expect(requests.some((url) => url.endsWith('/projects/sample-a/permanent'))).toBe(true),
  );
  expect(methods[requests.findIndex((url) => url.endsWith('/projects/sample-a/permanent'))]).toBe(
    'DELETE',
  );
});

test('instance permanent delete names its target and calls the explicit endpoint', async () => {
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 삭제' }));
  expect(screen.getByRole('dialog', { name: '인스턴스 live-01 영구 삭제' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 live-01 영구 삭제 확인' }));
  await waitFor(() =>
    expect(
      requests.some((url) => url.endsWith('/projects/sample-a/instances/live-01/permanent')),
    ).toBe(true),
  );
  expect(
    methods[
      requests.findIndex((url) => url.endsWith('/projects/sample-a/instances/live-01/permanent'))
    ],
  ).toBe('DELETE');
});

test('instance project dropdown uses enabled projects and deterministic first selection', async () => {
  app('/settings/instances');
  const project = await screen.findByLabelText('소속 프로젝트');
  await waitFor(() =>
    expect(project.closest('.ant-select')).toHaveTextContent('Sample A (sample-a)'),
  );
  expect(requests.some((url) => url.includes('/api/v1/projects'))).toBe(true);
  expect(screen.getByRole('button', { name: '등록' })).toBeEnabled();
});

test('connection test translates safe code and never exposes server details', async () => {
  connectionFailureCode = 'AUTH_ERROR';
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 연결 관리' }));
  fireEvent.click(await screen.findByRole('button', { name: '연결 확인' }));
  await waitFor(() =>
    expect(
      screen.getByText('인증에 실패했습니다. Collector 토큰을 다시 확인하세요.'),
    ).toBeVisible(),
  );
  expect(screen.queryByText(/secret|stack|token=abc/i)).not.toBeInTheDocument();
});

test('connection test explains an invalid allowlist file without exposing server details', async () => {
  connectionFailureCode = 'ALLOWLIST_CONFIG_ERROR';
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 연결 관리' }));
  fireEvent.click(await screen.findByRole('button', { name: '연결 확인' }));
  await waitFor(() =>
    expect(
      screen.getByText(
        '접속 허용 목록 파일을 읽을 수 없습니다. 파일 위치와 JSON 형식을 확인하세요.',
      ),
    ).toBeVisible(),
  );
  expect(screen.queryByText(/secret|stack|token=abc/i)).not.toBeInTheDocument();
});

test('an internal check can run from instance detail and refresh its result', async () => {
  app('/projects/sample-a/instances/live-01?tab=internal-checks');
  const button = await screen.findByRole('button', { name: '데이터 경로 즉시 점검' });
  expect(screen.getByText('미수집', { selector: '.ant-tag' })).toBeInTheDocument();
  fireEvent.click(button);
  await waitFor(() =>
    expect(
      requests.some(
        (request, index) =>
          request.endsWith('/api-checks/sample-a/live-01/data-path/run') &&
          methods[index] === 'POST',
      ),
    ).toBe(true),
  );
  expect(await screen.findByText('정상', { selector: '.ant-tag' })).toBeInTheDocument();
  await waitFor(() => expect(button).toBeEnabled());
});

test('connection test shows safe guidance without a structured error code', async () => {
  connectionFailureCode = '';
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 연결 관리' }));
  fireEvent.click(await screen.findByRole('button', { name: '연결 확인' }));
  await waitFor(() =>
    expect(
      screen.getByText('Collector에 연결할 수 없습니다. 주소, 포트, 방화벽을 확인하세요.'),
    ).toBeVisible(),
  );
});

test('registration starts from a toolbar action rather than an always-open form', async () => {
  app('/settings/instances');
  const button = await screen.findByRole('button', { name: '등록' });
  expect(screen.getByRole('group', { name: '인스턴스 등록 작업' })).toContainElement(button);
  expect(button).toBeVisible();
  await waitFor(() => expect(button).toBeEnabled());
  expect(document.getElementById('create-instance-form')).toBeNull();

  fireEvent.click(button);
  expect(screen.getByRole('dialog', { name: '인스턴스 등록' })).toContainElement(
    document.getElementById('create-instance-form'),
  );
});

test('API filter request transmits project, instance, direction, status, and name together', async () => {
  app('/api-monitoring');
  await screen.findByRole('button', { name: 'Partner API' });
  await selectOption(screen.getByLabelText('프로젝트 필터'), 'Sample A (sample-a)');
  await waitFor(() => expect(screen.getByLabelText('인스턴스 필터')).toBeEnabled());
  await selectOption(screen.getByLabelText('인스턴스 필터'), 'Live Agent (live-01)');
  await selectOption(screen.getByLabelText('내외부 필터'), '내부 API');
  await selectOption(screen.getByLabelText('상태 필터'), '장애');
  fireEvent.change(screen.getByLabelText('API 이름'), { target: { value: 'Partner API' } });

  await waitFor(() =>
    expect(
      requests.some((url) => {
        const query = new URL(url, 'http://localhost').searchParams;
        return (
          query.get('project') === 'sample-a' &&
          query.get('instance') === 'live-01' &&
          query.get('direction') === 'INTERNAL' &&
          query.get('status') === 'DOWN' &&
          query.get('name') === 'Partner API'
        );
      }),
    ).toBe(true),
  );
});

test('API project and instance filters use registered dependent options and clear stale instance', async () => {
  app('/api-monitoring');
  let project = await screen.findByLabelText('프로젝트 필터');
  let instance = screen.getByLabelText('인스턴스 필터');
  expect(project).toHaveAttribute('role', 'combobox');
  await waitFor(() => expect(project.closest('.ant-select')).toHaveTextContent('전체 프로젝트'));
  expect(instance).toBeDisabled();
  expect(instance.closest('.ant-select')).toHaveTextContent('프로젝트를 먼저 선택하세요');
  await selectOption(project, 'Sample A (sample-a)');
  instance = await screen.findByLabelText('인스턴스 필터');
  project = screen.getByLabelText('프로젝트 필터');
  await waitFor(() => expect(instance).toBeEnabled());
  expect(instance.closest('.ant-select')).toHaveTextContent('전체 인스턴스');
  await selectOption(instance, 'Live Agent (live-01)');
  await waitFor(() =>
    expect(
      requests.some(
        (url) => new URL(url, 'http://localhost').searchParams.get('instance') === 'live-01',
      ),
    ).toBe(true),
  );
  await selectOption(project, '전체 프로젝트');
  instance = await screen.findByLabelText('인스턴스 필터');
  expect(instance.closest('.ant-select')).toHaveTextContent('프로젝트를 먼저 선택하세요');
  await waitFor(() => expect(requests.slice(-1)[0]).not.toContain('instance=live-01'));
});

test('certificate list uses registered project select and explains project scope', async () => {
  app('/certificates');
  const project = await screen.findByLabelText('프로젝트 필터');
  expect(project).toHaveAttribute('role', 'combobox');
  await waitFor(() => expect(project.closest('.ant-select')).toHaveTextContent('전체 프로젝트'));
  expect(screen.getByText('프로젝트별 인증서를 관리합니다.')).toBeVisible();
  expect(screen.queryByLabelText(/인스턴스 필터/)).not.toBeInTheDocument();
  await selectOption(project, 'Sample A (sample-a)');
  await waitFor(() =>
    expect(
      requests.some(
        (url) => new URL(url, 'http://localhost').searchParams.get('project') === 'sample-a',
      ),
    ).toBe(true),
  );
});

test('certificate settings require a registered project select', async () => {
  app('/settings/certificates');
  fireEvent.click(await screen.findByRole('button', { name: '인증서 대상 등록' }));
  const project = screen.getByLabelText('인증서 프로젝트');
  expect(project).toHaveAttribute('role', 'combobox');
  expect(project.closest('.ant-select')).toHaveTextContent('프로젝트 선택');
  await waitFor(() => expect(project).toBeEnabled());
  expect(screen.getByRole('button', { name: '인증서 대상 등록 확인' })).toBeDisabled();
  expect(document.querySelector('input[value="sample-a"]')).not.toBeInTheDocument();
  await selectOption(project, 'Sample A (sample-a)');
  expect(project.closest('.ant-select')).toHaveTextContent('Sample A (sample-a)');
});

test('certificate creation uses ProTable and an Ant Design Modal with ProForm', async () => {
  app('/settings/certificates');
  fireEvent.click(await screen.findByRole('button', { name: '인증서 대상 등록' }));
  const dialog = screen.getByRole('dialog', { name: '인증서 대상 등록' });
  expect(dialog.closest('.ant-modal')).toBeInTheDocument();
  expect(dialog.querySelector('.ant-pro-form')).toBeInTheDocument();
  expect(
    screen.getByRole('table', { name: '인증서 대상 설정' }).closest('.ant-pro-table'),
  ).toBeInTheDocument();
});

test('certificate edit preserves the target and persists its interval', async () => {
  app('/settings/certificates');
  fireEvent.click(await screen.findByRole('button', { name: '인증서 41 수정' }));
  expect(
    screen.getByRole('dialog', { name: '인증서 대상 수정' }).querySelector('.ant-pro-form'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('인증서 41 점검 간격'), { target: { value: '120' } });
  fireEvent.click(screen.getByRole('button', { name: '인증서 41 저장' }));
  await waitFor(() => expect(methods).toContain('PUT'));
  expect(bodies).toContainEqual(
    expect.objectContaining({
      projectId: 'sample-a',
      hostname: 'old.example',
      checkIntervalMinutes: 120,
    }),
  );
});

test('settings never repopulates an agent token', async () => {
  app('/settings/instances');
  await screen.findByText('live-01');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  const token = screen.getByLabelText(/Collector 토큰/);
  expect(token).toHaveAttribute('type', 'password');
  expect(token).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));

  fireEvent.click(screen.getByRole('button', { name: '인스턴스 live-01 수정' }));
  expect(screen.getByRole('dialog', { name: '인스턴스 수정' })).toBeInTheDocument();
  expect(screen.queryByText('표시명 (live-01)')).not.toBeInTheDocument();
  const existing = screen.getByLabelText('새 토큰');
  expect(existing).toHaveAttribute('type', 'password');
  expect(existing).toHaveValue('');
});

test('project list removal of edit controls cannot issue a project update', async () => {
  app('/settings/projects');
  await screen.findByText('sample-a');
  expect(screen.queryByRole('button', { name: /sample-a 저장/ })).not.toBeInTheDocument();
  expect(methods).not.toContain('PUT');
});

test('instance create rejects a token shorter than 32 UTF-8 bytes without sending it', async () => {
  app('/settings/instances');
  await screen.findByText('live-01');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  fireEvent.change(screen.getByLabelText('인스턴스 ID'), { target: { value: 'new-one' } });
  fireEvent.change(screen.getByLabelText('인스턴스 표시명'), { target: { value: 'New one' } });
  fireEvent.change(screen.getByLabelText('Collector Base URL'), {
    target: { value: 'https://agent.example' },
  });
  fireEvent.change(screen.getByLabelText(/Collector 토큰/), {
    target: { value: '1234567890123456789012345678901' },
  });
  fireEvent.submit(document.getElementById('create-instance-form')!);
  expect(
    await screen.findByText('Collector 토큰은 32 UTF-8 bytes 이상이어야 합니다.'),
  ).toBeInTheDocument();
  expect(methods).not.toContain('POST');
  expect(JSON.stringify(bodies)).not.toContain('1234567890123456789012345678901');
});

test('instance edit saves every editable field and clears the write-only token after success', async () => {
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 수정' }));
  fireEvent.change(screen.getByLabelText('인스턴스 live-01 환경'), {
    target: { value: 'production' },
  });
  fireEvent.change(screen.getByLabelText('새 토큰'), {
    target: { value: 'abcdefghijklmnopqrstuvwxyz123456' },
  });
  await selectOption(screen.getByLabelText('인스턴스 live-01 API 자동 점검'), '사용 안 함');
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 live-01 저장' }));
  await waitFor(() => expect(methods).toContain('PUT'));
  expect(bodies).toContainEqual(
    expect.objectContaining({
      instanceId: 'live-01',
      environment: 'production',
      token: 'abcdefghijklmnopqrstuvwxyz123456',
      apiChecksEnabled: false,
    }),
  );
  // 저장 성공 후 창을 닫고 다시 열어도 토큰이 반환되지 않는지 검증
  await waitFor(() => expect(screen.queryByLabelText('새 토큰')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 live-01 수정' }));
  expect(screen.getByLabelText('새 토큰')).toHaveValue('');
});

test('threshold management requires project then instance selection', async () => {
  app('/settings/thresholds');
  expect(await screen.findByLabelText('인스턴스')).toBeDisabled();
  expect(screen.queryByLabelText('CPU 사용률 경고')).not.toBeInTheDocument();
  await selectOption(screen.getByRole('combobox', { name: '프로젝트' }), 'Sample A');
  await waitFor(() => expect(screen.getByLabelText('인스턴스')).toBeEnabled());
  expect(screen.queryByLabelText('CPU 사용률 경고')).not.toBeInTheDocument();
  await selectOption(screen.getByLabelText('인스턴스'), 'Live Agent');
  expect(await screen.findByText(/등록된 임계치가 없습니다/)).toBeVisible();
  expect(screen.getByRole('button', { name: '추가' })).toBeEnabled();
  expect(screen.queryByText('기본값 사용')).not.toBeInTheDocument();
  expect(screen.queryByText('공통 기본값')).not.toBeInTheDocument();
});

test('threshold management saves the selected server without choosing a setting mode', async () => {
  app('/settings/thresholds');
  await selectOption(await screen.findByRole('combobox', { name: '프로젝트' }), 'Sample A');
  await waitFor(() => expect(screen.getByLabelText('인스턴스')).toBeEnabled());
  await selectOption(screen.getByLabelText('인스턴스'), 'Live Agent');
  fireEvent.click(await screen.findByRole('button', { name: '추가' }));
  await selectOption(screen.getByLabelText('항목'), 'CPU 사용률');
  fireEvent.change(screen.getByLabelText('경고 기준'), { target: { value: '75' } });
  fireEvent.change(screen.getByLabelText('위험 기준'), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  await waitFor(() => expect(methods).toContain('PUT'));
  expect(bodies).toContainEqual(
    expect.objectContaining({
      metrics: expect.arrayContaining([
        expect.objectContaining({ metricKey: 'SYSTEM_CPU', warningValue: 0.75, useDefault: false }),
      ]),
    }),
  );
  expect(
    requests.some(
      (url, index) =>
        url.endsWith('/projects/sample-a/instances/live-01/thresholds') && methods[index] === 'PUT',
    ),
  ).toBe(true);
});

test('clearing project selection clears the selected instance and form', async () => {
  app('/settings/thresholds');
  await selectOption(await screen.findByRole('combobox', { name: '프로젝트' }), 'Sample A');
  await waitFor(() => expect(screen.getByLabelText('인스턴스')).toBeEnabled());
  await selectOption(screen.getByLabelText('인스턴스'), 'Live Agent');
  await screen.findByText(/등록된 임계치가 없습니다/);
  await selectOption(screen.getByRole('combobox', { name: '프로젝트' }), '프로젝트 선택');
  expect(screen.queryByLabelText('CPU 사용률 경고')).not.toBeInTheDocument();
  expect(screen.getByLabelText('인스턴스')).toBeDisabled();
});

test('certificate target form exposes and validates the persisted check interval', async () => {
  app('/settings/certificates');
  fireEvent.click(await screen.findByRole('button', { name: '인증서 대상 등록' }));
  const interval = screen.getByLabelText('새 인증서 점검 간격');
  expect(interval).toHaveValue(360);
  const project = screen.getByLabelText('인증서 프로젝트');
  await waitFor(() => expect(project).toBeEnabled());
  await selectOption(project, 'Sample A (sample-a)');
  fireEvent.change(screen.getByLabelText('인증서 호스트'), { target: { value: 'new.example' } });
  fireEvent.change(screen.getByLabelText('SNI 호스트'), { target: { value: 'new.example' } });
  fireEvent.change(interval, { target: { value: '0' } });
  fireEvent.submit(document.getElementById('create-certificate-form')!);
  expect(await screen.findByText(/점검 간격은 1분 이상/)).toBeInTheDocument();
  expect(methods.filter((method) => method === 'POST')).toHaveLength(0);
});

test('settings page delegates each route to a dedicated tab component', () => {
  const source = settingsPageSource;
  for (const component of [
    'ProjectSettingsTab',
    'InstanceSettingsTab',
    'ThresholdSettingsTab',
    'CertificateSettingsTab',
  ]) {
    expect(source).toContain(`import ${component}`);
    expect(source).toContain(`<${component} />`);
  }
});

test('the top bar names the current section and exposes the signed-in account', async () => {
  app('/certificates');
  await screen.findByRole('heading', { name: '인증서 관리' });
  const trigger = await screen.findByRole('button', { name: /admin/ });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('heading', { name: '인증서 관리', level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole('menu', { name: '계정 메뉴' })).not.toBeInTheDocument();
});

test('ProLayout sidebar can collapse and expand from keyboard-accessible controls', async () => {
  app('/');
  await screen.findByRole('heading', { name: '종합 현황' });
  await waitFor(() =>
    expect(screen.getByLabelText('프로젝트 선택').closest('.ant-select')).toHaveTextContent(
      'Sample A',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: '사이드 메뉴 접기' }));
  await waitFor(() =>
    expect(document.querySelector('.ant-pro-sider')).toHaveClass('ant-pro-sider-collapsed'),
  );
  fireEvent.click(screen.getByRole('button', { name: '사이드 메뉴 펼치기' }));
  await waitFor(() =>
    expect(document.querySelector('.ant-pro-sider')).not.toHaveClass('ant-pro-sider-collapsed'),
  );
});

test('mobile ProLayout menu closes after navigating to a project', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      matches: media.startsWith('(max-width:'),
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  app('/?project=sample-a');
  const open = await screen.findByRole('button', { name: '메뉴 열기' });
  fireEvent.click(open);
  fireEvent.click(await screen.findByRole('link', { name: '프로젝트' }));
  expect(await screen.findByRole('table', { name: '인스턴스 목록' })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toBeInTheDocument(),
  );
});

test('account menu uses Ant Design Dropdown with accessible actions', async () => {
  app('/');
  const trigger = await screen.findByRole('button', { name: /admin 계정 메뉴/ });
  expect(trigger.closest('.ant-dropdown-trigger')).toBeInTheDocument();
  fireEvent.click(trigger);
  expect(await screen.findByRole('menuitem', { name: /모드로 전환/ })).toBeInTheDocument();
});

test('account menu supports keyboard navigation and restores focus on Escape', async () => {
  app('/');
  const trigger = await screen.findByRole('button', { name: /admin/ });
  trigger.focus();
  fireEvent.click(trigger);
  const settings = screen.getByRole('menuitem', { name: '설정 관리' });
  const theme = screen.getByRole('menuitem', { name: /모드로 전환/ });
  const logout = screen.getByRole('menuitem', { name: '로그아웃' });
  // rc-menu의 키보드 탐색은 요소 크기로 가시성을 판단하지만 jsdom은 레이아웃을 계산하지 않음
  for (const item of [settings, theme, logout]) {
    Object.defineProperty(item, 'offsetParent', { configurable: true, value: item.parentElement });
  }
  settings.focus();
  expect(settings).toHaveFocus();
  fireEvent.keyDown(settings, { key: 'ArrowDown', keyCode: 40, which: 40 });
  await waitFor(() => expect(theme).toHaveFocus());
  fireEvent.keyDown(theme, { key: 'ArrowDown', keyCode: 40, which: 40 });
  await waitFor(() => expect(logout).toHaveFocus());
  fireEvent.keyDown(logout, { key: 'Escape', keyCode: 27, which: 27 });
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('Escape returns focus to the account trigger immediately after a menu item receives focus', async () => {
  app('/');
  const trigger = await screen.findByRole('button', { name: /admin 계정 메뉴/ });
  trigger.focus();
  fireEvent.click(trigger);
  const settings = await screen.findByRole('menuitem', { name: '설정 관리' });
  settings.focus();
  fireEvent.keyDown(settings, { key: 'Escape', keyCode: 27, which: 27 });
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('theme switching lives in the account menu and persists the choice', async () => {
  document.documentElement.dataset.theme = 'dark';
  app('/');
  const trigger = await screen.findByRole('button', { name: /admin/ });
  expect(document.querySelector('.topbar .theme-toggle')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: '라이트 모드로 전환' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('monitoring.theme')).toBe('light');
  expect(trigger).toHaveFocus();
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: '다크 모드로 전환' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('monitoring.theme')).toBe('dark');
  localStorage.removeItem('monitoring.theme');
});

test('the account menu opens on demand and logs out through the session endpoint', async () => {
  app('/');
  const trigger = await screen.findByRole('button', { name: /admin/ });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('menu', { name: '계정 메뉴' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /admin · 관리자/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: '로그아웃' }));
  await waitFor(() =>
    expect(
      requests.some((url, index) => url.endsWith('/session/logout') && methods[index] === 'POST'),
    ).toBe(true),
  );
});

function app(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        {/* JSDOM은 CSS 키프레임을 실행하지 않으므로 모션은 실제 브라우저에서 검증 */}
        <ConfigProvider theme={{ token: { motion: false } }}>
          <App />
        </ConfigProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as Response;
}

test('project menu opens the selected project directly and the all-projects choice shows the list', async () => {
  app('/xlog?project=sample-a');
  await waitFor(() =>
    expect(screen.getByLabelText('프로젝트 선택').closest('.ant-select')).toHaveTextContent(
      'Sample A',
    ),
  );
  fireEvent.click(screen.getByRole('link', { name: '프로젝트' }));

  expect(await screen.findByRole('table', { name: '인스턴스 목록' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Live Agent' })).toHaveAttribute(
    'href',
    '/projects/sample-a/instances/live-01',
  );
  expect(screen.queryByRole('table', { name: '프로젝트 목록' })).not.toBeInTheDocument();

  await selectOption(screen.getByLabelText('프로젝트 선택'), '전체 프로젝트');
  expect(await screen.findByRole('table', { name: '프로젝트 목록' })).toBeInTheDocument();

  await selectOption(screen.getByLabelText('프로젝트 선택'), 'Sample A');
  expect(await screen.findByRole('table', { name: '인스턴스 목록' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록으로' }));
  expect(await screen.findByRole('table', { name: '프로젝트 목록' })).toBeInTheDocument();
  expect(screen.getByLabelText('프로젝트 선택').closest('.ant-select')).toHaveTextContent(
    '전체 프로젝트',
  );
});

test('XLog time, path and error filters use labeled Ant Design controls', async () => {
  app('/xlog?project=sample-a');
  const period = await screen.findByLabelText('XLog 조회 기간');
  expect(period.closest('.ant-select')).toBeInTheDocument();
  expect(screen.getByLabelText('요청 경로 검색').closest('.ant-input')).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'HTTP 오류만' }).closest('.ant-checkbox'),
  ).toBeInTheDocument();
});

test('live logs instance filter is presented in an Ant Design form', async () => {
  app('/logs?project=sample-a');
  const instance = await screen.findByLabelText('인스턴스 선택');
  expect(instance.closest('.ant-select')).toBeInTheDocument();
  expect(instance.closest('form.ant-form')).toBeInTheDocument();
});

test('instance edit stages collection changes until save and discards them on cancel', async () => {
  app('/settings/instances');
  const edit = await screen.findByRole('button', { name: '인스턴스 live-01 수정' });
  expect(
    screen.queryByRole('button', { name: '인스턴스 live-01 수집 설정' }),
  ).not.toBeInTheDocument();
  fireEvent.click(edit);
  const dialog = within(screen.getByRole('dialog', { name: '인스턴스 수정' }));
  const mode = dialog.getByLabelText('수집 방식');
  const xlog = dialog.getByLabelText('XLog 수집');
  await waitFor(() => expect(mode).toBeEnabled());
  await waitFor(() => expect(xlog).toBeEnabled());
  await selectOption(mode, 'HTTP 조회');
  await selectOption(xlog, '사용');
  expect(methods).not.toContain('PUT');
  fireEvent.click(dialog.getByRole('button', { name: '취소' }));
  expect(methods).not.toContain('PUT');

  fireEvent.click(edit);
  const reopened = within(screen.getByRole('dialog', { name: '인스턴스 수정' }));
  expect(reopened.getByLabelText('수집 방식').closest('.ant-select')).toHaveTextContent(
    '웹소켓 연결',
  );
  expect(reopened.getByLabelText('XLog 수집').closest('.ant-select')).toHaveTextContent(
    '사용 안 함',
  );
  await selectOption(reopened.getByLabelText('수집 방식'), 'HTTP 조회');
  await selectOption(reopened.getByLabelText('XLog 수집'), '사용');
  fireEvent.click(reopened.getByRole('button', { name: '인스턴스 live-01 저장' }));
  await waitFor(() => expect(bodies).toContainEqual({ enabled: true }));
  expect(bodies).toContainEqual({ mode: 'HTTP' });
  expect(requests.some((url) => url.endsWith('/connection/start'))).toBe(false);
  await waitFor(() =>
    expect(screen.queryByRole('combobox', { name: '수집 방식' })).not.toBeInTheDocument(),
  );
});

test('instance edit keeps ID read-only and controls websocket connections without saving the form', async () => {
  app('/settings/instances');
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 live-01 수정' }));
  const dialog = screen.getByRole('dialog', { name: '인스턴스 수정' });
  const edit = within(dialog);
  const id = edit.getByRole('textbox', { name: '인스턴스 ID' });
  expect(id).toHaveValue('live-01');
  expect(id).toHaveAttribute('readonly');
  expect(id).toHaveAccessibleName('인스턴스 ID');
  const start = await edit.findByRole('button', { name: '연결 시작' });
  expect(requests.some((url) => url.endsWith('/connection/start'))).toBe(false);

  const name = edit.getByRole('textbox', { name: '인스턴스 live-01 표시명' });
  const original = (name as HTMLInputElement).value;
  fireEvent.change(name, { target: { value: 'Changed name' } });
  expect(start).toBeDisabled();
  fireEvent.change(name, { target: { value: original } });
  expect(start).toBeEnabled();
  fireEvent.click(start);
  const stop = await edit.findByRole('button', { name: '연결 종료' });
  await waitFor(() => expect(stop).toBeEnabled());
  expect(
    requests.some((url, index) => url.endsWith('/connection/start') && methods[index] === 'POST'),
  ).toBe(true);
  expect(methods).not.toContain('PUT');
  fireEvent.click(stop);
  await edit.findByRole('button', { name: '연결 시작' });
  expect(
    requests.some((url, index) => url.endsWith('/connection/stop') && methods[index] === 'POST'),
  ).toBe(true);
  expect(dialog).toBeInTheDocument();
});

test('brand navigates from settings to the dashboard', async () => {
  app('/settings/instances');
  const brand = await screen.findByRole('link', { name: '종합현황으로 이동' });
  expect(brand).toHaveAttribute('href', '/');
  fireEvent.click(brand);
  expect(await screen.findByRole('heading', { name: '종합 현황' })).toBeVisible();
});
