/**
 * Structured media-task log (Issue #3232).
 *
 * Official DSH has no general file sink for runtime logs: its logger writes to
 * stdout, and the desktop bundle never persists that. A failed generation
 * therefore left no diagnosable trace on the user's machine — support could
 * only try to reproduce it. The hub owns this file sink so a failure can be
 * read back afterwards.
 *
 * Writes are best-effort by design. A log failure must never affect generation,
 * and must never replace the original error; the failure is kept in
 * {@link lastMediaLogError} for tests instead of being thrown away.
 */

import { appendFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { hubHomeDir } from '../host/paths.js'

/** Hard ceiling for one NDJSON line; longer payloads are truncated and flagged. */
export const MEDIA_LOG_MAX_LINE_BYTES = 4096

/** Rotate to a numbered sibling once the day file passes this size. */
export const MEDIA_LOG_MAX_FILE_BYTES = 5 * 1024 * 1024

/** Longest single free-text value kept verbatim. */
const MAX_TEXT_CHARS = 1024

/** Lifecycle events this channel records. */
export const MEDIA_LOG_EVENTS = Object.freeze([
  'submit.rejected',
  'ledger.shortcircuit',
  'submit.accepted',
  'submit.failed',
  'poll.timeout',
  'poll.unknown-task',
  'poll.terminal-failure',
  'retrieve.failed',
  'download.failed',
  'request.failed',
])

/** Fields allowed into a log line. Anything else is dropped, never copied. */
const TEXT_FIELDS = Object.freeze([
  'taskRef',
  'requestKey',
  'capability',
  'model',
  'channel',
  'upstreamCode',
  'event',
])
const NUMBER_FIELDS = Object.freeze(['httpStatus', 'elapsedMs', 'attempt'])
const BOOLEAN_FIELDS = Object.freeze(['recoverable', 'truncated'])

/** Last write failure, exposed for tests — never thrown at the caller. */
let lastMediaLogError = null

/** Serializes writes so concurrent generations cannot interleave a line. */
let writeChain = Promise.resolve()
let currentDay = null
let currentSeq = 0

/**
 * Directory holding the media-task log. Product-owned storage under
 * `$DSH_HOME`, so it exists for a brand-new user without any opt-in.
 */
export function mediaLogDir() {
  return join(hubHomeDir(), 'omnimux', 'media-logs')
}

/** `YYYY-MM-DD` in local time. */
export function mediaLogDay(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `media-<day>.ndjson`, or `media-<day>-<n>.ndjson` once rotated. */
export function mediaLogFileName(day, seq = 0) {
  return seq > 0 ? `media-${day}-${seq}.ndjson` : `media-${day}.ndjson`
}

/** Absolute path of one log file. */
export function mediaLogPath(day, seq = 0) {
  return join(mediaLogDir(), mediaLogFileName(day, seq))
}

/** Read back the last write failure (tests and diagnostics only). */
export function lastMediaLogFailure() {
  return lastMediaLogError
}

function truncateText(text, limit = MAX_TEXT_CHARS) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}…`
}

/**
 * Credential-shaped fragments never reach the file.
 *
 * Same patterns as `redactSecrets` in `agents/updates.js`, applied without that
 * helper's 300-character tail clamp: the clamp exists for HTTP response bodies,
 * while a log line needs more of the upstream message to stay diagnosable. Keep
 * the two in step when either changes.
 */
const CREDENTIAL_PATTERNS = [
  [/(\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1***:***@'],
  [/(_authToken=)[^\s&]+/gi, '$1***'],
  [/\bnpm_[A-Za-z0-9]{8,}\b/g, 'npm_***'],
  [/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***'],
  [/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, 'sk-***'],
]

function redact(text) {
  let value = String(text ?? '')
  for (const [pattern, replacement] of CREDENTIAL_PATTERNS) {
    value = value.replace(pattern, replacement)
  }
  return value
}

function normalizeText(field, raw) {
  if (raw === undefined || raw === null) return undefined
  const text = truncateText(redact(raw)).trim()
  return text === '' ? undefined : text
}

function normalizeNumber(raw) {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Build one NDJSON line from an entry, keeping only whitelisted fields.
 * Returns `null` when the entry has no usable event name.
 */
export function serializeMediaLogEntry(entry, now = new Date()) {
  if (!entry || typeof entry !== 'object') return null

  const event = normalizeText('event', entry.event)
  if (!event || !MEDIA_LOG_EVENTS.includes(event)) return null

  const record = { ts: now.toISOString(), event }

  for (const field of TEXT_FIELDS) {
    if (field === 'event') continue
    const value = normalizeText(field, entry[field])
    if (value !== undefined) record[field] = value
  }
  for (const field of NUMBER_FIELDS) {
    const value = normalizeNumber(entry[field])
    if (value !== undefined) record[field] = value
  }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof entry[field] === 'boolean') record[field] = entry[field]
  }

  const message = normalizeText('message', entry.message)
  if (message !== undefined) record.message = message

  let line = JSON.stringify(record)
  if (Buffer.byteLength(line, 'utf8') <= MEDIA_LOG_MAX_LINE_BYTES) return line

  // Oversized lines are shrunk rather than dropped, so the event survives even
  // when an upstream message is huge. Limits step down until the line fits.
  record.truncated = true
  for (const limit of [512, 256, 128, 64, 32, 16, 0]) {
    shrinkTextFields(record, limit)
    line = JSON.stringify(record)
    if (Buffer.byteLength(line, 'utf8') <= MEDIA_LOG_MAX_LINE_BYTES) return line
  }
  return JSON.stringify({ ts: record.ts, event: record.event, truncated: true })
}

/** Cap every free-text field at `limit`; `0` drops it entirely. */
function shrinkTextFields(record, limit) {
  for (const field of [...TEXT_FIELDS, 'message']) {
    if (field === 'event') continue
    if (typeof record[field] !== 'string') continue
    if (limit === 0) {
      delete record[field]
      continue
    }
    record[field] = truncateText(record[field], limit)
  }
}

async function fileSize(path) {
  try {
    const info = await stat(path)
    return info.size
  } catch {
    return null
  }
}

async function writeLine(line, options) {
  const dir = options.dir || mediaLogDir()
  const now = typeof options.now === 'function' ? options.now() : new Date()
  const day = mediaLogDay(now)

  if (day !== currentDay) {
    currentDay = day
    currentSeq = 0
  }

  await mkdir(dir, { recursive: true })

  let target = join(dir, mediaLogFileName(day, currentSeq))
  const size = await fileSize(target)
  if (size !== null && size >= MEDIA_LOG_MAX_FILE_BYTES) {
    currentSeq += 1
    target = join(dir, mediaLogFileName(day, currentSeq))
  }

  await appendFile(target, `${line}\n`, 'utf8')
}

/**
 * Append one entry. Resolves `true` when written, `false` when the entry was
 * unusable or the write failed — it never rejects, because a log problem must
 * not surface as a generation failure.
 */
export function appendMediaTaskLog(entry, options = {}) {
  const now = typeof options.now === 'function' ? options.now() : new Date()
  const line = serializeMediaLogEntry(entry, now)
  if (!line) return Promise.resolve(false)

  const run = writeChain.then(async () => {
    try {
      await writeLine(line, options)
      lastMediaLogError = null
      return true
    } catch (error) {
      lastMediaLogError = error instanceof Error ? error : new Error(String(error))
      return false
    }
  })

  writeChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * Await every write queued so far.
 *
 * Appends are fire-and-forget so logging can never slow a generation down, but
 * that means an in-flight write is still pending when the caller returns. A
 * short-lived process — or a test asserting on the file — must flush first,
 * otherwise the last records are lost.
 */
export function flushMediaTaskLog() {
  return writeChain
}

/** Test seam: forget the in-memory rotation state and last failure. */
export function resetMediaLogState() {
  writeChain = Promise.resolve()
  currentDay = null
  currentSeq = 0
  lastMediaLogError = null
}
