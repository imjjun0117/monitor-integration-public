import { expect, test } from 'vitest';
import indexHtml from '../index.html?raw';

test('SPA publishes the Hermes Monitoring title and shared SVG favicon', () => {
  expect(indexHtml).toContain('<title>Hermes Monitoring</title>');
  expect(indexHtml).toContain('rel="icon" type="image/svg+xml" href="/monitoring.svg"');
});
