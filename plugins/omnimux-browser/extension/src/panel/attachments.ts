/** Multimodal image intake and durable attachment wire helpers. */

export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export type ImageMediaType = typeof IMAGE_MEDIA_TYPES[number]

export interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  maxImageDimension: number
  mediaTypes: readonly ImageMediaType[]
}

export interface ImageAttachmentRef {
  attachmentId: string
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  name?: string
}

export interface DraftImage {
  id: string
  mediaType: ImageMediaType
  data: string
  bytes: number
  width: number
  height: number
  name?: string
}

/**
 * A durable media reference the gallery can render.
 *
 * The host attachment protocol still admits images only (`IMAGE_MEDIA_TYPES`),
 * so `Row.images` is an `ImageAttachmentRef`; video is the already-supported
 * rendering path for references that reach the panel with a `video/*` type.
 */
export interface MediaAttachmentRef extends Omit<ImageAttachmentRef, 'mediaType'> {
  mediaType: string
}

/** A conservative `type/subtype` shape, so a type may never inject a data-URL delimiter. */
const MEDIA_TYPE_PATTERN = /^(?:image|video)\/[a-z0-9][a-z0-9.+-]*$/

/** Uppercase format badge for a media type, e.g. `image/jpeg` → `JPG`. */
const FORMAT_TAGS: Record<string, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WEBP',
  gif: 'GIF',
  mp4: 'MP4',
  webm: 'WEBM',
  quicktime: 'MOV',
}

export type PromptContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: ImageMediaType; data: string; name?: string }

export type ImageInputErrorCode =
  | 'unsupported-type'
  | 'too-many'
  | 'image-too-large'
  | 'message-too-large'
  | 'dimension-too-large'
  | 'too-many-pixels'
  | 'decode-failed'

export class ImageInputError extends Error {
  constructor(
    readonly code: ImageInputErrorCode,
    readonly imageName?: string,
    readonly limit?: number,
  ) {
    super(code)
    this.name = 'ImageInputError'
  }
}

type MeasureImage = (file: File) => Promise<{ width: number; height: number }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function isImageMediaType(value: unknown): value is ImageMediaType {
  return typeof value === 'string' && (IMAGE_MEDIA_TYPES as readonly string[]).includes(value)
}

/** Parse the host-owned `imageLimits` projection without trusting mux/history data. */
export function parseImageAttachmentLimits(value: unknown): ImageAttachmentLimits | null {
  if (!isRecord(value)
    || !isPositiveInteger(value.maxImageBytes)
    || !isPositiveInteger(value.maxImagesPerMessage)
    || !isPositiveInteger(value.maxMessageImageBytes)
    || !isPositiveInteger(value.maxImagePixels)
    || !isPositiveInteger(value.maxImageDimension)
    || !Array.isArray(value.mediaTypes)
    || value.mediaTypes.length === 0
    || !value.mediaTypes.every(isImageMediaType)) return null
  return {
    maxImageBytes: value.maxImageBytes,
    maxImagesPerMessage: value.maxImagesPerMessage,
    maxMessageImageBytes: value.maxMessageImageBytes,
    maxImagePixels: value.maxImagePixels,
    maxImageDimension: value.maxImageDimension,
    mediaTypes: [...new Set(value.mediaTypes)],
  }
}

/** Parse a durable image reference embedded in a user/assistant content block. */
export function parseImageAttachmentRef(value: unknown): ImageAttachmentRef | null {
  if (!isRecord(value)
    || typeof value.attachmentId !== 'string'
    || value.attachmentId === ''
    || !isImageMediaType(value.mediaType)
    || !isPositiveInteger(value.bytes)
    || !isPositiveInteger(value.width)
    || !isPositiveInteger(value.height)
    || (value.name !== undefined && typeof value.name !== 'string')) return null
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...(value.name === undefined ? {} : { name: value.name }),
  }
}

export function imageRefsFromBlocks(blocks: unknown): ImageAttachmentRef[] {
  if (!Array.isArray(blocks)) return []
  const images: ImageAttachmentRef[] = []
  for (const block of blocks) {
    if (!isRecord(block) || block.type !== 'image') continue
    const attachment = parseImageAttachmentRef(block.attachment)
    if (attachment !== null) images.push(attachment)
  }
  return images
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result))
      else reject(new Error('file read failed'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'))
    reader.readAsArrayBuffer(file)
  })
}

async function measureImage(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    try {
      return { width: bitmap.width, height: bitmap.height }
    } finally {
      bitmap.close()
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('image decode failed'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Validate against the exact host projection, then encode browser files for `session.prompt`. */
export async function prepareImageFiles(
  files: readonly File[],
  current: readonly DraftImage[],
  limits: ImageAttachmentLimits,
  measure: MeasureImage = measureImage,
): Promise<DraftImage[]> {
  if (current.length + files.length > limits.maxImagesPerMessage) {
    throw new ImageInputError('too-many', undefined, limits.maxImagesPerMessage)
  }
  let totalBytes = current.reduce((total, image) => total + image.bytes, 0)
  for (const file of files) {
    const mediaType = file.type
    if (!isImageMediaType(mediaType) || !limits.mediaTypes.includes(mediaType)) {
      throw new ImageInputError('unsupported-type', file.name)
    }
    if (file.size > limits.maxImageBytes) {
      throw new ImageInputError('image-too-large', file.name, limits.maxImageBytes)
    }
    totalBytes += file.size
    if (totalBytes > limits.maxMessageImageBytes) {
      throw new ImageInputError('message-too-large', undefined, limits.maxMessageImageBytes)
    }
  }

  const prepared: DraftImage[] = []
  for (const file of files) {
    const mediaType = file.type
    if (!isImageMediaType(mediaType)) throw new ImageInputError('unsupported-type', file.name)
    let dimensions: { width: number; height: number }
    try {
      dimensions = await measure(file)
    } catch {
      throw new ImageInputError('decode-failed', file.name)
    }
    const { width, height } = dimensions
    if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
      throw new ImageInputError('decode-failed', file.name)
    }
    if (width > limits.maxImageDimension || height > limits.maxImageDimension) {
      throw new ImageInputError('dimension-too-large', file.name, limits.maxImageDimension)
    }
    if (width * height > limits.maxImagePixels) {
      throw new ImageInputError('too-many-pixels', file.name, limits.maxImagePixels)
    }
    const data = bytesToBase64(await readFileBytes(file))
    prepared.push({
      id: crypto.randomUUID(),
      mediaType,
      data,
      bytes: file.size,
      width,
      height,
      ...(file.name === '' ? {} : { name: file.name }),
    })
  }
  return prepared
}

export function draftImageDataUrl(image: DraftImage): string {
  return `data:${image.mediaType};base64,${image.data}`
}

/** Serialize the side-panel draft to the exact dsh `session.prompt` union. */
export function promptContent(text: string, images: readonly DraftImage[]): PromptContentPart[] {
  const content: PromptContentPart[] = []
  if (text !== '') content.push({ type: 'text', text })
  content.push(...images.map((image) => ({
    type: 'image' as const,
    mediaType: image.mediaType,
    data: image.data,
    ...(image.name === undefined ? {} : { name: image.name }),
  })))
  return content
}

/** Validate a `session.attachment` response before putting it in an img src. */
export function attachmentResponseDataUrl(value: unknown, expected: ImageAttachmentRef): string | null {
  if (!isRecord(value) || typeof value.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) return null
  const attachment = parseImageAttachmentRef(value.attachment)
  if (attachment === null
    || attachment.attachmentId !== expected.attachmentId
    || attachment.mediaType !== expected.mediaType) return null
  return `data:${attachment.mediaType};base64,${value.data}`
}

/** Whether a durable media reference should render as a `<video>`. */
export function isVideoMediaType(mediaType: string): boolean {
  return mediaType.startsWith('video/') && MEDIA_TYPE_PATTERN.test(mediaType)
}

/** Short uppercase badge for a media type (`image/jpeg` → `JPG`, `video/mp4` → `MP4`). */
export function mediaFormatTag(mediaType: string): string {
  const subtype = mediaType.slice(mediaType.indexOf('/') + 1).toLowerCase()
  return FORMAT_TAGS[subtype] ?? subtype.toUpperCase()
}

function parseMediaAttachmentRef(value: unknown): MediaAttachmentRef | null {
  if (!isRecord(value)
    || typeof value.attachmentId !== 'string'
    || value.attachmentId === ''
    || typeof value.mediaType !== 'string'
    || !MEDIA_TYPE_PATTERN.test(value.mediaType)
    || !isPositiveInteger(value.bytes)
    || !isPositiveInteger(value.width)
    || !isPositiveInteger(value.height)
    || (value.name !== undefined && typeof value.name !== 'string')) return null
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...(value.name === undefined ? {} : { name: value.name }),
  }
}

/**
 * Validate a `session.attachment` response before putting it in a media `src`.
 *
 * Same contract as {@link attachmentResponseDataUrl}, widened to the video
 * references the gallery renders.
 */
export function mediaResponseDataUrl(value: unknown, expected: MediaAttachmentRef): string | null {
  if (!isRecord(value) || typeof value.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) return null
  const attachment = parseMediaAttachmentRef(value.attachment)
  if (attachment === null
    || attachment.attachmentId !== expected.attachmentId
    || attachment.mediaType !== expected.mediaType) return null
  return `data:${attachment.mediaType};base64,${value.data}`
}

export function browserTimeZone(): string | undefined {
  try {
    const value = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}
