import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import MetricChart, { metricSeriesStyle } from './MetricChart';
import { setTheme } from '../theme';

type CapturedOptions = {
  dataZoom: Array<{ type: string; xAxisIndex: number; filterMode: string }>;
  animation: boolean;
  xAxis: { data?: string[]; type: string; min?: number; max?: number };
  yAxis: {
    name: string;
    min: number;
    max?: number;
    axisLabel: { formatter: (value: number) => string };
  };
  tooltip: { valueFormatter: (value: unknown) => string };
  series: Array<{
    name?: string;
    data: Array<number | null | Array<number | null>>;
    connectNulls: boolean;
    color?: string;
    lineStyle?: { type?: string };
    symbol?: string;
  }>;
};

const dispatchAction = vi.fn();
const setOption = vi.fn();
const createMetricChart = vi.fn((_element: HTMLDivElement, _options: CapturedOptions) => ({
  on: vi.fn<(event: string, handler: () => void) => void>(),
  getOption: vi.fn(),
  dispatchAction,
  setOption,
  resize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('./chartEngine', () => ({ createMetricChart }));

test('shows per-series sample statistics without treating missing or invalid samples as zero', () => {
  render(
    <MetricChart
      title="CPU"
      points={[]}
      xKey="at"
      yKey="value"
      unit="ratio"
      series={[
        {
          name: '서버 A',
          points: [
            { at: '2026-01-03', value: null },
            { at: '2026-01-02', value: 0.3 },
            { at: '2026-01-01', value: 0.1 },
            { at: 'invalid', value: 0.9 },
          ],
        },
        { name: '서버 B', points: [{ at: '2026-01-01', value: 0 }] },
        { name: '서버 C', points: [] },
      ]}
    />,
  );
  const table = screen.getByRole('table', { name: 'CPU 수집 표본 통계' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(
    within(rows[0])
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['10%', '30%', '20%', '미수집']);
  expect(
    within(rows[1])
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['0%', '0%', '0%', '0%']);
  expect(
    within(rows[2])
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['미수집', '미수집', '미수집', '미수집']);
});

beforeEach(() => {
  createMetricChart.mockClear();
  setOption.mockClear();
  dispatchAction.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  setTheme('dark');
  localStorage.removeItem('monitoring.theme');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('sorts descending history chronologically and summarizes the latest valid timestamp value', async () => {
  const points = [
    { sampled_at: '2026-09-03T03:00:00Z', value: null },
    { sampled_at: '2026-09-03T02:00:00Z', value: 20 },
    { sampled_at: '2026-09-03T02:00:00Z', value: 21 },
    { sampled_at: '2026-09-03T01:00:00Z', value: '   ' },
    { sampled_at: '2026-09-03T00:00:00Z', value: 10 },
  ];

  render(<MetricChart title="CPU" points={points} xKey="sampled_at" yKey="value" unit="%" />);

  expect(screen.getByText('CPU 텍스트 요약: 3개 지점, 최근 값 21%')).toBeInTheDocument();
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const options = createMetricChart.mock.calls[0][1];
  expect(options.xAxis.type).toBe('time');
  // 같은 시각은 API 순서를 유지하고 마지막 유효값을 요약값으로 사용
  expect(options.series[0].data).toEqual([
    [Date.parse('2026-09-03T00:00:00Z'), 10],
    [Date.parse('2026-09-03T01:00:00Z'), null],
    [Date.parse('2026-09-03T02:00:00Z'), 20],
    [Date.parse('2026-09-03T02:00:00Z'), 21],
    [Date.parse('2026-09-03T03:00:00Z'), null],
  ]);
});

test('formats byte charts with one stable unit in axes, tooltips, and accessible summary', async () => {
  render(
    <MetricChart
      title="메모리"
      points={[
        { at: '2026-09-03T00:00:00Z', value: 1024 ** 2 },
        { at: '2026-09-03T01:00:00Z', value: 1.5 * 1024 ** 3 },
      ]}
      xKey="at"
      yKey="value"
      unit="bytes"
    />,
  );

  expect(screen.getByText('메모리 텍스트 요약: 2개 지점, 최근 값 1.5 GB')).toBeInTheDocument();
  expect(screen.queryByText(/bytes/)).not.toBeInTheDocument();
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const options = createMetricChart.mock.calls[0][1];
  expect(options.yAxis.name).toBe('GB');
  expect(options.yAxis.axisLabel.formatter(1024 ** 3)).toBe('1');
  expect(options.tooltip.valueFormatter(1.5 * 1024 ** 3)).toBe('1.5 GB');
});

test('formats ratio charts as percentages instead of decimals', async () => {
  render(
    <MetricChart
      title="CPU"
      points={[{ at: '2026-09-03T00:00:00Z', value: 0.125 }]}
      xKey="at"
      yKey="value"
      unit="ratio"
    />,
  );
  expect(screen.getByText('CPU 텍스트 요약: 1개 지점, 최근 값 12.5%')).toBeInTheDocument();
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const options = createMetricChart.mock.calls[0][1];
  expect(options.yAxis.name).toBe('%');
  expect(options.yAxis.axisLabel.formatter(0.125)).toBe('12.5');
  expect(options.tooltip.valueFormatter(0.125)).toBe('12.5%');
  expect(options.yAxis.min).toBe(0);
  expect(options.yAxis.max).toBe(1);
});

test('capacity sets the full-scale byte axis so low heap usage is not visually exaggerated', async () => {
  render(
    <MetricChart
      title="Heap"
      points={[{ at: '2026-09-03T00:00:00Z', value: 1024 ** 3 }]}
      xKey="at"
      yKey="value"
      unit="bytes"
      capacity={4 * 1024 ** 3}
    />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const options = createMetricChart.mock.calls[0][1];
  expect(options.yAxis.min).toBe(0);
  expect(options.yAxis.max).toBe(4 * 1024 ** 3);
  expect(options.series[0].data).toEqual([[Date.parse('2026-09-03T00:00:00Z'), 1024 ** 3]]);
});

test('past samples above the current capacity remain visible', async () => {
  render(
    <MetricChart
      title="Heap"
      points={[{ at: '2026-09-03T00:00:00Z', value: 8 * 1024 ** 3 }]}
      xKey="at"
      yKey="value"
      unit="bytes"
      capacity={4 * 1024 ** 3}
    />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  expect(createMetricChart.mock.calls[0][1].yAxis.max).toBe(8 * 1024 ** 3);
});

test('plots each instance on its own timestamps without creating gaps from other instances', async () => {
  render(
    <MetricChart
      title="비교"
      points={[]}
      xKey="sampled_at"
      yKey="value"
      unit="ratio"
      series={[
        {
          name: 'Alpha / One',
          points: [
            { sampled_at: '2026-09-03T02:00:00Z', value: 0.2 },
            { sampled_at: '2026-09-03T00:00:00Z', value: 0.1 },
          ],
        },
        { name: 'Beta / Two', points: [{ sampled_at: '2026-09-03T01:00:00Z', value: 0.3 }] },
      ]}
    />,
  );
  expect(screen.getByText(/Alpha \/ One: 2개 지점, 최근 값 20%/)).toBeInTheDocument();
  expect(screen.getByText(/Beta \/ Two: 1개 지점, 최근 값 30%/)).toBeInTheDocument();
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const options = createMetricChart.mock.calls[0][1];
  expect(options.series.map(({ name, data }) => ({ name, data }))).toEqual([
    {
      name: 'Alpha / One',
      data: [
        [Date.parse('2026-09-03T00:00:00Z'), 0.1],
        [Date.parse('2026-09-03T02:00:00Z'), 0.2],
      ],
    },
    { name: 'Beta / Two', data: [[Date.parse('2026-09-03T01:00:00Z'), 0.3]] },
  ]);
  expect(options.xAxis.type).toBe('time');
  expect(options.tooltip.valueFormatter([Date.parse('2026-09-03T01:00:00Z'), 0.3])).toBe('30%');
  expect(options.series[0].color).not.toBe(options.series[1].color);
  expect(options.series[0].lineStyle?.type).not.toBe(options.series[1].lineStyle?.type);
  expect(options.series[0].symbol).not.toBe(options.series[1].symbol);
});

test('uses explicit stable styles and every shared color has 3 to 1 contrast on the chart background', async () => {
  render(
    <MetricChart
      title="stable"
      points={[]}
      xKey="at"
      yKey="value"
      series={[
        { name: 'second', styleIndex: 1, points: [{ at: '2026-01-01', value: 1 }] },
        { name: 'first', styleIndex: 0, points: [{ at: '2026-01-01', value: 2 }] },
      ]}
    />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const rendered = createMetricChart.mock.calls[0][1].series;
  expect(rendered.map((item) => [item.color, item.lineStyle?.type, item.symbol])).toEqual([
    [metricSeriesStyle(1).color, metricSeriesStyle(1).lineType, metricSeriesStyle(1).symbol],
    [metricSeriesStyle(0).color, metricSeriesStyle(0).lineType, metricSeriesStyle(0).symbol],
  ]);
  for (let index = 0; index < 12; index++) {
    expect(contrast(metricSeriesStyle(index).color, '#101f33')).toBeGreaterThanOrEqual(3);
    expect(contrast(metricSeriesStyle(index, 'light').color, '#ffffff')).toBeGreaterThanOrEqual(3);
  }
});

test('redraws chart colors when the screen theme changes without changing sample values', async () => {
  render(
    <MetricChart title="theme" points={[{ at: '2026-01-01', value: 42 }]} xKey="at" yKey="value" />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const darkOptions = createMetricChart.mock.calls[0][1];
  setTheme('light');
  await waitFor(() => expect(setOption).toHaveBeenCalled());
  const lightOptions = setOption.mock.calls.at(-1)![0] as CapturedOptions;
  expect(lightOptions.series[0].color).toBe(metricSeriesStyle(0, 'light').color);
  expect(lightOptions.series[0].data).toEqual(darkOptions.series[0].data);
});

test('preserves actual missing samples in a named series rather than connecting across them', async () => {
  render(
    <MetricChart
      title="누락"
      points={[]}
      xKey="at"
      yKey="value"
      series={[
        {
          name: 'server',
          points: [
            { at: '2026-09-03T00:00:00Z', value: 0.1 },
            { at: '2026-09-03T01:00:00Z', value: null },
            { at: '2026-09-03T02:00:00Z', value: 0.2 },
          ],
        },
      ]}
    />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const options = createMetricChart.mock.calls[0][1];
  expect(options.series[0].data[1]).toEqual([Date.parse('2026-09-03T01:00:00Z'), null]);
  expect(options.series[0].connectNulls).toBe(false);
  expect(options.tooltip.valueFormatter([Date.parse('2026-09-03T01:00:00Z'), null])).toBe('미수집');
});

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/../g)!
      .map((value) => parseInt(value, 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test('keeps two samples in the same minute at their actual timestamps', async () => {
  const first = Date.parse('2026-09-03T00:00:00Z');
  render(
    <MetricChart
      title="CPU"
      points={[
        { at: new Date(first).toISOString(), value: 10 },
        { at: new Date(first + 30000).toISOString(), value: 95 },
        { at: new Date(first + 90000).toISOString(), value: 15 },
      ]}
      xKey="at"
      yKey="value"
    />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const options = createMetricChart.mock.calls[0][1];
  expect(options.xAxis.type).toBe('time');
  expect(options.series[0].data).toEqual([
    [first, 10],
    [first + 30000, 95],
    [first + 90000, 15],
  ]);
});

test('supports time zoom, reset, and preserves the chart across collection updates', async () => {
  const { rerender } = render(
    <MetricChart title="CPU" points={[{ at: '2026-01-01', value: 10 }]} xKey="at" yKey="value" />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  expect(createMetricChart.mock.calls[0][1].dataZoom).toEqual([
    { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'CPU 확대 초기화' }));
  expect(dispatchAction).toHaveBeenCalledWith({ type: 'dataZoom', start: 0, end: 100 });
  rerender(
    <MetricChart title="CPU" points={[{ at: '2026-01-01', value: 20 }]} xKey="at" yKey="value" />,
  );
  await waitFor(() => expect(setOption).toHaveBeenCalled());
  expect(createMetricChart).toHaveBeenCalledOnce();
});

test('always updates collected values, preserves an explored window, and returns to the latest range', async () => {
  const first = Date.parse('2026-09-03T00:00:00Z');
  vi.spyOn(Date, 'now').mockReturnValue(first);
  const points = [{ at: new Date(first).toISOString(), value: 10 }];
  const view = (data: typeof points) => (
    <MetricChart title="CPU" points={data} xKey="at" yKey="value" liveWindow={300_000} />
  );
  const { rerender } = render(view(points));
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const initial = createMetricChart.mock.calls[0][1];
  expect(initial.animation).toBe(true);
  expect(initial.xAxis.min).toBe(first - 300_000);
  expect(initial.xAxis.max).toBe(first);
  const next = [...points, { at: new Date(first + 30_000).toISOString(), value: 50 }];
  rerender(view(next));
  await waitFor(() => expect(setOption.mock.calls.at(-1)![0].xAxis.max).toBe(first + 30_000));
  const chart = createMetricChart.mock.results[0].value as ReturnType<typeof createMetricChart>;
  chart.getOption.mockReturnValue({
    xAxis: [{ min: first - 270_000, max: first + 30_000 }],
    dataZoom: [{ startValue: first - 120_000, endValue: first + 10_000, start: 50, end: 90 }],
  });
  expect(screen.queryByText('최신으로 이동')).not.toBeInTheDocument();
  const onZoom = chart.on.mock.calls.find(([event]) => event === 'datazoom')![1];
  act(() => onZoom());
  expect(screen.getByRole('button', { name: 'CPU 확대 초기화' })).toHaveTextContent('초기화');
  setOption.mockClear();
  const newest = [...next, { at: new Date(first + 60_000).toISOString(), value: 20 }];
  rerender(view(newest));
  await waitFor(() => expect(setOption).toHaveBeenCalled());
  const explored = setOption.mock.calls.at(-1)![0];
  expect(explored.xAxis.max).toBe(first + 30_000);
  expect(explored.series[0].data.at(-1)).toEqual([first + 60_000, 20]);
  expect(explored.dataZoom[0].startValue).toBe(first - 120_000);
  expect(explored.dataZoom[0].endValue).toBe(first + 10_000);
  fireEvent.click(screen.getByRole('button', { name: 'CPU 확대 초기화' }));
  await waitFor(() => expect(setOption.mock.calls.at(-1)![0].xAxis.max).toBe(first + 60_000));
  expect(screen.queryByText('최신으로 이동')).not.toBeInTheDocument();
  expect(createMetricChart).toHaveBeenCalledOnce();
});

test('moves only the time axis between samples and highlights the latest actual point', async () => {
  const now = Date.parse('2026-10-11T00:00:00Z');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const interval = vi.spyOn(window, 'setInterval');
  render(
    <MetricChart
      title="CPU"
      points={[{ at: new Date(now).toISOString(), value: 42 }]}
      xKey="at"
      yKey="value"
      liveWindow={300_000}
    />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const initial = createMetricChart.mock.calls[0][1];
  expect(
    (initial.series[0] as unknown as { markPoint: { data: Array<{ coord: number[] }> } }).markPoint
      .data[0].coord,
  ).toEqual([now, 42]);
  const tick = interval.mock.calls.find(([, delay]) => delay === 100)![0] as () => void;
  setOption.mockClear();
  clock.mockReturnValue(now + 1000);
  act(() => tick());
  expect(setOption.mock.calls.at(-1)![0]).toEqual({
    animationDurationUpdate: 0,
    xAxis: { min: now + 1000 - 300_000, max: now + 1000 },
  });
  expect(setOption.mock.calls.at(-1)![0].series).toBeUndefined();
  setOption.mockClear();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => tick());
  expect(setOption).not.toHaveBeenCalled();
});

test('waits for data and reset transitions to finish before moving the time axis again', async () => {
  const now = Date.parse('2026-10-11T00:00:00Z');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const interval = vi.spyOn(window, 'setInterval');
  const points = [{ at: new Date(now).toISOString(), value: 10 }];
  const view = (data: typeof points) => (
    <MetricChart title="CPU" points={data} xKey="at" yKey="value" liveWindow={900_000} />
  );
  const { rerender } = render(view(points));
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  const chart = createMetricChart.mock.results[0].value as ReturnType<typeof createMetricChart>;
  const finish = chart.on.mock.calls.find(([event]) => event === 'finished')![1];
  const tick = interval.mock.calls.find(([, delay]) => delay === 100)![0] as () => void;

  clock.mockReturnValue(now + 15_000);
  act(() => tick());
  expect(setOption.mock.calls.at(-1)![0].animationDurationUpdate).toBe(0);
  const latest = { at: new Date(now + 15_000).toISOString(), value: 70 };
  rerender(view([...points, latest]));
  expect(setOption.mock.calls.at(-1)![0].animationDurationUpdate).toBe(400);
  expect(setOption.mock.calls.at(-1)![0].series[0].data.at(-1)).toEqual([now + 15_000, 70]);

  setOption.mockClear();
  clock.mockReturnValue(now + 15_100);
  act(() => tick());
  clock.mockReturnValue(now + 15_300);
  act(() => tick());
  expect(setOption).not.toHaveBeenCalled();

  clock.mockReturnValue(now + 15_500);
  act(() => {
    finish();
    tick();
  });
  expect(setOption.mock.calls.at(-1)![0]).toEqual({
    animationDurationUpdate: 0,
    xAxis: { min: now + 15_500 - 900_000, max: now + 15_500 },
  });

  fireEvent.click(screen.getByRole('button', { name: 'CPU 확대 초기화' }));
  expect(setOption.mock.calls.at(-1)![0].animationDurationUpdate).toBe(400);
  setOption.mockClear();
  act(() => tick());
  expect(setOption).not.toHaveBeenCalled();
  act(() => {
    finish();
    tick();
  });
  expect(setOption).toHaveBeenCalledOnce();
  expect(createMetricChart).toHaveBeenCalledOnce();
});

test('respects reduced motion without starting continuous axis movement', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  const interval = vi.spyOn(window, 'setInterval');
  render(
    <MetricChart
      title="CPU"
      points={[{ at: '2026-10-11', value: 42 }]}
      xKey="at"
      yKey="value"
      liveWindow={300_000}
    />,
  );
  await waitFor(() => expect(createMetricChart).toHaveBeenCalledOnce());
  expect(createMetricChart.mock.calls[0][1].animation).toBe(false);
  expect(interval.mock.calls.some(([, delay]) => delay === 100)).toBe(false);
});
