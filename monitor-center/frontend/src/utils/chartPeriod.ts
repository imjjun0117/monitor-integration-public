// 차트 조회 기간 및 시간 표시 조건 구성
export type ChartPeriod = '24h' | '7d' | '30d' | '365d';
export const chartPeriods = {
  '24h': '하루',
  '7d': '일주일',
  '30d': '한 달',
  '365d': '1년',
} as const;
