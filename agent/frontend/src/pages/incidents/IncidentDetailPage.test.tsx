import { Grid } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { actOnIncident, getIncident, getIncidentEvidence, getIncidents } from '../../api';
import { PermissionContext } from '../../components/PermissionContext';
import { ApiError, DashboardStatusCause, Incident, Status } from '../../generated';
import { CancelablePromise } from '../../generated/core/CancelablePromise';
import type { IncidentDetail, IncidentEvidence } from '../../generated';
import IncidentDetailPage from './IncidentDetailPage';
import IncidentsPage from './IncidentsPage';

vi.mock('../../api', () => ({
  getIncident: vi.fn(),
  getIncidentEvidence: vi.fn(),
  actOnIncident: vi.fn(),
  getIncidents: vi.fn(),
}));
vi.mock('../../components/MetricChart', () => ({
  default: ({ title }: { title: string }) => <div role="img" aria-label={`${title} 추이`} />,
}));

const observation: DashboardStatusCause = {
  project_id: 'p',
  instance_id: 'i',
  kind: DashboardStatusCause.kind.CHECK,
  status: Status.DOWN,
  metric_key: null,
  subject_id: 'batch',
  subject_name: '배치 지연',
  value: null,
  warning_value: null,
  critical_value: null,
  result_code: 'BATCH_STALE',
  observed_at: '2026-10-01T12:00:00Z',
};
const incident: Incident = {
  incident_id: 1,
  project_id: 'p',
  project_name: '샘플 프로젝트',
  instance_id: 'i',
  instance_name: '서버',
  kind: Incident.kind.CHECK,
  metric_key: null,
  subject_id: 'batch',
  subject_name: '배치 지연',
  severity: Incident.severity.DOWN,
  state: Incident.state.OPEN,
  opened_at: '2026-10-01T12:00:00Z',
  last_detected_at: '2026-10-01T12:05:00Z',
  closed_at: null,
  assignee: null,
  version: 0,
  first_observation: observation,
  latest_observation: observation,
};
const detail: IncidentDetail = { incident, events: [], assignees: ['operator'] };
const evidence: IncidentEvidence = {
  from: '2026-10-01T11:45:00Z',
  to: '2026-10-01T12:15:00Z',
  logs_allowed: false,
  changes_allowed: false,
  resources: [],
  checks: [],
  logs: [],
  changes: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getIncident).mockResolvedValue(detail);
  vi.mocked(getIncidentEvidence).mockResolvedValue(evidence);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function show(write = true, path = '/incidents/1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PermissionContext.Provider
        value={{
          role: write ? 'OPERATOR' : 'VIEWER',
          username: 'tester',
          canWrite: write,
          isAdmin: false,
        }}
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/incidents/:incidentId" element={<IncidentDetailPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
          </Routes>
        </MemoryRouter>
      </PermissionContext.Provider>
    </QueryClientProvider>,
  );
  return client;
}

test('viewer can investigate but cannot edit or read restricted evidence', async () => {
  show(false);
  await screen.findByRole('heading', { name: /배치 지연/ });
  expect(screen.queryByRole('button', { name: '확인 처리' })).not.toBeInTheDocument();
  expect(await screen.findByRole('tab', { name: '점검 결과' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  fireEvent.click(screen.getByRole('tab', { name: '보관 로그' }));
  expect(await screen.findByText('원문 로그 조회 권한이 없습니다.')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '설정 변경' }));
  expect(screen.getByText('설정 변경 이력은 관리자만 조회할 수 있습니다.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '최근 이상 전후' }));
  await waitFor(() =>
    expect(getIncidentEvidence).toHaveBeenLastCalledWith(1, incident.last_detected_at),
  );
  expect(screen.getByRole('tab', { name: '설정 변경' })).toHaveAttribute('aria-selected', 'true');
});

test('acknowledgement uses the current version and updates available actions', async () => {
  const updated = { ...incident, version: 1, state: Incident.state.ACKNOWLEDGED };
  vi.mocked(actOnIncident).mockImplementation(() => {
    vi.mocked(getIncident).mockResolvedValue({ ...detail, incident: updated });
    return new CancelablePromise((resolve) => resolve(updated));
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: '확인 처리' }));
  await waitFor(() =>
    expect(actOnIncident).toHaveBeenCalledWith(1, { version: 0, action: 'ACKNOWLEDGE' }),
  );
  expect(await screen.findByText('조치 기록을 저장했습니다.')).toBeVisible();
  expect(screen.getByRole('button', { name: '확인 처리' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '조치 시작' })).toBeEnabled();
});

test('conflicting edits preserve the draft and require accepting the refreshed version', async () => {
  const newer = {
    ...detail,
    incident: { ...incident, version: 2, state: Incident.state.IN_PROGRESS },
  };
  vi.mocked(actOnIncident).mockImplementation(() => {
    vi.mocked(getIncident).mockResolvedValue(newer);
    return new CancelablePromise((_, reject) =>
      reject(
        new ApiError(
          { method: 'POST', url: '/actions' },
          { url: '/actions', ok: false, status: 409, statusText: 'Conflict', body: {} },
          'Conflict',
        ),
      ),
    );
  });
  show();
  fireEvent.change(await screen.findByLabelText('조치 메모'), {
    target: { value: '배치 로그 확인 중' },
  });
  fireEvent.click(screen.getByRole('button', { name: '메모 등록' }));
  await screen.findByText('장애 상태나 다른 담당자의 기록이 변경되었습니다.');
  await waitFor(() => expect(screen.getByRole('button', { name: '조치 시작' })).toBeDisabled());
  expect(screen.getByLabelText('조치 메모')).toHaveValue('배치 로그 확인 중');
  fireEvent.click(screen.getByRole('button', { name: '최신 상태로 계속 작성' }));
  vi.mocked(actOnIncident).mockResolvedValue({ ...newer.incident, version: 3 });
  fireEvent.click(screen.getByRole('button', { name: '메모 등록' }));
  await waitFor(() =>
    expect(actOnIncident).toHaveBeenLastCalledWith(1, {
      version: 2,
      action: 'COMMENT',
      note: '배치 로그 확인 중',
    }),
  );
});

test('later automatic recovery is detected even after saving an earlier action', async () => {
  vi.mocked(actOnIncident).mockResolvedValue({ ...incident, version: 1 });
  const client = show();
  fireEvent.change(await screen.findByLabelText('조치 메모'), { target: { value: '확인 중' } });
  fireEvent.click(screen.getByRole('button', { name: '메모 등록' }));
  await screen.findByText('조치 기록을 저장했습니다.');
  await act(async () => {
    client.setQueryData(['incident', 1], {
      ...detail,
      incident: {
        ...incident,
        version: 2,
        state: Incident.state.RECOVERED,
        closed_at: '2026-10-01T12:10:00Z',
      },
    });
  });
  expect(await screen.findByText('장애 상태나 다른 담당자의 기록이 변경되었습니다.')).toBeVisible();
  expect(screen.getByRole('button', { name: '복구 전후' })).toBeVisible();
});

test('the incident investigation uses accessible AntD tabs and a details card', async () => {
  show();
  await screen.findByRole('heading', { name: /배치 지연/ });
  expect(
    (await screen.findByRole('tab', { name: '점검 결과' })).closest('.ant-tabs'),
  ).toBeInTheDocument();
  expect(screen.getByText('최초 감지').closest('.ant-descriptions')).toBeInTheDocument();
});

test('list passes the state filter and links each record to its project', async () => {
  vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ md: true });
  vi.mocked(getIncidents).mockResolvedValue({ items: [incident], total: 1, page: 0, size: 50 });
  show(false, '/incidents?state=RECOVERED');
  expect(
    (await screen.findByRole('table', { name: '장애 관리대장' })).closest('.ant-pro-table'),
  ).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /배치 지연/ })).toHaveAttribute(
    'href',
    '/incidents/1?project=p',
  );
  expect(getIncidents).toHaveBeenCalledWith('', 'RECOVERED', 0);
  expect(document.querySelector('.ant-pagination-next')).toHaveClass('ant-pagination-disabled');
  fireEvent.click(screen.getByRole('button', { name: '미확인' }));
  await waitFor(() => expect(getIncidents).toHaveBeenLastCalledWith('', 'OPEN', 0));
});

test('incident pagination keeps server page indexes and displays the current server slice', async () => {
  vi.mocked(getIncidents).mockResolvedValue({ items: [incident], total: 101, page: 1, size: 50 });
  show(false, '/incidents?state=ACTIVE&page=1');
  expect(await screen.findByRole('link', { name: /배치 지연/ })).toBeInTheDocument();
  expect(getIncidents).toHaveBeenCalledWith('', 'ACTIVE', 1);
  fireEvent.click(screen.getByTitle('Next Page'));
  await waitFor(() => expect(getIncidents).toHaveBeenLastCalledWith('', 'ACTIVE', 2));
});

test('metric incidents focus the affected resource and show other evidence only on selection', async () => {
  const disk = {
    ...observation,
    kind: DashboardStatusCause.kind.METRIC,
    metric_key: 'DISK',
    value: 0.97,
    warning_value: 0.8,
    critical_value: 0.9,
  };
  vi.mocked(getIncident).mockResolvedValue({
    ...detail,
    incident: {
      ...incident,
      kind: Incident.kind.METRIC,
      metric_key: 'DISK',
      first_observation: disk,
      latest_observation: disk,
    },
  });
  vi.mocked(getIncidentEvidence).mockResolvedValue({
    ...evidence,
    resources: [
      {
        sampled_at: incident.opened_at,
        system_cpu_ratio: 0.5,
        heap_ratio: 0.5,
        memory_ratio: 0.5,
        disk_ratio: 0.97,
        db_pool_ratio: 0.5,
      },
    ],
  });
  show();
  expect(await screen.findByRole('img', { name: '디스크 추이' })).toBeVisible();
  expect(screen.queryByRole('img', { name: '시스템 CPU 추이' })).not.toBeInTheDocument();
  expect(screen.getByText('최근 측정 97% · 위험 기준 90%')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '시스템 CPU' }));
  expect(screen.getByRole('img', { name: '시스템 CPU 추이' })).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '보관 로그' }));
  expect(screen.queryByRole('img', { name: '시스템 CPU 추이' })).not.toBeInTheDocument();
  expect(screen.getByText('원문 로그 조회 권한이 없습니다.')).toBeVisible();
});

// 작은 화면에서도 상태·시각·담당자를 생략하지 않고 필터 조건을 서버로 전달
test('mobile incident list retains metadata and filters through the compact selector', async () => {
  vi.stubGlobal('innerWidth', 390);
  vi.mocked(getIncidents).mockResolvedValue({ items: [incident], total: 1, page: 0, size: 50 });
  show(false, '/incidents');
  expect(await screen.findByRole('link', { name: /배치 지연/ })).toBeInTheDocument();
  expect(screen.getByText('담당자', { exact: false })).toHaveTextContent('미지정');
  expect(document.querySelector('time')).toHaveAttribute('datetime', incident.opened_at);
  expect(screen.getAllByRole('columnheader')).toHaveLength(1);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '장애 상태 필터' }));
  fireEvent.click(await screen.findByText('확인 완료', { exact: true }));
  await waitFor(() => expect(getIncidents).toHaveBeenLastCalledWith('', 'ACKNOWLEDGED', 0));
});
