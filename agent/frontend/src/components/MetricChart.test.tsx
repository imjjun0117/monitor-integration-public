import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import MetricChart, { metricSeriesStyle } from './MetricChart';

type CapturedOptions = {
  xAxis: { data?: string[]; type: string };
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

const createMetricChart = vi.fn((_element: HTMLDivElement, _options: CapturedOptions) => ({
  resize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('./chartEngine', () => ({ createMetricChart }));

beforeEach(() => {
  createMetricChart.mockClear();
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
  vi.unstubAllGlobals();
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
  expect(options.xAxis.data).toEqual([
    local('2026-09-03T00:00:00Z'),
    local('2026-09-03T01:00:00Z'),
    local('2026-09-03T02:00:00Z'),
    local('2026-09-03T02:00:00Z'),
    local('2026-09-03T03:00:00Z'),
  ]);
  // 같은 시각은 API 순서를 유지하고 마지막 유효값을 요약값으로 사용
  expect(options.series[0].data).toEqual([10, null, 20, 21, null]);
  expect(options.series[0].data).not.toContain(0);
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
  expect(options.series[0].data).toEqual([1024 ** 3]);
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

test('uses explicit stable styles and every shared color has 3 to 1 contrast on white', async () => {
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
    expect(contrast(metricSeriesStyle(index).color, '#ffffff')).toBeGreaterThanOrEqual(3);
  }
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

function local(value: string) {
  return new Date(value).toLocaleString();
}
