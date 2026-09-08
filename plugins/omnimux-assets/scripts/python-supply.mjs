#!/usr/bin/env node
/** Build-time acquisition only. Never called by the plugin at runtime. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const runtimeRoot = fileURLToPath(new URL('../runtime/', import.meta.url));
export const manifest = JSON.parse(readFileSync(join(runtimeRoot, 'python-supply.json'), 'utf8'));

/** Compute the reproducible SHA-256 of a file or buffer. */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Refuse altered archives before any extraction or payload execution. */
export function verifyBytes(bytes, expectedHash, expectedSize) {
  if (sha256(bytes) !== expectedHash || (expectedSize !== undefined && bytes.length !== expectedSize)) {
    throw new Error('python-supply-integrity-mismatch');
  }
}

/** Fetch an explicitly pinned official object, without fallback sources. */
async function download(url, path, hash, size) {
  if (existsSync(path)) {
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('unsafe-cache-file');
    verifyBytes(readFileSync(path), hash, size);
    return;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`download-failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyBytes(bytes, hash, size);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
}

/** Acquire both architectures; extract only checksum-verified official archives. */
export async function acquire() {
  const cache = join(runtimeRoot, 'archives');
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  await download(manifest.checksums.url, join(cache, 'SHA256SUMS'), manifest.checksums.sha256);
  const checksums = readFileSync(join(cache, 'SHA256SUMS'), 'utf8');
  for (const artifact of manifest.artifacts) {
    const row = checksums.split('\n').find(line => line.trim().split(/\s+/).at(-1) === artifact.filename);
    if (!row || row.split(/\s+/)[0] !== artifact.sha256) throw new Error('upstream-checksum-disagreement');
    const archive = join(cache, artifact.filename);
    await download(artifact.url, archive, artifact.sha256, artifact.compressedBytes);
    const destination = join(runtimeRoot, artifact.directory);
    if (existsSync(destination)) {
      console.log(`Verified archive; retained existing tree for separate inventory check: ${artifact.arch}`);
      continue;
    }
    const stage = `${destination}.extracting`;
    mkdirSync(stage, { mode: 0o700 });
    const result = spawnSync('/usr/bin/tar', ['-xzf', archive, '-C', stage], {
      encoding: 'utf8', env: { PATH: '/usr/bin:/bin', COPYFILE_DISABLE: '1' }, timeout: 120000,
    });
    if (result.error || result.status !== 0) throw new Error(`extract-failed: ${result.error || result.stderr}`);
    renameSync(stage, destination);
    console.log(`Verified and extracted ${artifact.filename}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== 'acquire') {
    console.error('Usage: node scripts/python-supply.mjs acquire');
    process.exitCode = 2;
  } else {
    await acquire();
  }
}
