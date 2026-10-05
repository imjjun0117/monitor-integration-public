import { expect, test } from 'vitest';
import { formatBytes, formatCount, formatDuration, formatPercent } from './format';

test('formats byte boundaries with stable decimals and null support', () => {
  expect(formatBytes(null)).toBe('미지원');
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1023)).toBe('1,023 B');
  expect(formatBytes(1024)).toBe('1 KB');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(1024 ** 4 * 1.25)).toBe('1.25 TB');
});

test('formats durations, localized counts, and readable percentages', () => {
  expect(formatDuration(null)).toBe('미지원');
  expect(formatDuration(90061000)).toBe('1일 1시간 1분 1초');
  expect(formatDuration(61000)).toBe('1분 1초');
  expect(formatCount(1234567)).toBe((1234567).toLocaleString('ko-KR'));
  expect(formatPercent(0.1234)).toBe('12.3%');
  expect(formatPercent(null)).toBe('미지원');
});
