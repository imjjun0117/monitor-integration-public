import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { DefaultService } from '../generated';
import XlogOverview from './XlogOverview';

vi.mock('./XlogChart', () => ({
  default: () => <div role="img" aria-label="XLog 요청 응답시간 분포 차트" />,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('overview uses central records, preserves scope links and opens a selected request', async () => {
  const read = vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 0,
    summary: { count: 1, errors: 1, average_ms: 123, p95_ms: 123 },
    items: [
      {
        id: 1,
        project_id: 'sample',
        instance_id: 'prod',
        project_name: 'Sample',
        instance_name: 'Production',
        received_at: new Date().toISOString(),
        payload: {
          started_at: Date.now(),
          duration_ms: 123,
          method: 'GET',
          path: '/sample',
          status: 500,
        },
      },
    ],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview project="sample" instance="prod" detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText(/웹소켓 연결 끊김/);
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({ project: 'sample', instance: 'prod', minutes: 60 }),
  );
  expect(screen.getByRole('link', { name: 'HTTP 오류 1건 보기' })).toHaveAttribute(
    'href',
    '/xlog?project=sample&instance=prod&errorsOnly=true',
  );
  expect(
    screen.getByRole('table', { name: 'XLog 요청 목록' }).closest('.ant-pro-table'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'GET /sample' }));
  const detail = await screen.findByRole('dialog', { name: '요청 정보' });
  expect(detail.closest('.ant-modal')).toBeInTheDocument();
  expect(detail.querySelector('.ant-pro-descriptions')).toBeInTheDocument();
  expect(detail).toHaveTextContent('123 ms');
});

test('disabled overview hides empty XLog without starting any collector command', async () => {
  const read = vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 0,
    eligible_instances: 0,
    connected_instances: 0,
    summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
    items: [],
  });
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <XlogOverview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

test('request list pages by 20 and stays within bounds when records shrink', async () => {
  const items = Array.from({ length: 45 }, (_, index) => ({
    id: 45 - index,
    project_id: 'sample',
    instance_id: 'prod',
    project_name: 'Sample',
    instance_name: 'Production',
    received_at: new Date().toISOString(),
    payload: {
      started_at: Date.now(),
      duration_ms: 123,
      method: 'GET',
      path: '/request-' + index,
      status: 200,
    },
  }));
  const data = {
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 45, errors: 0, average_ms: 123, p95_ms: 123 },
    items,
  };
  const read = vi.spyOn(DefaultService, 'getXlog').mockResolvedValue(data);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <XlogOverview project="sample" instance="prod" detailed />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findByRole('button', { name: 'GET /request-0' });
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(20);
  expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  expect(screen.getByText('1 / 3 페이지')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(20);
  expect(screen.getByRole('button', { name: 'GET /request-20' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'GET /request-0' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(5);
  expect(screen.getByText('3 / 3 페이지')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }));
  expect(screen.getByRole('button', { name: 'GET /request-20' })).toBeInTheDocument();
  expect(read).toHaveBeenCalledTimes(1);

  act(() => {
    client.setQueryData(['xlog', 'sample', 'prod', 60, '', false, 0], {
      ...data,
      items: items.slice(0, 5),
    });
  });
  await waitFor(() => expect(screen.getByText('1 / 1 페이지')).toBeInTheDocument());
  expect(screen.getAllByRole('button', { name: /^GET / })).toHaveLength(5);
  expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  expect(screen.getByRole('img', { name: 'XLog 요청 응답시간 분포 차트' })).toBeInTheDocument();
});
