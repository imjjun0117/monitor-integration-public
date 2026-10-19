import { expect, test } from 'vitest';
import indexHtml from '../index.html?raw';

test('SPA publishes the Monitoring title and shared SVG favicon', () => {
  expect(indexHtml).toContain('<title>Monitoring</title>');
  expect(indexHtml).toContain('rel="icon" type="image/svg+xml" href="/monitoring.svg"');
});
