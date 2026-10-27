// 시간별 자원 및 응답시간 차트 표시
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, theme as antTheme } from 'antd';
import { useTheme, type Theme } from '../theme';
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
  { color: '#4bd9f5', lineType: 'solid', borderStyle: 'solid', symbol: 'circle' },
  { color: '#b49afa', lineType: 'dashed', borderStyle: 'dashed', symbol: 'rect' },
  { color: '#56d9b1', lineType: 'dotted', borderStyle: 'dotted', symbol: 'triangle' },
  { color: '#ffbd70', lineType: 'solid', borderStyle: 'solid', symbol: 'diamond' },
  { color: '#f78fa6', lineType: 'dashed', borderStyle: 'dashed', symbol: 'pin' },
  { color: '#75afff', lineType: 'dotted', borderStyle: 'dotted', symbol: 'arrow' },
  { color: '#d0b0ff', lineType: 'solid', borderStyle: 'solid', symbol: 'rect' },
  { color: '#ff936b', lineType: 'dashed', borderStyle: 'dashed', symbol: 'triangle' },
  { color: '#85d7a3', lineType: 'dotted', borderStyle: 'dotted', symbol: 'diamond' },
  { color: '#e7c777', lineType: 'solid', borderStyle: 'solid', symbol: 'pin' },
  { color: '#69bfc8', lineType: 'dashed', borderStyle: 'dashed', symbol: 'arrow' },
  { color: '#cba4c7', lineType: 'dotted', borderStyle: 'dotted', symbol: 'circle' },
];
const lightColors = [
  '#0072b2',
  '#7553a6',
  '#00845f',
  '#d55e00',
  '#a64d79',
  '#3578a8',
  '#946200',
  '#b54450',
  '#457539',
  '#956142',
  '#3f6d80',
  '#765765',
];
export function metricSeriesStyle(index: number, theme: Theme = 'dark'): MetricSeriesStyle {
  const position = ((index % seriesStyles.length) + seriesStyles.length) % seriesStyles.length;
  const style = seriesStyles[position];
  return theme === 'light' ? { ...style, color: lightColors[position] } : style;
}

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
  liveWindow,
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
  liveWindow?: number;
}) {
  const { token } = antTheme.useToken();
  const theme = useTheme();
  const [following, setFollowing] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const exploredWindow = useRef<
    { min: number; max: number; start: number; end: number } | undefined
  >(undefined);
  const liveEnabled = useRef(Boolean(liveWindow));
  liveEnabled.current = Boolean(liveWindow);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) {
      return;
    }
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const container = useRef<HTMLDivElement>(null);
  const currentChart = useRef<import('echarts/core').EChartsType | undefined>(undefined);
  const updating = useRef(false);
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
        const style =
          inputs[index]?.style ?? metricSeriesStyle(inputs[index]?.styleIndex ?? index, theme);
        const data = item.entries
          .filter((entry) => entry.timestamp != null)
          .map((entry) => [entry.timestamp!, entry.value]);
        const latest = item.entries.at(-1);
        return {
          name: item.name || undefined,
          type: 'line' as const,
          color: style.color,
          symbol: style.symbol,
          showSymbol: item.entries.length <= 1,
          symbolSize: 6,
          connectNulls: false,
          smooth: false,
          lineStyle: { width: 1.5, type: style.lineType, color: style.color },
          markPoint:
            liveWindow && latest?.timestamp != null && latest.value != null
              ? {
                  symbol: 'circle',
                  symbolSize: 8,
                  silent: true,
                  label: { show: false },
                  itemStyle: {
                    color: style.color,
                    borderColor: theme === 'dark' ? '#e7effa' : '#ffffff',
                    borderWidth: 2,
                    shadowBlur: 12,
                    shadowColor: style.color,
                  },
                  data: [{ name: '최신 값', coord: [latest.timestamp, latest.value] }],
                }
              : undefined,
          emphasis: { focus: 'series' as const, scale: 1.5 },
          areaStyle: { opacity: isMulti ? 0.06 : 0.12, color: style.color },
          data,
        };
      }),
    [inputs, isMulti, timelines, theme, liveWindow],
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
  const latestTimestamp = timestamps.at(-1);
  // 유효한 시각의 수집 표본으로 통계 계산. 마지막 미수집 값은 이전 값으로 대체하지 않음
  const statistics = useMemo(
    () =>
      timelines.map((item, index) => {
        const samples = item.entries.filter((entry) => entry.timestamp != null);
        const values = samples
          .map((entry) => entry.value)
          .filter((value): value is number => value != null);
        const style =
          inputs[index]?.style ?? metricSeriesStyle(inputs[index]?.styleIndex ?? index, theme);
        return {
          name: item.name || title,
          style,
          min: values.length ? Math.min(...values) : null,
          max: values.length ? Math.max(...values) : null,
          average: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null,
          latest: samples.at(-1)?.value ?? null,
        };
      }),
    [inputs, timelines, theme, title],
  );
  const liveEnd =
    liveWindow && latestTimestamp != null ? Math.max(Date.now(), latestTimestamp) : undefined;
  const options = useMemo(
    () => ({
      animation: Boolean(liveWindow) && !reducedMotion,
      animationDuration: 0,
      animationDurationUpdate: 400,
      animationEasingUpdate: 'linear' as const,
      backgroundColor: 'transparent',
      color: seriesStyles.map((_, index) => metricSeriesStyle(index, theme).color),
      textStyle: { fontFamily: 'sans-serif', fontSize: 12 },
      grid: { left: 4, right: 12, top: showLegend ? 58 : 30, bottom: 8, containLabel: true },
      ...(showLegend
        ? {
            legend: {
              type: 'scroll' as const,
              top: 0,
              left: 0,
              right: 0,
              textStyle: { color: theme === 'dark' ? '#9fb2cc' : '#475467', fontSize: 11 },
            },
          }
        : {}),
      tooltip: {
        trigger: 'axis' as const,
        confine: true,
        backgroundColor: theme === 'dark' ? '#102239' : '#ffffff',
        borderColor: theme === 'dark' ? '#35516e' : '#dce3ed',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: theme === 'dark' ? '#e7effa' : '#101828', fontSize: 12 },
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
        type: 'time' as const,
        min: liveWindow && liveEnd != null ? liveEnd - liveWindow : undefined,
        max: liveEnd,
        boundaryGap: [0, 0] as [number, number],
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: theme === 'dark' ? '#2c3038' : '#e2e8f0' },
        },
        axisLabel: {
          color: theme === 'dark' ? '#9fb2cc' : '#475467',
          fontSize: 11,
          margin: 14,
          hideOverlap: true,
          formatter: (value: string | number) => axisTime(Number(value), timestamps),
        },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        max: axisMax,
        splitNumber: 4,
        name: displayUnit,
        nameTextStyle: { color: theme === 'dark' ? '#9fb2cc' : '#475467', fontSize: 11 },
        splitLine: {
          lineStyle: { color: theme === 'dark' ? '#2c3038' : '#e2e8f0', type: 'solid' as const },
        },
        axisLabel: {
          color: theme === 'dark' ? '#9fb2cc' : '#475467',
          fontSize: 11,
          margin: 12,
          formatter: (value: number) => formatValue(value, false),
        },
      },
      dataZoom: [
        {
          type: 'inside' as const,
          xAxisIndex: 0,
          filterMode: 'none' as const,
          ...(liveWindow
            ? { start: 0, end: 100, rangeMode: ['percent', 'percent'] as ['percent', 'percent'] }
            : {}),
        },
      ],
      series: chartSeries,
    }),
    [
      axisMax,
      liveWindow,
      liveEnd,
      reducedMotion,
      chartSeries,
      displayUnit,
      formatValue,
      isMulti,
      timelines,
      timestamps,
      showLegend,
      theme,
    ],
  );
  const latestOptions = useRef(options);
  latestOptions.current = options;
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
      const chart = createMetricChart(container.current, latestOptions.current);
      currentChart.current = chart;
      // 데이터 전환이 끝난 뒤 시간축 이동 재개
      chart.on('finished', () => {
        updating.current = false;
      });
      // 탐색한 시간 범위를 고정하되 새 수집값은 계속 반영
      chart.on('datazoom', () => {
        if (!liveEnabled.current) {
          return;
        }
        const view = chart.getOption() as {
          xAxis: Array<{ min: number; max: number }>;
          dataZoom: Array<{ startValue?: number; endValue?: number; start: number; end: number }>;
        };
        const axis = view.xAxis[0];
        const zoom = view.dataZoom[0];
        exploredWindow.current = {
          min: axis.min,
          max: axis.max,
          start: zoom.startValue ?? axis.min + ((axis.max - axis.min) * zoom.start) / 100,
          end: zoom.endValue ?? axis.min + ((axis.max - axis.min) * zoom.end) / 100,
        };
        setFollowing(false);
      });
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(container.current);
      void document.fonts?.ready.then(() => {
        if (!disposed) {
          chart.resize();
        }
      });
      disposeChart = () => {
        observer.disconnect();
        currentChart.current = undefined;
        chart.dispose();
      };
    });
    return () => {
      disposed = true;
      disposeChart?.();
    };
  }, []);
  // 항상 데이터를 갱신하고 탐색 중에는 시간축·확대 범위만 유지
  useEffect(() => {
    if (!currentChart.current) {
      return;
    }

    const view = !following && liveWindow ? exploredWindow.current : undefined;
    updating.current = options.animation;
    currentChart.current.setOption(
      view
        ? {
            ...options,
            xAxis: { ...options.xAxis, min: view.min, max: view.max },
            dataZoom: [
              {
                ...options.dataZoom[0],
                startValue: view.start,
                endValue: view.end,
                rangeMode: ['value', 'value'],
              },
            ],
          }
        : options,
      { replaceMerge: ['series'] },
    );
  }, [options, following, liveWindow]);
  // 100ms마다 시간축을 이동해 선·점을 연속 이동. 측정값은 기존 수집 주기 유지
  // 데이터 전환·탐색 중·백그라운드·동작 축소 설정에서는 중단
  useEffect(() => {
    if (!liveWindow || !following || reducedMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      const current = latestOptions.current;
      if (
        document.hidden ||
        updating.current ||
        !currentChart.current ||
        current.xAxis.max == null
      ) {
        return;
      }
      const end = Math.max(Date.now(), current.xAxis.max);
      currentChart.current.setOption({
        animationDurationUpdate: 0,
        xAxis: { min: end - liveWindow, max: end },
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [liveWindow, following, reducedMotion]);
  const summaryText = summaries.join('; ');
  const accessibleTitle = context ? `${context} · ${title}` : title;
  return (
    <Card
      size="small"
      styles={{ body: { padding: token.padding } }}
      className="metric-chart-card"
      role="region"
      aria-label={`${accessibleTitle} 그래프`}
      title={<h3 style={{ fontSize: token.fontSizeLG, margin: 0 }}>{title}</h3>}
      extra={
        <Button
          type="text"
          aria-label={`${title} 확대 초기화`}
          title="초기화"
          icon={<ReloadOutlined />}
          onClick={() => {
            if (liveWindow) {
              exploredWindow.current = undefined;
              setFollowing(true);
              updating.current = latestOptions.current.animation;
              currentChart.current?.setOption(latestOptions.current, {
                replaceMerge: ['series'],
              });
            } else {
              currentChart.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
            }
          }}
        >
          초기화
        </Button>
      }
    >
      {summary}
      <div
        ref={container}
        className="chart"
        role="img"
        aria-label={`${accessibleTitle}: ${summaryText}`}
      />
      <div
        className="metric-chart-statistics"
        role="region"
        tabIndex={0}
        aria-label={`${accessibleTitle} 수집 표본 통계 스크롤`}
      >
        <table
          aria-label={`${accessibleTitle} 수집 표본 통계`}
          style={{ fontSize: token.fontSizeSM }}
        >
          <caption style={{ color: token.colorTextSecondary }}>
            조회 기간의 수집 표본 기준 · 확대 시에도 동일
          </caption>
          <thead>
            <tr>
              <th scope="col">지표</th>
              <th scope="col">최소</th>
              <th scope="col">최대</th>
              <th scope="col">평균</th>
              <th scope="col">최근</th>
            </tr>
          </thead>
          <tbody>
            {statistics.map((item, index) => (
              <tr key={index}>
                <th scope="row">
                  <span
                    className="metric-chart-swatch"
                    style={{
                      borderColor: item.style.color,
                      borderTopStyle: item.style.borderStyle,
                    }}
                    aria-hidden="true"
                  />
                  {item.name}
                </th>
                {[item.min, item.max, item.average, item.latest].map((value, column) => (
                  <td key={column}>
                    {value == null
                      ? '미수집'
                      : formatValue(
                          unit === 'ratio' || unit === 'bytes' ? value : Number(value.toFixed(2)),
                        )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="metric-chart-summary">
        {title} 텍스트 요약: {summaryText}
      </p>
    </Card>
  );
}

function ordered(points: Point[], xKey: string, yKey: string) {
  return points
    .map((point, inputIndex) => ({
      point,
      inputIndex,
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
