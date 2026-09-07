/** Profile-driven vendor payload mapping from validated logical requests. */
import { GUARD_CODES } from './codes.js'
import { collectMappedBindings } from './map-bindings.js'
import { assertVendorBodyAllowed } from './map-contract.js'
export { DEFAULT_PROFILE_PAYLOADS, resolveProfilePayloadContract, assertVendorBodyAllowed } from './map-contract.js'

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
        vendor.image = urls[0]
        logical.image = urls[0]
        if (urls.length > 1) {
          vendor.images = urls
          vendor.references = urls.map((pathOrUrl) => ({ type: 'image', role: 'reference', pathOrUrl }))
          logical.references = vendor.references
        }
      }
    }
  } else if (profileId === 'speechToText') {
    const audioUrl = sources[0] || audioTracks[0] || genericAudio[0]
    if (audioUrl) {
      logical.audio = audioUrl
      vendor.file = audioUrl
    }
  } else if (profileId === 'textComplete') {
    if (genericImages.length || references.length || firstFrames.length) {
      logical.image = firstFrames[0] || references[0] || genericImages[0]
    }
    if (genericVideo.length) logical.video = genericVideo[0]
  }

  // Extras have passed the effective model + operation parameter contract.
  if (typeof extras.duration === 'number' && (extras.duration > 0 || extras.duration === -1)) {
    vendor.duration = extras.duration
    logical.duration = extras.duration
  }
  if (typeof extras.aspectRatio === 'string' && extras.aspectRatio) {
    if (profileId === 'videoGenerate' || profileId === 'videoDigitalHuman') {
      const useAspectRatio = args.modelId === 'minimax-h3' || args.modelId === 'grok-imagine-video-1-5'
      vendor[useAspectRatio ? 'aspect_ratio' : 'size'] = extras.aspectRatio
    }
    logical.aspectRatio = extras.aspectRatio
  }
  if (typeof extras.resolution === 'string' && extras.resolution) {
    if (profileId === 'videoGenerate' || profileId === 'videoDigitalHuman') vendor.resolution = extras.resolution
    logical.resolution = extras.resolution
  }
  if (profileId === 'videoGenerate') {
    if (typeof extras.sound === 'boolean') {
      vendor[args.modelId === 'wan-3.0' ? 'audio' : 'generate_audio'] = extras.sound
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
  return { ok: true, vendorPayload: vendor, logicalPayload: logical }
}
