import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getLogs, readLog, saveLog, type LogSource } from '../api';
import { CancelablePromise } from '../generated';
import { selectOption } from '../test-select';
import LogPanel, { appendLogText } from './LogPanel';

vi.mock('../api', () => ({ getLogs: vi.fn(), readLog: vi.fn(), saveLog: vi.fn() }));
const source: LogSource = {
  log_id: 1,
  name: 'WAS',
  path: '/logs/catalina.out',
  encoding: 'UTF-8' as LogSource['encoding'],
  enabled: true,
  poll_interval_seconds: 10,
};
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.mocked(getLogs).mockResolvedValue([source]);
  vi.mocked(readLog).mockImplementation(
    () =>
      new CancelablePromise((resolve) =>
        resolve({
          text: 'raw token=value <script>literal</script>\n',
          cursor: '1',
          reset: false,
          limited: false,
          code: null,
          retry_after_seconds: 10,
        }),
      ),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function view() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <LogPanel projectId="test" instanceId="dev" />
    </QueryClientProvider>,
  );
}
test('polls only while open, uses configured interval, and pauses for hidden tabs and navigation', async () => {
  const rendered = view();
  const button = await screen.findByRole('button', { name: 'WAS' });
  expect(readLog).not.toHaveBeenCalled();
  vi.useFakeTimers();
  fireEvent.click(button);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(readLog).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('로그 원문')).toHaveTextContent(
    'token=value <script>literal</script>',
  );
  expect(screen.getByLabelText('로그 원문').querySelector('script')).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9_999);
  });
  expect(readLog).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(readLog).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: '조회 시작' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(readLog).toHaveBeenCalledTimes(3);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(readLog).toHaveBeenCalledTimes(3);
  rendered.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(readLog).toHaveBeenCalledTimes(3);
});
test('unused sources cannot open, while settings save enabled flag and seconds', async () => {
  vi.mocked(getLogs).mockResolvedValue([{ ...source, enabled: false }]);
  vi.mocked(saveLog).mockResolvedValue(undefined);
  view();
  expect(await screen.findByRole('button', { name: 'WAS' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '설정' }));
  await selectOption(screen.getByRole('combobox', { name: '로그 조회' }), '사용');
  fireEvent.change(screen.getByRole('spinbutton', { name: '조회 주기(초)' }), {
    target: { value: '1800' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(saveLog).toHaveBeenCalledWith(
      'test',
      'dev',
      expect.objectContaining({ enabled: true, pollIntervalSeconds: 1800 }),
      1,
    ),
  );
  expect(readLog).not.toHaveBeenCalled();
});
test('HTTP errors stop automatic requests and restarting respects retry cooldown', async () => {
  vi.mocked(readLog).mockImplementation(
    () =>
      new CancelablePromise((resolve) =>
        resolve({
          text: '',
          cursor: '',
          reset: false,
          limited: false,
          code: 'AGENT_HTTP_ERROR',
          retry_after_seconds: 60,
        }),
      ),
  );
  view();
  const button = await screen.findByRole('button', { name: 'WAS' });
  vi.useFakeTimers();
  fireEvent.click(button);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(readLog).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '조회 시작' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59_000);
  });
  expect(readLog).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  expect(readLog).toHaveBeenCalledTimes(2);
});
test('browser output stays bounded and reset discards previous file contents', () => {
  expect(appendLogText('old', 'new', true)).toBe('new');
  expect(appendLogText('', 'x'.repeat(200_000), false).length).toBe(131072);
  expect(appendLogText('', 'line\n'.repeat(3000), false).split('\n').length).toBe(2000);
});
