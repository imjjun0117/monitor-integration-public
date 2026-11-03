// 수집된 요청을 시간·응답시간 좌표에 표시하고 선택 요청 반환
import { useEffect, useRef } from 'react';
import { useTheme } from '../theme';
import type { XlogPage } from '../generated';

export type XlogItem = XlogPage['items'][number];
export type XlogZoom = { start: number; end: number };

function zoomOptions(zoom?: XlogZoom) {
  return zoom
    ? { startValue: zoom.start, endValue: zoom.end, rangeMode: ['value', 'value'] as const }
    : { start: 0, end: 100, rangeMode: ['percent', 'percent'] as const };
}

export default function XlogChart({
  items,
  onSelect,
  rangeMinutes,
  rangeEnd,
  zoom,
  onZoomChange,
}: {
  items: XlogItem[];
  onSelect: (item: XlogItem) => void;
  rangeMinutes?: number;
  rangeEnd?: number;
  zoom?: XlogZoom;
  onZoomChange?: (zoom?: XlogZoom) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const currentChart = useRef<import('echarts').ECharts | undefined>(undefined);
  const currentItems = useRef(items);
  currentItems.current = items;
  const savedZoom = useRef(zoom);
  const zoomChanged = useRef(onZoomChange);
  zoomChanged.current = onZoomChange;
  const updatingZoom = useRef(false);
  const oldestPoint = Math.min(...items.map((item) => item.payload.started_at));
  const newestPoint = Math.max(...items.map((item) => item.payload.started_at));
  const liveRange = useRef<{ min?: number; max?: number }>({});
  liveRange.current = {
    min:
      rangeMinutes && rangeEnd
        ? Math.min(rangeEnd - rangeMinutes * 60_000, oldestPoint)
        : undefined,
    max: rangeEnd ? Math.max(rangeEnd, newestPoint) : undefined,
  };
  const currentRange = useRef<{ min?: number; max?: number }>({});
  currentRange.current = {
    min: savedZoom.current
      ? Math.min(liveRange.current.min ?? savedZoom.current.start, savedZoom.current.start)
      : liveRange.current.min,
    max: savedZoom.current
      ? Math.max(liveRange.current.max ?? savedZoom.current.end, savedZoom.current.end)
      : liveRange.current.max,
  };
  const theme = useTheme();
  useEffect(() => {
    let disposed = false;
    let chart: import('echarts').ECharts | undefined;
    let observer: ResizeObserver | undefined;
    void import('echarts').then((echarts) => {
      if (disposed || !element.current) {
        return;
      }
      chart = echarts.init(element.current);
      currentChart.current = chart;
      const color = theme === 'dark' ? '#9fb2cc' : '#667085';
      const series = [
        {
          name: 'HTTP 2xx·3xx',
          color: theme === 'dark' ? '#4bd9f5' : '#0085a4',
          matches: (item: XlogItem) => item.payload.status < 400,
        },
        {
          name: 'HTTP 4xx·5xx',
          color: theme === 'dark' ? '#f78fa6' : '#c43a64',
          matches: (item: XlogItem) => item.payload.status >= 400,
        },
      ];
      const escaped = (value: string) =>
        value
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;');
      chart.setOption({
        baseOption: {
          animation: false,
          backgroundColor: 'transparent',
          grid: { left: 62, right: 30, top: 58, bottom: 72 },
          legend: {
            type: 'scroll',
            top: 0,
            left: 0,
            right: 90,
            textStyle: { color, fontSize: 11 },
            icon: 'circle',
          },
          toolbox: {
            top: 0,
            right: 0,
            feature: { dataZoom: { yAxisIndex: 'none' }, restore: {} },
            iconStyle: { borderColor: color },
          },
          tooltip: {
            confine: true,
            backgroundColor: theme === 'dark' ? '#102239' : '#fff',
            borderColor: '#a78bfa',
            textStyle: { color },
            formatter: (value: unknown) => {
              const point = (value as { data: { item: XlogItem } }).data.item;
              return `${escaped(point.instance_name)}<br/>${escaped(point.payload.method)} ${escaped(point.payload.path)}<br/>${point.payload.duration_ms} ms · HTTP ${point.payload.status}`;
            },
          },
          xAxis: {
            type: 'time',
            min: currentRange.current.min,
            max: currentRange.current.max,
            splitNumber: 4,
            axisLabel: { color, hideOverlap: true },
            axisLine: { lineStyle: { color: '#35516e' } },
            splitLine: { show: false },
          },
          yAxis: {
            type: 'value',
            name: '응답시간 ms',
            nameTextStyle: { color },
            axisLabel: { color },
            splitLine: {
              lineStyle: { color: theme === 'dark' ? '#23364c' : '#e9edf4', type: 'dashed' },
            },
          },
          dataZoom: [
            { type: 'inside', ...zoomOptions(savedZoom.current) },
            {
              type: 'slider',
              bottom: 8,
              height: 22,
              borderColor: 'transparent',
              fillerColor: 'rgba(167,139,250,.18)',
              textStyle: { color },
              ...zoomOptions(savedZoom.current),
            },
          ],
          series: series.map((series) => ({
            name: series.name,
            type: 'scatter',
            symbolSize: 6,
            itemStyle: { color: series.color, opacity: 0.8 },
            emphasis: { scale: 2 },
            data: currentItems.current.filter(series.matches).map((item) => ({
              value: [item.payload.started_at, item.payload.duration_ms],
              item,
            })),
          })),
        },
        // 좁은 카드에서는 범례와 도구 버튼을 별도 줄에 배치
        media: [
          {
            query: { maxWidth: 440 },
            option: {
              legend: { right: 0 },
              toolbox: { top: 30 },
              grid: { left: 56, right: 16, top: 82 },
            },
          },
          {
            option: {
              legend: { right: 90 },
              toolbox: { top: 0 },
              grid: { left: 62, right: 30, top: 58 },
            },
          },
        ],
      });
      chart.on('click', (event) => {
        const item = (event.data as { item?: XlogItem })?.item;
        if (item) {
          onSelect(item);
        }
      });
      chart.on('datazoom', () => {
        if (updatingZoom.current || !chart) {
          return;
        }
        const view = chart.getOption() as {
          xAxis: Array<{ min?: number; max?: number }>;
          dataZoom: Array<{
            startValue?: number;
            endValue?: number;
            start: number;
            end: number;
          }>;
        };
        const axis = view.xAxis[0];
        const selected = view.dataZoom[0];
        const min = axis?.min ?? currentRange.current.min;
        const max = axis?.max ?? currentRange.current.max;
        if (!selected || min === undefined || max === undefined) {
          return;
        }
        // 사용자 선택을 축의 절대 시각으로 보관하여 조회 시간축 이동과 분리
        const next =
          selected.start === 0 && selected.end === 100
            ? undefined
            : {
                start: selected.startValue ?? min + ((max - min) * selected.start) / 100,
                end: selected.endValue ?? min + ((max - min) * selected.end) / 100,
              };
        if (savedZoom.current?.start === next?.start && savedZoom.current?.end === next?.end) {
          return;
        }
        savedZoom.current = next;
        zoomChanged.current?.(next);
      });
      chart.on('restore', () => {
        savedZoom.current = undefined;
        currentRange.current = liveRange.current;
        updatingZoom.current = true;
        chart?.setOption({
          xAxis: liveRange.current,
          dataZoom: [zoomOptions(), zoomOptions()],
        });
        updatingZoom.current = false;
        zoomChanged.current?.(undefined);
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(element.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
      currentChart.current = undefined;
    };
  }, [theme, onSelect]);
  useEffect(() => {
    const chart = currentChart.current;
    if (!chart) {
      return;
    }
    // 축 갱신 시 절대 선택값을 재적용하여 새 자료에서도 같은 시각 유지
    updatingZoom.current = true;
    chart.setOption({
      xAxis: currentRange.current,
      dataZoom: [zoomOptions(savedZoom.current), zoomOptions(savedZoom.current)],
      series: [false, true].map((errors) => ({
        data: items
          .filter((item) => item.payload.status >= 400 === errors)
          .map((item) => ({ value: [item.payload.started_at, item.payload.duration_ms], item })),
      })),
    });
    updatingZoom.current = false;
  }, [items, rangeMinutes, rangeEnd]);
  return (
    <div
      ref={element}
      className="xlog-scatter"
      role="img"
      aria-label="XLog 요청 응답시간 분포 차트"
    />
  );
}
