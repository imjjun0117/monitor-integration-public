import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('binary-safe backup validates the archive before copying it out', () => {
  const source = readFileSync('scripts/backup-db.ps1', 'utf8');
  assert.match(source, /pg_dump/);
  assert.match(source, /--file/);
  assert.match(source, /pg_restore/);
  assert.match(source, /--list/);
  assert.match(source, /docker compose[^\n]* cp/);
  assert.doesNotMatch(source, /Set-Content|Out-File/);
});

test('restore is explicit, validated, transactional, and fail-fast', () => {
  assert.equal(existsSync('scripts/restore-db.ps1'), true);
  const source = readFileSync('scripts/restore-db.ps1', 'utf8');
  assert.match(source, /ConfirmRestore/);
  assert.match(source, /--list/);
  assert.match(source, /--single-transaction/);
  assert.match(source, /--exit-on-error/);
  assert.match(source, /--clean/);
});

test('operations guide documents both backup and restore commands', () => {
  const guide = readFileSync('docs/operations.md', 'utf8');
  assert.match(guide, /backup-db\.ps1/);
  assert.match(guide, /restore-db\.ps1/);
});

test('portable build selects the Maven wrapper for the host platform', () => {
  const source = readFileSync('scripts/build.ps1', 'utf8');
  assert.match(source, /\$IsWindows/);
  assert.match(source, /mvnw\.cmd/);
  assert.match(source, /['"]mvnw['"]/);
  assert.match(source, /& \$Maven clean package/);
});

test('normal dev shutdown stops tracked process trees and every sample container without deleting data', () => {
  const source = readFileSync('scripts/dev-down.ps1', 'utf8');
  const helpers = readFileSync('scripts/process-helpers.ps1', 'utf8');
  assert.match(source, /Stop-TrackedProcessTree/);
  assert.match(source, /Stop-ProcessTreeGracefully/);
  assert.match(helpers, /\.Parent/);
  assert.match(helpers, /-TERM/);
  assert.match(helpers, /Stop-Process[^\n]*-Force/);
  assert.match(source, /--profile samples down/);
  assert.match(source, /--profile samples down --volumes/);
  assert.match(source, /} else \{\s*& docker compose --env-file \.env --profile samples down\s*if \(\$LASTEXITCODE -ne 0\)/);
  assert.match(source, /HERMES_SAMPLE_AGENT_TOKEN/);
  assert.match(source, /'x' \* 32/);
});

test('every resolved troubleshooting entry has exactly the same four evidence fields', () => {
  const guide = readFileSync('docs/troubleshooting.md', 'utf8');
  const sections = guide.split(/^## /m).slice(1)
    .filter((section) => !section.startsWith('일반 확인 방법'));
  assert.ok(sections.length > 0);
  for (const section of sections) {
    const fields = [...section.matchAll(/^([1-4])\. \*\*(기능 정보|발생한 문제|해결 방법|해결 결과)\*\*:/gm)];
    assert.deepEqual(fields.map((field) => `${field[1]}:${field[2]}`), [
      '1:기능 정보', '2:발생한 문제', '3:해결 방법', '4:해결 결과',
    ], section.split('\n', 1)[0]);
  }
});

test('known limitations retains external blockers and no stale resolved Major list', () => {
  const limitations = readFileSync('docs/known-limitations.md', 'utf8');
  assert.doesNotMatch(limitations, /Major 잔존|FAIL\(Major|후속 수정 전 납품 blocker/);
  for (const line of limitations.split('\n').filter((value) => value.startsWith('- '))) {
    assert.match(line, /없|외부|접근 권한|의존/);
  }
});
