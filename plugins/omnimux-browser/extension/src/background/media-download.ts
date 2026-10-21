/**
 * Worker-side download channel for media the page hovers.
 *
 * The content script knows the address of an image or video but cannot write a
 * file; it hands the address here and the worker forwards it to
 * `chrome.downloads.download`. The browser API arrives as an injected
 * `download` function, so this module never touches `chrome` and every
 * validation, filename and failure mapping is plain data in and data out.
 *
 * Success honesty: only a positive integer download id is a started download.
 * A rejected call, a non-numeric id, a fractional id, or zero is
 * `download-failed` — the action layer must never mark a click as done when
 * the browser refused to start it.
 *
 * The saved name is built here rather than by the caller, so a signed query
 * string can never leak into it (tokens are not names) and an over-long,
 * control-character or Windows-illegal basename still lands as a real file.
 *
 * @module
 */

/** What the content script asks the worker to download. */
export interface DownloadStartRequest {
  /** Absolute http(s) address of the image or video itself. */
  url: string
  /** Preferred saved file name; sanitized and extension-completed when used. */
  filename?: string
  /** Page the asset was found on; carried for callers, never part of the name. */
  pageUrl?: string
  /** Page title; carried for callers, never part of the name. */
  pageTitle?: string
  /** Media kind; decides the fallback name and the completed extension. */
  type?: 'image' | 'video'
}

/**
 * The exact `chrome.downloads.download` options this module passes.
 *
 * `saveAs: false` keeps the click a one-press download to the default folder,
 * and `uniquify` makes a repeat download of the same asset a second file
 * instead of silently overwriting the first one.
 */
export interface DownloadOptions {
  url: string
  filename: string
  saveAs: false
  conflictAction: 'uniquify'
}

/** The browser download call injected by the worker; resolves a download id. */
export interface MediaDownloadDeps {
  download: (options: DownloadOptions) => Promise<number>
}

/** The only outcomes the action layer may render. */
export type DownloadStartResult =
  | { ok: true; downloadId: number; filename: string }
  | { ok: false; code: 'invalid-url' | 'invalid-request' | 'download-failed' }

/** Longest saved name, leaving room for the ` (1)` suffix the browser appends. */
const MAX_FILENAME_LENGTH = 120

/** Last resort when both the requested name and the fallback clean away to nothing. */
const LAST_RESORT_FILENAME = 'download'

/** Characters Windows forbids in a file name; replaced, never kept. */
const WINDOWS_ILLEGAL = /[<>:"/\\|?*]/g

/** C0 controls and DEL: a saved name must not carry them. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g

/** A trailing dot-extension the name may already carry (`.mp4`, `.jpeg`, ...). */
const FILE_EXTENSION = /\.[a-z0-9]{1,10}$/i

/**
 * Coerces a value into an options record.
 *
 * Arrays are objects by `typeof` but not requests; treating them as records
 * would let `[]` through as a request with no url.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Removes everything a saved file name cannot keep.
 *
 * Control characters are dropped, path separators and the other Windows-illegal
 * characters become `-` (so `a/b` cannot escape the download folder and cannot
 * fuse into `ab`), whitespace runs collapse, and leading/trailing spaces and
 * dots are trimmed — a trailing dot is illegal on Windows and a leading dot
 * hides the file. Non-ASCII text, including CJK, is preserved as-is.
 */
function cleanFilenameText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(CONTROL_CHARACTERS, '')
    .replace(WINDOWS_ILLEGAL, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+/, '')
    .replace(/[\s.]+$/, '')
}

/** Cuts a string to `max` UTF-16 units without splitting a surrogate pair. */
function clipToLength(value: string, max: number): string {
  if (value.length <= max) return value
  const clipped = value.slice(0, max)
  return /[\uD800-\uDBFF]$/.test(clipped) ? clipped.slice(0, -1) : clipped
}

/** The trailing `.ext` of a name, or `''` when it has none. */
function extensionOf(name: string): string {
  const match = FILE_EXTENSION.exec(name)
  return match === null ? '' : match[0]
}

/**
 * Enforces the length budget while keeping the extension readable.
 *
 * Truncating from the right would cut `.mp4` off first and leave the browser
 * with an extensionless file, so the stem is shortened and the extension is
 * kept whole.
 */
function limitFilenameLength(name: string): string {
  if (name.length <= MAX_FILENAME_LENGTH) return name
  const extension = extensionOf(name)
  const stem = extension === '' ? name : name.slice(0, name.length - extension.length)
  const head = clipToLength(stem, MAX_FILENAME_LENGTH - extension.length).replace(/[\s.]+$/, '')
  if (head === '') return clipToLength(extension.replace(/^\./, ''), MAX_FILENAME_LENGTH)
  return `${head}${extension}`
}

/** `decodeURIComponent` with a fallback to the raw segment (malformed `%` escapes). */
function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Sanitizes a caller-supplied file name.
 *
 * @param raw - The preferred name; control characters, separators and the
 *   Windows-illegal set are cleaned, and the result is bounded to 120
 *   characters with its extension preserved.
 * @param fallback - Used when `raw` cleans away to nothing; sanitized the same
 *   way, with `download` as the final non-empty answer.
 */
export function sanitizeDownloadFilename(raw: string, fallback: string): string {
  const primary = limitFilenameLength(cleanFilenameText(raw))
  if (primary !== '') return primary
  const secondary = limitFilenameLength(cleanFilenameText(fallback))
  return secondary !== '' ? secondary : LAST_RESORT_FILENAME
}

/**
 * Derives a file name from a URL's path.
 *
 * Only the pathname is read: the query string carries signatures, timestamps
 * and CDN parameters, none of which belong in a file name — and a `?` is
 * illegal on Windows anyway. Each path segment is decoded independently, so a
 * malformed escape can only spoil its own segment. A basename without an
 * extension borrows the fallback's extension when it has one; otherwise the
 * caller's extension completion (by media type) applies.
 */
export function filenameFromUrl(url: string, fallback: string): string {
  const fallbackName = sanitizeDownloadFilename('', fallback)
  if (typeof url !== 'string') return fallbackName
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return fallbackName
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallbackName
  const segments = parsed.pathname.split('/').filter((segment) => segment !== '')
  const last = segments[segments.length - 1]
  const base = last === undefined ? '' : limitFilenameLength(cleanFilenameText(decodeSegment(last)))
  if (base === '') return fallbackName
  if (FILE_EXTENSION.test(base)) return base
  const fallbackExtension = extensionOf(fallbackName)
  return limitFilenameLength(fallbackExtension === '' ? base : `${base}${fallbackExtension}`)
}

/**
 * Builds the name handed to the download manager.
 *
 * A caller-provided name wins over the URL basename; when neither yields an
 * extension the media type completes it (`video` → `.mp4`, everything else →
 * `.jpg`). The result always has an extension and never exceeds 120
 * characters.
 */
export function buildDownloadFilename(request: DownloadStartRequest): string {
  const fallback = request.type === 'video' ? 'video.mp4' : 'media'
  const provided = typeof request.filename === 'string'
    ? limitFilenameLength(cleanFilenameText(request.filename))
    : ''
  const name = provided !== '' ? provided : filenameFromUrl(request.url, fallback)
  if (FILE_EXTENSION.test(name)) return name
  return limitFilenameLength(`${name}${request.type === 'video' ? '.mp4' : '.jpg'}`)
}

/**
 * Parses a request url and admits only absolute http(s) addresses.
 *
 * `blob:` and `data:` URLs are page-scoped handles, not resources the download
 * manager can fetch later, and a relative address has no origin to resolve
 * against — all of them are `invalid-url`.
 */
function parseDownloadableUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null
}

/**
 * Starts one browser download for a hovered media asset.
 *
 * @param request - Untrusted message payload from the content script.
 * @param deps - The worker's `chrome.downloads.download` binding.
 * @returns A started download (positive integer id and the saved name), or
 *   `invalid-request`/`invalid-url` for a payload that must not be attempted,
 *   or `download-failed` when the browser refused to start it. A rejection is
 *   never swallowed into an optimistic `ok`.
 */
export async function startMediaDownload(
  request: unknown,
  deps: MediaDownloadDeps,
): Promise<DownloadStartResult> {
  const record = asRecord(request)
  if (record === null) return { ok: false, code: 'invalid-request' }

  const rawUrl = record.url
  if (typeof rawUrl !== 'string') return { ok: false, code: 'invalid-url' }
  const parsedUrl = parseDownloadableUrl(rawUrl)
  if (parsedUrl === null) return { ok: false, code: 'invalid-url' }

  const filenameSource: DownloadStartRequest = { url: rawUrl }
  if (typeof record.filename === 'string') filenameSource.filename = record.filename
  if (typeof record.pageUrl === 'string') filenameSource.pageUrl = record.pageUrl
  if (typeof record.pageTitle === 'string') filenameSource.pageTitle = record.pageTitle
  if (record.type === 'image' || record.type === 'video') filenameSource.type = record.type
  const filename = buildDownloadFilename(filenameSource)

  let downloadId: unknown
  try {
    downloadId = await deps.download({
      url: parsedUrl.href,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    })
  } catch {
    return { ok: false, code: 'download-failed' }
  }
  if (typeof downloadId !== 'number' || !Number.isSafeInteger(downloadId) || downloadId <= 0) {
    return { ok: false, code: 'download-failed' }
  }
  return { ok: true, downloadId, filename }
}
