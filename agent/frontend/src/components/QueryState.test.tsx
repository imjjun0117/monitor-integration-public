import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Empty, Failure, Loading, RefreshFailure, Stale } from './QueryState';

test('shared query states use official Ant Design feedback without losing messages or retry', () => {
  const retry = () => {};
  const { container } = render(
    <>
      <Loading />
      <Failure />
      <Empty>항목 없음</Empty>
      <Stale visible />
      <RefreshFailure visible updatedAt={0} retry={retry} />
    </>,
  );
  expect(container.querySelector('.ant-spin')).toBeInTheDocument();
  expect(container.querySelector('.ant-empty')).toBeInTheDocument();
  expect(container.querySelectorAll('.ant-alert')).toHaveLength(3);
  expect(screen.getAllByRole('button', { name: '다시 시도' })).toHaveLength(2);
  expect(screen.getByText('항목 없음')).toBeInTheDocument();
});
