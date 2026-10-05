import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import UserSettingsTab from './UserSettingsTab';
import { PermissionContext } from '../../components/PermissionContext';
import { createUser } from '../../api';
import { selectOption } from '../../test-select';

vi.mock('../../api', () => ({
  getUsers: vi.fn(async () => ({
    items: [
      {
        username: 'admin',
        role: 'ADMIN',
        enabled: true,
        project_ids: [],
        created_at: '2026-10-04T00:00:00Z',
        updated_at: '2026-10-04T00:00:00Z',
      },
    ],
    total: 1,
    page: 0,
    size: 50,
  })),
  getProjects: vi.fn(async () => ({
    items: [{ project_id: 'alpha', display_name: 'Alpha' }],
    total: 1,
    page: 0,
    size: 200,
  })),
  createUser: vi.fn(async () => undefined),
  updateUser: vi.fn(async () => undefined),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PermissionContext.Provider
        value={{ username: 'admin', role: 'ADMIN', isAdmin: true, canWrite: true }}
      >
        <UserSettingsTab />
      </PermissionContext.Provider>
    </QueryClientProvider>,
  );
}

test('creates a scoped viewer and never fills the editing form with an existing password', async () => {
  show();
  await screen.findByRole('button', { name: 'admin 계정 수정' });
  fireEvent.click(screen.getByRole('button', { name: '사용자 등록' }));
  fireEvent.change(screen.getByLabelText('계정 ID'), { target: { value: 'reader' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'test-password-123' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: /Alpha/ }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(createUser).toHaveBeenCalledWith({
      username: 'reader',
      password: 'test-password-123',
      role: 'VIEWER',
      enabled: true,
      projectIds: ['alpha'],
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'admin 계정 수정' }));
  expect(screen.getByLabelText('새 비밀번호')).toHaveValue('');
  expect(screen.getByLabelText('역할')).toBeDisabled();
  expect(screen.queryByLabelText('계정 상태')).not.toBeInTheDocument();
});

test('selecting administrator clears project assignments and rejects a short password', async () => {
  show();
  await screen.findByRole('button', { name: 'admin 계정 수정' });
  fireEvent.click(screen.getByRole('button', { name: '사용자 등록' }));
  fireEvent.change(screen.getByLabelText('계정 ID'), { target: { value: 'manager' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'short' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: /Alpha/ }));
  await selectOption(screen.getByLabelText('역할'), '관리자');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(createUser).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('12자 이상');
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'test-password-123' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', projectIds: [] }),
    ),
  );
});
