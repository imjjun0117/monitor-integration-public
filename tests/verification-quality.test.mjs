import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('verify.ps1 is fail-closed across runtimes, contracts, generation, security, and licenses', () => {
  const source = readFileSync('scripts/verify.ps1', 'utf8');
  for (const gate of [
    'HERMES_JAVA7_HOME', 'HERMES_JAVA8_HOME', 'clean', 'verify',
    'VerifyAgentJar.java', 'AgentCompatibilityProbe', 'tests/*.test.mjs',
    'validate:openapi', 'generate:api:check', 'license:check',
    'dependency-vulnerability-gate.ps1', 'scan-secrets.mjs', 'test:e2e',
  ]) {
    assert.ok(source.includes(gate), gate);
  }
  assert.doesNotMatch(source, /SilentlyContinue|\|\|\s*true/);
});

test('CI has Java 7/8 runtime matrix plus the full Java 21 gate', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /matrix:/);
  assert.match(workflow, /java:\s*\['7', '8'\]/);
  assert.match(workflow, /scripts\/verify\.ps1/);
  assert.match(workflow, /playwright install.*chromium/);
  assert.match(workflow, /scan-secrets\.mjs/);
});
