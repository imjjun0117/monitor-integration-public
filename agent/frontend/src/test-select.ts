// 테스트에서 선택 메뉴 조작
import { fireEvent, screen, within } from '@testing-library/react';

export async function selectOption(control: HTMLElement, label: string) {
  if (control.closest('.ant-select')) {
    fireEvent.mouseDown(control);
    const option = await screen.findByText(label, { selector: '.ant-select-item-option-content' });
    fireEvent.click(option.closest('.ant-select-item-option')!);
    return;
  } else {
    fireEvent.keyDown(control, { key: 'Enter' });
  }
  const menu = await screen.findByRole('listbox');
  fireEvent.click(within(menu).getByRole('option', { name: label }));
}
