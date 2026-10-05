import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('Maven verify fails when dependency license metadata is missing', () => {
  const pom = readFileSync('pom.xml', 'utf8');
  assert.match(pom, /license-maven-plugin/);
  assert.match(pom, /aggregate-add-third-party/);
  assert.match(pom, /<failOnMissing>true<\/failOnMissing>/);
});

test('npm dependency licenses have a fail-closed audit script', () => {
  assert.equal(existsSync('tools/check-npm-licenses.mjs'), true);
  const pkg = JSON.parse(readFileSync('agent/frontend/package.json', 'utf8'));
  assert.equal(pkg.scripts['license:check'], 'node ../../tools/check-npm-licenses.mjs');
  const source = readFileSync('tools/check-npm-licenses.mjs', 'utf8');
  assert.match(source, /AGPL|GPL|SSPL/);
  assert.match(source, /missing license metadata/);
});
