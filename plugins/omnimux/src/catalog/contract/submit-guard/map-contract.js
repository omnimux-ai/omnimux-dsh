import { GUARD_CODES } from './codes.js'

/** Profile JSON overrides these fallback payload contracts. */
export const DEFAULT_PROFILE_PAYLOADS = Object.freeze({
  textComplete: Object.freeze({
    logicalFields: Object.freeze(['prompt', 'system', 'maxTokens', 'image', 'video', 'references']),
    vendorFields: Object.freeze(['prompt', 'system', 'maxTokens', 'image', 'video', 'content']),
    unknownFieldPolicy: 'reject',
  }),
  imageGenerate: Object.freeze({
    logicalFields: Object.freeze(['prompt', 'image', 'references', 'duration', 'aspectRatio', 'resolution', 'quality']),
    vendorFields: Object.freeze(['prompt', 'image', 'images', 'references', 'duration', 'metadata', 'size', 'aspect_ratio', 'resolution', 'quality']),
    unknownFieldPolicy: 'reject',
  }),
  videoGenerate: Object.freeze({
    logicalFields: Object.freeze([
      'prompt', 'references', 'duration', 'aspectRatio', 'resolution', 'sound', 'seed',
      'watermark', 'outputFormat', 'referenceTaskType', 'generationType', 'returnLastFrame',
      'webSearch', 'nsfwCheck', 'fileUrl', 'linkUrl',
    ]),
    vendorFields: Object.freeze([
      'operation', 'prompt', 'image_with_roles', 'image_urls', 'video_urls', 'audio_urls',
      'file_url', 'link_url', 'duration', 'size', 'aspect_ratio', 'resolution', 'generate_audio',
      'audio', 'seed', 'watermark', 'output_format', 'omni_reference_task_type', 'generation_type',
      'return_last_frame', 'tools', 'nsfw_check',
    ]),
    forbiddenVendorFields: Object.freeze([
      'images', 'references', 'audioTrack', 'metadata', 'speech', 'voice', 'style',
      'image', 'image_tail', 'reference_images',
    ]),
    unknownFieldPolicy: 'reject',
  }),
  audioGenerate: Object.freeze({
    logicalFields: Object.freeze([
      'prompt', 'input', 'model', 'voice', 'style', 'instrumental', 'speed', 'speech',
      'audio', 'references', 'audioTrack', 'duration', 'format', 'response_format',
    ]),
    vendorFields: Object.freeze([
      'prompt', 'input', 'model', 'voice', 'speed', 'response_format', 'format',
      'duration', 'image', 'images', 'references', 'audioTrack', 'metadata',
    ]),
    unknownFieldPolicy: 'reject',
    operationVendorShapes: Object.freeze({
      text_to_speech: Object.freeze({
        allow: Object.freeze(['model', 'input', 'voice', 'speed', 'response_format']),
        require: Object.freeze(['input']),
      }),
    }),
  }),
  speechToText: Object.freeze({
    logicalFields: Object.freeze(['audio', 'language', 'model', 'response_format']),
    vendorFields: Object.freeze(['file', 'model', 'language', 'response_format']),
    unknownFieldPolicy: 'reject',
  }),
  videoDigitalHuman: Object.freeze({
    logicalFields: Object.freeze(['prompt', 'image', 'audioTrack', 'references', 'duration', 'aspectRatio', 'resolution']),
    vendorFields: Object.freeze(['prompt', 'image', 'audioTrack', 'duration', 'aspect_ratio', 'resolution']),
    forbiddenVendorFields: Object.freeze(['images', 'references', 'metadata', 'reference_images', 'image_tail']),
    unknownFieldPolicy: 'reject',
    operationVendorShapes: Object.freeze({
      digital_human: Object.freeze({
        allow: Object.freeze(['prompt', 'image', 'audioTrack', 'duration', 'aspect_ratio', 'resolution']),
        require: Object.freeze(['image', 'audioTrack']),
      }),
    }),
  }),
})

/** @param {object} profile */
export function resolveProfilePayloadContract(profile) {
  const defaults = DEFAULT_PROFILE_PAYLOADS[profile?.id] ?? {}
  return {
    logicalFields: Array.isArray(profile?.logicalFields) ? profile.logicalFields : defaults.logicalFields ?? [],
    vendorFields: Array.isArray(profile?.vendorFields) ? profile.vendorFields : defaults.vendorFields ?? [],
    forbiddenVendorFields: Array.isArray(profile?.forbiddenVendorFields)
      ? profile.forbiddenVendorFields : defaults.forbiddenVendorFields ?? [],
    unknownFieldPolicy: profile?.unknownFieldPolicy ?? defaults.unknownFieldPolicy ?? 'reject',
    operationVendorShapes: profile?.operationVendorShapes ?? defaults.operationVendorShapes ?? {},
  }
}

/**
 * Constrain the body by both the profile and its operation-specific shape.
 * @param {Record<string, unknown>} body
 * @param {object} profile
 * @param {string} [operationId]
 */
export function assertVendorBodyAllowed(body, profile, operationId) {
  const contract = resolveProfilePayloadContract(profile)
  const shape = operationId ? contract.operationVendorShapes?.[operationId] : null
  const allow = new Set(contract.vendorFields ?? [])
  const operationAllow = Array.isArray(shape?.allow) ? new Set(shape.allow) : null
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [field, value] of Object.entries(body ?? {})) {
    const forbidden = (contract.forbiddenVendorFields ?? []).includes(field)
    if (forbidden || (allow.size > 0 && !allow.has(field)) || (operationAllow && !operationAllow.has(field))) {
      if (!forbidden && contract.unknownFieldPolicy === 'drop') continue
      return {
        ok: false,
        code: GUARD_CODES.VENDOR_FIELD_FORBIDDEN,
        message: `vendor field "${field}" not allowed on profile ${profile.id}${operationId ? ` for ${operationId}` : ''}`,
        field,
        profileId: profile.id,
        ...(operationId ? { operationId } : {}),
      }
    }
    out[field] = value
  }
  for (const field of shape?.require ?? []) {
    if (out[field] === undefined || out[field] === null || out[field] === '') {
      return {
        ok: false,
        code: GUARD_CODES.MAPPER_INCOMPLETE,
        message: `vendor payload missing required field "${field}" for ${operationId}`,
        field,
        operationId,
        profileId: profile.id,
      }
    }
  }
  return { ok: true, body: out }
}
