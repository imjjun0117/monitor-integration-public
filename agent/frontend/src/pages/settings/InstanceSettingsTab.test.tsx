import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { createInstance, updateInstance } from '../../api';
import { CancelablePromise, ConnectionState, DefaultService } from '../../generated';
import { selectOption } from '../../test-select';
import InstanceSettingsTab from './InstanceSettingsTab';

vi.mock('../../api', () => ({
  getProjects: vi.fn(async () => ({
    items: [{ project_id: 'alpha', display_name: 'Alpha', enabled: true }],
  })),
  getInstances: vi.fn(async () => ({
    items: [
      {
        instance_id: 'dev',
        display_name: 'Dev',
        environment: 'development',
        agent_base_url: 'https://example.com',
        poll_interval_seconds: 30,
        api_checks_enabled: false,
        enabled: true,
      },
    ],
  })),
  updateInstance: vi.fn(async () => undefined),
  createInstance: vi.fn(),
  deleteInstancePermanently: vi.fn(),
  testInstance: vi.fn(),
}));
vi.mock('../../generated', async (original) => ({
  ...(await original<typeof import('../../generated')>()),
  DefaultService: {
    getConnection: vi.fn(),
    getXlogSettings: vi.fn(async () => ({ enabled: false })),
    saveConnectionMode: vi.fn(),
    saveXlogSettings: vi.fn(),
    startConnection: vi.fn(),
    stopConnection: vi.fn(),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateInstance).mockResolvedValue(undefined);
  vi.mocked(DefaultService.getConnection).mockResolvedValue({
    mode: ConnectionState.mode.HTTP,
    state: 'IDLE',
  });
  vi.mocked(DefaultService.saveConnectionMode).mockImplementation(
    () =>
      new CancelablePromise((resolve) => {
        vi.mocked(DefaultService.getConnection).mockResolvedValue({
          mode: ConnectionState.mode.WSS,
          state: 'IDLE',
        });
        resolve({ state: 'IDLE' });
      }),
  );
  vi.mocked(DefaultService.startConnection).mockImplementation(
    () =>
      new CancelablePromise((resolve) => {
        vi.mocked(DefaultService.getConnection).mockResolvedValue({
          mode: ConnectionState.mode.WSS,
          state: 'CONNECTING',
        });
        resolve({ state: 'CONNECTING' });
      }),
  );
});
afterEach(cleanup);
async function edit() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <InstanceSettingsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '인스턴스 dev 수정' }));
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: '수집 방식' })).not.toBeDisabled(),
  );
  await selectOption(screen.getByRole('combobox', { name: '수집 방식' }), '웹소켓 연결');
}
test('registration is an AntD dialog and Escape cancels without creating', async () => {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <InstanceSettingsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const register = await screen.findByRole('button', { name: '등록' });
  await waitFor(() => expect(register).toBeEnabled());
  fireEvent.click(register);
  expect(screen.getByRole('dialog', { name: '인스턴스 등록' })).toHaveClass('ant-modal');
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(createInstance).not.toHaveBeenCalled();
});

test('failed registration keeps the draft, but cancel and reopen starts clean', async () => {
  vi.mocked(createInstance).mockRejectedValueOnce(new Error('network failed'));
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <InstanceSettingsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const register = await screen.findByRole('button', { name: '등록' });
  await waitFor(() => expect(register).toBeEnabled());
  fireEvent.click(register);
  fireEvent.change(screen.getByRole('textbox', { name: '인스턴스 ID' }), {
    target: { value: 'new-instance' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: '인스턴스 표시명' }), {
    target: { value: 'New' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Collector Base URL' }), {
    target: { value: 'https://collector.example.com' },
  });
  fireEvent.change(screen.getByLabelText('Collector 토큰'), {
    target: { value: 'test-token-with-thirty-two-bytes-long' },
  });
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 등록 확인' }));
  await waitFor(() =>
    expect(createInstance).toHaveBeenCalledWith(
      'alpha',
      expect.objectContaining({ instanceId: 'new-instance' }),
    ),
  );
  expect(
    await screen.findByText('요청을 처리하지 못했습니다. 입력값과 서버 상태를 확인하세요.'),
  ).toBeVisible();
  expect(screen.getByRole('textbox', { name: '인스턴스 ID' })).toHaveValue('new-instance');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  fireEvent.click(register);
  expect(
    screen.queryByText('요청을 처리하지 못했습니다. 입력값과 서버 상태를 확인하세요.'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '인스턴스 ID' })).toHaveValue('');
  expect(screen.getByLabelText('Collector 토큰')).toHaveValue('');
});

test('saves changed settings and closes without starting WSS', async () => {
  await edit();
  expect(screen.getByText('연결 대기')).toBeVisible();
  expect(screen.queryByRole('button', { name: /저장하고 연결|저장만/ })).not.toBeInTheDocument();
  const save = screen.getByRole('button', { name: '인스턴스 dev 저장' });
  expect(save).toHaveTextContent('저장');
  fireEvent.click(save);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(vi.mocked(updateInstance).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(DefaultService.saveConnectionMode).mock.invocationCallOrder[0],
  );
  expect(DefaultService.startConnection).not.toHaveBeenCalled();
});
test('a failed save keeps the dialog open and never starts WSS', async () => {
  vi.mocked(updateInstance).mockRejectedValue(new Error('save failed'));
  await edit();
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 dev 저장' }));
  expect(await screen.findByText(/일부 항목은 이미 저장됐을 수/)).toBeVisible();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(DefaultService.startConnection).not.toHaveBeenCalled();
});
// AntD 폼을 두 번 열고 실패·재시도까지 검증하므로 병렬 전체 실행 시 렌더링 여유를 둔다.
test('saved WSS settings can be connected separately and retried without saving again', async () => {
  await edit();
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 dev 저장' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '인스턴스 dev 수정' }));
  vi.mocked(DefaultService.startConnection).mockRejectedValueOnce(new Error('connection failed'));
  fireEvent.click(await screen.findByRole('button', { name: '연결 시작' }));
  expect(await screen.findByText(/연결 요청에 실패했습니다/)).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: '연결 시작' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: '연결 시작' }));
  expect(await screen.findByText('연결 시도 중')).toBeVisible();
  expect(DefaultService.startConnection).toHaveBeenCalledTimes(2);
  expect(updateInstance).toHaveBeenCalledTimes(1);
}, 40_000);
