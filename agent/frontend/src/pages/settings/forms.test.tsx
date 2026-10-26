import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PermissionContext } from '../../components/PermissionContext';
import { BooleanSelect, NumberInput, SecretInput, SettingsDialog } from './forms';
import { selectOption } from '../../test-select';

afterEach(cleanup);

test('setting fields expose labels and help through official Ant Design controls', async () => {
  const setEnabled = vi.fn();
  const setNumber = vi.fn();
  render(
    <>
      <BooleanSelect
        id="setting-enabled"
        label="사용 여부"
        help="작업 중지"
        value={true}
        trueLabel="사용"
        falseLabel="미사용"
        onChange={setEnabled}
      />
      <NumberInput id="setting-count" label="횟수" value={5} onChange={setNumber} />
      <SecretInput id="setting-secret" label="비밀" value="" onChange={vi.fn()} />
    </>,
  );
  const enabled = screen.getByRole('combobox', { name: '사용 여부' });
  expect(enabled.closest('.ant-select')).toBeInTheDocument();
  expect(enabled).toHaveAttribute('aria-describedby', 'setting-enabled-help');
  await selectOption(enabled, '미사용');
  expect(setEnabled).toHaveBeenCalledWith(false);
  const count = screen.getByRole('spinbutton', { name: '횟수' });
  expect(count).toHaveClass('ant-input-number-input');
  fireEvent.change(count, { target: { value: '' } });
  expect(setNumber).toHaveBeenLastCalledWith(Number.NaN);
  expect(screen.getByLabelText('비밀')).toHaveAttribute('type', 'password');
});

test('setting dialog retains native form submission and blocks writes for read-only users', () => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const content = (
    <SettingsDialog
      id="test-dialog"
      title="변경"
      submitLabel="저장"
      isOpen
      isPending={false}
      failed={false}
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <input aria-label="항목" required defaultValue="ok" />
    </SettingsDialog>
  );
  const { rerender } = render(content);
  expect(screen.getByRole('dialog', { name: '변경' })).toHaveClass('ant-modal');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
  rerender(
    <PermissionContext.Provider
      value={{ role: 'VIEWER', username: '', isAdmin: false, canWrite: false }}
    >
      {content}
    </PermissionContext.Provider>,
  );
  expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
});
