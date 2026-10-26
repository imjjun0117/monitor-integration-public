import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import type { ApiCheck } from '../api';
import ServiceOverview from './ServiceOverview';

const check = {
  project_id: 'alpha',
  instance_id: 'server-1',
  check_id: 'vendor',
  project_name: '알파',
  service_info: {
    title: '외부 업체',
    status: 'WARN',
    metrics: [
      { key: 'balance', label: '잔액', value: 0, unit: '원' },
      { key: 'unknown', label: '잔여량', value: null, unit: '건' },
    ],
  },
} as ApiCheck;

test('keeps service status, metric gaps and encoded detail link in a ProTable', () => {
  render(
    <MemoryRouter>
      <ServiceOverview checks={[check]} />
    </MemoryRouter>,
  );
  const table = screen.getByRole('table', { name: '전체 프로젝트 외부 서비스 정보' });
  expect(table.closest('.ant-pro-table')).toBeInTheDocument();
  const row = within(table).getByRole('row', { name: /알파/ });
  expect(row).toHaveTextContent('0 원');
  expect(row).toHaveTextContent('미수집');
  expect(within(row).getByText('정보 경고')).toHaveClass('ant-tag');
  expect(within(row).getByRole('link', { name: '알파 외부 업체 상세' })).toHaveAttribute(
    'href',
    '/api-monitoring?project=alpha&instance=server-1&check=vendor',
  );
});
