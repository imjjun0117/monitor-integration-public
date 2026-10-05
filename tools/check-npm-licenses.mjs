import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lockPath = resolve(process.cwd(), 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const missing = [];
const forbidden = [];

for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
  if (!path) continue;
  const license = metadata.license;
  if (typeof license !== 'string' || license.trim() === '') {
    missing.push(path);
  } else if (/\b(?:AGPL|GPL|SSPL)-/i.test(license)) {
    forbidden.push(`${path} (${license})`);
  }
}

if (missing.length > 0) {
  throw new Error(`missing license metadata: ${missing.join(', ')}`);
}
if (forbidden.length > 0) {
  throw new Error(`forbidden dependency license: ${forbidden.join(', ')}`);
}
console.log(`npm license audit passed: ${Object.keys(lock.packages ?? {}).length - 1} packages`);
