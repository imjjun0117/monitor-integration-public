import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Table, Tbody, Td, Th, Thead, Tr } from './table';

afterEach(cleanup);
test('mobile labels follow headings, explicit labels and spanning result rows', () => {
  const view = (heading: string) => (
    <Table aria-label="서버">
      <Thead>
        <Tr>
          <Th>{heading}</Th>
          <Th>상태</Th>
        </Tr>
      </Thead>
      <Tbody>
        <Tr>
          <Td>긴 서버 이름</Td>
          <Td dataLabel="수집 상태">정상</Td>
        </Tr>
        <Tr>
          <Td colSpan={2}>연결 결과</Td>
        </Tr>
      </Tbody>
    </Table>
  );
  const { rerender } = render(view('이름'));
  expect(screen.getByText('긴 서버 이름')).toHaveAttribute('data-label', '이름');
  expect(screen.getByText('긴 서버 이름').getAttribute('headers')).toBe(
    screen.getByRole('columnheader', { name: '이름' }).id,
  );
  expect(screen.getByText('정상')).toHaveAttribute('data-label', '수집 상태');
  expect(screen.getByText('연결 결과')).not.toHaveAttribute('data-label');
  rerender(view('서버명'));
  expect(screen.getByText('긴 서버 이름')).toHaveAttribute('data-label', '서버명');
});
