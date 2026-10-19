// 차트 조회 기간 및 시간 표시 조건 구성
export type ChartPeriod = '5m' | '15m' | '1h' | '24h' | '7d' | '30d' | '365d';
export const chartPeriods = {
  '5m': '최근 5분',
  '15m': '최근 15분',
  '1h': '최근 1시간',
  '24h': '하루',
  '7d': '일주일',
  '30d': '한 달',
  '365d': '1년',
} as const;

export function liveWindowMs(period: ChartPeriod): number | undefined {
  switch (period) {
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '1h':
      return 60 * 60_000;
    default:
      return undefined;
  }
}
