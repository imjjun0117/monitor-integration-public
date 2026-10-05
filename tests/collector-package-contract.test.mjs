import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const newPackage = ['com', 'monitoring', 'collector'].join('.');
const newPath = ['com', 'monitoring', 'collector'].join('/');
const mainSourceRoot = 'collector/src/main/java';
const expectedCollectorSources = [
  'CollectorCompatibilityProbe.java',
  'BoundedCheckExecutor.java',
  'CheckCategory.java',
  'CheckContext.java',
  'CheckDirection.java',
  'CheckDirections.java',
  'CheckResult.java',
  'DbPoolMetrics.java',
  'DbPoolMetricsProvider.java',
  'DeclarativeCheckLoader.java',
  'DeclarativeCheckSpec.java',
  'DeclarativeMonitorCheck.java',
  'DirectionalMonitorCheck.java',
  'EnvironmentSecretProvider.java',
  'HttpDeclarativeExecutor.java',
  'MonitorCollectorBuilder.java',
  'MonitorCollectorConfigurer.java',
  'MonitorCheck.java',
  'MonitorRuntime.java',
  'SecretMasker.java',
  'SecretProvider.java',
  'TemplateResolver.java',
  'TokenVerifier.java',
  'UtcClock.java',
  'servlet/MonitorServlet.java',
];
const ignoredDirectories = new Set(['.git', 'node_modules', 'target']);

function filesUnder(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    if (statSync(child).isDirectory()) {
      return ignoredDirectories.has(entry) ? [] : filesUnder(child);
    }
    return [child];
  });
}

test('collector sources use the com.monitoring.collector path and package', () => {
  for (const relativePath of expectedCollectorSources) {
    const sourcePath = join(mainSourceRoot, newPath, relativePath);
    assert.equal(existsSync(sourcePath), true, sourcePath);
    const expectedPackage = relativePath.startsWith('servlet/')
      ? `${newPackage}.servlet`
      : newPackage;
    assert.match(readFileSync(sourcePath, 'utf8'),
      new RegExp(`^package ${expectedPackage.replaceAll('.', '\\.')};`), sourcePath);
  }
});

test('Collector Servlet and testapp use the current SDK registration', () => {
  const web = readFileSync('collector-testapp/src/main/webapp/WEB-INF/web.xml', 'utf8');
  assert.ok(web.includes('com.monitoring.collector.servlet.MonitorServlet'));
  assert.ok(web.includes('com.monitoring.collector.testapp.TestConfigurer'));
  const pom = readFileSync('collector-testapp/pom.xml', 'utf8');
  assert.ok(pom.includes('<artifactId>collector</artifactId>'));
});

test('SDK integration guide documents installation and one-runtime lifecycle', () => {
  const guide = readFileSync('docs/agent-integration.md', 'utf8');
  assert.match(guide, /<groupId>com\.monitoring<\/groupId>/);
  assert.match(guide, /<artifactId>collector<\/artifactId>/);
  assert.match(guide, /WEB-INF\/lib/);
  assert.match(guide, /singleton/);
  assert.match(guide, /new MonitorCollectorBuilder\(\)/);
  assert.match(guide, /\.identity\(/);
  assert.match(guide, /\.token\(/);
  assert.match(guide, /runtime\.shutdown\(\)/);
  assert.match(guide, /Servlet adapter.*선택/);
});

test('SDK integration guide has a complete Spring MVC Service and Controller mapping', () => {
  const guide = readFileSync('docs/agent-integration.md', 'utf8');
  assert.match(guide, /class MonitorService/);
  assert.match(guide, /class MonitorController/);
  assert.match(guide, /runtime\.info\(\)/);
  assert.match(guide, /runtime\.snapshot\(\)/);
  assert.match(guide, /runtime\.startChecks\(/);
  assert.match(guide, /runtime\.results\(/);
  for (const mapping of [
    /value\s*=\s*"\/info"[\s\S]*?RequestMethod\.GET/,
    /value\s*=\s*"\/snapshot"[\s\S]*?RequestMethod\.GET/,
    /value\s*=\s*"\/checks\/run"[\s\S]*?RequestMethod\.POST/,
    /value\s*=\s*"\/checks\/results"[\s\S]*?RequestMethod\.GET/,
  ]) assert.match(guide, mapping);
  assert.equal((guide.match(/authorizeOrThrow\(token\);/g) || []).length, 5);
  assert.equal((guide.match(/noStore\(response\);/g) || []).length, 5);
  assert.match(guide, /MonitorRuntime\.isAuthorized\(/);
  assert.match(guide, /HttpStatus\.UNAUTHORIZED/);
  assert.match(guide, /Cache-Control", "no-store"/);
  assert.match(guide, /class MonitorSecurityFilter/);
  assert.match(guide, /MAX_BODY_BYTES\s*=\s*16\s*\*\s*1024/);
  assert.match(guide, /@JsonProperty\("check_ids"\)/);
  assert.match(guide, /@JsonProperty\("requested_by"\)/);
  assert.match(guide, /validateRunRequest\(request\);[\s\S]*?runtime\.startChecks/);
  assert.match(guide, /class MonitorErrorHandler/);
  assert.match(guide, /"AUTH_ERROR"/);
  assert.match(guide, /"INVALID_REQUEST"/);
  assert.match(guide, /HTTPS/);
  assert.match(guide, /class MonitorPayloadWriter/);
  assert.match(guide, /PropertyAccessor\.FIELD/);
  assert.match(guide, /JsonAutoDetect\.Visibility\.ANY/);
  assert.match(guide, /payloadWriter\.write\(/);
  assert.match(guide, /@JsonAnySetter/);
  assert.match(guide, /MonitorNotFoundException/);
  assert.match(guide, /validateResultsQuery\(/);
  assert.match(guide, /since.*형식.*HTTP 200.*빈/);
});

test('SDK integration guide covers checks, DB metrics, views, polling, and wire contracts', () => {
  const guide = readFileSync('docs/agent-integration.md', 'utf8');
  assert.match(guide, /implements MonitorCheck/);
  assert.match(guide, /CheckResult execute\(CheckContext context\)/);
  assert.match(guide, /implements DbPoolMetricsProvider/);
  assert.match(guide, /DbPoolMetrics collect\(\)/);
  assert.match(guide, /new DbPoolMetrics\(/);
  assert.match(guide, /JSP.*view/);
  assert.match(guide, /poll_interval_seconds/);
  assert.match(guide, /60초/);
  for (const contract of [
    'agent-info.schema.json', 'agent-snapshot.schema.json',
    'check-run.schema.json', 'check-result.schema.json',
  ]) assert.match(guide, new RegExp(contract.replace('.', '\\.')));
  for (const status of ['200', '202', '400', '401', '404', '429', '500']) {
    assert.match(guide, new RegExp(`HTTP.*${status}|${status}.*HTTP`));
  }
  assert.match(guide, /application\/json; charset=UTF-8/);
  assert.match(guide, /\{"code":"[A-Z_]+"\}/);
});

test('README links the canonical SDK integration guide', () => {
  const readme = readFileSync('README.md', 'utf8');
  assert.match(readme, /\[.*SDK.*\]\(docs\/agent-integration\.md\)/);
});

test('agent package and Maven coordinates remain outside the agent rename scope', () => {
  const center = filesUnder('agent/src/main/java');
  assert.ok(center.length > 0);
  for (const path of center) {
    assert.match(readFileSync(path, 'utf8'), /^package com\.monitoring\.agent/);
  }
  assert.match(readFileSync('pom.xml', 'utf8'), /<groupId>com\.monitoring<\/groupId>/);
  assert.match(readFileSync('collector/pom.xml', 'utf8'), /<artifactId>collector<\/artifactId>/);
});
