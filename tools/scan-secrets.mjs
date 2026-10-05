import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const excludedDirectories = new Set([
  '.git', '.tools', '.run', 'node_modules', 'target', 'dist', 'backups',
  'playwright-report', 'test-results',
]);
const textExtensions = new Set([
  '.java', '.json', '.mjs', '.ps1', '.properties', '.sql', '.ts', '.tsx',
  '.xml', '.yaml', '.yml', '.md', '.example', '',
]);
const findings = [];

visit(root);
if (findings.length > 0) {
  for (const finding of findings) console.error(`${finding.path}:${finding.line} ${finding.rule}`);
  process.exitCode = 1;
} else {
  console.log('secret scan passed');
}

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile()) inspect(path);
  }
}

function inspect(path) {
  const name = relative(root, path).replaceAll('\\', '/');
  if (name === '.env' || name === 'tools/scan-secrets.mjs') return;
  if (!textExtensions.has(extname(path))) return;
  if (name.includes('/src/test/') || name.includes('.test.') || name.startsWith('tests/')
      || name.includes('/e2e/') || name.startsWith('fixtures/')) return;
  if (statSync(path).size > 2 * 1024 * 1024) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    check(name, index + 1, line, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      'private-key-material');
    check(name, index + 1, line, /\bAKIA[0-9A-Z]{16}\b/, 'aws-access-key');
    check(name, index + 1, line,
      /(?:password|token|secret|master[_-]?key)\s*[:=]\s*["'][^"'$]{16,}["']/i,
      'embedded-credential');
    check(name, index + 1, line, /\b[0-9]{32}\b/, 'fixed-32-byte-token');
    check(name, index + 1, line,
      /(?:log(?:ger)?\.|System\.out|System\.err|printStackTrace).*\b(?:token|password|secret|cipher|master)/i,
      'sensitive-log-statement');
  });
}

function check(path, line, value, pattern, rule) {
  if (pattern.test(value)) findings.push({ path, line, rule });
}
