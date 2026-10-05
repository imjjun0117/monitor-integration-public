import { expect, test } from 'vitest';
import page from './InstanceDetailPage.tsx?raw';

test('resource and DB Pool periods use visible compact 조회 기간 fields', () => {
  expect(page.match(/>\s*조회 기간\s*<\/label>/g)).toHaveLength(2);
  expect(page).toContain('className="period-field field"');
});

test('resource detail has no raw bytes suffix and uses overflow containment classes', () => {
  expect(page).not.toMatch(/\}\s*bytes/);
  expect(page).toContain('className="resource-overflow"');
  expect(page).toContain('className="chart-grid"');
});
