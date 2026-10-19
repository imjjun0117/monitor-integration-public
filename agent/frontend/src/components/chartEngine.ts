// 사용하는 차트 구성 요소 등록
import { LineChart, type LineSeriesOption } from 'echarts/charts';
import {
  MarkPointComponent,
  DataZoomComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  type DataZoomComponentOption,
  type GridComponentOption,
  type TitleComponentOption,
  type TooltipComponentOption,
  type LegendComponentOption,
} from 'echarts/components';
import { init, use, type ComposeOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

use([
  MarkPointComponent,
  DataZoomComponent,
  LineChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

type MetricChartOption = ComposeOption<
  | DataZoomComponentOption
  | LineSeriesOption
  | GridComponentOption
  | TitleComponentOption
  | TooltipComponentOption
  | LegendComponentOption
>;

export function createMetricChart(element: HTMLDivElement, option: MetricChartOption) {
  const chart = init(element);
  chart.setOption(option);
  return chart;
}
