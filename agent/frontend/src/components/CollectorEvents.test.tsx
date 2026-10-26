import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { DefaultService } from '../generated';
import CollectorEvents from './CollectorEvents';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('keeps XLog cursor navigation while presenting records with the official table and buttons', async () => {
  const getEvents = vi.spyOn(DefaultService, 'getCollectorEvents').mockResolvedValue({
    items: [
      {
        id: 100,
        received_at: '2026-01-01T00:00:00Z',
        payload: { started_at: 100, duration_ms: 42, method: 'GET', path: '/health', status: 200 },
      },
    ],
  } as Awaited<ReturnType<typeof DefaultService.getCollectorEvents>>);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CollectorEvents projectId="alpha" instanceId="web" />
    </QueryClientProvider>,
  );
  const table = await screen.findByRole('table', { name: 'XLog 요청 목록' });
  expect(table.closest('.ant-pro-table')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '최신 기록' })).toHaveClass('ant-btn');
  expect(screen.getByRole('button', { name: '이전 기록' })).toBeDisabled();
  expect(screen.getByRole('img', { name: 'XLog 요청 처리 시간 분포' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '최신 기록' }));
  await waitFor(() =>
    expect(getEvents).toHaveBeenCalledWith({
      projectId: 'alpha',
      instanceId: 'web',
      kind: 'XLOG',
      beforeId: 0,
    }),
  );
});
