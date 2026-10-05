import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function digest(path) {
  const content = readFileSync(path);
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function create(manifestPath, artifactPaths) {
  if (artifactPaths.length === 0) throw new Error('ARTIFACT_REQUIRED');
  const base = dirname(resolve(manifestPath));
  const artifacts = artifactPaths.map((value) => {
    const absolute = resolve(value);
    const record = digest(absolute);
    return { ...record, path: absolute.startsWith(`${base}/`)
      ? absolute.slice(base.length + 1)
      : absolute };
  });
  const manifest = {
    schema_version: 1,
    algorithm: 'SHA-256',
    artifacts,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o644,
  });
}

function verify(manifestPath) {
  const absoluteManifest = resolve(manifestPath);
  const base = dirname(absoluteManifest);
  const manifest = JSON.parse(readFileSync(absoluteManifest, 'utf8'));
  if (manifest.schema_version !== 1 || manifest.algorithm !== 'SHA-256'
      || !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error('INVALID_MANIFEST');
  }
  for (const expected of manifest.artifacts) {
    const path = resolve(base, expected.path);
    if (!statSync(path).isFile()) throw new Error(`NOT_A_FILE:${expected.path}`);
    const actual = digest(path);
    if (actual.bytes !== expected.bytes) {
      throw new Error(`SIZE_MISMATCH:${expected.path}`);
    }
    if (actual.sha256 !== expected.sha256) {
      throw new Error(`SHA256_MISMATCH:${expected.path}`);
    }
  }
}

function main(argv) {
  const [command, manifestPath, ...artifactPaths] = argv;
  if (!manifestPath || !['create', 'verify'].includes(command)) {
    throw new Error('usage: artifact-manifest.mjs create <manifest> <artifact...> | verify <manifest>');
  }
  if (command === 'create') create(manifestPath, artifactPaths);
  else verify(manifestPath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
