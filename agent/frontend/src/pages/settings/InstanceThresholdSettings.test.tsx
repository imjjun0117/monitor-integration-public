import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import InstanceThresholdSettings from './InstanceThresholdSettings';
import {
  getInstanceThresholds,
  saveInstanceThresholds,
  getInstanceThresholdCertificates,
} from '../../api';
import type { InstanceThresholdSettings as Settings } from '../../generated';
import { InstanceThresholdMetricKey as MetricKey, CancelablePromise } from '../../generated';
import { PermissionContext } from '../../components/PermissionContext';
import { selectOption } from '../../test-select';

vi.mock('../../api', () => ({
  getInstanceThresholds: vi.fn(),
  saveInstanceThresholds: vi.fn(),
  getInstanceThresholdCertificates: vi.fn(),
}));
const settings: Settings = {
  projectName: 'Alpha',
  instanceName: '개발서버',
  recipientEmails: [],
  metrics: [],
};
function metric(metricKey: MetricKey, email: string) {
  return {
    metricKey,
    warningValue: metricKey === 'API_LATENCY_MS' ? 2000 : 0.8,
    criticalValue: metricKey === 'API_LATENCY_MS' ? 5000 : 0.9,
    defaultWarningValue: 0.8,
    defaultCriticalValue: 0.9,
    useDefault: false,
    recipientEmails: [email],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInstanceThresholds).mockResolvedValue(settings);
  vi.mocked(getInstanceThresholdCertificates).mockResolvedValue([
    { id: 41, label: 'ssl.example:443' },
  ]);
  vi.mocked(saveInstanceThresholds).mockImplementation(
    (_, __, value) =>
      new CancelablePromise((resolve) =>
        resolve({
          ...settings,
          ...value,
          metrics: value.metrics.map((item) => ({
            ...item,
            defaultWarningValue: item.warningValue,
            defaultCriticalValue: item.criticalValue,
          })),
        }),
      ),
  );
});
afterEach(cleanup);
function page(canWrite = true) {
  render(
    <PermissionContext.Provider
      value={{ role: canWrite ? 'OPERATOR' : 'VIEWER', username: 'test', isAdmin: false, canWrite }}
    >
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <InstanceThresholdSettings projectId="alpha" instanceId="dev" />
      </QueryClientProvider>
    </PermissionContext.Provider>,
  );
}
async function add(name: string, warning: string, critical: string, email: string) {
  fireEvent.click(await screen.findByRole('button', { name: '추가' }));
  await selectOption(screen.getByLabelText('항목'), name);
  fireEvent.change(screen.getByLabelText('경고 기준'), { target: { value: warning } });
  fireEvent.change(screen.getByLabelText('위험 기준'), { target: { value: critical } });
  fireEvent.change(screen.getByLabelText('알림 이메일'), { target: { value: email } });
}

test('starts empty and only opens item registration when add is clicked', async () => {
  page();
  expect(await screen.findByText(/등록된 임계치가 없습니다/)).toBeVisible();
  expect(screen.queryByText('CPU 사용률')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('기본 담당 이메일')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '추가' }));
  expect(screen.getByRole('dialog', { name: '임계치 추가' })).toBeVisible();
  expect(screen.getByLabelText('경고 기준')).toHaveValue(null);
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(saveInstanceThresholds).not.toHaveBeenCalled();
});

test('registers only selected items with independent email lists and unit conversions', async () => {
  page();
  await add('CPU 사용률', '75', '90', 'cpu@example.com, support@example.com');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  await screen.findByRole('button', { name: 'CPU 사용률 수정' });
  expect(saveInstanceThresholds).toHaveBeenLastCalledWith('alpha', 'dev', {
    recipientEmails: [],
    metrics: [
      {
        metricKey: 'SYSTEM_CPU',
        warningValue: 0.75,
        criticalValue: 0.9,
        useDefault: false,
        recipientEmails: ['cpu@example.com', 'support@example.com'],
      },
    ],
  });
  await add('API 응답시간', '3', '5', 'api@example.com');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  await screen.findByRole('button', { name: 'API 응답시간 수정' });
  const saved = vi.mocked(saveInstanceThresholds).mock.calls[1][2];
  expect(saved.metrics).toHaveLength(2);
  expect(saved.metrics[0].recipientEmails).toEqual(['cpu@example.com', 'support@example.com']);
  expect(saved.metrics[1]).toEqual({
    metricKey: 'API_LATENCY_MS',
    warningValue: 3000,
    criticalValue: 5000,
    useDefault: false,
    recipientEmails: ['api@example.com'],
  });
});

test('edits one item and preserves other items and their email lists', async () => {
  vi.mocked(getInstanceThresholds).mockResolvedValue({
    ...settings,
    metrics: [
      metric(MetricKey.SYSTEM_CPU, 'cpu@example.com'),
      metric(MetricKey.PHYSICAL_MEMORY, 'ram@example.com'),
    ],
  });
  page();
  fireEvent.click(await screen.findByRole('button', { name: 'CPU 사용률 수정' }));
  expect(screen.getByLabelText('경고 기준')).toHaveValue(80);
  fireEvent.change(screen.getByLabelText('경고 기준'), { target: { value: '70' } });
  fireEvent.change(screen.getByLabelText('알림 이메일'), {
    target: { value: 'new-cpu@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(saveInstanceThresholds).toHaveBeenCalledOnce());
  const saved = vi.mocked(saveInstanceThresholds).mock.calls[0][2];
  expect(saved.metrics).toContainEqual(
    expect.objectContaining({
      metricKey: 'PHYSICAL_MEMORY',
      warningValue: 0.8,
      recipientEmails: ['ram@example.com'],
    }),
  );
  expect(saved.metrics).toContainEqual(
    expect.objectContaining({
      metricKey: 'SYSTEM_CPU',
      warningValue: 0.7,
      recipientEmails: ['new-cpu@example.com'],
    }),
  );
});

test('excludes already registered items from add and deletes only after confirmation', async () => {
  vi.mocked(getInstanceThresholds).mockResolvedValue({
    ...settings,
    metrics: [metric(MetricKey.SYSTEM_CPU, 'cpu@example.com')],
  });
  page();
  fireEvent.click(await screen.findByRole('button', { name: '추가' }));
  fireEvent.click(screen.getByLabelText('항목'));
  expect(screen.queryByRole('option', { name: 'CPU 사용률' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'RAM 사용률' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  fireEvent.click(screen.getByRole('button', { name: 'CPU 사용률 삭제' }));
  expect(saveInstanceThresholds).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  expect(await screen.findByText(/등록된 임계치가 없습니다/)).toBeVisible();
  expect(saveInstanceThresholds).toHaveBeenLastCalledWith('alpha', 'dev', {
    recipientEmails: [],
    metrics: [],
  });
});

test('rejects reversed thresholds and invalid email addresses without saving', async () => {
  page();
  await add('CPU 사용률', '95', '90', 'cpu@example.com');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  expect(await screen.findByText(/CPU 사용률: 경고는 위험 이하/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('경고 기준'), { target: { value: '75' } });
  fireEvent.change(screen.getByLabelText('알림 이메일'), { target: { value: 'broken' } });
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  expect(await screen.findByText(/알림 이메일을 확인/)).toBeVisible();
  expect(saveInstanceThresholds).not.toHaveBeenCalled();
});

test('viewer can read registered items but cannot add edit or delete', async () => {
  vi.mocked(getInstanceThresholds).mockResolvedValue({
    ...settings,
    metrics: [metric(MetricKey.SYSTEM_CPU, 'cpu@example.com')],
  });
  page(false);
  expect(await screen.findByText('cpu@example.com')).toBeVisible();
  for (const name of ['추가', 'CPU 사용률 수정', 'CPU 사용률 삭제']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
});

test('failed registration leaves the dialog open and the saved list untouched', async () => {
  vi.mocked(saveInstanceThresholds).mockRejectedValue(new Error('failed'));
  page();
  await add('CPU 사용률', '75', '90', '');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  await waitFor(() => expect(saveInstanceThresholds).toHaveBeenCalledOnce());
  expect(screen.getByRole('dialog', { name: '임계치 추가' })).toBeVisible();
  expect(screen.getByText(/등록된 임계치가 없습니다/)).toBeVisible();
});

test('registers SSL days and a selected certificate with descending limits', async () => {
  page();
  await add('SSL 인증서 만료', '30', '7', 'ssl@example.com');
  expect(screen.getByText('경고 (일 이하)')).toBeVisible();
  expect(screen.getByText('위험 (일 이하)')).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText('인증서 대상')).toBeEnabled());
  await selectOption(screen.getByLabelText('인증서 대상'), 'ssl.example:443');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  await waitFor(() => expect(saveInstanceThresholds).toHaveBeenCalledOnce());
  expect(saveInstanceThresholds).toHaveBeenLastCalledWith('alpha', 'dev', {
    recipientEmails: [],
    metrics: [
      {
        metricKey: 'CERTIFICATE_DAYS',
        warningValue: 30,
        criticalValue: 7,
        useDefault: false,
        recipientEmails: ['ssl@example.com'],
        certificateTargetId: 41,
      },
    ],
  });
});

test('rejects reversed SSL day limits and missing certificate targets', async () => {
  page();
  await add('SSL 인증서 만료', '7', '30', 'ssl@example.com');
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  expect(await screen.findByText(/경고는 위험 이상/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('경고 기준'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('위험 기준'), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: '등록' }));
  expect(await screen.findByText('인증서 대상을 선택해 주세요.')).toBeVisible();
  expect(saveInstanceThresholds).not.toHaveBeenCalled();
});
