import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('compose defines four isolated live sample agents on the fixture ports', () => {
  const compose = readFileSync('compose.yaml', 'utf8');
  for (const [name, port, project, instance] of [
    ['agent-a1', '18081', 'sample-a', 'local-01'],
    ['agent-a2', '18082', 'sample-a', 'local-02'],
    ['agent-b1', '18083', 'sample-b', 'local-01'],
    ['agent-b2', '18084', 'sample-b', 'local-02'],
  ]) {
    assert.match(compose, new RegExp(`${name}:`));
    assert.match(compose, new RegExp(`127\\.0\\.0\\.1:${port}:8080`));
    assert.ok(compose.includes(`HERMES_TEST_PROJECT_ID: ${project}`));
    assert.ok(compose.includes(`HERMES_TEST_INSTANCE_ID: ${instance}`));
  }
  assert.equal(existsSync('monitor-agent-testapp/Dockerfile'), true);
});

test('sample testapp fails closed and never embeds a fallback token', () => {
  const source = readFileSync(
    'monitor-agent-testapp/src/main/java/com/hermes/monitoring/testapp/TestConfigurer.java', 'utf8');
  assert.match(source, /HERMES_TEST_AGENT_TOKEN/);
  assert.doesNotMatch(source, /01234567890123456789012345678901/);
  assert.match(source, /HERMES_TEST_PROJECT_ID/);
  assert.match(source, /HERMES_TEST_INSTANCE_ID/);
});
