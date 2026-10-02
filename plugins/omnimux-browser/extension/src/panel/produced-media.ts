/**
 * Produced-media extraction: reads tool/result event payloads for media the
 * assistant produced (display_file meta, read_image attachments, degraded
 * `<path>/<media>` envelopes, omnimux_*_submit JSON results) and narrows them
 * to displayable references. Pure functions — the wire shapes are unit-tested
 * here and the renderers consume `ProducedMediaRef` without re-parsing events.
 *
 * @module
 */

import {
  parseImageAttachmentRef,
  parseMediaAttachmentRef,
  type ImageAttachmentRef,
  type MediaAttachmentRef,
} from './attachments.ts'
import type { SessionEventView } from './events.ts'

/** How one produced reference is rendered; mirrors the host viewer vocabulary. */
export type ProducedMediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'html' | 'file'

/** A produced item the host attachment store owns; bytes come over `session.attachment`. */
export interface ProducedAttachmentRef {
  source: 'attachment'
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
}

/**
 * One media artifact a tool produced, addressable either by a host attachment
 * id (bytes via `session.attachment`) or by an absolute path on the host
 * filesystem (bytes via `omnimux.producedMedia`).
 */
export type ProducedMediaRef =
  | ProducedAttachmentRef
  | {
    source: 'path'
    path: string
    mediaType: string
    kind: ProducedMediaKind
    bytes?: number
    name?: string
  }

/** Bridge RPC the host answers with one produced file's bytes. */
export const PRODUCED_MEDIA_RPC_METHOD = 'omnimux.producedMedia'

/** Tools whose JSON result carries `dest`: the artifact's absolute path. */
const SUBMIT_MEDIA_TOOLS = new Set([
  'omnimux_image_submit',
  'omnimux_video_submit',
  'omnimux_audio_submit',
])

const PRODUCED_KINDS = new Set<ProducedMediaKind>([
  'image',
  'video',
  'audio',
  'pdf',
  'document',
  'html',
  'file',
])

/** A conservative `type/subtype` shape; it also feeds the data-URL prefix. */
const MEDIA_TYPE_PATTERN = /^[a-z][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/

/** Extension → media type for envelopes/submit results that only name a path. */
const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
}

/** Kind inferred from one lowercase file extension (whitelist for submit tools). */
const EXTENSION_KINDS: Record<string, ProducedMediaKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  avif: 'image',
  bmp: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
  ogv: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  m4a: 'audio',
  pdf: 'pdf',
  html: 'html',
  htm: 'html',
  docx: 'document',
  txt: 'document',
  md: 'document',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** `/a/b/c.png` → `c.png`; tolerates Windows separators and a trailing slash. */
function baseName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const at = normalized.lastIndexOf('/')
  return normalized.slice(at + 1)
}

/** Absolute path on POSIX (`/…`) or Windows (`C:\…`, `C:/…`); trailing slashes stripped. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:\//.test(normalizePath(path))
}

function extensionOf(path: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function kindOfMediaType(mediaType: string): ProducedMediaKind {
  const prefix = mediaType.split('/')[0] ?? ''
  if (prefix === 'image') return 'image'
  if (prefix === 'video') return 'video'
  if (prefix === 'audio') return 'audio'
  if (mediaType === 'application/pdf') return 'pdf'
  if (mediaType === 'text/html') return 'html'
  return 'file'
}

/** Wrap a durable attachment ref into the produced-media union. */
export function attachmentProduced(ref: MediaAttachmentRef): ProducedMediaRef {
  return { source: 'attachment', ...ref }
}

/** The render kind for one reference (attachments are image/video only today). */
export function producedMediaKind(ref: ProducedMediaRef): ProducedMediaKind {
  if (ref.source === 'attachment') return kindOfMediaType(ref.mediaType)
  return ref.kind
}

/** Dedup/lookup key: attachment id or normalized path. */
export function producedMediaKey(ref: ProducedMediaRef): string {
  return ref.source === 'attachment' ? `a:${ref.attachmentId}` : `p:${normalizePath(ref.path)}`
}

/** The callId a tool/result event cites (message.toolCallId, source.callId, or a flat callId). */
export function toolResultCallId(event: SessionEventView): string | null {
  const data = event.data
  if (data === undefined) return null
  if (typeof (data as { callId?: unknown }).callId === 'string') {
    return (data as { callId: string }).callId
  }
  const message = data.message
  if (!isRecord(message)) return null
  if (typeof message.toolCallId === 'string') return message.toolCallId
  const source = message.source
  if (isRecord(source) && typeof source.callId === 'string') return source.callId
  return null
}

/** Line 1: `data.meta` DisplayValue — image attachment first, else the path entry. */
function producedFromMeta(data: Record<string, unknown>): ProducedMediaRef[] {
  const meta = data.meta
  if (!isRecord(meta)) return []
  if (meta.image !== undefined) {
    const image = parseImageAttachmentRef(meta.image)
    return image === null ? [] : [attachmentProduced(image)]
  }
  // Path entry: the whole DisplayValue must satisfy the contract, not just the
  // three fields the card reads — a half-written meta would render a card for a
  // file the host never recorded as produced.
  if (typeof meta.path !== 'string' || meta.path === '' || !isAbsolutePath(meta.path)) return []
  if (typeof meta.kind !== 'string' || !PRODUCED_KINDS.has(meta.kind as ProducedMediaKind)) return []
  if (typeof meta.mediaType !== 'string' || !MEDIA_TYPE_PATTERN.test(meta.mediaType)) return []
  if (!isNonNegativeInteger(meta.bytes)) return []
  if (typeof meta.inContext !== 'boolean') return []
  return [{
    source: 'path',
    path: meta.path,
    mediaType: meta.mediaType,
    kind: meta.kind as ProducedMediaKind,
    bytes: meta.bytes,
    ...(baseName(meta.path) === '' ? {} : { name: baseName(meta.path) }),
  }]
}

/** Lines 2–3: image attachment blocks and `<path>/<media>/<type>` envelopes. */
function producedFromContent(content: unknown): ProducedMediaRef[] {
  if (!Array.isArray(content)) return []
  const refs: ProducedMediaRef[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type === 'image') {
      const attachment = parseMediaAttachmentRef(block.attachment)
      if (attachment !== null) refs.push(attachmentProduced(attachment))
      continue
    }
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    const path = /<path>([\s\S]*?)<\/path>/i.exec(block.text)?.[1].trim()
    if (path === undefined || path === '' || !isAbsolutePath(path)) continue
    const declaredMedia = /<media>([\s\S]*?)<\/media>/i.exec(block.text)?.[1].trim()
    const declaredKind = /<type>([\s\S]*?)<\/type>/i.exec(block.text)?.[1].trim()
    const extension = extensionOf(path)
    const mediaType = declaredMedia !== undefined && MEDIA_TYPE_PATTERN.test(declaredMedia)
      ? declaredMedia
      : EXTENSION_MEDIA_TYPES[extension] ?? 'application/octet-stream'
    const kind = declaredKind !== undefined && PRODUCED_KINDS.has(declaredKind as ProducedMediaKind)
      ? declaredKind as ProducedMediaKind
      : declaredMedia !== undefined && MEDIA_TYPE_PATTERN.test(declaredMedia)
        ? kindOfMediaType(declaredMedia)
        : EXTENSION_KINDS[extension] ?? 'file'
    refs.push({
      source: 'path',
      path,
      mediaType,
      kind,
      ...(baseName(path) === '' ? {} : { name: baseName(path) }),
    })
  }
  return refs
}

/** Line 4: `omnimux_*_submit` JSON result — `dest` absolute path, media extension. */
function producedFromSubmit(content: unknown): ProducedMediaRef[] {
  if (!Array.isArray(content)) return []
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') continue
    let value: unknown
    try {
      value = JSON.parse(block.text)
    } catch {
      continue
    }
    if (!isRecord(value)) return []
    if (value.mode === 'submitted') return []
    const dest = value.dest
    if (typeof dest !== 'string' || dest === '' || !isAbsolutePath(dest)) return []
    const extension = extensionOf(dest)
    const kind = EXTENSION_KINDS[extension]
    if (kind === undefined || (kind !== 'image' && kind !== 'video' && kind !== 'audio')) return []
    return [{
      source: 'path',
      path: dest,
      mediaType: EXTENSION_MEDIA_TYPES[extension] ?? 'application/octet-stream',
      kind,
      name: baseName(dest),
    }]
  }
  return []
}

/**
 * Extract every media artifact a tool/result event produced.
 *
 * `toolName` is the paired tool/call's name — pass `undefined` when the result
 * cannot be paired, which disables the omnimux submit-JSON line only; the meta,
 * attachment, and envelope lines do not need it. An `isError` result produces
 * nothing. Dedup is first-come across all four lines.
 */
export function producedMediaFromToolResult(
  event: SessionEventView,
  toolName?: string,
): ProducedMediaRef[] {
  if (event.type !== 'tool/result') return []
  const data = event.data
  if (!isRecord(data)) return []
  const message = data.message
  if (isRecord(message) && message.isError === true) return []
  if ((data as { isError?: unknown }).isError === true) return []

  const candidates: ProducedMediaRef[] = [...producedFromMeta(data)]
  const content = isRecord(message) ? message.content : undefined
  candidates.push(...producedFromContent(content))
  if (toolName !== undefined && SUBMIT_MEDIA_TOOLS.has(toolName)) {
    candidates.push(...producedFromSubmit(content))
  }

  const seen = new Set<string>()
  const produced: ProducedMediaRef[] = []
  for (const ref of candidates) {
    const key = producedMediaKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    produced.push(ref)
  }
  return produced
}

/**
 * Validate an `omnimux.producedMedia` response before it becomes a `src`.
 *
 * The host answers `{mediaType, bytes, data(base64)}` for a registered path;
 * a response that cannot satisfy the ref's media type renders as a failure.
 */
export function producedMediaResponseDataUrl(value: unknown, expected: ProducedMediaRef): string | null {
  if (expected.source !== 'path') return null
  if (!isRecord(value) || typeof value.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) return null
  const mediaType = typeof value.mediaType === 'string' && MEDIA_TYPE_PATTERN.test(value.mediaType)
    ? value.mediaType
    : expected.mediaType
  return `data:${mediaType};base64,${value.data}`
}

export type { ImageAttachmentRef, MediaAttachmentRef }
