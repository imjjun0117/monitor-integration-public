import { expect, test } from 'vitest';
import page from './InstanceDetailPage.tsx?raw';

test('resource and DB Pool periods keep visible 조회 기간 labels with accessible AntD fields', () => {
  expect(page.match(/>\s*조회 기간\s*<\/label>/g)).toHaveLength(2);
  expect(page.match(/className="period-field"/g)).toHaveLength(2);
  expect(page).toContain('id="resource-period"');
  expect(page).toContain('id="pool-period"');
});

test('resource detail has no raw bytes suffix and contains wide tables and charts', () => {
  expect(page).not.toMatch(/\}\s*bytes/);
  expect(page.match(/scroll=\{\{ x: 'max-content' \}\}/g)).toHaveLength(3);
  expect(page).toContain('className="chart-grid"');
});
