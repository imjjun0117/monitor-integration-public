import { expect, test } from 'vitest';
import indexHtml from '../index.html?raw';
import logo from '../public/monitoring.svg?raw';

test('SPA publishes the Monitoring title and shared SVG favicon', () => {
  expect(indexHtml).toContain('<title>Monitoring</title>');
  expect(indexHtml).toContain('rel="icon" type="image/svg+xml" href="/monitoring.svg"');
});

test('generic Monitoring mark is shared by the shell and favicon', () => {
  expect(logo).toContain('aria-label="Monitoring"');
  expect(logo).not.toContain('ICU');
  expect(logo).toContain('#5b21b6');
});
