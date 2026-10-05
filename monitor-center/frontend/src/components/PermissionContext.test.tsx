import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { PermissionContext } from './PermissionContext';
import { Button } from './ui';
afterEach(cleanup);
test('viewer sees read actions only and operator cannot see administrator actions', () => {
  const controls = (
    <>
      <Button>결과 확인</Button>
      <Button permission="write">점검 실행</Button>
      <Button permission="admin">계정 관리</Button>
    </>
  );
  const view = render(
    <PermissionContext.Provider
      value={{ username: 'reader', role: 'VIEWER', isAdmin: false, canWrite: false }}
    >
      {controls}
    </PermissionContext.Provider>,
  );
  expect(screen.getByRole('button', { name: '결과 확인' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '점검 실행' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '계정 관리' })).not.toBeInTheDocument();
  view.rerender(
    <PermissionContext.Provider
      value={{ username: 'operator', role: 'OPERATOR', isAdmin: false, canWrite: true }}
    >
      {controls}
    </PermissionContext.Provider>,
  );
  expect(screen.getByRole('button', { name: '점검 실행' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '계정 관리' })).not.toBeInTheDocument();
});
