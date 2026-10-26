import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { selectOption } from '../../test-select';
import ThresholdSettingsTab from './ThresholdSettingsTab';

vi.mock('../../api', () => ({
  getProjects: vi.fn(async () => ({ items: [{ project_id: 'alpha', display_name: 'Alpha' }] })),
  getInstances: vi.fn(async () => ({ items: [{ instance_id: 'one', display_name: 'One' }] })),
}));
vi.mock('./InstanceThresholdSettings', () => ({
  default: ({ projectId, instanceId }: { projectId: string; instanceId: string }) => (
    <div data-testid="selected-threshold">{`${projectId}/${instanceId}`}</div>
  ),
}));
afterEach(cleanup);

test('selecting a project clears its instance, and official selectors keep the threshold scope', async () => {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ThresholdSettingsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const project = screen.getByRole('combobox', { name: '프로젝트' });
  const instance = screen.getByRole('combobox', { name: '인스턴스' });
  expect(project.closest('.ant-select')).toBeInTheDocument();
  await selectOption(project, 'Alpha');
  await waitFor(() => expect(instance).not.toBeDisabled());
  await selectOption(instance, 'One');
  expect(screen.getByTestId('selected-threshold')).toHaveTextContent('alpha/one');
  await selectOption(project, '프로젝트 선택');
  expect(screen.queryByTestId('selected-threshold')).not.toBeInTheDocument();
  expect(instance).toBeDisabled();
  fireEvent.keyDown(project, { key: 'Escape' });
});
