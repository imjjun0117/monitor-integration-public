// 사용량·시각·상태의 화면 표시 형식 변환
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
export type ByteUnit = (typeof BYTE_UNITS)[number];

function readable(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits });
}

export function byteUnitFor(maxValue: number): ByteUnit {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return 'B';
  }
  const index = Math.min(Math.floor(Math.log(maxValue) / Math.log(1024)), BYTE_UNITS.length - 1);
  return BYTE_UNITS[Math.max(0, index)];
}

export function formatBytes(value: unknown, displayUnit?: ByteUnit): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '미지원';
  }
  const unit = displayUnit ?? byteUnitFor(Math.abs(value));
  const index = BYTE_UNITS.indexOf(unit);
  return `${readable(value / 1024 ** index, index === 0 ? 0 : 2)} ${unit}`;
}

export function formatDuration(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '미지원';
  }
  let seconds = Math.max(0, Math.floor(value / 1000));
  const parts: string[] = [];
  for (const [size, label] of [
    [86400, '일'],
    [3600, '시간'],
    [60, '분'],
  ] as const) {
    const amount = Math.floor(seconds / size);
    if (amount) {
      parts.push(`${readable(amount, 0)}${label}`);
    }
    seconds %= size;
  }
  if (seconds || parts.length === 0) {
    parts.push(`${seconds}초`);
  }
  return parts.join(' ');
}

export function formatCount(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? readable(value, 0) : '미지원';
}

export function formatPercent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${readable(value * 100, 1)}%`
    : '미지원';
}
