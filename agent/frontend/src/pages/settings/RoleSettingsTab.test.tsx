import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import RoleSettingsTab from './RoleSettingsTab';
import { DefaultService } from '../../generated';

vi.mock('../../generated', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../generated')>();
  return {
    ...original,
    DefaultService: {
      listRoles: vi.fn(async () => [
        {
          roleId: 'ADMIN',
          name: '관리자',
          baseRole: 'ADMIN',
          description: '',
          enabled: true,
          builtin: true,
          userCount: 1,
        },
        {
          roleId: 'OPERATOR',
          name: '운영자',
          baseRole: 'OPERATOR',
          description: '',
          enabled: true,
          builtin: true,
          userCount: 0,
        },
        {
          roleId: 'TEAM_READ',
          name: '팀 조회',
          baseRole: 'VIEWER',
          description: '',
          enabled: true,
          builtin: false,
          userCount: 1,
        },
      ]),
      listPermissions: vi.fn(async () =>
        ['OPERATOR', 'TEAM_READ'].flatMap((role) => [
          {
            role,
            menuId: 'dashboard',
            label: '종합 현황',
            canRead: true,
            canWrite: role === 'OPERATOR',
          },
        ]),
      ),
      listRoleUsers: vi.fn(async () => [
        { username: 'reader', role: 'TEAM_READ', enabled: true, assigned: true },
        { username: 'other', role: 'VIEWER', enabled: true, assigned: false },
      ]),
      createRole: vi.fn(async () => undefined),
      updateRole: vi.fn(async () => undefined),
      assignRoleUsers: vi.fn(async () => undefined),
    },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RoleSettingsTab />
    </QueryClientProvider>,
  );
}
test('role registration defaults to viewer and builtin editing stays protected', async () => {
  show();
  await screen.findByRole('button', { name: '팀 조회 수정' });
  expect(screen.queryByRole('button', { name: '관리자 수정' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '역할 등록' }));
  fireEvent.change(screen.getByLabelText('역할 ID'), { target: { value: 'team_new' } });
  fireEvent.change(screen.getByLabelText('역할 이름'), { target: { value: '신규 팀' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(DefaultService.createRole).toHaveBeenCalledWith({
      requestBody: {
        roleId: 'TEAM_NEW',
        name: '신규 팀',
        description: '',
        baseRole: 'VIEWER',
        enabled: true,
      },
    }),
  );
});
test('member count opens selected role assignment and submits complete membership', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '팀 조회 사용자 1명' }));
  expect(screen.getByRole('tab', { name: '사용자 배정' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(await screen.findByRole('checkbox', { name: /other/ }));
  fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
  await waitFor(() =>
    expect(DefaultService.assignRoleUsers).toHaveBeenCalledWith({
      roleId: 'TEAM_READ',
      requestBody: ['reader', 'other'],
    }),
  );
});
