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
