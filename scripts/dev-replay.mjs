#!/usr/bin/env node
/**
 * scripts/dev-replay.mjs
 * Dev-only one-command replay for failed /omnimux-workflow route requests.
 *
 * Division of labour with `scripts/mock-sidecar.mjs` — two different things,
 * deliberately no shared mode flag and no second replay semantics:
 *   - mock-sidecar records and replays the UPSTREAM AI / storage HTTP calls an
 *     execution makes; its cassettes are request-hash keyed under
 *     `tests/fixtures/cassettes/`.
 *   - this script replays the LOCAL `/omnimux-workflow` route failures the
 *     canvas hit, read from the JSONL the host recorder appended under
 *     `$DSH_HOME`. It never intercepts, fabricates, or short-circuits an
 *     upstream call — a replayed request runs the real route again.
 *
 * Dev-only by construction: every target (the recorded request's own origin and
 * the `--origin` override) must be the loopback Dev app on port 45120.
 * Production listens on 44200 and is refused with an explicit message; the port
 * is checked, never inferred from the environment.
 *
 * The record file name, the opt-in variable, and the path derivation all come
 * from the plugin module that writes them (`devFailureRecorder.ts`), so there is
 * exactly one definition of each.
 *
 * Usage:
 *   node scripts/dev-replay.mjs --list
 *   node scripts/dev-replay.mjs --replay 3
 *   node scripts/dev-replay.mjs --latest
 *   node scripts/dev-replay.mjs --clear
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  DEV_REPLAY_ENV,
  isDevReplayEnabled,
  resolveDevFailureFile,
} from '../plugins/omnimux-workflow/src/workflow/devFailureRecorder.ts';

/** Dev app origin (docs/contracts/dev-pipeline.md). */
export const DEV_PORT = 45120;
export const DEV_ORIGIN = `http://127.0.0.1:${DEV_PORT}`;
/** Production app port — refused, never a silent fallback. */
export const PROD_PORT = 44200;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function assertLoopbackHttp(raw, label) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error(`dev-replay: ${label} "${String(raw)}" is not a valid URL`);
  }
  if (url.protocol !== 'http:') {
    throw new Error(`dev-replay: refusing to replay over ${url.protocol}// — the Dev app serves plain http`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `dev-replay: refusing to replay against ${url.hostname} — only the local Dev app on loopback is allowed`,
    );
  }
  return url;
}

function portOf(url) {
  return url.port === '' ? '80' : url.port;
}

/**
 * R9: the replay TARGET is accepted only on the loopback Dev app on the Dev port.
 * @throws {Error} with an actionable message for anything else.
 */
export function assertDevOrigin(raw, { label = 'target' } = {}) {
  const url = assertLoopbackHttp(raw, label);
  const port = portOf(url);
  if (port !== String(DEV_PORT)) {
    const hint = port === String(PROD_PORT) ? ' (that is the production port)' : '';
    throw new Error(
      `dev-replay: refusing to replay against port ${port}${hint} for ${label}. ` +
        `This tool only targets the Dev app on port ${DEV_PORT}; production listens on ${PROD_PORT}. ` +
        `Start the Dev app and use ${DEV_ORIGIN}, or pass --origin ${DEV_ORIGIN}.`,
    );
  }
  return url;
}

/**
 * A record may be captured by a worktree harness or a QA runner that binds an
 * ephemeral loopback port, so the recorded origin is not required to be exactly
 * the Dev port — but production and non-loopback origins are refused, and a
 * different dev port is reported rather than silently replayed elsewhere.
 * @returns {{ url: URL, warning: string | null }}
 */
export function checkRecordedOrigin(raw, { label = 'recorded origin' } = {}) {
  const url = assertLoopbackHttp(raw, label);
  const port = portOf(url);
  if (port === String(PROD_PORT)) {
    throw new Error(
      `dev-replay: refusing to replay ${label} captured on the production port ${PROD_PORT}. ` +
        `Production failures are out of scope for this Dev-only tool (Dev listens on ${DEV_PORT}).`,
    );
  }
  return {
    url,
    warning: port === String(DEV_PORT) ? null : `${label} was captured on port ${port}, not the Dev port ${DEV_PORT}`,
  };
}

/** Read the recorded failures, oldest first. */
export function loadFailures(file) {
  if (!existsSync(file)) return [];
  const records = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A truncated tail line must not hide the records before it.
    }
  }
  return records;
}

export function formatFailure(record, index) {
  const status = String(record.status ?? '???').padStart(3, ' ');
  const method = String(record.method ?? '?').padEnd(6, ' ');
  const duration = Number.isFinite(record.durationMs) ? ` (${record.durationMs}ms)` : '';
  return `  #${index}  ${record.ts ?? '?'}  ${method} ${record.url ?? '?'}  ${status}${duration}`;
}

function collectBody(res) {
  return new Promise((resolve) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      resolve({ text, parsed });
    });
  });
}

/**
 * Resend one recorded failure against the Dev app and report both responses.
 * The recorded `origin` / `sec-fetch-site` are sent verbatim so the route's
 * `assertLocalWrite()` runs the same check a browser would trigger — omitting
 * the origin would bypass it and make a passing replay meaningless.
 */
export function replayFailure(record, { origin = DEV_ORIGIN, timeoutMs = 30000 } = {}) {
  const target = assertDevOrigin(origin, { label: 'origin' });
  const url = new URL(String(record.url), target.origin);
  const omitted = record.body !== null && typeof record.body === 'object' && record.body.omitted === true;
  const body = record.body === undefined || omitted ? undefined : JSON.stringify(record.body);
  const headers = {
    origin: target.origin,
    'sec-fetch-site': record.headers?.['sec-fetch-site'] ?? 'same-origin',
  };
  if (record.headers?.referer !== undefined) headers.referer = record.headers.referer;
  if (record.headers?.range !== undefined) headers.range = record.headers.range;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = Buffer.byteLength(body, 'utf8');
  }

  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: String(record.method ?? 'GET').toUpperCase(), headers, timeout: timeoutMs },
      async (res) => {
        const collected = await collectBody(res);
        resolve({ status: res.statusCode, headers: res.headers, ...collected });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error(`dev-replay: no response within ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function parseArgs(argv) {
  const args = { mode: 'list', index: null, origin: DEV_ORIGIN, file: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--list') args.mode = 'list';
    else if (token === '--latest') args.mode = 'latest';
    else if (token === '--clear') args.mode = 'clear';
    else if (token === '--help' || token === '-h') args.mode = 'help';
    else if (token === '--replay') {
      args.mode = 'replay';
      args.index = Number(argv[i + 1]);
      i += 1;
    } else if (token === '--origin') {
      args.origin = argv[i + 1];
      i += 1;
    } else if (token === '--file') {
      args.file = argv[i + 1];
      i += 1;
    } else if (token.startsWith('--replay=')) {
      args.mode = 'replay';
      args.index = Number(token.slice('--replay='.length));
    } else if (token.startsWith('--origin=')) {
      args.origin = token.slice('--origin='.length);
    } else if (token.startsWith('--file=')) {
      args.file = token.slice('--file='.length);
    } else {
      throw new Error(`dev-replay: unknown argument "${token}" (try --help)`);
    }
  }
  return args;
}

function printUsage(file) {
  process.stdout.write(
    [
      'dev-replay · replay a failed /omnimux-workflow request against the Dev app',
      '',
      `  record file: ${file}`,
      `  written by:  ${DEV_REPLAY_ENV}=1 (off by default; missing means off)`,
      `  target:      ${DEV_ORIGIN} only — production (${PROD_PORT}) is refused`,
      '',
      'Usage:',
      '  node scripts/dev-replay.mjs --list            list recorded failures, oldest first',
      '  node scripts/dev-replay.mjs --replay <n>      resend entry #n and compare',
      '  node scripts/dev-replay.mjs --latest          resend the newest entry',
      '  node scripts/dev-replay.mjs --clear           delete the record file',
      '  --origin <url>   override the target (loopback :45120 only)',
      '  --file <path>    override the record file',
      '',
    ].join('\n'),
  );
}

async function main(argv) {
  const args = parseArgs(argv);
  const file = args.file ?? resolveDevFailureFile(process.env);

  if (args.mode === 'help') {
    printUsage(file);
    return 0;
  }

  if (args.mode === 'clear') {
    if (!existsSync(file)) {
      process.stdout.write(`dev-replay: nothing to clear (${file})\n`);
      return 0;
    }
    rmSync(file);
    process.stdout.write(`dev-replay: removed ${file}\n`);
    return 0;
  }

  const records = loadFailures(file);
  if (records.length === 0) {
    process.stdout.write(
      `dev-replay: no recorded failures in ${file}\n` +
        `  Recording is off by default. Restart the Dev app with ${DEV_REPLAY_ENV}=1, reproduce the failure, then rerun.\n`,
    );
    return 1;
  }

  if (args.mode === 'list') {
    process.stdout.write(`dev-replay · ${records.length} recorded failure(s) in ${file}\n`);
    records.forEach((record, i) => process.stdout.write(`${formatFailure(record, i + 1)}\n`));
    return 0;
  }

  const index = args.mode === 'latest' ? records.length : args.index;
  if (!Number.isInteger(index) || index < 1 || index > records.length) {
    throw new Error(`dev-replay: --replay expects 1..${records.length} (see --list)`);
  }
  const record = records[index - 1];

  const target = assertDevOrigin(args.origin, { label: '--origin' });

  // A record captured against production is refused even when the CLI target
  // itself is the Dev app; a record from another loopback dev port (worktree
  // harness, QA runner) is replayed with an explicit notice.
  let recordOriginNote = null;
  if (record.headers?.origin !== undefined) {
    recordOriginNote = checkRecordedOrigin(record.headers.origin, { label: `record #${index} origin` }).warning;
  }

  process.stdout.write(`dev-replay · replaying #${index} from ${file}\n`);
  process.stdout.write(`  recorded  ${record.ts}  ${record.method} ${record.url}  ->  ${record.status}\n`);
  if (recordOriginNote) {
    process.stdout.write(`  note: ${recordOriginNote}; replaying to ${target.origin}\n`);
  }
  if (record.body !== null && typeof record.body === 'object' && record.body.omitted === true) {
    process.stdout.write(
      `  note: the recorded request body was omitted (${record.body.bytes} bytes); replay sends no body\n`,
    );
  }
  process.stdout.write(`  resending ${record.method} ${new URL(String(record.url), target.origin).href}\n`);

  const result = await replayFailure(record, { origin: args.origin });
  const recordedText = JSON.stringify(record.responseBody ?? null);
  const replayedText = result.parsed === undefined ? result.text : JSON.stringify(result.parsed);
  const same = recordedText === replayedText;

  process.stdout.write(`  recorded response: ${record.status}  ${recordedText}\n`);
  process.stdout.write(`  replayed response: ${result.status}  ${replayedText}\n`);
  process.stdout.write(
    same && result.status === record.status
      ? '  verdict: reproduced — status and body are identical\n'
      : `  verdict: differs — status ${record.status} -> ${result.status}, body ${same ? 'identical' : 'changed'}\n`,
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    });
}

export { DEV_REPLAY_ENV, isDevReplayEnabled, resolveDevFailureFile, main };
