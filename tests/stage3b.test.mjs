import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const base = 'monitor-center/src/main/java/com/hermes/monitoring/center/';
const required = [
  'security/SecurityConfig.java', 'security/AdminSeeder.java',
  'project/ProjectController.java', 'collection/SnapshotCollector.java',
  'check/ApiCheckScheduler.java', 'certificate/CertificateScheduler.java',
  'metric/RetentionJob.java',
];

test('단계 3 관리 API와 스케줄 작업이 존재한다', () => {
  for (const path of required) assert.equal(existsSync(base + path), true, path);
});

test('상태 변경 API에서 CSRF를 끄지 않는다', () => {
  const source = readFileSync(base + 'security/SecurityConfig.java', 'utf8');
  assert.equal(source.includes('csrf(csrf -> csrf.disable'), false);
  assert.ok(source.includes('CookieCsrfTokenRepository'));
});

test('주기는 문서 기준값이다', () => {
  assert.match(readFileSync(base + 'collection/SnapshotCollector.java', 'utf8'), /15_000/);
  assert.match(readFileSync(base + 'check/ApiCheckScheduler.java', 'utf8'), /300_000/);
  const certificates = readFileSync(base + 'certificate/CertificateScheduler.java', 'utf8');
  assert.match(certificates, /60000/);
  assert.match(certificates, /check_interval_minutes/);
  assert.match(readFileSync(base + 'metric/RetentionJob.java', 'utf8'), /0 30 3 \* \* \*/);
});
