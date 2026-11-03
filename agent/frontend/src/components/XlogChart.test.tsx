import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import XlogChart from './XlogChart';
import { setTheme } from '../theme';

const { setOption, resize, dispose, on, getOption } = vi.hoisted(() => ({
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  on: vi.fn(),
  getOption: vi.fn(),
}));
vi.mock('echarts', () => ({ init: () => ({ setOption, resize, dispose, on, getOption }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  setTheme('dark');
});
test('user zoom keeps absolute start and end across new records and polling, without feedback', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const item = {
    id: 1,
    project_id: 'p',
    instance_id: 'i',
    project_name: 'Project',
    instance_name: 'Instance',
    received_at: '2026-01-01T00:00:00Z',
    payload: { started_at: 5_500_000, duration_ms: 80, method: 'GET', path: '/', status: 200 },
  };
  const choose = () => {};
  const selected = vi.fn();
  const view = render(
    <XlogChart
      items={[item]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_000_000}
    />,
  );
  await waitFor(() => expect(on).toHaveBeenCalledWith('datazoom', expect.any(Function)));
  getOption.mockReturnValue({
    xAxis: [{ min: 5_100_000, max: 6_000_000 }],
    dataZoom: [{ startValue: 5_400_000, endValue: 5_700_000, start: 10, end: 90 }],
  });
  act(() => on.mock.calls.find(([event]) => event === 'datazoom')?.[1]());
  expect(selected).toHaveBeenCalledWith({ start: 5_400_000, end: 5_700_000 });
  const nextItem = { ...item, id: 2, payload: { ...item.payload, started_at: 6_050_000 } };
  view.rerender(
    <XlogChart
      items={[item, nextItem]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_100_000}
    />,
  );
  expect(setOption.mock.calls.at(-1)?.[0].dataZoom).toEqual([
    expect.objectContaining({
      startValue: 5_400_000,
      endValue: 5_700_000,
      rangeMode: ['value', 'value'],
    }),
    expect.objectContaining({
      startValue: 5_400_000,
      endValue: 5_700_000,
      rangeMode: ['value', 'value'],
    }),
  ]);
  expect(setOption.mock.calls.at(-1)?.[0].series[0].data).toHaveLength(2);
  act(() => on.mock.calls.find(([event]) => event === 'datazoom')?.[1]());
  expect(selected).toHaveBeenCalledTimes(1);
});

test('rolling query keeps an early absolute selection within the full time axis', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const item = {
    id: 1,
    project_id: 'p',
    instance_id: 'i',
    project_name: 'Project',
    instance_name: 'Instance',
    received_at: '2026-01-01T00:00:00Z',
    payload: { started_at: 5_500_000, duration_ms: 80, method: 'GET', path: '/', status: 200 },
  };
  const choose = () => {};
  const selected = vi.fn();
  const view = render(
    <XlogChart
      items={[item]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_000_000}
    />,
  );
  await waitFor(() => expect(on).toHaveBeenCalledWith('datazoom', expect.any(Function)));
  getOption.mockReturnValue({
    xAxis: [{ min: 5_100_000, max: 6_000_000 }],
    dataZoom: [{ startValue: 5_200_000, endValue: 5_300_000, start: 11, end: 22 }],
  });
  act(() => on.mock.calls.find(([event]) => event === 'datazoom')?.[1]());
  expect(selected).toHaveBeenCalledWith({ start: 5_200_000, end: 5_300_000 });

  const newItem = { ...item, id: 2, payload: { ...item.payload, started_at: 6_400_000 } };
  view.rerender(
    <XlogChart
      items={[newItem]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_500_000}
    />,
  );
  const updated = setOption.mock.calls.at(-1)?.[0];
  expect(updated.xAxis.min).toBeLessThanOrEqual(5_200_000);
  expect(updated.xAxis.max).toBeGreaterThanOrEqual(5_300_000);
  expect(updated.dataZoom[0]).toMatchObject({
    startValue: 5_200_000,
    endValue: 5_300_000,
    rangeMode: ['value', 'value'],
  });
  expect(updated.series[0].data).toEqual([{ value: [6_400_000, 80], item: newItem }]);
  expect(selected).toHaveBeenCalledTimes(1);

  act(() => on.mock.calls.find(([event]) => event === 'restore')?.[1]());
  expect(selected).toHaveBeenLastCalledWith(undefined);
  expect(setOption.mock.calls.at(-1)?.[0].xAxis).toEqual({ min: 5_600_000, max: 6_500_000 });
  view.rerender(
    <XlogChart
      items={[]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_600_000}
    />,
  );
  expect(setOption.mock.calls.at(-1)?.[0].xAxis).toEqual({ min: 5_700_000, max: 6_600_000 });
});

test('percentage-only zoom resolves against the current axis and toolbox restore clears it', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const selected = vi.fn();
  const choose = () => {};
  const view = render(
    <XlogChart
      items={[]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_000_000}
    />,
  );
  await waitFor(() => expect(on).toHaveBeenCalledWith('datazoom', expect.any(Function)));
  getOption.mockReturnValue({
    xAxis: [{ min: 5_100_000, max: 6_000_000 }],
    dataZoom: [{ start: 25, end: 75 }],
  });
  act(() => on.mock.calls.find(([event]) => event === 'datazoom')?.[1]());
  expect(selected).toHaveBeenLastCalledWith({ start: 5_325_000, end: 5_775_000 });
  act(() => on.mock.calls.find(([event]) => event === 'restore')?.[1]());
  expect(selected).toHaveBeenLastCalledWith(undefined);
  getOption.mockReturnValue({
    xAxis: [{ min: 5_100_000, max: 6_000_000 }],
    dataZoom: [{ start: 0, end: 100, startValue: 5_100_000, endValue: 6_000_000 }],
  });
  act(() => on.mock.calls.find(([event]) => event === 'datazoom')?.[1]());
  expect(selected).toHaveBeenLastCalledWith(undefined);
  view.rerender(
    <XlogChart
      items={[]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_100_000}
    />,
  );
  expect(setOption.mock.calls.at(-1)?.[0].dataZoom).toEqual([
    expect.objectContaining({ start: 0, end: 100, rangeMode: ['percent', 'percent'] }),
    expect.objectContaining({ start: 0, end: 100, rangeMode: ['percent', 'percent'] }),
  ]);
});

test('theme recreation reapplies the selected absolute zoom', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const selected = vi.fn();
  const choose = () => {};
  render(
    <XlogChart
      items={[]}
      onSelect={choose}
      onZoomChange={selected}
      rangeMinutes={15}
      rangeEnd={6_000_000}
    />,
  );
  await waitFor(() => expect(on).toHaveBeenCalledWith('datazoom', expect.any(Function)));
  getOption.mockReturnValue({
    xAxis: [{ min: 5_100_000, max: 6_000_000 }],
    dataZoom: [{ startValue: 5_400_000, endValue: 5_700_000, start: 33, end: 67 }],
  });
  act(() => on.mock.calls.find(([event]) => event === 'datazoom')?.[1]());
  act(() => setTheme('light'));
  await waitFor(() => expect(dispose).toHaveBeenCalled());
  await waitFor(() =>
    expect(setOption.mock.calls.filter(([value]) => value.baseOption)).toHaveLength(2),
  );
  const option = setOption.mock.calls.filter(([value]) => value.baseOption).at(-1)?.[0].baseOption;
  expect(option.dataZoom[0]).toMatchObject({
    startValue: 5_400_000,
    endValue: 5_700_000,
    rangeMode: ['value', 'value'],
  });
});
test('light XLog scatter uses legible series colors and clickable points', async () => {
  setTheme('light');
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(<XlogChart items={[]} onSelect={() => {}} />);
  await waitFor(() => expect(setOption).toHaveBeenCalled());
  const option = setOption.mock.calls.find(([value]) => value.baseOption)?.[0].baseOption;
  expect(option.series[0].itemStyle.color).toBe('#0085a4');
  expect(option.series[1].itemStyle.color).toBe('#c43a64');
  expect(option.series[0].symbolSize).toBeGreaterThanOrEqual(6);
  expect(option.dataZoom).toHaveLength(2);
});
test('scatter time axis reflects the selected query interval rather than only recorded points', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(<XlogChart items={[]} onSelect={() => {}} rangeMinutes={15} rangeEnd={6000000} />);
  await waitFor(() => expect(setOption).toHaveBeenCalled());
  const axis = setOption.mock.calls.find(([value]) => value.baseOption)?.[0].baseOption.xAxis;
  expect(axis.min).toBe(5100000);
  expect(axis.max).toBe(6000000);
});

test('polling keeps zoom chart alive and includes older returned records in the time axis', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const item = {
    id: 1,
    project_id: 'p',
    instance_id: 'i',
    project_name: 'Project',
    instance_name: 'Instance',
    received_at: '2026-01-01T00:00:00Z',
    payload: { started_at: 5000000, duration_ms: 80, method: 'GET', path: '/', status: 200 },
  };
  const choose = () => {};
  const view = render(
    <XlogChart items={[item]} onSelect={choose} rangeMinutes={15} rangeEnd={6000000} />,
  );
  await waitFor(() => expect(setOption.mock.calls.some(([value]) => value.baseOption)).toBe(true));
  const first = setOption.mock.calls.find(([value]) => value.baseOption)?.[0].baseOption;
  expect(first.xAxis.min).toBe(5000000);
  view.rerender(
    <XlogChart items={[item]} onSelect={choose} rangeMinutes={15} rangeEnd={6100000} />,
  );
  expect(dispose).not.toHaveBeenCalled();
  expect(setOption.mock.calls.at(-1)?.[0].xAxis.min).toBe(5000000);
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
