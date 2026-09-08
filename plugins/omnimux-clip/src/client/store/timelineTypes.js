/** @typedef {'video' | 'image' | 'audio' | 'text'} ClipMediaType */
/** @typedef {'video' | 'audio' | 'text'} TrackType */
/** @typedef {'16:9' | '9:16' | '1:1'} AspectRatio */

export const ASPECT_PRESETS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
}

export const TEXT_PRESETS = [
  { id: 'title', label: '标题', content: '标题文字', fontFamily: 'sans-serif', fontSize: 72, fontWeight: 'bold', color: '#ffffff', strokeColor: '#000000', strokeWidth: 4, textAlign: 'center' }, // exempt-ui03 // exempt-ui10: 视频大标题预设
  // 字幕底衬遮罩：链官方 mask 别名，令牌缺席时落回原值（画布侧由 theme/colors.js 解析）。
  { id: 'subtitle', label: '字幕', content: '字幕内容', fontFamily: 'sans-serif', fontSize: 42, fontWeight: 'normal', color: '#ffffff', strokeColor: '#000000', strokeWidth: 3, backgroundColor: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))', textAlign: 'center' }, // exempt-ui03 // exempt-ui10: 视频字幕预设
  // 花字是创作内容默认色而非 UI 表面色：链官方品牌位令牌，缺席时保持原值。
  { id: 'caption', label: '花字', content: '花字', fontFamily: 'sans-serif', fontSize: 56, fontWeight: 'bold', color: 'var(--dsw-specific-caption-accent, #ffe566)', strokeColor: 'var(--dsw-specific-caption-stroke, #ff4d6d)', strokeWidth: 5, textAlign: 'center' }, // exempt-ui10: 视频花字大字号预设
  { id: 'lower-third', label: '下三分之一', content: '姓名 / 身份', fontFamily: 'sans-serif', fontSize: 36, fontWeight: 'bold', color: '#ffffff', backgroundColor: 'var(--dsw-alias-bg-mask-2, rgba(20,20,24,0.75))', textAlign: 'left' }, // exempt-ui03 // exempt-ui10: 视频下三分之一大字号预设
]

export const TRANSITIONS = [
  { type: 'none', label: '无转场', durationMs: 0 },
  { type: 'cut', label: '硬切', durationMs: 0 },
  { type: 'crossfade', label: '交叉溶解', durationMs: 400 },
  { type: 'fadeblack', label: '黑场', durationMs: 600 },
]

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function defaultCanvasConfig(aspectRatio = '16:9') {
  const size = ASPECT_PRESETS[aspectRatio] || ASPECT_PRESETS['16:9']
  return {
    aspectRatio,
    width: size.width,
    height: size.height,
    fps: 30,
    durationMs: 8000,
    backgroundColor: '#000000', // exempt-ui03: 视频黑场预设底色
  }
}

export function emptyTracks() {
  return [
    { id: 'track_video', name: '视频', type: 'video', order: 0, isMuted: false, isLocked: false, isVisible: true, clips: [] },
    { id: 'track_audio', name: '音频', type: 'audio', order: 1, isMuted: false, isLocked: false, isVisible: true, clips: [] },
    { id: 'track_text', name: '字幕', type: 'text', order: 2, isMuted: false, isLocked: false, isVisible: true, clips: [] },
  ]
}

export function defaultTextStyle(overrides = {}) {
  return {
    presetId: 'subtitle',
    content: '字幕',
    fontFamily: 'sans-serif',
    fontSize: 42, // exempt-ui10: 视频字幕大字预设
    fontWeight: 'normal',
    color: '#ffffff', // exempt-ui03: 视频字幕前景色
    strokeColor: '#000000', // exempt-ui03: 视频字幕描边色
    strokeWidth: 3,
    backgroundColor: '',
    textAlign: 'center',
    ...overrides,
  }
}

/**
 * @param {Partial<import('./timelineTypes.js')>} [opts]
 */
export function createEmptySchema(opts = {}) {
  const projectId = opts.projectId || uid('clip')
  return {
    version: '1.0',
    projectId,
    canvasConfig: { ...defaultCanvasConfig(opts.aspectRatio), ...(opts.canvasConfig || {}) },
    tracks: emptyTracks(),
    media: [],
  }
}

export function computeDurationMs(tracks, fallback = 8000) {
  let max = 0
  for (const track of tracks || []) {
    for (const clip of track.clips || []) {
      max = Math.max(max, (clip.startTimeMs || 0) + (clip.durationMs || 0))
    }
  }
  return Math.max(fallback, max)
}

/**
 * Build a TimelineSchema from an OpenClipEditorPayload.
 * @param {object} payload
 */
export function schemaFromOpenPayload(payload) {
  if (payload?.draftSchema && typeof payload.draftSchema === 'object' && Array.isArray(payload.draftSchema.tracks)) {
    const schema = structuredCloneSafe(payload.draftSchema)
    schema.projectId = payload.projectId || schema.projectId || uid('clip')
    schema.canvasConfig = { ...defaultCanvasConfig(), ...(schema.canvasConfig || {}), ...(payload.canvasConfig || {}) }
    schema.canvasConfig.durationMs = computeDurationMs(schema.tracks, schema.canvasConfig.durationMs)
    return schema
  }

  const projectId = payload?.projectId || uid('clip')
  const schema = createEmptySchema({
    projectId,
    canvasConfig: payload?.canvasConfig,
  })
  const inputs = payload?.upstreamInputs || {}
  const media = []
  const videoTrack = schema.tracks.find((t) => t.type === 'video')
  const audioTrack = schema.tracks.find((t) => t.type === 'audio')
  const textTrack = schema.tracks.find((t) => t.type === 'text')

  let cursor = 0
  for (const item of inputs.videos || []) {
    const durationMs = Math.max(400, item.durationMs || 4000)
    const path = item.path || item.url || ''
    const mediaId = uid('media')
    media.push({ id: mediaId, name: item.name || 'video', type: 'video', durationMs, path })
    videoTrack.clips.push(makeClip({
      trackId: videoTrack.id,
      name: item.name || '视频',
      mediaType: 'video',
      startTimeMs: cursor,
      durationMs,
      sourceUrl: path,
      sourceOutMs: durationMs,
    }))
    cursor += durationMs
  }
  for (const item of inputs.images || []) {
    const durationMs = Math.max(400, item.displayDurationMs || 3000)
    const path = item.path || item.url || ''
    const mediaId = uid('media')
    media.push({ id: mediaId, name: item.name || 'image', type: 'image', durationMs, path })
    videoTrack.clips.push(makeClip({
      trackId: videoTrack.id,
      name: item.name || '图片',
      mediaType: 'image',
      startTimeMs: cursor,
      durationMs,
      sourceUrl: path,
      sourceOutMs: durationMs,
    }))
    cursor += durationMs
  }

  let audioCursor = 0
  for (const item of inputs.audios || []) {
    const durationMs = Math.max(400, item.durationMs || 4000)
    const path = item.path || item.url || ''
    media.push({ id: uid('media'), name: item.name || 'audio', type: 'audio', durationMs, path })
    audioTrack.clips.push(makeClip({
      trackId: audioTrack.id,
      name: item.name || '音频',
      mediaType: 'audio',
      startTimeMs: audioCursor,
      durationMs,
      sourceUrl: path,
      sourceOutMs: durationMs,
    }))
    audioCursor += durationMs
  }

  for (const caption of inputs.captions || []) {
    textTrack.clips.push(makeClip({
      trackId: textTrack.id,
      name: '字幕',
      mediaType: 'text',
      startTimeMs: caption.startTimeMs || 0,
      durationMs: caption.durationMs || 3000,
      sourceUrl: '',
      textStyle: defaultTextStyle({ content: caption.text || '字幕' }),
    }))
  }

  schema.media = media
  schema.canvasConfig.durationMs = computeDurationMs(schema.tracks, Math.max(cursor, audioCursor, 8000))
  return schema
}

export function makeClip(partial = {}) {
  const durationMs = Math.max(200, partial.durationMs || 3000)
  return {
    id: partial.id || uid('clip'),
    trackId: partial.trackId,
    name: partial.name || '片段',
    mediaType: partial.mediaType || 'video',
    startTimeMs: Math.max(0, partial.startTimeMs || 0),
    durationMs,
    sourceUrl: partial.sourceUrl || '',
    sourceInMs: partial.sourceInMs || 0,
    sourceOutMs: partial.sourceOutMs || durationMs,
    speed: partial.speed ?? 1,
    volume: partial.volume ?? 1,
    textStyle: partial.textStyle,
    transition: partial.transition || { type: 'none', durationMs: 0 },
  }
}

export function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function stripRuntimeUrls(schema) {
  const next = structuredCloneSafe(schema)
  for (const track of next.tracks || []) {
    for (const clip of track.clips || []) {
      if (typeof clip.sourceUrl === 'string' && clip.sourceUrl.startsWith('blob:')) {
        const media = (next.media || []).find((item) => item.id === clip.mediaId || item.name === clip.name)
        if (media?.path) clip.sourceUrl = media.path
      }
    }
  }
  return next
}

export function formatTimecode(ms) {
  const value = Math.max(0, Math.round(Number(ms) || 0))
  const minutes = Math.floor(value / 60_000)
  const seconds = Math.floor((value % 60_000) / 1000)
  const millis = value % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}
