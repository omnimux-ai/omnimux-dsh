/**
 * Shared Host HTTP primitives for workflow + project routes.
 *
 * Extracted so canvas and project dispatchers share one secret-guarded
 * JSON writer, one 1MB body cap, and one loopback write check. Behavior
 * is the original canvasRoutes / projects/routes copy, not a new protocol.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Request-body cap for JSON routes (M2 QA fix #2: bound memory usage). */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

/** Minimal prompt-privacy guard: refuse obvious API tokens without falsely matching task/model names. */
export const SECRET_PATTERN = /(?:^|[^A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9]{8,}|access_token/;

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  if (SECRET_PATTERN.test(text)) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'refused to emit a secret' }));
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

/** Thrown by readJsonBody when the incoming body exceeds the byte cap. */
export class JsonBodyLimitError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`request body exceeds ${String(limit)} bytes`);
    this.limit = limit;
    this.name = 'JsonBodyLimitError';
  }
}

export async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    total += buffer.length;
    if (total > maxBytes) {
      throw new JsonBodyLimitError(maxBytes);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

export function assertLocalWrite(headers: {
  origin?: string;
  referer?: string;
  secFetchSite?: string;
}): void {
  const site = String(headers.secFetchSite || '').toLowerCase();
  if (site === 'cross-site') throw new Error('cross-origin write refused');
  const origin = headers.origin || originFromReferer(headers.referer);
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    throw new Error('cross-origin write refused');
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('cross-origin write refused');
}

function originFromReferer(referer: string | undefined): string {
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

export function header(
  req: { headers?: Record<string, string | string[] | undefined> },
  name: string,
): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function jsonBodyProblem(body: unknown): { status: number; body: unknown } | null {
  if (body === null) {
    return { status: 400, body: { error: 'invalid-json', message: 'request body is not valid JSON' } };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: 'invalid-json', message: 'request body must be a JSON object' } };
  }
  return null;
}
