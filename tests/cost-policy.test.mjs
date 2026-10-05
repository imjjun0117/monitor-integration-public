import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const costs = readFileSync('docs/costs.md', 'utf8');

test('cost policy covers every runtime and tool with official sources', () => {
  for (const name of ['PostgreSQL', 'Docker', 'Compose', 'Temurin', 'OpenJDK', 'Maven',
    'React', 'Vite', 'TailAdmin', 'Tailwind CSS', 'Radix UI', 'Outfit', 'Noto Sans KR',
    'ECharts', 'Trivy', 'Cloudflare Quick Tunnel']) {
    assert.match(costs, new RegExp(name, 'i'), `${name} missing`);
  }
  assert.match(costs, /과금[^\n]*(금지|사용하지)/);
  assert.match(costs, /계정[^\n]*결제[^\n]*없는/);
  assert.match(costs, /유료 plan|유료 플랜/i);
  assert.match(costs, /외부 API[^\n]*(disabled|configuration_required)/i);
  assert.match(costs, /npm[^\n]*Maven[^\n]*license/i);
  assert.match(costs, /https:\/\//);
});
