import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const setup = readFileSync('scripts/setup-local.ps1', 'utf8');
const devUp = readFileSync('scripts/dev-up.ps1', 'utf8');

test('setup checks the native Java exit code before formatting its stderr', () => {
  assert.match(setup, /\$JavaVersionOutput\s*=\s*\(& java -version 2>&1\)/);
  assert.match(setup, /if \(\$LASTEXITCODE -ne 0\)/);
  assert.match(setup, /\$version\s*=\s*\(\$JavaVersionOutput \| Select-Object -First 1\)/);
  assert.doesNotMatch(setup, /\(& java -version 2>&1 \| Select-Object/);
});

test('setup and dev-up select the Maven wrapper for the host platform', () => {
  for (const source of [setup, devUp]) {
    assert.match(source, /if \(\$IsWindows\).*mvnw\.cmd.*else.*mvnw/s);
    assert.doesNotMatch(source, /\$Root\/mvnw\.cmd/);
  }
});
