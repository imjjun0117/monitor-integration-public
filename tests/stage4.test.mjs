import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const frontend = 'monitor-center/frontend/';
const pages = frontend + 'src/pages/';
const sourceFiles = [
  frontend + 'src/App.tsx', frontend + 'src/api.ts',
  ...readdirSync(pages)
    .map((name) => pages + name)
    .filter((path) => statSync(path).isFile()),
  ...readdirSync(pages + 'settings')
    .map((name) => pages + 'settings/' + name),
];
const source = sourceFiles.map((path) => readFileSync(path, 'utf8')).join('\n');

test('단계 4 앱과 테스트가 존재한다', () => {
  for (const path of ['src/App.tsx', 'src/main.tsx', 'src/api.ts', 'src/App.test.tsx',
    'vite.config.ts', 'index.html']) {
    assert.equal(existsSync(frontend + path), true, path);
  }
});

test('최상위 메뉴는 정확히 다섯 개다', () => {
  const app = readFileSync(frontend + 'src/App.tsx', 'utf8');
  for (const label of ['종합 현황', '프로젝트', 'API 모니터링', '인증서 관리', '설정']) {
    assert.ok(app.includes(label), label);
  }
  assert.equal((app.match(/label:\s*'[^']+',\s*to:\s*'[^']+'/g) || []).length, 5);
});

test('인스턴스 상세는 정확히 네 탭과 미지원 표기를 제공한다', () => {
  const detail = readFileSync(frontend + 'src/pages/InstanceDetailPage.tsx', 'utf8');
  for (const label of ['JVM·서버 자원', 'DB Pool', '내부 점검', '실시간 로그', '미지원']) {
    assert.ok(detail.includes(label), label);
  }
  assert.equal((detail.match(/<Tab /g) || []).length, 4);
});

test('실 API polling, 토큰 비재표시, lazy routes가 구현된다', () => {
  assert.match(source, /refetchInterval:\s*15_000/);
  assert.ok(!source.includes('token_ciphertext'));
  assert.ok(!source.includes('fixtures/'));
  assert.match(readFileSync(frontend + 'src/App.tsx', 'utf8'), /lazy\(\(\) => import/);
});

test('primary content uses the full workspace width and allows grid children to shrink', () => {
  const css = readFileSync(frontend + 'src/app.css', 'utf8');
  assert.match(cssRule(css, 'html, body, #root'), /width:\s*100%/);
  assert.match(cssRule(css, '.app-shell'), /grid-template-columns:\s*290px minmax\(0, 1fr\)/);
  assert.match(cssRule(css, 'main'), /min-width:\s*0/);
  assert.match(cssRule(css, 'main > *'), /min-width:\s*0/);
  assert.doesNotMatch(cssRule(css, 'main'), /max-width\s*:/);
  assert.doesNotMatch(cssRule(css, 'main > *'), /max-width\s*:/);
});

function cssRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing CSS rule for ${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
}
