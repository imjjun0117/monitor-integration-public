import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { saveCheckSettings, type ApiCheck } from '../api';
import { Check, Status } from '../generated';
import { selectOption } from '../test-select';
import CheckSettingsButton from './CheckSettingsButton';

vi.mock('../api', () => ({ saveCheckSettings: vi.fn() }));
const check: ApiCheck = {
  project_id: 'market',
  instance_id: 'dev',
  check_id: 'batch-cleanup',
  name: '판매특허 정리 배치 신선도',
  category: Check.category.INTERNAL,
  direction: null,
  status: Status.DOWN,
  checked_at: null,
  duration_ms: null,
  result_code: 'INTERNAL_CHECK_FAILED',
  message: null,
  monitoring_enabled: true,
  automatic_enabled: false,
  check_interval_seconds: 300,
  automatic_allowed: true,
  history: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(saveCheckSettings).mockResolvedValue();
});
afterEach(cleanup);
function view(value = check) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <CheckSettingsButton check={value} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '판매특허 정리 배치 점검 점검 설정' }));
}
test('internal check uses plain name and saves automatic interval in seconds', async () => {
  view();
  expect(screen.getByRole('spinbutton', { name: '점검 주기(분)' })).toBeDisabled();
  await selectOption(screen.getByRole('combobox', { name: '자동 실행' }), '사용');
  fireEvent.change(screen.getByRole('spinbutton', { name: '점검 주기(분)' }), {
    target: { value: '60' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(saveCheckSettings).toHaveBeenCalledWith(check, {
      monitoringEnabled: true,
      automaticEnabled: true,
      checkIntervalSeconds: 3600,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
test('unused disables automatic controls while preserving saved schedule', async () => {
  view({ ...check, automatic_enabled: true, check_interval_seconds: 86400 });
  await selectOption(screen.getByRole('combobox', { name: '점검 사용 여부' }), '미사용');
  expect(screen.getByRole('combobox', { name: '자동 실행' })).toBeDisabled();
  expect(screen.getByRole('spinbutton', { name: '점검 주기(분)' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(saveCheckSettings).toHaveBeenCalledWith(expect.anything(), {
      monitoringEnabled: false,
      automaticEnabled: true,
      checkIntervalSeconds: 86400,
    }),
  );
});
test('invalid interval cannot submit and save failure keeps draft open', async () => {
  view({ ...check, automatic_enabled: true });
  fireEvent.change(screen.getByRole('spinbutton', { name: '점검 주기(분)' }), {
    target: { value: '10081' },
  });
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  expect(saveCheckSettings).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('spinbutton', { name: '점검 주기(분)' }), {
    target: { value: '10' },
  });
  vi.mocked(saveCheckSettings).mockRejectedValueOnce(new Error('failed'));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(
    await screen.findByText('점검 설정을 저장하지 못했습니다. 다시 시도하세요.'),
  ).toBeVisible();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByRole('spinbutton')).toHaveValue(10);
});
