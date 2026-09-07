import { PublishError } from './publish-error.js'
/** @typedef {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>} RouteHandler */
/** @typedef {{ register: (route: { kind: 'prefix', path: string, handler: RouteHandler }) => () => void }} WebServer */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
/** @type {Record<string, number>} */
export const STATUS_BY_CODE = {
  'account-provider-mismatch': 409, 'post-provider-mismatch': 409, 'account-unavailable': 409,
  'invalid-arguments': 400, 'validation-failed': 400, 'confirm-required': 400, 'invalid-json': 400,
  'record-not-found': 404, 'task-not-found': 404, 'media-not-found': 404, 'path-not-found': 400,
  'media-too-large': 413, 'record-not-draft': 409, 'task-not-retryable': 409, 'not-local': 403,
  'needs-hub': 503, 'needs-omnimux': 503, 'quota-exceeded': 402, 'hub-tool-error': 502,
  'upload-failed': 502, 'aborted': 500,
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
export function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  if (/access_token|sk-[A-Za-z0-9]/.test(text)) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'refused to emit a secret' }))
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

/** @param {import('node:http').IncomingMessage} req @returns {Promise<unknown>} */
export async function readJsonBody(req) {
  const buffer = await readRawBody(req)
  if (buffer.length === 0) return {}
  try {
    return JSON.parse(buffer.toString('utf8') || '{}')
  } catch {
    return null
  }
}

/** @param {import('node:http').IncomingMessage} req */
export async function readRawBody(req) {
  /** @type {Buffer[]} */
  const chunks = []
  for await (const chunk of req) {
    const value = /** @type {unknown} */ (chunk)
    if (typeof value === 'string') chunks.push(Buffer.from(value))
    else if (Buffer.isBuffer(value)) chunks.push(value)
    else throw new PublishError('invalid-arguments', 'request body must contain bytes')
  }
  return Buffer.concat(chunks)
}

/** @param {{ secFetchSite?: string, 'sec-fetch-site'?: string, origin?: string, referer?: string }} [headers] */
export function assertLocalWrite(headers = {}) {
  const site = String(headers.secFetchSite ?? headers['sec-fetch-site'] ?? '').toLowerCase()
  if (site === 'cross-site') throw new Error('cross-origin write refused')
  const origin = headers.origin || originFromReferer(headers.referer)
  if (!origin) return
  let host
  try {
    host = new URL(origin).hostname
  } catch {
    throw new Error('cross-origin write refused')
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('cross-origin write refused')
}

/** @param {string | undefined} referer */
function originFromReferer(referer) {
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

/** @param {{ headers?: Record<string, string | string[] | undefined> } | undefined} req @param {string} name */
export function header(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/** @param {unknown} error */
export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
