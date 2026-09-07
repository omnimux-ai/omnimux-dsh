/** OmniMux catalog defaults and response envelopes. Not a second HTTP client. */

export const TASK_PATH = Object.freeze({
  video: 'video/generations',
  image: 'images/generations',
  audio: 'audio/generations',
})

/** Text-to-speech returns audio bytes synchronously, without a task handle. */
export const SPEECH_PATH = 'audio/speech'

/** Speech-to-text is synchronous: one multipart POST, no task poll. */
export const TRANSCRIPTION_PATH = 'audio/transcriptions'

/**
 * Catalog ids whose video-class operation is digital_human (talking-head).
 * Unlike generic video generation, these REQUIRE a driving audio track.
 */
export const DIGITAL_HUMAN_MODEL_IDS = Object.freeze(['kling-avatar'])

/**
 * @param {unknown} modelId
 * @returns {boolean}
 */
export function isDigitalHumanModel(modelId) {
  const id = typeof modelId === 'string' ? modelId.trim().toLowerCase() : ''
  return DIGITAL_HUMAN_MODEL_IDS.includes(id)
}

/**
 * Transcript text from an OmniMux / OpenAI-compat transcription envelope.
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function pickTranscriptionText(raw) {
  if (typeof raw === 'string') {
    const text = raw.trim()
    return text || undefined
  }
  if (!raw || typeof raw !== 'object') return undefined
  const row = /** @type {Record<string, unknown>} */ (raw)
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? /** @type {Record<string, unknown>} */ (row.data)
    : undefined
  const direct = row.text ?? row.transcript ?? row.transcription
    ?? data?.text ?? data?.transcript ?? data?.transcription
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  return undefined
}

/**
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function pickTaskId(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const row = /** @type {Record<string, unknown>} */ (raw)
  const data = row.data && typeof row.data === 'object'
    ? /** @type {Record<string, unknown>} */ (row.data)
    : undefined
  const id = row.task_id ?? row.taskId ?? row.id ?? data?.task_id ?? data?.taskId ?? data?.id
  return id == null ? undefined : String(id)
}

/**
 * First usable media URL from an OmniMux / OpenAI-compat envelope.
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function pickMediaUrl(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const row = /** @type {Record<string, unknown>} */ (raw)
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? /** @type {Record<string, unknown>} */ (row.data)
    : undefined
  const dataRows = Array.isArray(row.data) ? row.data : undefined
  const firstData = dataRows && dataRows[0] && typeof dataRows[0] === 'object'
    ? /** @type {Record<string, unknown>} */ (dataRows[0])
    : undefined
  const direct = row.videoUrl ?? row.video_url ?? row.imageUrl ?? row.image_url
    ?? row.audioUrl ?? row.audio_url
    ?? row.url ?? row.result_url
    ?? data?.videoUrl ?? data?.video_url ?? data?.imageUrl ?? data?.image_url
    ?? data?.audioUrl ?? data?.audio_url
    ?? data?.url ?? data?.result_url
    ?? firstData?.url
  if (typeof direct === 'string' && direct) return direct
  const b64 = firstData?.b64_json ?? row.b64_json ?? data?.b64_json
  if (typeof b64 === 'string' && b64.trim()) return `data:image/png;base64,${b64.trim()}`
  const list = row.videoUrls ?? row.video_urls ?? row.imageUrls ?? row.image_urls
    ?? row.audioUrls ?? row.audio_urls
    ?? row.images ?? data?.videoUrls ?? data?.video_urls ?? data?.imageUrls ?? data?.images
    ?? data?.audioUrls ?? data?.audio_urls
  if (Array.isArray(list) && typeof list[0] === 'string') return list[0]
  const outputs = row.outputs
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (item && typeof item === 'object' && typeof item.url === 'string') return item.url
    }
  }
  return undefined
}

/** @deprecated use pickMediaUrl */
export const pickVideoUrl = pickMediaUrl

/**
 * @param {unknown} raw
 */
export function pickTaskStatus(raw) {
  if (!raw || typeof raw !== 'object') return ''
  const row = /** @type {Record<string, unknown>} */ (raw)
  const data = row.data && typeof row.data === 'object'
    ? /** @type {Record<string, unknown>} */ (row.data)
    : undefined
  return String(row.status ?? data?.status ?? '').toLowerCase()
}

/**
 * Map a capability request onto the OmniMux OpenAI-compat body.
 * When `guardPlan.vendorPayload` is present (SubmitGuard #468), prefer that
 * profile-constrained body and only fill gaps from legacy heuristics.
 * @param {string} capability
 * @param {{
 *   prompt: string,
 *   model?: string,
 *   duration?: number,
 *   image?: string,
 *   speech?: string,
 *   audio?: string,
 *   references?: Array<{ role?: string, type: string, pathOrUrl: string, [key: string]: unknown }>,
 *   audioTrack?: { role?: string, type: string, pathOrUrl: string, [key: string]: unknown },
 *   voice?: string,
 *   style?: string,
 *   instrumental?: boolean,
 *   speed?: number,
 *   format?: string,
 *   aspectRatio?: string,
 *   resolution?: string,
 *   operation?: string,
 *   guardPlan?: { vendorPayload?: Record<string, unknown>, operationId?: string, profileId?: string, modelId?: string },
 * }} request
 */
export function mapOmnimuxInput(capability, request) {
  // Profile-validated payload from SubmitGuard — fail-closed shape already enforced.
  if (request.guardPlan?.vendorPayload && typeof request.guardPlan.vendorPayload === 'object') {
    const fromGuard = { ...request.guardPlan.vendorPayload }
    // Ensure model wire id is not injected here (protocol layer owns model).
    if (fromGuard.prompt === undefined && fromGuard.input === undefined && request.prompt) fromGuard.prompt = request.prompt
    return fromGuard
  }

  if (capability === 'audio' && (request.operation === 'text_to_speech' || request.model === 'seed-audio-1.0')) {
    const speech = { input: request.prompt }
    if (request.voice !== undefined) speech.voice = request.voice
    if (request.speed !== undefined) speech.speed = request.speed
    if (request.format !== undefined) speech.response_format = request.format
    return speech
  }

  const input = { prompt: request.prompt }
  if (request.duration) input.duration = request.duration

  if (capability === 'video') {
    // 视频请求：画幅/分辨率透传；上游网关对 video 结构体启用了 DisallowUnknownFields，
    // 只允许 image / image_tail / reference_images 等已知字段，绝不能注入
    // images/references/audioTrack（#429）。last_frame wire 证据见 #566：image_tail。
    if (request.aspectRatio) input.aspect_ratio = request.aspectRatio
    if (request.resolution) input.resolution = request.resolution

    const references = Array.isArray(request.references) ? request.references : []
    /** @type {Array<{ role?: string, type: string, pathOrUrl: string, [key: string]: unknown }>} */
    const imageRefs = references.filter(
      (r) => r && r.type === 'image' && typeof r.pathOrUrl === 'string' && r.pathOrUrl,
    )
    const firstFrameRef = imageRefs.find((r) => r.role === 'first_frame')
    const lastFrameRef = imageRefs.find((r) => r.role === 'last_frame')
    // Generic refs only — last_frame must never collapse into reference_images (#566).
    const otherImageUrls = []
    const seenOther = new Set()
    for (const ref of imageRefs) {
      if (ref.role === 'first_frame' || ref.role === 'last_frame') continue
      if (seenOther.has(ref.pathOrUrl)) continue
      seenOther.add(ref.pathOrUrl)
      otherImageUrls.push(ref.pathOrUrl)
    }

    if (firstFrameRef || lastFrameRef) {
      // Frame roles are independent: first → image, last → image_tail.
      // Tail never overwrites first; tail never enters reference_images.
      // Extra generic refs are dropped in frame mode (same exclusivity as #429 first_frame).
      if (firstFrameRef) {
        input.image = firstFrameRef.pathOrUrl
      } else if (request.image) {
        // only-last + legacy request.image still maps first slot without inventing a fake ref
        input.image = request.image
      }
      if (lastFrameRef) {
        input.image_tail = lastFrameRef.pathOrUrl
      }
    } else if (otherImageUrls.length > 0) {
      // 参考图模式：用 reference_images 数组（每项 { url }）
      input.reference_images = otherImageUrls.map((url) => ({ url }))
    } else if (request.image) {
      input.image = request.image
    }
    // digital_human（如 kling-avatar）：audioTrack 是驱动音频，属于该模型契约的
    // 已知字段，必须透传（#538）。普通 video 模型仍严禁携带 audioTrack（#429），
    // 网关 Go 结构体 DisallowUnknownFields 会 400。
    if (isDigitalHumanModel(request.model) && request.audioTrack && request.audioTrack.pathOrUrl) {
      input.audioTrack = request.audioTrack
    }
    // 严禁向 video 注入 images/references/metadata（#429/#432）。
    // 网关 Go 结构体 DisallowUnknownFields，metadata 会 400。
    return input
  } else {
    // 非 video（image/audio）保持现存的向后兼容逻辑不变
    if (request.image) input.image = request.image
    if (Array.isArray(request.references) && request.references.length > 0) {
      input.references = request.references
      const imageRefs = request.references
        .filter((r) => r && r.type === 'image' && r.pathOrUrl)
        .map((r) => r.pathOrUrl)
      if (imageRefs.length > 0) {
        input.images = imageRefs
        if (!input.image) {
          input.image = imageRefs[0]
        }
      }
    }
    if (request.audioTrack) {
      input.audioTrack = request.audioTrack
    }
  }
  /** @type {Record<string, unknown>} */
  const metadata = {}
  if (typeof request.speech === 'string' && request.speech.trim()) metadata.speech = request.speech.trim()
  if (typeof request.audio === 'string' && request.audio.trim()) metadata.audio = request.audio.trim()
  if (typeof request.voice === 'string' && request.voice.trim()) metadata.voice = request.voice.trim()
  if (typeof request.style === 'string' && request.style.trim()) metadata.style = request.style.trim()
  if (request.instrumental !== undefined) metadata.instrumental = Boolean(request.instrumental)
  if (request.speed !== undefined) metadata.speed = request.speed
  if (Object.keys(metadata).length > 0) input.metadata = metadata
  return input
}
