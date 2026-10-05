import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import ServerCollectionPage from './ServerCollectionPage';

vi.mock('../api', () => ({
  getDashboard: vi.fn(async () => ({
    projects: [
      {
        project_id: 'alpha',
        display_name: 'Alpha',
        instances: [
          {
            instance_id: 'api-failed',
            display_name: 'API 장애 서버',
            status: 'DOWN',
            collection_status: 'UP',
          },
          {
            instance_id: 'stopped',
            display_name: '수집 중단 서버',
            status: 'DOWN',
            collection_status: 'DOWN',
          },
        ],
      },
    ],
  })),
}));
afterEach(cleanup);
test('normal collection list includes a server with API failure and excludes a collection failure', async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/instances?collection=UP']}>
        <ServerCollectionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('link', { name: 'API 장애 서버' })).toHaveAttribute(
    'href',
    '/projects/alpha/instances/api-failed',
  );
  expect(screen.queryByRole('link', { name: '수집 중단 서버' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '전체 서버 보기' }));
  expect(await screen.findByRole('link', { name: '수집 중단 서버' })).toBeVisible();
});
