import { generate } from 'openapi-typescript-codegen';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specification = resolve(frontend, '../../contracts/center-api.openapi.yaml');
const committedOutput = resolve(frontend, 'src/generated');
const checking = process.argv.includes('--check');
const temporaryRoot = checking ? await mkdtemp(join(tmpdir(), 'hermes-openapi-')) : null;
const output = temporaryRoot ? join(temporaryRoot, 'generated') : committedOutput;

try {
  await generate({
    input: specification,
    output,
    httpClient: 'fetch',
    useOptions: true,
    exportCore: true,
    exportServices: true,
    exportModels: true,
  });
  if (checking) {
    const expected = await contents(output);
    const current = await contents(committedOutput);
    if (JSON.stringify(expected) !== JSON.stringify(current)) {
      throw new Error('generated API types are stale; run npm run generate:api');
    }
  }
} finally {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
}

async function contents(root) {
  const files = [];
  await visit(root, root, files);
  return files;
}

async function visit(root, directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(root, path, files);
    else files.push([relative(root, path), await readFile(path, 'utf8')]);
  }
  files.sort(([left], [right]) => left.localeCompare(right));
}
