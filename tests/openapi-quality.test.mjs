import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('OpenAPI defines reusable DTOs, status, paging, sorting, and response codes', () => {
  const api = readFileSync('contracts/center-api.openapi.yaml', 'utf8');
  for (const schema of ['Status:', 'Project:', 'Instance:', 'Dashboard:', 'ResourceResponse:',
    'DbPoolResponse:', 'Check:', 'Certificate:', 'Threshold:', 'PageMetadata:']) {
    assert.ok(api.includes(schema), schema);
  }
  for (const parameter of ['Page:', 'Size:', 'Sort:', 'StatusFilter:']) {
    assert.ok(api.includes(parameter), parameter);
  }
  assert.match(api, /\/certificates\/\{id\}\/check:[\s\S]*?'202':/);
});

test('TypeScript generation uses a standard OpenAPI package and has a diff check', () => {
  const pkg = JSON.parse(readFileSync('monitor-center/frontend/package.json', 'utf8'));
  assert.ok(pkg.devDependencies['openapi-typescript-codegen']);
  assert.ok(pkg.scripts['generate:api:check']);
  const generator = readFileSync('monitor-center/frontend/scripts/generate-api.mjs', 'utf8');
  assert.match(generator, /openapi-typescript-codegen/);
  assert.doesNotMatch(generator, /matchAll|new RegExp|\.match\(/);
  assert.match(generator, /--check/);
});

test('metric, disk, pool, and history schemas generate concrete typed models', () => {
  const api = readFileSync('contracts/center-api.openapi.yaml', 'utf8').replace(/\r\n/g, '\n');
  for (const schema of [
    'MetricLatest', 'InstanceMetricSample', 'Disk', 'DiskMetricSample', 'DbPool',
    'DbPoolMetricSample', 'CheckHistorySample', 'DashboardHistory',
  ]) {
    assert.match(api, new RegExp(`\\n    ${schema}:\\n[\\s\\S]*?additionalProperties: false`), schema);
  }
  for (const model of [
    'MetricLatest', 'InstanceMetricSample', 'Disk', 'DiskMetricSample', 'DbPool',
    'DbPoolMetricSample', 'CheckHistorySample', 'DashboardHistory',
  ]) {
    const source = readFileSync(`monitor-center/frontend/src/generated/models/${model}.ts`, 'utf8');
    assert.doesNotMatch(source, /Record<string, any>|\bany\b/, model);
  }
  assert.match(api, /sampled_at: \{type: string, format: date-time\}/);
  assert.match(api, /status: \{\$ref: '#\/components\/schemas\/Status'\}/);
});

test('Maven checks committed generated output before any source-writing generation', () => {
  const pom = readFileSync('monitor-center/pom.xml', 'utf8');
  const check = pom.indexOf('<arguments>run generate:api:check</arguments>');
  const write = pom.indexOf('<arguments>run generate:api</arguments>');
  assert.ok(check >= 0, 'Maven immutable generated-client check is missing');
  assert.equal(write, -1, 'Maven must not overwrite committed generated output');
});

test('standard generator owns the typed service client without handwritten endpoint duplication', () => {
  const generator = readFileSync('monitor-center/frontend/scripts/generate-api.mjs', 'utf8');
  assert.match(generator, /exportCore:\s*true/);
  assert.match(generator, /exportServices:\s*true/);
  assert.equal(existsSync('monitor-center/frontend/src/generated/services/DefaultService.ts'), true);
  const api = readFileSync('monitor-center/frontend/src/api.ts', 'utf8');
  assert.doesNotMatch(api, /['"`]\/api\/v1\//);
  assert.match(api, /DefaultService/);
});
