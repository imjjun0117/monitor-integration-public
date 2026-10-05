// 테스트에서 선택 메뉴 조작
import { fireEvent, screen, within } from '@testing-library/react';

export async function selectOption(control: HTMLElement, label: string) {
  fireEvent.keyDown(control, { key: 'Enter' });
  const menu = await screen.findByRole('listbox');
  fireEvent.click(within(menu).getByRole('option', { name: label }));
}
