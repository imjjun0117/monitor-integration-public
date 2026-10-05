import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const load = p => JSON.parse(readFileSync(p, 'utf8'));

test('단계 1 계약 파일과 OpenAPI가 존재한다', () => {
  for (const p of ['contracts/agent-info.schema.json','contracts/agent-snapshot.schema.json','contracts/check-run.schema.json','contracts/center-api.openapi.yaml']) assert.equal(existsSync(p), true, `${p} missing`);
});

test('fixture는 2개 프로젝트와 각 2개 인스턴스를 포함한다', () => {
  const data=load('fixtures/dashboard.json');
  assert.equal(data.projects.length,2);
  for (const p of data.projects) assert.equal(p.instances.length,2);
});

test('agent fixture는 v1, UTC, 상태, null 미지원 규칙을 지킨다', () => {
  const snap=load('fixtures/agent-snapshot.json');
  assert.match(snap.schema_version,/^1\./);
  assert.match(snap.observed_at,/Z$/);
  assert.ok(['UP','WARN','DOWN','UNKNOWN'].includes(snap.recent_checks[0].status));
  assert.equal(snap.db_pools[0].waiters,null);
  assert.ok(snap.db_pools[0].unsupported.includes('waiters'));
  assert.deepEqual(Object.keys(snap.identity).sort(),['instance_id','project_id']);
});
