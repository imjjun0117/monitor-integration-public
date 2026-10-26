import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { DefaultService } from '../../generated';
import MenuSettingsTab from './MenuSettingsTab';

vi.mock('../../generated', async (original) => ({
  ...(await original<typeof import('../../generated')>()),
  DefaultService: {
    listMenus: vi.fn(async () => [
      { menuId: 'dashboard', label: '종합 현황', route: '/', sortOrder: 1, enabled: true },
    ]),
    updateMenu: vi.fn(async () => undefined),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('menu edits use the official table and preserve the update payload', async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MenuSettingsTab />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('종합 현황')).toBeVisible();
  expect(
    screen.getByRole('table', { name: '메뉴 목록' }).closest('.ant-table-content'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '수정' }));
  fireEvent.change(screen.getByRole('textbox', { name: '메뉴 이름' }), {
    target: { value: '현황' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() =>
    expect(DefaultService.updateMenu).toHaveBeenCalledWith({
      menuId: 'dashboard',
      requestBody: {
        menuId: 'dashboard',
        label: '현황',
        route: '/',
        sortOrder: 1,
        enabled: true,
      },
    }),
  );
});
