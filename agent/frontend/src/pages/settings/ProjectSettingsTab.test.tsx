import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { createProject, deleteProjectPermanently } from '../../api';
import { DefaultService } from '../../generated';
import ProjectSettingsTab from './ProjectSettingsTab';

vi.mock('../../api', () => ({
  getProjects: vi.fn(async () => ({ items: [{ project_id: 'alpha', display_name: 'Alpha' }] })),
  createProject: vi.fn(async () => undefined),
  deleteProjectPermanently: vi.fn(async () => undefined),
}));
vi.mock('../../generated', async (original) => ({
  ...(await original<typeof import('../../generated')>()),
  DefaultService: {
    getXlogSettings: vi.fn(async () => ({ enabled: false })),
    saveXlogSettings: vi.fn(async () => undefined),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProjectSettingsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
test('project form preserves registration and the table retains XLog toggle and deletion confirmation', async () => {
  show();
  expect(await screen.findByText('alpha')).toBeVisible();
  expect(
    screen.getByRole('table', { name: '프로젝트 설정' }).closest('.ant-table-content'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 등록' }));
  fireEvent.change(screen.getByRole('textbox', { name: '프로젝트 ID' }), {
    target: { value: 'beta' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: '프로젝트 표시명' }), {
    target: { value: 'Beta' },
  });
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 등록 확인' }));
  await waitFor(() =>
    expect(vi.mocked(createProject).mock.calls[0]?.[0]).toEqual({
      projectId: 'beta',
      displayName: 'Beta',
      enabled: true,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  expect(screen.getByText(/복구할 수 없습니다/)).toBeVisible();
  expect(deleteProjectPermanently).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 alpha 영구 삭제 확인' }));
  await waitFor(() => expect(deleteProjectPermanently).toHaveBeenCalledWith('alpha'));
  expect(DefaultService.saveXlogSettings).not.toHaveBeenCalled();
});
