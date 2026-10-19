import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import XlogChart from './XlogChart';

const { setOption, resize, dispose } = vi.hoisted(() => ({
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('echarts', () => ({ init: () => ({ setOption, resize, dispose, on: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
test('narrow charts reserve separate rows for HTTP legend, tools and plot and resize with the card', async () => {
  let resized = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const view = render(<XlogChart items={[]} onSelect={() => {}} />);
  await waitFor(() => expect(setOption).toHaveBeenCalled());
  const option = setOption.mock.calls.find(([value]) => value.baseOption)?.[0];
  expect(option.baseOption.legend.type).toBe('scroll');
  const narrow = option.media.find(
    (item: { query?: { maxWidth: number } }) => item.query?.maxWidth === 440,
  ).option;
  expect(narrow.legend.right).toBe(0);
  expect(narrow.toolbox.top).toBeGreaterThan(option.baseOption.legend.top);
  expect(narrow.grid.top).toBeGreaterThan(narrow.toolbox.top + 30);
  resized();
  expect(resize).toHaveBeenCalled();
  view.unmount();
  expect(dispose).toHaveBeenCalled();
});
