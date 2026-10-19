import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { ProjectScopeProvider, ProjectSelector, useProjectScope } from './ProjectScope';
import { selectOption } from '../test-select';

vi.mock('../api', () => ({
  getProjects: async () => ({
    items: [
      { project_id: 'alpha', display_name: 'Alpha' },
      { project_id: 'beta', display_name: 'Beta' },
    ],
  }),
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
function Probe() {
  const { project } = useProjectScope();
  const location = useLocation();
  return (
    <>
      <ProjectSelector />
      <output aria-label="현재 범위">
        {project}|{location.search}
      </output>
      <Link to="/logs">실시간 로그</Link>
    </>
  );
}
test('project change clears previous instance and survives navigation and remount', async () => {
  sessionStorage.clear();
  const mount = (url: string) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[url]}>
          <ProjectScopeProvider>
            <Probe />
          </ProjectScopeProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  const first = mount('/?project=alpha&instance=old');
  await waitFor(() => expect(screen.getByLabelText('프로젝트 선택')).toBeEnabled());
  await selectOption(await screen.findByLabelText('프로젝트 선택'), 'Beta');
  await waitFor(() =>
    expect(screen.getByLabelText('현재 범위')).toHaveTextContent('beta|?project=beta'),
  );
  expect(screen.getByLabelText('현재 범위')).not.toHaveTextContent('instance');
  fireEvent.click(screen.getByRole('link', { name: '실시간 로그' }));
  expect(screen.getByLabelText('현재 범위')).toHaveTextContent('beta|');
  first.unmount();
  mount('/logs');
  expect(screen.getByLabelText('현재 범위')).toHaveTextContent('beta|');
});
