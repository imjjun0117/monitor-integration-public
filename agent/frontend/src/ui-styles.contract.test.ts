import { expect, test, vi } from 'vitest';

const { readFileSync } = await vi.importActual<{
  readFileSync(path: string, encoding: string): string;
}>('node:fs');
const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
const source = (file: string) => readFileSync(`${cwd}/src/${file.replace(/^\.\//, '')}`, 'utf8');

test('the application loads only component-neutral layout and chart/log styles', () => {
  const entry = source('./main.tsx');
  const app = source('./App.tsx');
  const html = source('../index.html');
  const vite = source('../vite.config.ts');

  expect(entry).not.toContain('tailadmin.css');
  expect(app).not.toContain('monitoring-theme.css');
  expect(html).toContain('/assets/fonts/fonts.css');
  expect(app).toContain('theme={getMonitoringTheme(appearance)}');
  expect(source('./theme.ts')).toContain('Outfit Variable');
  expect(source('./theme.ts')).toContain('Noto Sans KR Variable');
  expect(vite).not.toContain('@tailwindcss/vite');
});

test('custom styles do not repaint Ant Design shell, cards, forms or tables', () => {
  const styles = [
    source('./app.css'),
    source('./pro-layout.css'),
    source('./pages/incidents/incidents.css'),
  ].join('\n');

  expect(styles).not.toMatch(
    /\.app-shell|\.side-rail|\.topbar|\.ta-(?:button|input|select|table|modal|tab|alert)/,
  );
  expect(styles).not.toMatch(
    /\.ant-(?:card|btn|table|form|layout|pro-layout|select)\b[^{}]*\{[^{}]*(?:background|color|border|box-shadow|padding|font-size|height)\s*:/,
  );
  expect(styles).not.toMatch(/(?:--hm-|--background:|--foreground:|--primary:|--card:|--ring:)/);
  expect(styles).not.toMatch(
    /(?:font-family:\s*['"]?(?:Outfit|Noto Sans)|@import\s*['"]tailwindcss)/,
  );
});

test('chart internals, readable log/code content, focus and responsive layouts survive', () => {
  const app = source('./app.css');
  const layout = source('./pro-layout.css');
  const incidents = source('./pages/incidents/incidents.css');
  const chart = source('./components/MetricChart.tsx');

  expect(chart).not.toMatch(/Outfit Variable|Noto Sans KR Variable/);
  expect(app).toMatch(/\.chart\s*\{[^}]*min-height:/);
  expect(app).toMatch(/\.service-info-metrics\s*\{[^}]*grid-template-columns:/);
  expect(app).toMatch(/\.metric-chart-statistics\s*\{[^}]*overflow-x:\s*auto/);
  expect(app).toMatch(/\.log-output\s*\{[^}]*overflow:\s*auto/);
  expect(app).toMatch(
    /\.api-code-block pre,\s*\.collector-events pre\s*\{[^}]*white-space:\s*pre-wrap/,
  );
  expect(app).toMatch(/\.skip-link:focus\s*\{/);
  expect(layout).toMatch(/\.dashboard-summary\s*\{[^}]*grid-template-columns:/);
  expect(incidents).toMatch(/\.incident-workspace\s*\{[^}]*grid-template-columns:/);
  expect(incidents).toMatch(/\.incident-log\s*\{[^}]*overflow:\s*auto/);
});
