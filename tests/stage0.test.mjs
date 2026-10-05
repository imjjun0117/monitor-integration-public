import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'pom.xml', 'mvnw', 'mvnw.cmd', '.mvn/wrapper/maven-wrapper.properties',
  'compose.yaml', '.env.example', '.gitignore',
  'collector/pom.xml', 'collector-testapp/pom.xml', 'agent/pom.xml',
  'agent/frontend/package.json', '.github/workflows/ci.yml',
  'scripts/setup-local.ps1', 'scripts/dev-up.ps1', 'scripts/dev-down.ps1',
  'scripts/build.ps1', 'scripts/verify.ps1', 'scripts/backup-db.ps1',
  'scripts/restore-db.ps1'
];

test('단계 0 저장소와 자동화 파일이 모두 존재한다', () => {
  for (const path of required) assert.equal(existsSync(path), true, `${path} missing`);
});

test('DB와 웹 서버는 loopback에만 바인딩한다', () => {
  assert.match(readFileSync('compose.yaml', 'utf8'), /127\.0\.0\.1:\$\{HERMES_DB_PORT:-5432\}:5432/);
  assert.match(readFileSync('agent/src/main/resources/application.yml', 'utf8'), /address:\s*127\.0\.0\.1/);
});

test('.env는 추적에서 제외하고 예시는 값 없는 비밀을 제공한다', () => {
  assert.match(readFileSync('.gitignore', 'utf8'), /^\.env$/m);
  const env = readFileSync('.env.example', 'utf8');
  assert.match(env, /^HERMES_DB_PASSWORD=$/m);
  assert.match(env, /^HERMES_MASTER_KEY=$/m);
});
