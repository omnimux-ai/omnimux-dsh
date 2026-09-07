import { normalizeLogicalRequest } from '../catalog/contract/submit-guard/index.js'
import { probeTextImage } from '../text/image.js'
import { probeTextVideo } from '../text/video.js'
import { probeRemoteDocument } from '../text/document.js'
import { durationFromAudioBytes, loadAudioBytes } from './stt.js'

const MAX_PROBED_IMAGE_BYTES = 50 * 1024 * 1024
const MAX_PROBED_VIDEO_BYTES = 200 * 1024 * 1024
const MAX_PROBED_DOCUMENT_BYTES = 100 * 1024 * 1024

/**
 * Ignore caller-provided media metadata and derive every guard asset from its
 * bytes. A reference with an unknown type deliberately reaches the guard
 * without MIME/size metadata, where any restricted slot rejects it.
 * @param {Record<string, unknown>} input
 * @param {{ capability?: string, seam?: string }} [context]
 */
export async function probeMediaAssets(input, context = {}) {
  const capability = typeof context.capability === 'string' ? context.capability : undefined
  const seam = typeof context.seam === 'string' ? context.seam : undefined
  const topImage = typeof input.image === 'string' ? input.image.trim() : ''
  const topImageIsExplicitReference = topImage && (
    Array.isArray(input.references)
      ? input.references.some((reference) => {
        if (!reference || typeof reference !== 'object') return false
        const row = /** @type {Record<string, unknown>} */ (reference)
        return typeof row.pathOrUrl === 'string' && row.pathOrUrl.trim() === topImage
      })
      : false
  )
  const normalized = normalizeLogicalRequest({
    ...input,
    // A workflow often repeats its leading explicit reference in `image`.
    // Omit only that shorthand before normalization so a first_frame supplied
    // by `references` remains an explicit asset rather than being filtered.
    image: topImageIsExplicitReference ? undefined : input.image,
    assetMeta: {},
    metadata: undefined,
    imageMeta: undefined,
    imageTailMeta: undefined,
    audioMeta: undefined,
    // This boundary owns capability semantics. Mounted callers must not be
    // able to turn video shorthand into a generic reference.
    capability,
    seam,
  })
  return Promise.all(normalized.assets.map(async (asset) => {
    const identity = {
      type: asset.type,
      pathOrUrl: asset.pathOrUrl,
      ...(asset.role ? { role: asset.role } : {}),
      ...(asset.targetSlot ? { targetSlot: asset.targetSlot } : {}),
    }
    if (asset.type === 'image') {
      const image = await probeTextImage(asset.pathOrUrl, {
        attachments: { imageLimits: { maxImageBytes: MAX_PROBED_IMAGE_BYTES } },
        fetcher: input.fetcher,
        signal: input.signal,
      })
      return { ...identity, mime: image.mediaType, sizeBytes: image.sizeBytes }
    }
    if (asset.type === 'video') {
      const video = await probeTextVideo(asset.pathOrUrl, {
        maxVideoBytes: MAX_PROBED_VIDEO_BYTES,
        fetcher: input.fetcher,
        signal: input.signal,
      })
      return {
        ...identity,
        mime: video.mediaType,
        sizeBytes: video.sizeBytes,
        ...(video.durationSec !== undefined ? { durationSec: video.durationSec } : {}),
      }
    }
    if (asset.type === 'audio') {
      const audio = await loadAudioBytes(asset.pathOrUrl, {
        fetcher: input.fetcher,
        signal: input.signal,
      })
      const durationSec = durationFromAudioBytes(audio.bytes, audio.contentType)
      return {
        ...identity,
        mime: audio.contentType === 'audio/mpeg' ? 'audio/mp3' : audio.contentType,
        sizeBytes: audio.bytes.byteLength,
        ...(durationSec !== undefined ? { durationSec } : {}),
      }
    }
    if (asset.type === 'document' && (asset.role === 'document' || asset.targetSlot === 'file_url')) {
      const document = await probeRemoteDocument(asset.pathOrUrl, {
        maxDocumentBytes: MAX_PROBED_DOCUMENT_BYTES,
        fetcher: input.fetcher,
        signal: input.signal,
      })
      return { ...identity, mime: document.mime, sizeBytes: document.sizeBytes }
    }
    return identity
  }))
}
