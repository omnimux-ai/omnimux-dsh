/**
 * Issue #3237 — dev-only recorder for failed /omnimux-workflow route requests,
 * so a developer can resend the exact request instead of hand-assembling it.
 *
 * Scope split with `scripts/mock-sidecar.mjs` (deliberately no second replay
 * mechanism): mock-sidecar records and replays the *upstream* AI / storage HTTP
 * calls an execution makes; this recorder captures the *local* route failures
 * the canvas hit. The two never share a file, a hash space, or a mode flag, and
 * nothing here touches upstream traffic.
 *
 * Dev identity is an explicit opt-in, never `NODE_ENV`: `build-host.mjs` /
 * `build-canvas.mjs` emit one bundle that Dev and Prod both load, with
 * `process.env.NODE_ENV` hard-replaced by `"production"` at build time, so a
 * `NODE_ENV` check can never select dev. The switch is off by default and,
 * while off, `withDevFailureRecorder` returns its input unchanged — the
 * production path keeps its original code path and performs no new IO.
 *
 * Records live at `<DSH_HOME>/omnimux/workflow/dev-failures.jsonl`, i.e. the
 * same plugin-owned root as every other workflow artifact (`paths.ts`), never
 * inside the repository checkout.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MAX_JSON_BODY_BYTES, SECRET_PATTERN } from '../http/helpers.ts';
import { resolveWorkflowPaths } from './paths.ts';
import type { DispatchResult, WorkflowDispatchRequest } from './routes/dispatch.ts';

/** Explicit opt-in. Any other value (including unset) leaves recording off. */
export const DEV_REPLAY_ENV = 'OMNIMUX_WORKFLOW_DEV_REPLAY';

/** Record file name under the workflow root; the replay script reads the same name. */
export const DEV_FAILURE_FILE_NAME = 'dev-failures.jsonl';

/** Rolling caps: oldest records are dropped once either is exceeded. */
export const DEV_FAILURE_MAX_ENTRIES = 200;
export const DEV_FAILURE_MAX_FILE_BYTES = 4 * 1024 * 1024;

const REDACTED = '[REDACTED]';

/**
 * Global clone of the shared `SECRET_PATTERN` (http/helpers.ts). The original is
 * anchored and non-global because `sendJson` only needs a yes/no test; here we
 * need every occurrence replaced, so the source is reused rather than copied.
 */
const SECRET_PATTERN_SOURCE = SECRET_PATTERN.source;

/**
 * One pass over every recorded string, ordered by specificity so a value is
 * never re-scanned after the key in front of it was replaced:
 *   1. `access_token=<value>` / `access_token: "<value>"` — the shapes
 *      `SECRET_PATTERN` misses (it matches the bare word, leaving the value).
 *   2. `Bearer <token>` — likewise not covered by `SECRET_PATTERN`.
 *   3. `SECRET_PATTERN` itself — `sk-*` and the bare `access_token`.
 */
const REDACTION_PATTERN = new RegExp(
  [
    /access[_-]?token\s*["']?\s*[:=]\s*["']?[^"'&\s,}]+/.source,
    /\bBearer\s+[A-Za-z0-9\-._~+/]{4,}=*/.source,
    SECRET_PATTERN_SOURCE,
  ].join('|'),
  'gi',
);

/** Header names never written to disk; mirrors `scripts/mock-sidecar.mjs` SENSITIVE_HEADERS. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'dsh-pat',
]);

/** Body keys whose value is replaced whatever its shape (key compared without `-`/`_`). */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'proxyauthorization',
  'apikey',
  'xapikey',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'secret',
  'clientsecret',
  'password',
  'passwd',
  'cookie',
  'setcookie',
  'dshpat',
  'pat',
]);

export interface DevFailureRecord {
  /** ISO timestamp of the failure (R3: 时间). */
  ts: string;
  /** Uppercase HTTP method (R3: 方法). */
  method: string;
  /** Request path as dispatched, canonical or legacy prefix (R3: 路径). */
  url: string;
  /** Response status, always >= 400 (R3: 状态). */
  status: number;
  durationMs: number;
  /** Sanitized subset of the headers the dispatcher consumes; drives faithful replay. */
  headers: Record<string, string>;
  /** Redacted request body, or `{omitted:true,bytes:N}` above the cap. */
  body?: unknown;
  /** Redacted response body, or `{omitted:true,bytes:N}` above the cap. */
  responseBody?: unknown;
}

export interface DevFailureRecorderOptions {
  /** Env source; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Record file; defaults to `<DSH_HOME>/omnimux/workflow/dev-failures.jsonl`. */
  file?: string;
  maxEntries?: number;
  maxBytes?: number;
  /** Per-body cap before the content is replaced by `{omitted:true,bytes:N}`. */
  maxBodyBytes?: number;
  now?: () => Date;
}

export interface DevFailureRecorder {
  readonly enabled: boolean;
  readonly file: string;
  /** Appends one record; returns whether a record was written. Never throws. */
  recordFailure(request: WorkflowDispatchRequest, result: DispatchResult, durationMs: number): boolean;
}

/** The switch is on only for the literal `1`; anything else means off. */
export function isDevReplayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DEV_REPLAY_ENV] === '1';
}

/** `<DSH_HOME>/omnimux/workflow/dev-failures.jsonl` — the plugin-owned root, never the checkout. */
export function resolveDevFailureFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveWorkflowPaths({ env }).root, DEV_FAILURE_FILE_NAME);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

/**
 * Replace every secret shape in one string. The leading character of a match is
 * kept when it is a delimiter (`"sk-…` → `"[REDACTED]`), so surrounding text
 * stays readable.
 */
export function redactText(text: string): string {
  return text.replace(REDACTION_PATTERN, (match) =>
    /^[A-Za-z0-9]/.test(match) ? REDACTED : `${match.slice(0, 1)}${REDACTED}`,
  );
}

/** Deep redaction: sensitive keys lose their whole value, strings lose secret shapes. */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactValue(item);
    }
    return out;
  }
  return value;
}

/**
 * R6: above the cap only the size marker is kept — never the content, never a
 * base64 inline. Size is measured before redaction so `bytes` is the real
 * payload size.
 */
export function summarizeBody(body: unknown, maxBytes: number = MAX_JSON_BODY_BYTES): unknown {
  if (body === undefined) return undefined;
  let text: string;
  try {
    text = JSON.stringify(body) ?? 'null';
  } catch {
    return { omitted: true, bytes: 0 };
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > maxBytes) return { omitted: true, bytes };
  return redactValue(body);
}

/** Only JSON failures are in scope; file and SSE results are a documented boundary. */
function asJsonFailure(result: DispatchResult): { status: number; body?: unknown } | null {
  if (result.status < 400) return null;
  if ('file' in result || 'sse' in result) return null;
  return result;
}

function sanitizeHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    clean[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return clean;
}

interface RecordLimits {
  maxEntries: number;
  maxBytes: number;
  maxBodyBytes: number;
}

function buildRecord(
  request: WorkflowDispatchRequest,
  result: { status: number; body?: unknown },
  durationMs: number,
  limits: RecordLimits,
  now: Date,
): DevFailureRecord {
  const record: DevFailureRecord = {
    ts: now.toISOString(),
    method: request.method,
    url: request.url,
    status: result.status,
    durationMs,
    headers: sanitizeHeaders({
      origin: request.origin,
      referer: request.referer,
      'sec-fetch-site': request.secFetchSite,
      range: request.range,
    }),
  };
  const body = summarizeBody(request.body, limits.maxBodyBytes);
  if (body !== undefined) record.body = body;
  const responseBody = summarizeBody(result.body, limits.maxBodyBytes);
  if (responseBody !== undefined) record.responseBody = responseBody;
  return record;
}

/** Drop the oldest lines until both the entry count and the byte cap fit. */
function trimRecords(file: string, limits: RecordLimits): void {
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '');
  let kept = lines.length > limits.maxEntries ? lines.slice(lines.length - limits.maxEntries) : lines;
  let total = kept.reduce((sum, line) => sum + Buffer.byteLength(line, 'utf8') + 1, 0);
  let start = 0;
  // Always keep the newest line, even when it alone exceeds the byte cap.
  while (total > limits.maxBytes && start < kept.length - 1) {
    total -= Buffer.byteLength(kept[start] ?? '', 'utf8') + 1;
    start += 1;
  }
  if (start > 0) kept = kept.slice(start);
  if (kept.length === lines.length) return;
  writeFileSync(file, kept.map((line) => `${line}\n`).join(''), 'utf8');
}

export function createDevFailureRecorder(opts: DevFailureRecorderOptions = {}): DevFailureRecorder {
  const env = opts.env ?? process.env;
  const enabled = isDevReplayEnabled(env);
  const file = opts.file ?? resolveDevFailureFile(env);
  const limits: RecordLimits = {
    maxEntries: opts.maxEntries ?? DEV_FAILURE_MAX_ENTRIES,
    maxBytes: opts.maxBytes ?? DEV_FAILURE_MAX_FILE_BYTES,
    maxBodyBytes: opts.maxBodyBytes ?? MAX_JSON_BODY_BYTES,
  };
  const now = opts.now ?? (() => new Date());

  return {
    enabled,
    file,
    recordFailure(request, result, durationMs) {
      // R1/R8: no file, no directory, no IO while the switch is off.
      if (!enabled) return false;
      const failure = asJsonFailure(result);
      // R2: successes are not recorded. R4: file/SSE results are out of scope.
      if (!failure) return false;
      try {
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, `${JSON.stringify(buildRecord(request, failure, durationMs, limits, now()))}\n`, 'utf8');
        trimRecords(file, limits);
        return true;
      } catch {
        // Recording must never change the outcome of the request it observes.
        return false;
      }
    },
  };
}

export interface DevFailureDispatcher {
  dispatch: (request: WorkflowDispatchRequest) => Promise<DispatchResult>;
}

/**
 * Wrap a dispatcher so failed JSON responses are recorded.
 *
 * Disabled (the default) → the very same object is returned, so `makeHandler`
 * keeps its original call path and the production path gains no branch.
 * Enabled → only `dispatch` is intercepted; `handleAudioRequest` is passed
 * through untouched, which is also the file/SSE boundary (R4).
 */
export function withDevFailureRecorder<T extends DevFailureDispatcher>(
  dispatcher: T,
  opts: DevFailureRecorderOptions = {},
): T {
  const recorder = createDevFailureRecorder(opts);
  if (!recorder.enabled) return dispatcher;
  return {
    ...dispatcher,
    dispatch: async (request: WorkflowDispatchRequest) => {
      const startedAt = Date.now();
      const result = await dispatcher.dispatch(request);
      recorder.recordFailure(request, result, Date.now() - startedAt);
      return result;
    },
  } as T;
}
