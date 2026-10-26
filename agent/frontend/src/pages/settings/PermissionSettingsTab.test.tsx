import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import PermissionSettingsTab from './PermissionSettingsTab';
import { DefaultService } from '../../generated';
import { selectOption } from '../../test-select';

vi.mock('../../generated', () => ({
  DefaultService: {
    listPermissions: vi.fn(async () =>
      ['ADMIN', 'OPERATOR', 'VIEWER'].flatMap((role) =>
        ['dashboard', 'projects', 'api', 'certificates', 'settings'].map((menuId) => ({
          role,
          menuId,
          label: menuId,
          canRead: true,
          canWrite: role !== 'VIEWER',
        })),
      ),
    ),
    updatePermissions: vi.fn(async () => undefined),
  },
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
      <PermissionSettingsTab />
    </QueryClientProvider>,
  );
}

test('revoking read also revokes write and saves the complete role grant set', async () => {
  show();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'api 조회' }));
  expect(
    screen.getByRole('table', { name: '역할별 메뉴 권한' }).closest('.ant-table-content'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'api 조회' }).closest('.ant-checkbox'),
  ).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'api 변경' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '권한 저장' }));
  await waitFor(() => expect(DefaultService.updatePermissions).toHaveBeenCalledOnce());
  const payload = vi.mocked(DefaultService.updatePermissions).mock.calls[0][0];
  expect(payload.role).toBe('OPERATOR');
  expect(payload.requestBody).toHaveLength(5);
  expect(payload.requestBody.find((row) => row.menuId === 'api')).toMatchObject({
    canRead: false,
    canWrite: false,
  });
});

test('viewer write grants and administrator grant editing stay disabled', async () => {
  show();
  await screen.findByRole('checkbox', { name: 'api 조회' });
  await selectOption(screen.getByRole('combobox'), '조회자');
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'api 변경' })).toBeDisabled());
  await selectOption(screen.getByRole('combobox'), '관리자');
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'api 조회' })).toBeDisabled());
  expect(screen.getByRole('button', { name: '권한 저장' })).toBeDisabled();
});
