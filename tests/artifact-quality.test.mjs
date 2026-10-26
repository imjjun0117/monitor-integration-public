import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('collector artifact verifier inspects every class and rejects multi-release metadata', () => {
  assert.equal(existsSync('tools/VerifyCollectorJar.java'), true);
  const source = readFileSync('tools/VerifyCollectorJar.java', 'utf8');
  assert.match(source, /ZipFile/);
  assert.match(source, /major/);
  assert.match(source, /module-info/);
  assert.match(source, /META-INF\/versions/);
});

test('collector verifier accepts older shaded dependencies and rejects incompatible or damaged entries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'collector-verifier-'));
  const executable = (name) => process.env.JAVA_HOME
    ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? `${name}.exe` : name)
    : name;
  try {
    const compile = spawnSync(executable('javac'), [
      '-d', directory, 'tools/VerifyCollectorJar.java', 'tools/VerifyCollectorJarTest.java',
    ], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr || String(compile.error));

    const result = spawnSync(executable('java'), [
      '-cp', directory, 'VerifyCollectorJarTest', directory,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.match(result.stdout, /13 cases passed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
