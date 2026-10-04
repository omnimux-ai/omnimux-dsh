/**
 * Image-asset save adapter for {@link BRIDGE_SAVE_IMAGE_ASSET_METHOD}
 * (Issue #3052).
 *
 * Orchestrates the one safe path a confirmed page image takes into the host's
 * asset library:
 *
 *   payload → fetchMediaBytes (public-only, per-hop, 8 MiB / 9 s, DNS-bound)
 *           → declared image/* in the frozen raster set ∩ host imageLimits
 *           → attachments.validateImage (real raster decode, never a save)
 *           → assetLibrary.ingestDownloadedImage (the same live LibraryStore)
 *
 * The adapter owns no persistence and no second downloader: every guard is
 * the existing seam it delegates to, and every expected refusal maps to the
 * frozen outcome vocabulary in protocol.ts. Nothing here returns local
 * paths, bytes, raw URLs, or exception details to the extension.
 *
 * @module
 */

import { createHash } from 'node:crypto'
import { fetchMediaBytes, isFetchableMediaUrl, type MediaFetchOptions } from './media-fetch.ts'
import type { ImageAssetSaveOutcome, ImageAssetSaveRequest, MediaFetchOutcome } from './protocol.ts'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'

/** Wire bounds for the frozen input shape (wire contract #3052). */
export const IMAGE_ASSET_SAVE_LIMITS = {
  requestId: 128,
  url: 8_192,
  pageUrl: 8_192,
  title: 200,
} as const

/** Raster types V1 accepts, before intersecting with the host's own limits. */
const FROZEN_RASTER_SET = new Set<string>(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * Attachment error codes mapped to their frozen outcome. Codes not listed
 * (storage faults, corrupt references) mean the validation capability itself
 * could not judge the bytes, which is reported as `unavailable` — never
 * downgraded to a header-only check.
 */
const VALIDATION_OUTCOME_BY_CODE: Readonly<Record<string, ImageAssetSaveOutcome['status']>> = {
  UNSUPPORTED_IMAGE_TYPE: 'unsupported-image',
  INVALID_IMAGE: 'unsupported-image',
  INVALID_IMAGE_BASE64: 'unsupported-image',
  TOO_MANY_IMAGES: 'unsupported-image',
  IMAGES_TOO_LARGE: 'unsupported-image',
  IMAGE_TYPE_MISMATCH: 'mime-mismatch',
  IMAGE_TOO_LARGE: 'too-large',
  IMAGE_TOO_MANY_PIXELS: 'too-large',
  IMAGE_DIMENSION_TOO_LARGE: 'too-large',
}

/**
 * The narrow write capability the assets plugin provides as `assetLibrary`.
 * Browser only ever sees this structural shape — never its implementation.
 */
export interface AssetLibraryLike {
  ingestDownloadedImage(input: {
    bytes: Uint8Array
    mime: string
    displayName?: string | undefined
    sourceKey: string
    description?: string | undefined
  }): Promise<unknown>
}

/** Dependencies the save needs from the host; production wires the real seams. */
export interface ImageAssetSaveDeps {
  /** Secure downloader; defaults to {@link fetchMediaBytes}. */
  fetchMedia?: ((url: unknown, options?: MediaFetchOptions) => Promise<MediaFetchOutcome>) | undefined
  /** Host raster validation (dsh-attachment validateImage); absence = unavailable. */
  validateImage?: ((input: { data: Uint8Array; mediaType: ImageMediaType }) => Promise<void>) | undefined
  /** Host deployment-resolved acceptable media types (imageLimits.mediaTypes). */
  imageMediaTypes?: readonly string[] | undefined
  /** Resolves the assets plugin's `assetLibrary` service; undefined = not mounted. */
  assetLibrary?: (() => AssetLibraryLike | undefined) | undefined
}

/**
 * Build the save deps bound to a Cordis context. Every seam resolves per
 * call — attachments, its image limits, and the asset library may mount
 * after this plugin (or be swapped by HMR), and a capture at mount time
 * would freeze `unavailable` forever (Issue #3052 Q5).
 * @param ctx - Cordis context of the bridge plugin.
 */
export function createImageAssetSaveDeps(ctx: { get: (name: string) => unknown }): ImageAssetSaveDeps {
  interface AttachmentsLike {
    validateImage?: (input: { data: Uint8Array; mediaType: ImageMediaType }) => Promise<void>
    imageLimits?: { mediaTypes?: readonly string[] }
  }
  const attachments = (): AttachmentsLike | undefined =>
    ctx.get('attachments') as AttachmentsLike | undefined
  return {
    get validateImage() {
      const provider = attachments()
      // 绑定到当次解析出的 provider：方法可能是依赖 this 的服务方法。
      return typeof provider?.validateImage === 'function' ? provider.validateImage.bind(provider) : undefined
    },
    get imageMediaTypes() {
      return attachments()?.imageLimits?.mediaTypes
    },
    assetLibrary: () => {
      const service = ctx.get('assetLibrary') as AssetLibraryLike | undefined
      return typeof service?.ingestDownloadedImage === 'function' ? service : undefined
    },
  }
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed !== '' && value.length <= max ? value : undefined
}

/**
 * Validate the frozen `{requestId,url,pageUrl,title?}` input.
 * Extra keys (paths, headers, credentials) refuse the whole call — the RPC
 * never lets a caller steer where bytes land or what the request carries.
 * @param payload - decoded rpc payload.
 * @returns the parsed request, or `undefined` when it is not the frozen shape.
 */
export function parseImageAssetPayload(payload: unknown): ImageAssetSaveRequest | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const record = payload as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key !== 'requestId' && key !== 'url' && key !== 'pageUrl' && key !== 'title') return undefined
  }
  const requestId = boundedString(record.requestId, IMAGE_ASSET_SAVE_LIMITS.requestId)
  const url = boundedString(record.url, IMAGE_ASSET_SAVE_LIMITS.url)
  const pageUrl = boundedString(record.pageUrl, IMAGE_ASSET_SAVE_LIMITS.pageUrl)
  if (requestId === undefined || url === undefined || pageUrl === undefined) return undefined
  if (record.title === undefined) return { requestId, url, pageUrl }
  if (typeof record.title !== 'string' || record.title.length > IMAGE_ASSET_SAVE_LIMITS.title) return undefined
  return { requestId, url, pageUrl, title: record.title }
}

/**
 * Map a declared content-type to the frozen raster set, or `null`.
 * Missing MIME, octet-stream, SVG, HTML and unknown types are refused here;
 * the URL suffix is never consulted as a substitute.
 * @param contentType - the response's declared content type.
 */
export function normalizeImageMime(contentType: string): ImageMediaType | null {
  const base = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (!FROZEN_RASTER_SET.has(base)) return null
  return base as ImageMediaType
}

/**
 * Source identity for dedupe: sha256 of the normalized URL — fragment
 * stripped, query kept (signed URLs stay distinct; the same image under two
 * fragment spellings does not duplicate).
 * @param url - the page image URL the user saved.
 * @returns 64-char lowercase hex digest.
 */
export function imageAssetSourceKey(url: string): string {
  let normalized = url
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    normalized = parsed.href
  } catch (error: unknown) {
    // URL validity is enforced upstream by isFetchableMediaUrl; a plain
    // string simply hashes as-is. Log rather than silently fall through.
    console.warn('[omnimux-browser] image source key normalization fell back to raw URL', error)
  }
  return createHash('sha256').update(normalized).digest('hex')
}

function errorCodeOf(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

/** Whether a returned ingest result is a legal success receipt. */
function isIngestReceipt(value: unknown): value is { status: 'saved' | 'duplicate'; assetId: string; fileId: string; lrev: number } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (record.status === 'saved' || record.status === 'duplicate')
    && typeof record.assetId === 'string' && record.assetId !== ''
    && typeof record.fileId === 'string' && record.fileId !== ''
    && typeof record.lrev === 'number' && Number.isSafeInteger(record.lrev) && record.lrev >= 0
}

/** Map a thrown validation error to its frozen outcome. */
function validationOutcomeOf(error: unknown): ImageAssetSaveOutcome {
  const status = VALIDATION_OUTCOME_BY_CODE[errorCodeOf(error)]
  switch (status) {
    case 'unsupported-image':
      return { status: 'unsupported-image' }
    case 'mime-mismatch':
      return { status: 'mime-mismatch' }
    case 'too-large':
      return { status: 'too-large' }
    default:
      // The validator itself could not judge the bytes — honest
      // unavailability, never a weaker check masquerading as validation.
      return { status: 'unavailable' }
  }
}

/** Run the host raster validation; captures the refusal instead of propagating. */
async function runValidation(
  validateImage: (input: { data: Uint8Array; mediaType: ImageMediaType }) => Promise<void>,
  bytes: Uint8Array,
  mime: ImageMediaType,
): Promise<{ failed: false } | { failed: true; error: unknown }> {
  try {
    await validateImage({ data: bytes, mediaType: mime })
    return { failed: false }
  } catch (error: unknown) {
    return { failed: true, error }
  }
}

/**
 * Race the host validation against the connection generation's abort.
 *
 * A slow or stuck decoder must not hold the RPC open: the moment the owning
 * connection dies the call answers `cancelled`. The validation promise is not
 * abandoned unobserved — a settlement arriving after the abort is drained so a
 * late refusal can never surface as an unhandled rejection (OCR R2-2).
 */
async function runValidationWithCancel(
  validateImage: (input: { data: Uint8Array; mediaType: ImageMediaType }) => Promise<void>,
  bytes: Uint8Array,
  mime: ImageMediaType,
  signal?: AbortSignal,
): Promise<{ failed: false } | { failed: true; error: unknown } | { aborted: true }> {
  if (signal === undefined) {
    return runValidation(validateImage, bytes, mime)
  }
  if (signal.aborted) {
    return { aborted: true }
  }
  let onAbort: (() => void) | undefined
  const abortedPromise = new Promise<{ aborted: true }>((resolve) => {
    onAbort = () => resolve({ aborted: true })
    signal.addEventListener('abort', onAbort, { once: true })
  })
  const validation = runValidation(validateImage, bytes, mime)
  const outcome = await Promise.race([validation, abortedPromise])
  signal.removeEventListener('abort', onAbort ?? (() => {}))
  if ('aborted' in outcome) {
    // 校验仍在途：它到达的迟到结果必须被消费，rejection 不能流落进程。
    void validation.then(() => undefined, () => undefined)
    return { aborted: true }
  }
  return outcome
}

/** Run the assets ingest; captures the persistence failure instead of propagating. */
async function runIngest(
  service: AssetLibraryLike,
  input: Parameters<AssetLibraryLike['ingestDownloadedImage']>[0],
): Promise<{ failed: false; result: unknown } | { failed: true; error: unknown }> {
  try {
    return { failed: false, result: await service.ingestDownloadedImage(input) }
  } catch (error: unknown) {
    return { failed: true, error }
  }
}

/**
 * Save one validated page image into the host asset library.
 *
 * @param request - the frozen, already shape-validated input.
 * @param deps - injectable seams; production wires fetchMediaBytes,
 *   ctx.attachments.validateImage + imageLimits, and ctx.assetLibrary.
 * @param signal - the owning connection generation's abort: a dying
 *   connection must not restart the save elsewhere, and mid-flight death
 *   reports `cancelled` rather than a download failure.
 * @returns the frozen business outcome; never throws for an expected refusal.
 */
export async function saveImageAsset(
  request: ImageAssetSaveRequest,
  deps: ImageAssetSaveDeps,
  signal?: AbortSignal,
): Promise<ImageAssetSaveOutcome> {
  const service = deps.assetLibrary?.()
  const validateImage = deps.validateImage
  if (service === undefined || typeof validateImage !== 'function') {
    return { status: 'unavailable' }
  }
  if (!isFetchableMediaUrl(request.url)) {
    return { status: 'invalid-url' }
  }

  const fetchMedia = deps.fetchMedia ?? ((url, options) => fetchMediaBytes(url, options))
  // Read the generation flag through a closure: AbortSignal.aborted is a live
  // getter, so every check evaluates the current value rather than a snapshot.
  const aborted = (): boolean => signal?.aborted === true
  const fetched = await fetchMedia(request.url, { signal })
  switch (fetched.status) {
    case 'ok':
      break
    case 'timeout':
      return aborted() ? { status: 'cancelled' } : { status: 'timeout' }
    case 'too-large':
      return { status: 'too-large' }
    case 'http-error':
      return { status: 'http-error', statusCode: fetched.statusCode }
    case 'bad-request':
      return { status: 'invalid-url' }
    case 'failed':
      return aborted() ? { status: 'cancelled' } : { status: 'http-error' }
  }

  if (aborted()) return { status: 'cancelled' }

  const mime = normalizeImageMime(fetched.contentType)
  if (mime === null) {
    return { status: 'unsupported-image' }
  }
  const allowed = deps.imageMediaTypes
  if (allowed !== undefined && !allowed.includes(mime)) {
    // 冻结集与宿主可验证集的交集为空：不能入库的类型诚实拒绝。
    return { status: 'unsupported-image' }
  }

  const bytes = Buffer.from(fetched.data, 'base64')
  if (bytes.byteLength === 0) {
    return { status: 'unsupported-image' }
  }
  const validation = await runValidationWithCancel(validateImage, bytes, mime, signal)
  if ('aborted' in validation) {
    return { status: 'cancelled' }
  }
  if (validation.failed) {
    console.warn('[omnimux-browser] image validation refused the downloaded bytes', validation.error)
    return validationOutcomeOf(validation.error)
  }

  if (aborted()) return { status: 'cancelled' }

  const ingest = await runIngest(service, {
    bytes,
    mime,
    displayName: request.title,
    sourceKey: imageAssetSourceKey(request.url),
    description: `来源：${request.pageUrl}`,
  })
  // ingest API 不带 signal：若连接代次在提交期间死亡，落盘不回滚（真实
  // 已提交的文件不撤），但回执必须报 cancelled —— 不能向一个已断的连接
  // 承诺 saved（QA #3052 / wire：连接取消回执约定）。
  if (aborted()) return { status: 'cancelled' }
  if (ingest.failed) {
    console.error('[omnimux-browser] asset ingest failed after validation', ingest.error)
    return { status: 'storage-failed' }
  }
  if (!isIngestReceipt(ingest.result)) {
    console.error('[omnimux-browser] asset ingest returned a malformed receipt', ingest.result)
    return { status: 'storage-failed' }
  }
  return ingest.result
}
