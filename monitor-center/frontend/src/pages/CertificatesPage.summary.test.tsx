import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import CertificatesPage from './CertificatesPage';
import { getCertificates } from '../api';

function certificate(id: number) {
  return {
    certificate_target_id: id,
    project_id: 'alpha',
    hostname: `host-${id}.example`,
    port: 443,
    status: 'WARN',
    enabled: true,
    days_remaining: 20,
  };
}
vi.mock('../api', () => ({
  getProjects: vi.fn(async () => ({ items: [], total: 0 })),
  checkCertificate: vi.fn(),
  getCertificates: vi.fn(async (_, page = 0) => ({
    items: page === 0 ? [certificate(1), certificate(2)] : [certificate(3)],
    page,
    size: 2,
    total: 3,
  })),
  getDashboard: vi.fn(async () => ({
    status_causes: [
      {
        kind: 'CERTIFICATE',
        metric_key: 'CERTIFICATE_DAYS',
        result_code: null,
        status: 'WARN',
        subject_id: '3',
      },
      {
        kind: 'CERTIFICATE',
        metric_key: 'CERTIFICATE_DAYS',
        result_code: 'TLS_HANDSHAKE_FAILED',
        status: 'DOWN',
        subject_id: '1',
      },
    ],
  })),
}));
afterEach(cleanup);
test('expiry summary uses dashboard expiry causes, excludes TLS failures, and includes later pages', async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/certificates?expiry=soon']}>
        <CertificatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('button', { name: 'host-3.example:443' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'host-1.example:443' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'host-2.example:443' })).not.toBeInTheDocument();
  expect(getCertificates).toHaveBeenCalledWith(expect.objectContaining({ expiry: 'soon' }), 1);
});
