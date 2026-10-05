import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tool = fileURLToPath(new URL('../tools/artifact-manifest.mjs', import.meta.url));

test('artifact manifest verifies exact SHA-256 and detects tampering', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hermes-artifact-'));
  const artifact = join(directory, 'center.jar');
  const manifest = join(directory, 'build-manifest.json');
  writeFileSync(artifact, 'immutable-artifact');

  const created = spawnSync(process.execPath, [tool, 'create', manifest, artifact], {
    encoding: 'utf8',
  });
  assert.equal(created.status, 0, created.stderr);
  const record = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.match(record.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(record.artifacts[0].bytes, 18);

  const verified = spawnSync(process.execPath, [tool, 'verify', manifest], {
    encoding: 'utf8',
  });
  assert.equal(verified.status, 0, verified.stderr);

  writeFileSync(artifact, 'tampered-artifact!');
  const tampered = spawnSync(process.execPath, [tool, 'verify', manifest], {
    encoding: 'utf8',
  });
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /SHA256_MISMATCH/);
});
