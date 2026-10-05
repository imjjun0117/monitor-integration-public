import { expect, test, vi } from 'vitest';

const { readFileSync } = await vi.importActual<{
  readFileSync(path: string, encoding: string): string;
}>('node:fs');
const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
const styles = readFileSync(`${cwd}/src/app.css`, 'utf8');

test('the canvas background and viewport height contract covers every full-page shell layer', () => {
  for (const selector of ['html', 'body', '#root', '.app-shell', '.workspace', 'main']) {
    const rule = styles.split('\n').find((line) => line.startsWith(`${selector} {`)) ?? '';
    expect(rule, `${selector} must cover the document canvas`).toMatch(
      /min-height:\s*(?:100%|100vh)/,
    );
    expect(rule, `${selector} must paint the document canvas`).toContain(
      'background: var(--hm-canvas)',
    );
  }
});
