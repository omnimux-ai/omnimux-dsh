/** Profile-driven vendor payload mapping from validated logical requests. */
import { GUARD_CODES } from './codes.js'
import { collectMappedBindings } from './map-bindings.js'
import { assertVendorBodyAllowed } from './map-contract.js'
export { DEFAULT_PROFILE_PAYLOADS, resolveProfilePayloadContract, assertVendorBodyAllowed } from './map-contract.js'

/**
 * OpenAI DALL-E 3 size mapping matrix.
 *
 * Matrix specification:
 * - 1:1 + 1K ➜ size: "1024x1024"
 * - 1:1 + 2K ➜ size: "1024x1024", quality: "hd" (若未指定)
 * - 16:9 + 1K/2K ➜ size: "1792x1024"
 * - 9:16 + 1K/2K ➜ size: "1024x1792"
 * - 横屏聚类（4:3、21:9 等）➜ size: "1792x1024"
 * - 竖屏聚类（3:4、2:3 等）➜ size: "1024x1792"
 * - auto ➜ size: "1792x1024"
 *
 * @param {string} [aspectRatio]
 * @param {string} [resolution]
 * @returns {{ size: string, quality?: string }}
 */
export function mapOpenAiImageSize(aspectRatio = '16:9', resolution = '2K') {
  const ratio = typeof aspectRatio === 'string' && aspectRatio.trim() ? aspectRatio.trim() : '16:9'
  const res = typeof resolution === 'string' && resolution.trim() ? resolution.trim().toUpperCase() : '2K'

  if (res === '4K') {
    if (ratio === '1:1') {
      return { size: '2048x2048', quality: 'hd' }
    }
    if (ratio === '9:16' || ratio === '3:4' || ratio === '2:3' || ratio === '4:5') {
      return { size: '2160x3840', quality: 'hd' }
    }
    if (ratio === '16:9' || ratio === '4:3' || ratio === '3:2' || ratio === '21:9' || ratio === 'auto') {
      return { size: '3840x2160', quality: 'hd' }
    }
    const parts = ratio.split(':')
    if (parts.length === 2) {
      const w = parseFloat(parts[0])
      const h = parseFloat(parts[1])
      if (!Number.isNaN(w) && !Number.isNaN(h) && h > 0) {
        if (w < h) return { size: '2160x3840', quality: 'hd' }
        if (w > h) return { size: '3840x2160', quality: 'hd' }
        return { size: '2048x2048', quality: 'hd' }
      }
    }
    return { size: '3840x2160', quality: 'hd' }
  }

  if (ratio === '1:1') {
    return {
      size: '1024x1024',
      ...(res === '2K' ? { quality: 'hd' } : {}),
    }
  }

  // 竖屏聚类：9:16, 3:4, 2:3, etc.
  if (ratio === '9:16' || ratio === '3:4' || ratio === '2:3' || ratio === '4:5') {
    return { size: '1024x1792' }
  }

  // 横屏聚类：16:9, 4:3, 3:2, 21:9, auto, etc.
  if (ratio === '16:9' || ratio === '4:3' || ratio === '3:2' || ratio === '21:9' || ratio === 'auto') {
    return { size: '1792x1024' }
  }

  // 兜底：按比例高宽比判断或默认横屏
  const parts = ratio.split(':')
  if (parts.length === 2) {
    const w = parseFloat(parts[0])
    const h = parseFloat(parts[1])
    if (!Number.isNaN(w) && !Number.isNaN(h) && h > 0) {
      if (w < h) {
        return { size: '1024x1792' }
      }
      if (w > h) {
        return { size: '1792x1024' }
      }
      return {
        size: '1024x1024',
        ...(res === '2K' ? { quality: 'hd' } : {}),
      }
    }
  }

  return { size: '1792x1024' }
}

/**
 * @param {{
 *   operation: object,
 *   profile: object,
 *   modelId: string,
 *   prompt: string,
 *   bindings: Array<{ slot: string, role?: string, type: string, pathOrUrl: string, asset: object }>,
 *   bySlot: Map<string, object[]>,
 *   extras?: Record<string, unknown>,
 * }} args
 */
export function mapValidatedPlanToVendor(args) {
  const { profile } = args
  const profileId = profile.id
  const opId = args.operation.id
  const speech = profileId === 'audioGenerate' && opId === 'text_to_speech'
  /** @type {Record<string, unknown>} */
  let vendor = {}
  /** @type {Record<string, unknown>} */
  const logical = {}
  let targetModelId
  const prompt = typeof args.prompt === 'string' ? args.prompt : ''
  if (prompt && profileId !== 'speechToText') {
    vendor[speech ? 'input' : 'prompt'] = prompt
    logical.prompt = prompt
  }
  const extras = args.extras && typeof args.extras === 'object' ? args.extras : {}
  const {
    firstFrames, lastFrames, references, audioTracks, sources,
    genericImages, genericAudio, genericVideo, sourceVideos,
    referenceVideos, referenceAudios, documentUrls, webpageUrls,
  } = collectMappedBindings(args.bindings, args.bySlot)

  if (profileId === 'videoGenerate' || profile.seam === 'videoGenerate' && profileId !== 'videoDigitalHuman') {
    // Cloud adapters consume the canonical operation, not upstream providers.
    vendor.operation = opId
    logical.operation = opId
    if (opId === 'first_frame' || opId === 'first_last_frame' || opId === 'end_frame') {
      const rows = []
      if (opId !== 'end_frame' && firstFrames[0]) rows.push({ url: firstFrames[0], role: 'first_frame' })
      if ((opId === 'end_frame' || opId === 'first_last_frame') && lastFrames[0]) {
        rows.push({ url: lastFrames[0], role: 'last_frame' })
      }
      if (rows.length) vendor.image_with_roles = rows
    } else if (opId === 'video_multi_ref' || opId === 'video_edit') {
      const images = references.length ? references : genericImages
      const videos = opId === 'video_edit' ? [...sourceVideos, ...referenceVideos] : referenceVideos
      if (images.length) vendor.image_urls = [...images]
      if (videos.length) vendor.video_urls = [...videos]
      if (referenceAudios.length) vendor.audio_urls = [...referenceAudios]
    } else if (opId === 'video_extend') {
      const images = references.length ? references : genericImages
      if (images.length) vendor.image_urls = [...images]
      if (sourceVideos.length) vendor.video_urls = [...sourceVideos]
      if (referenceAudios.length) vendor.audio_urls = [...referenceAudios]
    } else if (opId === 'document_to_video') {
      if (documentUrls[0]) vendor.file_url = documentUrls[0]
    } else if (opId === 'webpage_to_video') {
      if (webpageUrls[0]) vendor.link_url = webpageUrls[0]
    }
    if ((args.bindings ?? []).length > 0) {
      logical.references = args.bindings.map((binding) => ({
        type: binding.type, role: binding.role || binding.asset?.role,
        slot: binding.slot, pathOrUrl: binding.pathOrUrl,
      }))
    }
  } else if (profileId === 'videoDigitalHuman') {
    const img = firstFrames[0] || genericImages[0] || references[0]
    if (img) {
      vendor.image = img
      logical.image = img
    }
    const audioUrl = audioTracks[0] || genericAudio[0]
    if (audioUrl) {
      vendor.audioTrack = { role: 'audio_track', type: 'audio', pathOrUrl: audioUrl }
      logical.audioTrack = vendor.audioTrack
    }
  } else if (profileId === 'imageGenerate') {
    if (genericImages.length || references.length || firstFrames.length) {
      const urls = [...firstFrames, ...references, ...genericImages].filter((u, i, a) => a.indexOf(u) === i)
      if (urls.length) {
        const family = args.family || args.model?.family
        const isSeedream = family === 'seedream' || String(args.modelId ?? '').startsWith('seedream')
        const isOpenAi = family === 'openai' || args.model?.family === 'openai' || String(args.modelId ?? '').startsWith('gpt-image')
        const isGrok = family === 'grok' || String(args.modelId ?? '').startsWith('grok')

        logical.image = urls[0]
        if (urls.length > 1) {
          logical.references = urls.map((pathOrUrl) => ({ type: 'image', role: 'reference', pathOrUrl }))
        }

        if (isOpenAi) {
          vendor.image = urls[0]
        } else if (isSeedream) {
          vendor.image = urls[0]
          vendor.image_urls = urls
        } else if (isGrok) {
          vendor.image = urls[0]
          if (urls.length > 1) {
            vendor.images = urls
          }
        } else {
          vendor.image = urls[0]
          if (urls.length > 1) {
            vendor.images = urls
            vendor.references = urls.map((pathOrUrl) => ({ type: 'image', role: 'reference', pathOrUrl }))
          }
        }
      }
    }
  } else if (profileId === 'speechToText') {
    const audioUrl = sources[0] || audioTracks[0] || genericAudio[0]
    if (audioUrl) {
      logical.audio = audioUrl
      vendor.file = audioUrl
      if (args.modelId === 'doubao-asr-bigmodel' || String(args.modelId ?? '').startsWith('doubao-asr')) {
        vendor.url = audioUrl
        vendor.audio_url = audioUrl
      }
    }
  } else if (profileId === 'textComplete') {
    if (genericImages.length || references.length || firstFrames.length) {
      logical.image = firstFrames[0] || references[0] || genericImages[0]
    }
    if (genericVideo.length) logical.video = genericVideo[0]
  }

  // Extras have passed the effective model + operation parameter contract.
  if (profileId === 'imageGenerate') {
    const isOpneAi = args.family === 'openai'
      || args.model?.family === 'openai'
      || String(args.modelId ?? '').startsWith('gpt-image')

    if (isOpneAi) {
      const openAiMapped = mapOpenAiImageSize(extras.aspectRatio, extras.resolution)
      vendor.size = openAiMapped.size

      if (args.userSpecifiedQuality && typeof extras.quality === 'string' && extras.quality) {
        vendor.quality = extras.quality
        logical.quality = extras.quality
      } else if (openAiMapped.quality) {
        vendor.quality = openAiMapped.quality
        logical.quality = openAiMapped.quality
      } else if (typeof extras.quality === 'string' && extras.quality) {
        vendor.quality = extras.quality
        logical.quality = extras.quality
      }

      if (typeof extras.aspectRatio === 'string' && extras.aspectRatio) {
        logical.aspectRatio = extras.aspectRatio
      }
      if (typeof extras.resolution === 'string' && extras.resolution) {
        logical.resolution = extras.resolution
      }
      // 严禁向 vendor 注入 aspect_ratio
    } else {
      if (typeof extras.aspectRatio === 'string' && extras.aspectRatio) {
        vendor.aspect_ratio = extras.aspectRatio
        logical.aspectRatio = extras.aspectRatio
      }
      if (typeof extras.resolution === 'string' && extras.resolution) {
        vendor.resolution = extras.resolution
        logical.resolution = extras.resolution
      }
      if (typeof extras.quality === 'string' && extras.quality) {
        vendor.quality = extras.quality
        logical.quality = extras.quality
      }
    }

    if (typeof extras.n === 'number' && extras.n > 0) {
      vendor.n = extras.n
      logical.n = extras.n
    }
  }

  if (typeof extras.duration === 'number' && (extras.duration > 0 || extras.duration === -1)) {
    vendor.duration = extras.duration
    logical.duration = extras.duration
  }
  if (typeof extras.aspectRatio === 'string' && extras.aspectRatio) {
    if (profileId === 'videoGenerate' || profileId === 'videoDigitalHuman') {
      const isKling = args.family === 'kling' || args.model?.family === 'kling' || String(args.modelId ?? '').startsWith('kling')
      const useAspectRatio = isKling || args.modelId.startsWith('minimax-h3') || args.modelId === 'grok-imagine-video-1-5'
      vendor[useAspectRatio ? 'aspect_ratio' : 'size'] = extras.aspectRatio
      if (isKling) {
        vendor.metadata = { ...(vendor.metadata || {}), aspect_ratio: extras.aspectRatio }
      }
    }
    logical.aspectRatio = extras.aspectRatio
  }
  if (typeof extras.resolution === 'string' && extras.resolution) {
    if (profileId === 'videoGenerate' || profileId === 'videoDigitalHuman') {
      const isWan = args.modelId === 'wan-3.0' || args.family === 'wan' || args.model?.family === 'wan'
      vendor.resolution = isWan ? extras.resolution.toUpperCase() : extras.resolution
    }
    logical.resolution = extras.resolution
  }
  if (profileId === 'videoGenerate') {
    if (typeof extras.sound === 'boolean') {
      const isWan = args.modelId === 'wan-3.0' || args.family === 'wan' || args.model?.family === 'wan'
      vendor[isWan ? 'audio' : 'generate_audio'] = extras.sound
      logical.sound = extras.sound
    }
    if (typeof extras.seed === 'number' && Number.isInteger(extras.seed)) {
      vendor.seed = extras.seed
      logical.seed = extras.seed
    }
    if (typeof extras.watermark === 'boolean') {
      vendor.watermark = extras.watermark
      logical.watermark = extras.watermark
    }
    if (typeof extras.outputFormat === 'string' && extras.outputFormat) {
      vendor.output_format = extras.outputFormat
      logical.outputFormat = extras.outputFormat
    }
    if (typeof extras.referenceTaskType === 'string' && extras.referenceTaskType) {
      vendor.omni_reference_task_type = extras.referenceTaskType
      logical.referenceTaskType = extras.referenceTaskType
    }
    if (typeof extras.generationType === 'string' && extras.generationType) {
      vendor.generation_type = extras.generationType
      logical.generationType = extras.generationType
    }
    if (typeof extras.returnLastFrame === 'boolean') {
      vendor.return_last_frame = extras.returnLastFrame
      logical.returnLastFrame = extras.returnLastFrame
    }
    if (extras.webSearch === true) {
      vendor.tools = [{ type: 'web_search' }]
      logical.webSearch = true
    }
    if (typeof extras.nsfwCheck === 'boolean') {
      vendor.nsfw_check = extras.nsfwCheck
      logical.nsfwCheck = extras.nsfwCheck
    }
  }
  if (speech) {
    for (const key of ['voice', 'speed', 'format']) {
      if (extras[key] !== undefined && extras[key] !== null && extras[key] !== '') {
        vendor[key === 'format' ? 'response_format' : key] = extras[key]
        logical[key] = extras[key]
      }
    }
  } else if (profileId === 'audioGenerate' || profileId === 'imageGenerate') {
    if (args.modelId === 'suno' || opId === 'text_to_music') {
      for (const key of ['title', 'tags', 'style', 'duration']) {
        if (extras[key] !== undefined && extras[key] !== null && extras[key] !== '') {
          vendor[key] = extras[key]
          logical[key] = extras[key]
        }
      }
      if (typeof extras.instrumental === 'boolean') {
        vendor.instrumental = extras.instrumental
        logical.instrumental = extras.instrumental
      }
      if (args.modelId) {
        vendor.model = args.modelId
        logical.model = args.modelId
      }
    }
    if (typeof extras.format === 'string' && extras.format) {
      vendor.format = extras.format
      logical.format = extras.format
    }
    if (args.modelId !== 'suno' && opId !== 'text_to_music') {
      const metadata = {}
      for (const key of ['speech', 'audio', 'voice', 'style', 'instrumental', 'speed']) {
        if (extras[key] !== undefined && extras[key] !== null && extras[key] !== '') {
          metadata[key] = extras[key]
          logical[key] = extras[key]
        }
      }
      if (genericAudio[0] && metadata.audio === undefined) metadata.audio = genericAudio[0]
      if (Object.keys(metadata).length) vendor.metadata = metadata
    }
  }
  if (profileId === 'textComplete') {
    if (typeof extras.system === 'string' && extras.system) {
      vendor.system = extras.system
      logical.system = extras.system
    }
    if (typeof extras.maxTokens === 'number') {
      vendor.maxTokens = extras.maxTokens
      logical.maxTokens = extras.maxTokens
    }
  }
  if (profileId === 'speechToText') {
    vendor.model = args.modelId
    logical.model = args.modelId
    for (const key of ['language', 'response_format']) {
      if (typeof extras[key] === 'string' && extras[key]) {
        vendor[key] = extras[key]
        logical[key] = extras[key]
      }
    }
  }
  const checked = assertVendorBodyAllowed(vendor, profile, opId)
  if (!checked.ok) return checked
  vendor = checked.body

  const hasFrameFamily = Array.isArray(vendor.image_with_roles)
    && vendor.image_with_roles.some((row) => row?.role === 'first_frame' || row?.role === 'last_frame')
  const hasReferenceFamily = ['image_urls', 'video_urls', 'audio_urls', 'file_url', 'link_url']
    .some((field) => vendor[field] !== undefined)
  if (hasFrameFamily && hasReferenceFamily) {
    return { ok: false, code: GUARD_CODES.VENDOR_FIELD_FORBIDDEN, message: 'frame inputs and reference inputs must not coexist', profileId }
  }
  if (vendor.file_url !== undefined && vendor.link_url !== undefined) {
    return { ok: false, code: GUARD_CODES.VENDOR_FIELD_FORBIDDEN, message: 'file_url and link_url must not coexist', profileId }
  }
  return {
    ok: true,
    vendorPayload: vendor,
    logicalPayload: logical,
  }
}
