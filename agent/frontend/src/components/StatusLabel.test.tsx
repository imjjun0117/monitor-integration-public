import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import StatusLabel from './StatusLabel';
import { Status } from '../generated';

test('shows collection state with an official Ant Design tag', () => {
  render(<StatusLabel status={Status.DOWN} context="collection" />);
  expect(screen.getByText('수집 중단')).toHaveClass('ant-tag');
  expect(screen.getByText('수집 중단')).toHaveClass('ant-tag-red');
});

test('shows missing status without inventing a healthy result', () => {
  render(<StatusLabel status={null} context="check" />);
  expect(screen.getByText('결과 미확인')).toHaveClass('ant-tag');
});
