import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const devUp = readFileSync('scripts/dev-up.ps1', 'utf8');
const helpers = readFileSync('scripts/process-helpers.ps1', 'utf8');
const app = readFileSync('monitor-center/src/main/resources/application.yml', 'utf8');
const compose = readFileSync('compose.yaml', 'utf8');
const operations = readFileSync('docs/operations.md', 'utf8');
const readme = readFileSync('README.md', 'utf8');

 test('LAN dashboard is explicit and Spring binds only the selected host-owned private address', () => {
  assert.match(devUp, /\[switch\]\$Lan/);
  assert.match(devUp, /\[string\]\$LanAddress/);
  assert.match(devUp, /Resolve-LanIPv4Address/);
  assert.match(devUp, /SERVER_ADDRESS/);
  assert.match(devUp, /Test-PortOwnedByTree[^\n]*-LocalAddress/);
  assert.doesNotMatch(devUp, /0\.0\.0\.0/);
});

test('default dashboard, database, Vite, and sample agents remain loopback-only', () => {
  assert.match(app, /address:\s*127\.0\.0\.1/);
  assert.match(compose, /127\.0\.0\.1:\$\{HERMES_DB_PORT:-5432\}:5432/);
  for (const port of [18081, 18082, 18083, 18084]) {
    assert.match(compose, new RegExp(`127\\.0\\.0\\.1:${port}:8080`));
  }
  assert.match(devUp, /--host['"],?\s*['"]127\.0\.0\.1/);
  assert.match(helpers, /LocalAddress/);
});

test('operator docs explain opt-in, rollback, exposure boundary, and public Wi-Fi prohibition', () => {
  for (const source of [operations, readme]) {
    assert.match(source, /dev-up\.ps1 -Lan/);
    assert.match(source, /dev-down\.ps1/);
    assert.match(source, /공용 Wi-Fi|public Wi-Fi/i);
    assert.match(source, /8080/);
    assert.match(source, /5173/);
    assert.match(source, /5432/);
    assert.match(source, /login|로그인/i);
  }
});
