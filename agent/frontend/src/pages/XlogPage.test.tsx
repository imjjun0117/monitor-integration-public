import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { CancelablePromise, DefaultService } from '../generated';
import XlogPage from './XlogPage';

vi.mock('../components/XlogChart', () => ({
  default: () => <div role="img" aria-label="XLog 요청 응답시간 분포 차트" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output aria-label="현재 주소">{location.search}</output>
      <button onClick={() => navigate(-1)}>뒤로</button>
      <button onClick={() => navigate(1)}>앞으로</button>
    </>
  );
}

test('instance XLog keeps its fixed scope while exposing period and HTTP filters', async () => {
  const read = vi.spyOn(DefaultService, 'getXlog').mockResolvedValue({
    enabled_projects: 1,
    eligible_instances: 1,
    connected_instances: 1,
    summary: { count: 0, errors: 0, average_ms: 0, p95_ms: 0 },
    items: [],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/projects/p/instances/i?tab=xlog']}>
        <XlogPage projectId="p" instanceId="i" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ project: 'p', instance: 'i' })),
  );
  const filters = screen.getByRole('form', { name: 'XLog 필터' });
  expect(filters).toBeVisible();
  expect(filters).toHaveClass('xlog-inline-filters');
  expect(screen.queryByRole('region', { name: 'XLog 필터' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: '인스턴스 선택' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'XLog 조회 기간' })).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'HTTP 오류만' }));
  await waitFor(() =>
    expect(read).toHaveBeenLastCalledWith(
      expect.objectContaining({ project: 'p', instance: 'i', errorsOnly: true }),
    ),
  );
});

test('URL history restores XLog checkbox, request filter and displayed records', async () => {
  const items = [200, 500].map((status) => ({
    id: status,
    project_id: 'sample',
    instance_id: 'prod',
    project_name: 'Sample',
    instance_name: 'Production',
    received_at: new Date().toISOString(),
    payload: {
      started_at: Date.now(),
      duration_ms: 123,
      method: 'GET',
      path: `/status-${status}`,
      status,
    },
  }));
  const read = vi.spyOn(DefaultService, 'getXlog').mockImplementation(({ errorsOnly }) => {
    const filtered = errorsOnly ? items.filter((item) => item.payload.status >= 400) : items;
    return new CancelablePromise((resolve) =>
      resolve({
        enabled_projects: 1,
        eligible_instances: 1,
        connected_instances: 0,
        summary: { count: filtered.length, errors: 1, average_ms: 123, p95_ms: 123 },
        items: filtered,
      }),
    );
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/xlog?instance=prod']}>
        <HistoryControls />
        <Routes>
          <Route path="/xlog" element={<XlogPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const checkbox = screen.getByRole('checkbox', { name: 'HTTP 오류만' });
  expect(screen.getByRole('combobox', { name: 'XLog 프로젝트 필터' })).toBeVisible();
  await screen.findByRole('button', { name: 'GET /status-200' });
  expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ errorsOnly: false }));
  fireEvent.click(checkbox);
  await waitFor(() =>
    expect(screen.getByLabelText('현재 주소')).toHaveTextContent('errorsOnly=true'),
  );
  await waitFor(() => expect(checkbox).toBeChecked());
  await waitFor(() =>
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ errorsOnly: true })),
  );
  await screen.findByRole('button', { name: 'GET /status-500' });
  expect(screen.queryByRole('button', { name: 'GET /status-200' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
  await waitFor(() =>
    expect(screen.getByLabelText('현재 주소')).not.toHaveTextContent('errorsOnly'),
  );
  await waitFor(() => expect(checkbox).not.toBeChecked());
  await waitFor(() =>
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ errorsOnly: false })),
  );
  await screen.findByRole('button', { name: 'GET /status-200' });

  fireEvent.click(screen.getByRole('button', { name: '앞으로' }));
  await waitFor(() =>
    expect(screen.getByLabelText('현재 주소')).toHaveTextContent('errorsOnly=true'),
  );
  await waitFor(() => expect(checkbox).toBeChecked());
  await waitFor(() =>
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ errorsOnly: true })),
  );
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'GET /status-200' })).not.toBeInTheDocument(),
  );
});
