import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { getAudit } from '../../api';
import AuditSettingsTab from './AuditSettingsTab';

vi.mock('../../api', () => ({
  getProjects: vi.fn(async () => ({ items: [] })),
  getAudit: vi.fn(async () => ({
    items: [
      {
        audit_id: 1,
        occurred_at: '2026-01-01T00:00:00Z',
        actor: 'admin',
        action: 'UPDATE',
        entity_type: 'projects',
        target_id: 'alpha',
        outcome: 'SUCCESS',
        before_values: { enabled: false },
        after_values: { enabled: true },
      },
    ],
    total: 51,
  })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
test('audit ProTable preserves actor filtering, diff inspection and 0-based server pages', async () => {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuditSettingsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByText('alpha')).toBeVisible();
  expect(
    screen.getByRole('table', { name: '변경 이력' }).closest('.ant-table-content'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText('변경 내용 1건'));
  await waitFor(() => expect(screen.getByText('아니오 → 예')).toBeVisible());
  fireEvent.change(screen.getByRole('textbox', { name: '변경자' }), { target: { value: 'other' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await waitFor(() => expect(getAudit).toHaveBeenLastCalledWith(0, '', 'other'));
  fireEvent.click(await screen.findByRole('button', { name: '다음' }));
  await waitFor(() => expect(getAudit).toHaveBeenLastCalledWith(1, '', 'other'));
});
