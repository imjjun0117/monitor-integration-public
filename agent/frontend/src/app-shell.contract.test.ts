import { expect, test, vi } from 'vitest';

const { readFileSync } = await vi.importActual<{
  readFileSync(path: string, encoding: string): string;
}>('node:fs');
const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
const source = (file: string) => readFileSync(`${cwd}/src/${file.replace(/^\.\//, '')}`, 'utf8');

test('responsive layout uses Ant Design shell rather than repainting the document canvas', () => {
  const appStyles = source('./app.css');
  const layoutStyles = source('./pro-layout.css');
  const app = source('./App.tsx');

  expect(app).toContain('<ProLayout');
  expect(appStyles).not.toMatch(/(?:html|body|#root|\.workspace)\s*\{[^}]*background:/);
  expect(layoutStyles).toMatch(
    /\.monitor-pro-layout \.ant-pro-layout-content\s*\{[^}]*min-width:\s*0/,
  );
  expect(layoutStyles).toMatch(/@media \(max-width: 600px\)/);
});
