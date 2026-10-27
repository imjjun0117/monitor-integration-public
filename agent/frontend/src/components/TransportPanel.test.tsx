import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CancelablePromise, DefaultService, ConnectionState } from '../generated';
import { MemoryRouter } from 'react-router-dom';
import TransportPanel from './TransportPanel';
import { PermissionContext } from './PermissionContext';

afterEach(cleanup);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(DefaultService, 'getConnection').mockResolvedValue({
    state: 'IDLE',
    mode: ConnectionState.mode.WSS,
  });
  vi.spyOn(DefaultService, 'getXlogSettings').mockResolvedValue({ enabled: false });
});

it('never starts on mount and starts only after the button click', async () => {
  const start = vi
    .spyOn(DefaultService, 'startConnection')
    .mockResolvedValue({ state: 'CONNECTING' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TransportPanel projectId="sample-a" instanceId="prod" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const button = await screen.findByRole('button', { name: '연결 시작' });
  expect(screen.getByRole('region', { name: 'Collector 연결 상태' })).toHaveClass('ant-card');
  expect(screen.getByText('연결 대기')).toHaveClass('ant-tag');
  expect(start).not.toHaveBeenCalled();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(button);
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  expect(start).toHaveBeenCalledWith({ projectId: 'sample-a', instanceId: 'prod' });
  client.clear();
});

it('read-only users cannot start a connection or alter XLog', async () => {
  const start = vi.spyOn(DefaultService, 'startConnection');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PermissionContext.Provider
          value={{ role: 'VIEWER', username: 'reader', isAdmin: false, canWrite: false }}
        >
          <TransportPanel projectId="sample-a" instanceId="prod" />
        </PermissionContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('status');
  expect(screen.queryByRole('button', { name: '연결 시작' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(start).not.toHaveBeenCalled();
  client.clear();
});

it('blocks duplicate operations across panels for the same instance', async () => {
  let finish!: () => void;
  const start = vi.spyOn(DefaultService, 'startConnection').mockImplementation(
    () =>
      new CancelablePromise((resolve) => {
        finish = () => resolve({ state: 'CONNECTING' });
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TransportPanel projectId="sample-a" instanceId="prod" />
        <TransportPanel projectId="sample-a" instanceId="prod" compact />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const buttons = await screen.findAllByRole('button', { name: '연결 시작' });
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(buttons[1]).toBeDisabled());
  fireEvent.click(buttons[1]);
  expect(start).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(buttons[1]).toBeEnabled());
  client.clear();
});

it('shows a state-query failure without offering a connection action', async () => {
  vi.mocked(DefaultService.getConnection).mockRejectedValue(new Error('unavailable'));
  const start = vi.spyOn(DefaultService, 'startConnection');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TransportPanel projectId="sample-a" instanceId="prod" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByText('연결 상태를 불러오지 못했습니다.')).toBeVisible();
  expect(screen.queryByRole('button', { name: '연결 시작' })).not.toBeInTheDocument();
  expect(start).not.toHaveBeenCalled();
  client.clear();
});
