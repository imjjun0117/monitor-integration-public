import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('Playwright launches the isolated real backend stack rather than Vite fixtures', () => {
  const config = readFileSync('monitor-center/frontend/playwright.config.ts', 'utf8');
  assert.match(config, /start-e2e-stack\.sh/);
  assert.match(config, /127\.0\.0\.1:18080/);
  assert.doesNotMatch(config, /npm run dev|127\.0\.0\.1:5173|reuseExistingServer:true/);
  assert.equal(existsSync('scripts/start-e2e-stack.sh'), true);
});

test('authenticated E2E verifies four agents, all detail tabs, and accessibility', () => {
  const spec = readFileSync('monitor-center/frontend/e2e/core-flow.spec.ts', 'utf8');
  assert.match(spec, /input\[name="username"\]/);
  for (const label of ['샘플 A 1', '샘플 A 2', '샘플 B 1', '샘플 B 2',
    'JVM·서버 자원', 'DB Pool', '내부 점검', 'AxeBuilder']) {
    assert.ok(spec.includes(label), label);
  }
  assert.doesNotMatch(spec, /route\(|fulfill\(|mock/i);
});

test('stack gate proves nonzero latest/history rows and center restart recovery', () => {
  const script = readFileSync('scripts/start-e2e-stack.sh', 'utf8');
  for (const table of ['instance_snapshot_latest', 'instance_metric_samples', 'disk_latest',
    'disk_samples', 'db_pool_latest', 'db_pool_samples', 'check_results_latest',
    'check_result_samples']) {
    assert.ok(script.includes(table), table);
  }
  assert.match(script, /restart/i);
});
