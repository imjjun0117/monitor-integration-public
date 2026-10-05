// 시간별 자원 및 응답시간 차트 표시
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  byteUnitFor,
  formatBytes,
  formatCount,
  formatPercent,
  type ByteUnit,
} from '../utils/format';

type Point = object;
export type MetricSeriesStyle = {
  color: string;
  lineType: 'solid' | 'dashed' | 'dotted';
  borderStyle: 'solid' | 'dashed' | 'dotted';
  symbol: string;
};
export type NamedMetricSeries = {
  name: string;
  points: Point[];
  styleIndex?: number;
  style?: MetricSeriesStyle;
};
const seriesStyles: readonly MetricSeriesStyle[] = [
  { color: '#0072B2', lineType: 'solid', borderStyle: 'solid', symbol: 'circle' },
  { color: '#D55E00', lineType: 'dashed', borderStyle: 'dashed', symbol: 'rect' },
  { color: '#00845F', lineType: 'dotted', borderStyle: 'dotted', symbol: 'triangle' },
  { color: '#A64D79', lineType: 'solid', borderStyle: 'solid', symbol: 'diamond' },
  { color: '#946200', lineType: 'dashed', borderStyle: 'dashed', symbol: 'pin' },
  { color: '#3578A8', lineType: 'dotted', borderStyle: 'dotted', symbol: 'arrow' },
  { color: '#7553A6', lineType: 'solid', borderStyle: 'solid', symbol: 'rect' },
  { color: '#B54450', lineType: 'dashed', borderStyle: 'dashed', symbol: 'triangle' },
  { color: '#457539', lineType: 'dotted', borderStyle: 'dotted', symbol: 'diamond' },
  { color: '#956142', lineType: 'solid', borderStyle: 'solid', symbol: 'pin' },
  { color: '#3F6D80', lineType: 'dashed', borderStyle: 'dashed', symbol: 'arrow' },
  { color: '#765765', lineType: 'dotted', borderStyle: 'dotted', symbol: 'circle' },
];
export const metricSeriesStyle = (index: number): MetricSeriesStyle =>
  seriesStyles[((index % seriesStyles.length) + seriesStyles.length) % seriesStyles.length];

export default function MetricChart({
  title,
  points,
  xKey,
  yKey,
  unit = '',
  series,
  summary,
  capacity,
  context,
  showLegend = false,
}: {
  title: string;
  points: Point[];
  xKey: string;
  yKey: string;
  unit?: string;
  series?: NamedMetricSeries[];
  summary?: ReactNode;
  capacity?: number | null;
  context?: string;
  showLegend?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const inputs = useMemo(
    () => (series?.length ? series : [{ name: '', points }]),
    [points, series],
  );
  const timelines = useMemo(
    () => inputs.map((item) => ({ name: item.name, entries: ordered(item.points, xKey, yKey) })),
    [inputs, xKey, yKey],
  );
  const timestamps = useMemo(
    () =>
      [
        ...new Set(
          timelines.flatMap((item) =>
            item.entries
              .map((entry) => entry.timestamp)
              .filter((value): value is number => value != null),
          ),
        ),
      ].sort((a, b) => a - b),
    [timelines],
  );
  const isMulti = Boolean(series?.length);
  const chartSeries = useMemo(
    () =>
      timelines.map((item, index) => {
        const style = inputs[index]?.style ?? metricSeriesStyle(inputs[index]?.styleIndex ?? index);
        const data = isMulti
          ? item.entries
              .filter((entry) => entry.timestamp != null)
              .map((entry) => [entry.timestamp!, entry.value])
          : item.entries.map(({ value }) => value);
        return {
          name: item.name || undefined,
          type: 'line' as const,
          color: style.color,
          symbol: style.symbol,
          showSymbol: item.entries.length <= 1,
          symbolSize: 6,
          connectNulls: false,
          smooth: false,
          lineStyle: { width: 2.5, type: style.lineType, color: style.color },
          emphasis: { focus: 'series' as const, scale: 1.5 },
          areaStyle: isMulti ? undefined : { opacity: 0.08, color: style.color },
          data,
        };
      }),
    [inputs, isMulti, timelines],
  );
  const values = useMemo(
    () =>
      timelines.flatMap((item) =>
        item.entries.map(({ value }) => value).filter((value): value is number => value != null),
      ),
    [timelines],
  );
  const maximum = Math.max(0, ...values.map(Math.abs));
  const axisMax =
    typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0
      ? Math.max(capacity, maximum)
      : unit === 'ratio'
        ? Math.max(1, maximum)
        : undefined;
  const byteUnit = useMemo<ByteUnit>(() => byteUnitFor(axisMax ?? maximum), [axisMax, maximum]);
  const displayUnit = unit === 'bytes' ? byteUnit : unit === 'ratio' ? '%' : unit;
  const formatValue = useMemo(
    () =>
      (value: number, includeUnit = true) => {
        if (unit === 'bytes') {
          const formatted = formatBytes(value, byteUnit);
          return includeUnit ? formatted : formatted.replace(` ${byteUnit}`, '');
        }
        if (unit === 'ratio') {
          return includeUnit ? formatPercent(value) : formatPercent(value).replace('%', '');
        }
        return `${value.toLocaleString('ko-KR')}${includeUnit ? unit : ''}`;
      },
    [byteUnit, unit],
  );
  const summaries = useMemo(
    () =>
      timelines.map((item) => {
        const valid = item.entries.filter(
          (entry) => entry.timestamp != null && entry.value != null,
        );
        const latest = valid.at(-1)?.value;
        return `${item.name ? `${item.name}: ` : ''}${latest == null ? '수집된 지점 없음' : `${formatCount(valid.length)}개 지점, 최근 값 ${formatValue(latest)}`}`;
      }),
    [formatValue, timelines],
  );
  const options = useMemo(
    () => ({
      animation: false,
      color: seriesStyles.map((style) => style.color),
      textStyle: { fontFamily: 'Outfit Variable, Noto Sans KR Variable, sans-serif', fontSize: 12 },
      grid: { left: 4, right: 12, top: showLegend ? 58 : 30, bottom: 8, containLabel: true },
      ...(showLegend
        ? {
            legend: {
              type: 'scroll' as const,
              top: 0,
              left: 0,
              right: 0,
              textStyle: { color: '#667085', fontSize: 11 },
            },
          }
        : {}),
      tooltip: {
        trigger: 'axis' as const,
        confine: true,
        backgroundColor: '#FFFFFF',
        borderColor: '#E4E7EC',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#344054', fontSize: 12 },
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(16,24,40,.12);',
        axisPointer: {
          type: 'line' as const,
          lineStyle: { color: '#98A2B3', type: 'dashed' as const },
        },
        valueFormatter: (value: unknown) => {
          const numeric = Array.isArray(value) ? value[1] : value;
          return numeric == null ? '미수집' : formatValue(Number(numeric));
        },
      },
      xAxis: {
        ...(isMulti
          ? { type: 'time' as const, boundaryGap: [0, 0] as [number, number] }
          : {
              type: 'category' as const,
              boundaryGap: false,
              data: timelines[0]?.entries.map(({ rawTime }) => localTime(rawTime)) ?? [],
            }),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#667085',
          fontSize: 11,
          margin: 14,
          hideOverlap: true,
          formatter: (value: string | number, index: number) =>
            axisTime(isMulti ? Number(value) : timelines[0]?.entries[index]?.timestamp, timestamps),
        },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        max: axisMax,
        splitNumber: 4,
        name: displayUnit,
        nameTextStyle: { color: '#667085', fontSize: 11 },
        splitLine: { lineStyle: { color: '#EAECF0', type: 'dashed' as const } },
        axisLabel: {
          color: '#667085',
          fontSize: 11,
          margin: 12,
          formatter: (value: number) => formatValue(value, false),
        },
      },
      series: chartSeries,
    }),
    [axisMax, chartSeries, displayUnit, formatValue, isMulti, timelines, timestamps, showLegend],
  );
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') {
      return;
    }
    let disposed = false;
    let disposeChart: (() => void) | undefined;
    void import('./chartEngine').then(({ createMetricChart }) => {
      if (disposed || !container.current) {
        return;
      }
      const chart = createMetricChart(container.current, options);
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(container.current);
      void document.fonts?.ready.then(() => {
        if (!disposed) {
          chart.resize();
        }
      });
      disposeChart = () => {
        observer.disconnect();
        chart.dispose();
      };
    });
    return () => {
      disposed = true;
      disposeChart?.();
    };
  }, [options]);
  const summaryText = summaries.join('; ');
  const accessibleTitle = context ? `${context} · ${title}` : title;
  return (
    <section className="metric-chart-card" aria-label={`${accessibleTitle} 그래프`}>
      <h3 className="metric-chart-title">{title}</h3>
      {summary}
      <div
        ref={container}
        className="chart"
        role="img"
        aria-label={`${accessibleTitle}: ${summaryText}`}
      />
      <p className="metric-chart-summary">
        {title} 텍스트 요약: {summaryText}
      </p>
    </section>
  );
}

function ordered(points: Point[], xKey: string, yKey: string) {
  return points
    .map((point, inputIndex) => ({
      point,
      inputIndex,
      rawTime: field(point, xKey),
      timestamp: timestamp(field(point, xKey)),
      value: numeric(field(point, yKey)),
    }))
    .sort((left, right) =>
      left.timestamp == null
        ? right.timestamp == null
          ? left.inputIndex - right.inputIndex
          : 1
        : right.timestamp == null
          ? -1
          : left.timestamp - right.timestamp || left.inputIndex - right.inputIndex,
    );
}
function timestamp(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}
function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function localTime(value: unknown) {
  if (!value) {
    return '';
  }
  const date = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
function axisTime(value: number | null | undefined, times: number[]) {
  if (value == null) {
    return '';
  }
  const date = new Date(value);
  const time = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const multipleDays =
    times.length > 1 &&
    new Date(times[0]).toDateString() !== new Date(times.at(-1)!).toDateString();
  return multipleDays ? `${date.getMonth() + 1}/${date.getDate()} ${time}` : time;
}
function field(point: object, key: string): unknown {
  return (point as { [name: string]: unknown })[key];
}
