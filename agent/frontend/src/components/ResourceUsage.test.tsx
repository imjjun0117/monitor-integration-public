import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import ResourceUsage from './ResourceUsage';

afterEach(cleanup);

test('shows used capacity, total, percentage and available RAM together', () => {
  render(
    <ResourceUsage
      used={12 * 1024 ** 3}
      total={16 * 1024 ** 3}
      capacityLabel="전체 RAM"
      valueLabel="RAM 값"
    />,
  );
  expect(screen.getByLabelText('RAM 값')).toHaveTextContent('12 GB / 16 GB');
  expect(screen.getByText('75%')).toBeVisible();
  expect(screen.getByText('전체 RAM 16 GB · 여유 4 GB')).toBeVisible();
  expect(screen.getByRole('meter')).toHaveAttribute('value', '0.75');
});

test('zero usage is preserved while an unknown capacity never produces a fake percentage', () => {
  const { rerender } = render(<ResourceUsage used={0} total={1024 ** 3} valueLabel="사용량" />);
  expect(screen.getByLabelText('사용량')).toHaveTextContent('0 GB / 1 GB');
  expect(screen.getByText('0%')).toBeVisible();
  rerender(<ResourceUsage used={1024 ** 3} total={null} valueLabel="사용량" />);
  expect(screen.getByLabelText('사용량')).toHaveTextContent('1 GB / 미지원');
  expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  expect(screen.queryByText(/NaN|Infinity|0%/)).not.toBeInTheDocument();
});

test('missing and invalid metrics stay unavailable instead of becoming zero usage', () => {
  render(<ResourceUsage used={Number.NaN} total={0} valueLabel="사용량" />);
  expect(screen.getByLabelText('사용량')).toHaveTextContent('미지원 / 미지원');
  expect(screen.queryByRole('meter')).not.toBeInTheDocument();
});
