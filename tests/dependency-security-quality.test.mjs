import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('Docker build context excludes repository, local state, caches, and secrets', () => {
  assert.equal(existsSync('.dockerignore'), true);
  const ignore = readFileSync('.dockerignore', 'utf8');
  for (const entry of ['.git', '.env*', '.run', '.tools', '**/node_modules',
    'monitor-agent/target', 'monitor-center/target']) {
    assert.ok(ignore.includes(entry), entry);
  }
  assert.match(ignore, /!monitor-agent-testapp\/target\/monitor-agent-testapp-0\.1\.0-SNAPSHOT\.war/);
});

test('CycloneDX production SBOM and periodic OWASP defense-in-depth are pinned', () => {
  const pom = readFileSync('pom.xml', 'utf8');
  assert.match(pom, /<cyclonedx-maven-plugin\.version>2\.9\.3<\/cyclonedx-maven-plugin\.version>/);
  assert.match(pom, /<artifactId>cyclonedx-maven-plugin<\/artifactId>/);
  assert.match(pom, /<goal>makeAggregateBom<\/goal>/);
  assert.match(pom, /<includeTestScope>false<\/includeTestScope>/);
  assert.match(pom, /<id>periodic-owasp<\/id>/);
  assert.match(pom, /<dependency-check\.version>12\.2\.2<\/dependency-check\.version>/);
  assert.match(pom, /<failBuildOnCVSS>7\.0<\/failBuildOnCVSS>/);
  assert.match(pom, /<failOnError>true<\/failOnError>/);
  assert.doesNotMatch(pom.slice(0, pom.indexOf('<profiles>')), /dependency-check-maven/);
});

test('Tomcat embed patch is aligned on the first fixed release for discovered critical CVEs', () => {
  const pom = readFileSync('monitor-center/pom.xml', 'utf8');
  assert.match(pom, /<tomcat-embed\.version>11\.0\.25<\/tomcat-embed\.version>/);
  for (const artifact of ['tomcat-embed-core', 'tomcat-embed-el', 'tomcat-embed-websocket']) {
    assert.match(pom, new RegExp(`<artifactId>${artifact}</artifactId>\\s*<version>\\$\\{tomcat-embed\\.version\\}</version>`));
  }
});

test('Trivy gate pins official archives, scans both production SBOMs, and emits JSON plus SARIF', () => {
  const source = readFileSync('scripts/dependency-vulnerability-gate.ps1', 'utf8');
  for (const expected of [
    "0.74.0", 'checksums.txt',
    '2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a',
    '472816f6888dda689d075c30254d4210b4d1035acf365aa72332f584c2f60485',
    '94c40e0696e4b907a74b7b2e1438d5d72ebaca83115817407f568a002d520842',
    'npm sbom', '--omit=dev', '--sbom-format=cyclonedx',
    '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--exit-code',
    'maven-trivy.json', 'maven-trivy.sarif', 'npm-trivy.json', 'npm-trivy.sarif',
  ]) assert.ok(source.includes(expected), expected);
  assert.doesNotMatch(source, /--ignore-unfixed|SilentlyContinue|\|\|\s*true/);
});

test('CI makes the fast free gate required and keeps OWASP as scheduled defense-in-depth', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /dependency-vulnerability:/);
  assert.match(workflow, /dependency-vulnerability-gate\.ps1/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /periodic-owasp/);
  assert.match(workflow, /group: dependency-check-nvd/);
  assert.match(workflow, /NVD_API_KEY: \$\{\{ secrets\.NVD_API_KEY \}\}/);
});

test('CI uploads Maven and npm SARIF separately with distinct CodeQL v4 categories', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const uploadAction = 'github/codeql-action/upload-sarif@v4';
  const uploads = workflow.match(new RegExp(uploadAction, 'g')) ?? [];
  const categories = [...workflow.matchAll(/^\s+category:\s*(\S+)\s*$/gm)]
    .map((match) => match[1]);

  assert.equal(uploads.length, 2);
  assert.doesNotMatch(workflow, /github\/codeql-action\/upload-sarif@v3/);
  assert.match(workflow, /sarif_file: \.run\/security\/maven-trivy\.sarif[\s\S]{0,120}category: dependency-maven/);
  assert.match(workflow, /sarif_file: \.run\/security\/npm-trivy\.sarif[\s\S]{0,120}category: dependency-npm/);
  assert.deepEqual(new Set(categories), new Set(['dependency-maven', 'dependency-npm']));
});
