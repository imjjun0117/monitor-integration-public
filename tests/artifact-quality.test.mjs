import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('agent artifact verifier inspects every class and rejects multi-release metadata', () => {
  assert.equal(existsSync('tools/VerifyCollectorJar.java'), true);
  const source = readFileSync('tools/VerifyCollectorJar.java', 'utf8');
  assert.match(source, /ZipFile/);
  assert.match(source, /major/);
  assert.match(source, /!= 51/);
  assert.match(source, /module-info/);
  assert.match(source, /META-INF\/versions/);
});

test('shade configuration removes multi-release and module descriptors', () => {
  const pom = readFileSync('collector/pom.xml', 'utf8');
  assert.match(pom, /META-INF\/versions\/\*\*/);
  assert.match(pom, /module-info\.class/);
});

test('center logo has one source and is copied before tests', () => {
  const source = 'agent/frontend/public/monitoring.svg';
  assert.equal(existsSync(source), true, `${source} missing`);
  assert.equal(existsSync('agent/src/main/resources/static/monitoring.svg'), false,
    'logo must not have a duplicate backend source');

  const pom = readFileSync('agent/pom.xml', 'utf8');
  const execution = pom.match(/<execution>\s*<id>copy-logo-for-tests<\/id>[\s\S]*?<\/execution>/)?.[0];
  assert.ok(execution, 'copy-logo-for-tests execution missing');
  assert.match(execution, /<phase>process-resources<\/phase>/);
  assert.match(execution, /<outputDirectory>\$\{project\.build\.outputDirectory\}\/static<\/outputDirectory>/);
  assert.match(execution, /<directory>frontend\/public<\/directory>/);
  assert.match(execution, /<include>monitoring\.svg<\/include>/);
});
