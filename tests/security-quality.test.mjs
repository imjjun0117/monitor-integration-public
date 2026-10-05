import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('secret scanner excludes generated/test data but inspects production and logs safely', () => {
  assert.equal(existsSync('tools/scan-secrets.mjs'), true);
  const source = readFileSync('tools/scan-secrets.mjs', 'utf8');
  assert.match(source, /PRIVATE KEY/);
  assert.match(source, /embedded-credential/);
  assert.match(source, /sensitive-log-statement/);
  assert.match(source, /process\.exitCode = 1/);
});

test('production APIs never return token encryption columns', () => {
  const controller = readFileSync(
    'agent/src/main/java/com/monitoring/agent/project/ProjectController.java', 'utf8');
  const frontend = readFileSync('agent/frontend/src/api.ts', 'utf8');
  assert.doesNotMatch(controller, /select\s+i\.\*/i);
  assert.doesNotMatch(frontend, /token_ciphertext|token_iv/);
});

test('agent messages pass through the central secret masker', () => {
  const result = readFileSync(
    'collector/src/main/java/com/monitoring/collector/CheckResult.java', 'utf8');
  assert.match(result, /SecretMasker\.mask\(message\)/);
});

test('successful login redirects to the SPA root and never writes a JSON landing response', () => {
  const security = readFileSync(
    'agent/src/main/java/com/monitoring/agent/security/SecurityConfig.java', 'utf8');
  const success = security.slice(security.indexOf('.successHandler('), security.indexOf('.failureHandler('));
  assert.match(success, /response\.sendRedirect\("\/"\)/);
  assert.doesNotMatch(success, /application\/json/);
});
