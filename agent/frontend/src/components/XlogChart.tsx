// 수집된 요청을 시간·응답시간 좌표에 표시하고 선택 요청 반환
import { useEffect, useRef } from 'react';
import { useTheme } from '../theme';
import type { XlogPage } from '../generated';

export type XlogItem = XlogPage['items'][number];
export default function XlogChart({
  items,
  onSelect,
}: {
  items: XlogItem[];
  onSelect: (item: XlogItem) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const currentChart = useRef<import('echarts').ECharts | undefined>(undefined);
  const currentItems = useRef(items);
  currentItems.current = items;
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
          color: '#4bd9f5',
          matches: (item: XlogItem) => item.payload.status < 400,
        },
        {
          name: 'HTTP 4xx·5xx',
          color: '#f78fa6',
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
            { type: 'inside' },
            {
              type: 'slider',
              bottom: 8,
              height: 22,
              borderColor: 'transparent',
              fillerColor: 'rgba(167,139,250,.18)',
              textStyle: { color },
            },
          ],
          series: series.map((series) => ({
            name: series.name,
            type: 'scatter',
            symbolSize: 2.5,
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
    // 갱신 시 데이터만 교체하여 사용자가 확대한 시간 범위 유지
    currentChart.current?.setOption({
      series: [false, true].map((errors) => ({
        data: items
          .filter((item) => item.payload.status >= 400 === errors)
          .map((item) => ({ value: [item.payload.started_at, item.payload.duration_ms], item })),
      })),
    });
  }, [items]);
  return (
    <div
      ref={element}
      className="xlog-scatter"
      role="img"
      aria-label="XLog 요청 응답시간 분포 차트"
    />
  );
}
