import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scriptPath = 'scripts/reset-admin-password.ps1';

test('admin password reset uses local secure confirmation and never persists or argv-passes plaintext', () => {
  const source = readFileSync(scriptPath, 'utf8');
  const firstPrompt = source.indexOf('Read-Host "새 admin 비밀번호');
  const build = source.indexOf('package');
  const directJava = source.indexOf('PropertiesLauncher');
  assert.equal((source.match(/Read-Host[^\n]+-AsSecureString/g) ?? []).length, 2);
  assert.ok(build >= 0 && build < firstPrompt, 'reset artifact must be built before plaintext exists');
  assert.ok(directJava > firstPrompt, 'reset CLI must run directly after secure confirmation');
  assert.match(source, /['"]-Dfrontend\.skip=true['"]/);
  assert.match(source, /AdminPasswordResetCli/);
  assert.match(source, /ZeroFreeBSTR/);
  assert.match(source, /\.Dispose\(\)/);
  assert.match(source, /ADMIN_PASSWORD_RESET_FAILED stage=(build|reset-cli)/);
  assert.doesNotMatch(source, /\$PlainFirst\s*\|\s*&\s*\$Maven/);
  assert.doesNotMatch(source, /param\([^)]*(password|credential)/i);
  assert.doesNotMatch(source, /Set-Content|Add-Content|Out-File|GetTemp(FileName|Path)/i);
  assert.doesNotMatch(source, /-D[^\s]*(password|hash)=/i);
});

test('admin password reset script enforces the shared eight-character boundary', () => {
  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /\$MinimumPasswordLength\s*=\s*8\b/);
  assert.match(source, /\$PlainFirst\.Length\s*-lt\s*\$MinimumPasswordLength/);
  assert.match(source, /새 admin 비밀번호\(\$\{MinimumPasswordLength\}자 이상\)/);
  assert.match(source, /비밀번호는 \$\{MinimumPasswordLength\}자 이상이어야 합니다\./);
});

test('operations documents only the interactive local reset command and no public reset endpoint', () => {
  const operations = readFileSync('docs/operations.md', 'utf8');
  const troubleshooting = readFileSync('docs/troubleshooting.md', 'utf8');
  assert.match(operations, /\.\/scripts\/reset-admin-password\.ps1/);
  assert.match(operations, /8자 미만/);
  assert.match(troubleshooting, /CLI 계약은 8자 이상/);
  assert.doesNotMatch(operations, /https?:\/\/[^\s`]+\/[^\s`]*(reset|password)/i);
});
