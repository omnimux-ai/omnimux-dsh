/**
 * Produced-media path registry: the host-side allowlist behind
 * `omnimux.producedMedia`.
 *
 * The panel renders media the assistant produced (`display_file`, `read_image`
 * rasters, the `omnimux_*_submit` writers) by asking the bridge for the file's
 * bytes by path. Letting the extension name ANY path and reading it back would
 * turn the bridge into an arbitrary local file reader, so this module keeps an
 * in-memory `sessionId → Set<normalized absolute path>` allowlist that is fed
 * by the same data the panel sees: `session/event` frames and the
 * `session.history` result. Only paths the session's own events already
 * disclosed can ever be read back.
 *
 * The extraction rules mirror the panel's produced-media layer (they must never
 * drift — the card and the byte grant are the same decision made twice):
 *
 *   1. `tool/result` `data.meta` narrowing to a DisplayValue (non-empty `path`,
 *      `kind` in the viewer vocabulary, non-empty `mediaType`, non-negative
 *      integer `bytes`, boolean `inContext`) registers `path`.
 *   2. `<path>x</path>` envelopes inside the result's text blocks register `x`
 *      — the degraded carrier `formatDisplayOutput` emits for nested calls that
 *      never get `meta`.
 *   3. When the result pairs (via `message.content[].toolCallId`, not the
 *      event's own fields) to a same-session `tool/call` whose name sits in
 *      {@link SUBMIT_TOOL_NAMES}, the first JSON-parseable text block's `dest`
 *      registers as the submission's landing file.
 *
 * A result carrying `isError` (block flag or the event's `error` identity)
 * registers nothing. Non-absolute paths register nothing. `lookup` normalizes
 * the queried path exactly like registration normalizes candidates, so
 * `..` segments and separator quirks cannot widen the grant.
 *
 * The registry is process-local on purpose: after a bridge restart it rebuilds
 * from the history scan on the panel's first `session.history`, which is the
 * same data that repopulates the panel's cards.
 *
 * @module
 */

import { readFile, stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'
import type { ProducedMediaOutcome } from './protocol.ts'

/** Tool names whose JSON `dest` field names a produced file the bridge may serve. */
export const SUBMIT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'omnimux_image_submit',
  'omnimux_video_submit',
  'omnimux_audio_submit',
])

/** Largest produced file the bridge will serve, in bytes. */
export const PRODUCED_MEDIA_MAX_BYTES = 64 * 1024 * 1024

/** Extensions the produced-media RPC serves, to the media type it reports. */
const PRODUCED_MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',

  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.m4v': 'video/x-m4v',

  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',

  '.pdf': 'application/pdf',
}

/** Viewer kinds a DisplayValue may claim (mirrors omnimux-viewer's ViewerKind). */
const PRODUCED_KINDS: ReadonlySet<string> = new Set([
  'image', 'video', 'audio', 'pdf', 'document', 'html', 'file',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whether `value` names an absolute path. `/`-rooted POSIX paths and Windows
 * drive-absolute paths qualify; `C:relative`, `\\unc`, and plain relatives do
 * not — a relative string must never reach `path.resolve`, where it would be
 * re-rooted at the host's cwd and silently widen the grant.
 */
function isAbsolutePath(value: string): boolean {
  if (value.startsWith('/')) return true
  return /^[A-Za-z]:[\\/]/.test(value)
}

/** Canonical form both registration and lookup agree on. */
function normalizeProducedPath(value: string): string {
  return path.resolve(path.normalize(value))
}

/** Register `candidate` under `session` when it is an absolute path. */
function registerPath(session: SessionBucket, candidate: string): void {
  if (!isAbsolutePath(candidate)) return
  session.paths.add(normalizeProducedPath(candidate))
}

/**
 * `data.meta` narrowed to the DisplayValue subset that authorizes a path.
 *
 * The five declared fields must all be present and valid — the same gate the
 * panel's extraction applies before it offers a card, so the host never
 * registers a path the UI would not have rendered.
 */
function displayValuePath(meta: unknown): string | undefined {
  if (!isRecord(meta)) return undefined
  if (typeof meta.path !== 'string' || meta.path.length === 0) return undefined
  if (typeof meta.kind !== 'string' || !PRODUCED_KINDS.has(meta.kind)) return undefined
  if (typeof meta.mediaType !== 'string' || meta.mediaType.length === 0) return undefined
  if (typeof meta.bytes !== 'number' || !Number.isInteger(meta.bytes) || meta.bytes < 0) return undefined
  if (typeof meta.inContext !== 'boolean') return undefined
  return meta.path
}

/**
 * Absolute paths inside `<path>x</path>` envelopes. `formatDisplayOutput`
 * emits this envelope for nested `display_file` calls whose result never
 * carries `meta`; the card parses it, so the grant follows it.
 */
function envelopePaths(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(/<path>([^<]*)<\/path>/g)) {
    const candidate = match[1]
    if (candidate !== undefined) found.push(candidate.trim())
  }
  return found.filter(value => value.length > 0)
}

/** Text of every text block in a content array (unknown block shapes skipped). */
function textBlocks(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  const texts: string[] = []
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text)
    }
  }
  return texts
}

/** The `dest` of the first JSON-parseable text block, when it is a string. */
function submittedDest(texts: string[]): string | undefined {
  for (const text of texts) {
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      continue
    }
    if (isRecord(value) && typeof value.dest === 'string') return value.dest
  }
  return undefined
}

interface SessionBucket {
  readonly paths: Set<string>
  /** `callId` → tool name, collected from `tool/call` frames of this session. */
  readonly toolNames: Map<string, string>
}

/**
 * The produced-media allowlist. Create one per bridge mount and share the
 * instance between the Host adapter (which feeds it) and the WebSocket server
 * (which reads it) — two instances would disagree on what was produced.
 */
export interface ProducedRegistry {
  /**
   * Fold one session event into the allowlist.
   * @param sessionId - owning session of the event frame.
   * @param event - the raw `payload.event` object (`{type, seq, data}`).
   */
  observeEvent(sessionId: string, event: unknown): void
  /**
   * Fold a `session.history` result into the allowlist. The value's
   * `events` entries are `{event}` wrappers; tool-call names are collected
   * across the WHOLE list first so a result can pair to a call that preceded
   * it in the page.
   * @param sessionId - owning session of the history.
   * @param historyValue - the history result value (`{events: [...], ...}`).
   */
  observeHistory(sessionId: string, historyValue: unknown): void
  /**
   * @returns the normalized registered path when `path` was produced by this
   * session, `undefined` otherwise.
   */
  lookup(sessionId: string, path: string): string | undefined
  /** Forget one session entirely (after its durable storage was purged). */
  drop(sessionId: string): void
}

/** Create an empty registry. */
export function createProducedRegistry(): ProducedRegistry {
  const sessions = new Map<string, SessionBucket>()
  const bucketFor = (sessionId: string): SessionBucket => {
    const existing = sessions.get(sessionId)
    if (existing !== undefined) return existing
    const created: SessionBucket = { paths: new Set(), toolNames: new Map() }
    sessions.set(sessionId, created)
    return created
  }
  const observeEvent = (sessionId: string, event: unknown): void => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    if (!isRecord(event) || typeof event.type !== 'string') return
    const session = bucketFor(sessionId)
    const data = isRecord(event.data) ? event.data : {}
    if (event.type === 'tool/call') {
      if (typeof data.callId === 'string' && data.callId.length > 0
        && typeof data.name === 'string' && data.name.length > 0) {
        session.toolNames.set(data.callId, data.name)
      }
      return
    }
    if (event.type !== 'tool/result') return
    const message = isRecord(data.message) ? data.message : {}
    const content = Array.isArray(message.content) ? message.content : []
    for (const block of content) {
      // A failed call produced nothing viewable; registering its `dest` or
      // envelope would later let the panel read bytes for an output that does
      // not exist (or worse, one a failed tool partially wrote).
      if (isRecord(block) && block.isError === true) return
    }
    if (data.error !== undefined) return

    const metaPath = displayValuePath(data.meta)
    if (metaPath !== undefined) registerPath(session, metaPath)

    for (const block of content) {
      if (!isRecord(block)) continue
      for (const text of textBlocks(block.content)) {
        for (const candidate of envelopePaths(text)) registerPath(session, candidate)
      }
    }
    for (const text of textBlocks(content)) {
      for (const candidate of envelopePaths(text)) registerPath(session, candidate)
    }

    for (const block of content) {
      if (!isRecord(block)) continue
      const callId = block.toolCallId
      if (typeof callId !== 'string') continue
      const toolName = session.toolNames.get(callId)
      if (toolName === undefined || !SUBMIT_TOOL_NAMES.has(toolName)) continue
      const dest = submittedDest(textBlocks(block.content))
      if (dest !== undefined) registerPath(session, dest)
    }
  }
  return {
    observeEvent,
    observeHistory(sessionId: string, historyValue: unknown): void {
      if (!isRecord(historyValue) || !Array.isArray(historyValue.events)) return
      const events: unknown[] = []
      for (const entry of historyValue.events) {
        if (isRecord(entry) && 'event' in entry) events.push(entry.event)
      }
      // Call identities must be known before results are paired to them; a
      // page in seq order already interleaves call/result, so collecting the
      // map in one pre-pass is the only safe order.
      for (const event of events) {
        if (isRecord(event) && event.type === 'tool/call') observeEvent(sessionId, event)
      }
      for (const event of events) observeEvent(sessionId, event)
    },
    lookup(sessionId: string, filePath: string): string | undefined {
      if (typeof filePath !== 'string' || !isAbsolutePath(filePath)) return undefined
      const normalized = normalizeProducedPath(filePath)
      const session = sessions.get(sessionId)
      return session?.paths.has(normalized) ? normalized : undefined
    },
    drop(sessionId: string): void {
      sessions.delete(sessionId)
    },
  }
}

/**
 * No-op registry used when a caller omits the produced dep. Every lookup
 * misses, so `omnimux.producedMedia` still answers `not-produced` rather than
 * serving anything — absence must degrade closed, never open.
 */
export const NULL_PRODUCED_REGISTRY: ProducedRegistry = {
  observeEvent(): void {},
  observeHistory(): void {},
  lookup(): string | undefined {
    return undefined
  },
  drop(): void {},
}

/**
 * Read one produced file's bytes.
 *
 * The registry decides which paths are servable; this seam then enforces the
 * physical contract — a real regular file, within the byte ceiling, and of a
 * media type the panel can meaningfully render.
 *
 * @param produced - the shared allowlist.
 * @param request - validated RPC payload.
 * @param seams - injectable fs for tests.
 * @returns the tagged outcome; never throws for expected denials.
 */
export async function readProducedMedia(
  produced: ProducedRegistry,
  request: { sessionId: string; path: string },
  seams: { stat?: typeof stat; readFile?: typeof readFile } = {},
): Promise<ProducedMediaOutcome> {
  const filePath = produced.lookup(request.sessionId, request.path)
  if (filePath === undefined) {
    return { code: 'not-produced', message: 'the session did not produce this path' }
  }
  const statImpl = seams.stat ?? stat
  const readFileImpl = seams.readFile ?? readFile
  let info: Stats
  try {
    info = await statImpl(filePath)
  } catch {
    // A registered path that no longer exists is answered as unproduced: the
    // panel shows its retryable failure state instead of a transport error.
    return { code: 'not-produced', message: 'the produced file is no longer present' }
  }
  if (!info.isFile()) {
    return { code: 'not-produced', message: 'the produced path is not a regular file' }
  }
  if (info.size > PRODUCED_MEDIA_MAX_BYTES) {
    return { code: 'too-large', message: `the produced file exceeds ${String(PRODUCED_MEDIA_MAX_BYTES)} bytes`, limit: PRODUCED_MEDIA_MAX_BYTES }
  }
  const mediaType = producedMediaType(filePath)
  if (mediaType === undefined) {
    return { code: 'unsupported', message: 'the produced file type is not servable' }
  }
  try {
    const data = await readFileImpl(filePath)
    return {
      code: 'ok',
      mediaType,
      bytes: data.byteLength,
      data: data.toString('base64'),
    }
  } catch (error: unknown) {
    return {
      code: 'internal',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Media type the RPC reports for `filePath`, or `undefined` when unservable. */
function producedMediaType(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '') return undefined
  return Object.hasOwn(PRODUCED_MEDIA_TYPES, extension)
    ? PRODUCED_MEDIA_TYPES[extension]
    : undefined
}
