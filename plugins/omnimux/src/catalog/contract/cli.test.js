/**
 * CLI contract tests — prefer in-process parseArgs/runVerify so importing the
 * module never races with process.exit under the full node:test worker pool.
 * One lightweight spawn check still covers the executable shebang path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start = __dirname) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'scripts', 'verify-model-contracts.mjs');
    if (existsSync(candidate)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`cannot locate repo root from ${start}`);
}

const repoRoot = findRepoRoot();
const cliPath = join(repoRoot, 'scripts', 'verify-model-contracts.mjs');
const cliHref = pathToFileURL(cliPath).href;

/** @type {typeof import('../../../../../scripts/verify-model-contracts.mjs')} */
const cli = await import(cliHref);

test('cli path resolves under monorepo root', () => {
  assert.ok(existsSync(cliPath), `missing CLI at ${cliPath}`);
});

test('parseArgs: unknown flag → exit 2', () => {
  const opts = cli.parseArgs(['--not-a-real-flag']);
  assert.equal(opts.exitCode, cli.EXIT_USAGE);
  assert.ok(opts.usageError.includes('unknown flag'));
});

test('parseArgs: --specs-dir without value → exit 2', () => {
  const opts = cli.parseArgs(['--specs-dir']);
  assert.equal(opts.exitCode, cli.EXIT_USAGE);
  assert.ok(opts.usageError.includes('--specs-dir'));
});

test('parseArgs: --audit + --strict → exit 2', () => {
  const opts = cli.parseArgs(['--audit', '--strict']);
  assert.equal(opts.exitCode, cli.EXIT_USAGE);
  assert.ok(opts.usageError.includes('mutually exclusive'));
});

test('parseArgs: help ok', () => {
  const opts = cli.parseArgs(['--help']);
  assert.equal(opts.help, true);
});

test('runVerify usage error JSON is pure JSON (stdout)', async () => {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    const report = await cli.runVerify({
      usageError: 'unknown flag: --nope',
      exitCode: cli.EXIT_USAGE,
      json: true,
    });
    assert.equal(report.exitCode, cli.EXIT_USAGE);
    assert.equal(report.ok, false);
    const text = chunks.join('');
    const parsed = JSON.parse(text);
    assert.equal(parsed.code, 'cli_usage_error');
    assert.equal(parsed.exitCode, 2);
  } finally {
    process.stdout.write = origWrite;
  }
});

test('runVerify audit ok; strict ok with 53 dispositions resolved', async () => {
  const silent = () => true;
  const out = process.stdout.write;
  const err = process.stderr.write;
  process.stdout.write = silent;
  process.stderr.write = silent;
  try {
    const audit = await cli.runVerify({ mode: 'audit', strict: false, json: false });
    assert.equal(audit.exitCode, 0, JSON.stringify(audit.admission));
    assert.equal(audit.ok, true);
    assert.ok(audit.listedOperations.length > 0, 'H2 lists evidence-backed ops');
    assert.equal(audit.admission.errorCount, 0);
    assert.equal(audit.schemaVersion, '1.1');
    assert.equal(Object.prototype.hasOwnProperty.call(audit, 'version'), false);

    const strict = await cli.runVerify({ mode: 'strict', strict: true, json: false });
    assert.equal(strict.exitCode, 0, JSON.stringify(strict.issues.filter((i) => i.level === 'error')));
    assert.equal(strict.ok, true);
    assert.equal(strict.admission.errorCount, 0);
    assert.equal(strict.schemaVersion, '1.1');
    assert.equal(strict.dispositions.total, 53);
    assert.deepEqual(strict.dispositions.unresolvedDispositions, []);
    assert.deepEqual(strict.coverage.extraInYaml, []);
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
});

test('runVerify JSON report exposes schemaVersion only (no root version)', async () => {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  process.stderr.write = () => true;
  try {
    const report = await cli.runVerify({ mode: 'audit', strict: false, json: true });
    assert.equal(report.exitCode, 0);
    const parsed = JSON.parse(chunks.join(''));
    assert.equal(parsed.schemaVersion, '1.1');
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'version'), false);
    assert.ok(Array.isArray(parsed.listedOperations));
    assert.ok(parsed.listedOperations.length > 0);
    assert.equal(parsed.dispositions.total, 53);
  } finally {
    process.stdout.write = origWrite;
    process.stderr.write = origErr;
  }
});

test('runVerify with injected fake profile op fails admission (profile_operation_unknown)', async () => {
  const { loadAdapterProfiles, loadOperationRegistry } = await import('./schema.js');
  const base = loadAdapterProfiles();
  const fakeProfiles = {
    version: base.version,
    profiles: [
      ...base.profiles,
      {
        id: 'cliFakeProfile',
        seam: 'x',
        status: 'live',
        operations: ['not_in_registry_op'],
        outputTypes: ['text'],
      },
    ],
  };

  const silent = () => true;
  const out = process.stdout.write;
  const err = process.stderr.write;
  process.stdout.write = silent;
  process.stderr.write = silent;
  try {
    const { verifyContracts } = await import('./index.js');
    const report = verifyContracts({
      strict: false,
      profiles: fakeProfiles,
      registry: loadOperationRegistry(),
    });
    assert.equal(report.ok, false);
    assert.equal(report.exitCode, 1);
    assert.ok(
      report.issues.some((i) => i.code === 'profile_operation_unknown'),
      JSON.stringify(report.issues.filter((i) => i.level === 'error').slice(0, 5)),
    );
    assert.equal(report.schemaVersion, '1.1');
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
});

test('runVerify help returns exit 0', async () => {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    const report = await cli.runVerify({ help: true });
    assert.equal(report.exitCode, 0);
    assert.ok(chunks.join('').includes('Usage:'));
  } finally {
    process.stdout.write = origWrite;
  }
});

// Note: process-level spawn of the CLI is covered by manual verification
// (`node scripts/verify-model-contracts.mjs --help|--audit|--strict`).
// Under the full omnimux node:test worker pool, spawnSync of the same entry
// can return empty stdout (environment interference); in-process parseArgs /
// runVerify above is the authoritative unit coverage for fail-closed flags.
