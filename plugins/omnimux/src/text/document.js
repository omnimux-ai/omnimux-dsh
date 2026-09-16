import { extname } from 'node:path'
import { OmnimuxError } from '../media/errors.js'

const DOCUMENT_MIME_BY_EXTENSION = Object.freeze({
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.key': 'application/vnd.apple.keynote',
  '.pages': 'application/vnd.apple.pages',
  '.numbers': 'application/vnd.apple.numbers',
  '.md': 'text/markdown',
})

/**
 * Probe a public document URL without downloading the document body. APIMart
 * defines document formats by file kind, so a recognized URL extension is the
 * stable MIME source; Content-Length supplies the size gate.
 * @param {string} source
 * @param {{ fetcher?: typeof fetch, signal?: AbortSignal, maxDocumentBytes?: number }} [opts]
 */
export async function probeRemoteDocument(source, opts = {}) {
  const value = String(source || '').trim()
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new OmnimuxError('omnimux-invalid-request', 'document must be a public HTTP(S) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OmnimuxError('omnimux-invalid-request', 'document must be a public HTTP(S) URL')
  }
  const mime = DOCUMENT_MIME_BY_EXTENSION[extname(parsed.pathname).toLowerCase()]
  if (!mime) {
    throw new OmnimuxError('omnimux-invalid-request', 'document URL extension is not supported by APIMart')
  }
  const fetcher = opts.fetcher ?? fetch
  let response
  try {
    response = await fetcher(value, {
      method: 'HEAD',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  } catch (error) {
    throw new OmnimuxError('omnimux-invalid-request', `failed to probe document: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    throw new OmnimuxError('omnimux-invalid-request', `document URL returned HTTP ${response.status}`)
  }
  const declaredHeader = response.headers?.get?.('content-length')
  const declared = typeof declaredHeader === 'string' && declaredHeader.trim() !== ''
    ? Number(declaredHeader)
    : Number.NaN
  if (!Number.isFinite(declared) || declared < 0) {
    throw new OmnimuxError('omnimux-invalid-request', 'document URL did not provide Content-Length')
  }
  const cap = opts.maxDocumentBytes
  if (typeof cap === 'number' && Number.isFinite(cap) && cap >= 0 && declared > cap) {
    throw new OmnimuxError('omnimux-invalid-request', `document exceeds ${cap} bytes`)
  }
  return { mime, sizeBytes: declared }
}

export const APIMART_DOCUMENT_MIMES = Object.freeze([...new Set(Object.values(DOCUMENT_MIME_BY_EXTENSION))])

import { readBoundedBody } from '../media/read-bounded-body.js'
import { readFile } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'

const DEFAULT_BYTE_CAP = 50 * 1024 * 1024

/**
 * Load one document from an absolute path or data URI and return a
 * `data:application/pdf;base64,…` URI for chat-completions transport.
 * @param {string} source
 * @param {{
 *   maxDocumentBytes?: number,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 * }} [opts]
 */
export async function loadTextDocument(source, opts = {}) {
  const probed = await probeTextDocument(source, opts)
  return {
    dataUri: `data:${probed.mediaType};base64,${Buffer.from(probed.data).toString('base64')}`,
    mediaType: probed.mediaType,
    bytes: probed.sizeBytes,
    name: probed.name,
  }
}

/**
 * Read and identify a document without repacking it for chat transport.
 * @param {string} source
 * @param {{ maxDocumentBytes?: number, fetcher?: typeof fetch, signal?: AbortSignal }} [opts]
 */
export async function probeTextDocument(source, opts = {}) {
  const raw = String(source || '').trim()
  if (!raw) {
    throw new OmnimuxError('omnimux-invalid-request', 'document is empty')
  }
  const loaded = raw.startsWith('data:')
    ? decodeDocumentDataUri(raw)
    : /^https?:\/\//i.test(raw)
      ? await fetchRemoteDocument(raw, opts)
      : await readLocalDocument(raw, opts.signal)
  const probedMediaType = mediaFromDocumentMagic(loaded.data)
  if (!probedMediaType) {
    throw new OmnimuxError('omnimux-invalid-request', 'document must be a valid PDF file')
  }
  if (loaded.mediaType && loaded.mediaType !== probedMediaType) {
    throw new OmnimuxError('omnimux-invalid-request', `document MIME ${loaded.mediaType} does not match its bytes`)
  }
  const mediaType = probedMediaType
  const cap = typeof opts.maxDocumentBytes === 'number' && opts.maxDocumentBytes > 0
    ? opts.maxDocumentBytes
    : DEFAULT_BYTE_CAP
  if (loaded.data.byteLength > cap) {
    throw new OmnimuxError('omnimux-invalid-request', `document exceeds ${cap} bytes`)
  }
  return {
    data: loaded.data,
    mediaType,
    sizeBytes: loaded.data.byteLength,
    name: loaded.name,
  }
}

export function toDocumentImageUrlPart(media) {
  if (!media || typeof media !== 'object') {
    throw new OmnimuxError('omnimux-invalid-request', 'media object is required')
  }
  const url = typeof media.dataUri === 'string' && media.dataUri.trim()
  if (!url || !url.startsWith('data:application/pdf')) {
    throw new OmnimuxError('omnimux-invalid-request', 'document must have a data:application/pdf URI')
  }
  return {
    type: 'image_url',
    image_url: { url },
  }
}

function decodeDocumentDataUri(dataUri) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/is.exec(dataUri.trim())
  if (!match) {
    throw new OmnimuxError('omnimux-invalid-request', 'document data URI must be base64')
  }
  const declaredMime = match[1]?.toLowerCase()
  const data = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  if (data.byteLength === 0) {
    throw new OmnimuxError('omnimux-invalid-request', 'document data URI has no content')
  }
  return {
    data,
    mediaType: declaredMime === 'application/pdf' ? 'application/pdf' : undefined,
    name: 'data-document',
  }
}

async function fetchRemoteDocument(url, opts = {}) {
  const fetcher = opts.fetcher ?? fetch
  let response
  try {
    response = await fetcher(url, { signal: opts.signal })
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      throw new OmnimuxError('omnimux-aborted', 'document fetch aborted')
    }
    throw new OmnimuxError('omnimux-invalid-request', `failed to fetch document: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    throw new OmnimuxError('omnimux-invalid-request', `document URL returned HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const data = await readBoundedBody(response, opts.maxDocumentBytes ?? DEFAULT_BYTE_CAP)
  return {
    data,
    mediaType: contentType === 'application/pdf' ? 'application/pdf' : undefined,
    name: basename(new URL(url).pathname) || 'document.pdf',
  }
}

async function readLocalDocument(filePath, signal) {
  if (signal?.aborted) {
    throw new OmnimuxError('omnimux-aborted', 'document read aborted')
  }
  if (!isAbsolute(filePath)) {
    throw new OmnimuxError('omnimux-invalid-request', `document path must be absolute: ${filePath}`)
  }
  let data
  try {
    data = await readFile(filePath, { signal })
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      throw new OmnimuxError('omnimux-aborted', 'document read aborted')
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new OmnimuxError('omnimux-invalid-request', `document file not found: ${filePath}`)
    }
    throw error
  }
  return {
    data,
    name: basename(filePath),
  }
}

export function mediaFromDocumentMagic(bytes) {
  // %PDF-
  if (bytes && bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'application/pdf'
  }
  return undefined
}

