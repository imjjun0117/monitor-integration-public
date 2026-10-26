import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { PermissionContext } from '../components/PermissionContext';
import SettingsPage from './SettingsPage';

vi.mock('./settings/InstanceSettingsTab', () => ({
  default: () => <button>인스턴스 편집</button>,
}));
vi.mock('./settings/ProjectSettingsTab', () => ({ default: () => <button>프로젝트 편집</button> }));
afterEach(cleanup);

test('read-only settings announce the limitation with an Ant Design alert and disable editing', () => {
  render(
    <PermissionContext.Provider
      value={{ role: 'VIEWER', username: '', isAdmin: false, canWrite: false }}
    >
      <MemoryRouter initialEntries={['/settings/instances']}>
        <SettingsPage />
      </MemoryRouter>
    </PermissionContext.Provider>,
  );
  expect(screen.getByRole('alert')).toHaveClass('ant-alert');
  expect(screen.getByRole('button', { name: '인스턴스 편집' })).toBeDisabled();
});
