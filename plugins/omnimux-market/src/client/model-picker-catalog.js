/**
 * Pure helpers for the Composer model picker catalog (Issue #2136).
 * List truth = hub listed video/image buckets only.
 * MODEL_METADATA_PRESETS may enrich labels; never invent unlisted ids.
 */

export const EMPTY_MODEL_CATALOG = Object.freeze({
  video: Object.freeze([]),
  image: Object.freeze([]),
})

export const MODEL_CATALOG_CACHE_KEY = 'omnimux:model-catalog:v1'
export const MODEL_CATALOG_CACHE_TTL_MS = 30 * 60 * 1000

/** Display enrichment only — must not create catalog rows by itself. */
export const MODEL_METADATA_PRESETS = Object.freeze({
  'seedance-2-5': Object.freeze({
    name: 'Dreamina Seedance 2.5',
    capsuleName: 'Dreamina Seedance 2.5',
    subtitle: '30秒视频生成，精准片段编辑',
    pro: true,
    icon: 'bytedance',
  }),
  'seedance-2-0-fast': Object.freeze({
    name: 'Dreamina Seedance 2.0 Fast',
    capsuleName: 'Dreamina Seedance 2.0 Fast',
    subtitle: '细节和质量提升，成本更低',
    pro: true,
    badge: Object.freeze({ text: '高达43%折扣', type: 'purple' }),
    icon: 'bytedance',
  }),
  'seedance-2-0': Object.freeze({
    name: 'Dreamina Seedance 2.0',
    capsuleName: 'Dreamina Seedance 2.0',
    subtitle: '更精准的参考，更真实，高达4K',
    pro: true,
    icon: 'bytedance',
  }),
  'seedance-2-0-mini': Object.freeze({
    name: 'Dreamina Seedance 2.0 Mini',
    capsuleName: 'Dreamina Seedance 2.0 Mini',
    subtitle: '轻量级推理，最具成本效益',
    pro: true,
    badge: Object.freeze({ text: '最高可享58折优惠', type: 'purple' }),
    icon: 'bytedance',
  }),
  'wan-3.0': Object.freeze({
    name: 'Wan 3.0',
    capsuleName: 'Wan 3.0',
    subtitle: '通义万相电影级视效与长镜头生成',
    pro: false,
    icon: 'alibaba',
  }),
  'minimax-h3': Object.freeze({
    name: 'MiniMax H3',
    capsuleName: 'MiniMax H3',
    subtitle: '电影感画质，原生高帧率动态生成',
    pro: true,
    icon: 'minimax',
  }),
  'grok-imagine-video-1-5': Object.freeze({
    name: 'Grok Imagine Video 1.5',
    capsuleName: 'Grok Video 1.5',
    subtitle: '极速拟真运镜与多画幅自适应',
    pro: false,
    icon: 'grok',
  }),
  'nano-banana-2': Object.freeze({
    name: 'Nano Banana 2',
    capsuleName: 'Nano Banana 2',
    subtitle: '专业图像质量和文本布局',
    pro: true,
    icon: 'nanobanana',
  }),
  'seedream-5-0-pro': Object.freeze({
    name: 'Seedream 5.0 Pro',
    capsuleName: 'Seedream 5.0 Pro',
    subtitle: '更精确、更可控的编辑',
    pro: true,
    icon: 'seedream',
  }),
  'gpt-image-2.5': Object.freeze({
    name: 'GPT Image 2.5',
    capsuleName: 'GPT Image 2.5',
    subtitle: '高精细节渲染与指令遵循',
    pro: true,
    icon: 'openai',
  }),
  'gpt-image-2.5-flare': Object.freeze({
    name: 'GPT Image 2.5 Flare',
    capsuleName: 'GPT Image 2.5 Flare',
    subtitle: '高精细节渲染与指令遵循',
    pro: true,
    icon: 'openai',
  }),
  'gpt-image-2.5-sunburst': Object.freeze({
    name: 'GPT Image 2.5 Sunburst',
    capsuleName: 'GPT Image 2.5 Sunburst',
    subtitle: '高精细节渲染与指令遵循',
    pro: true,
    icon: 'openai',
  }),
  'grok-imagine-image-2-0': Object.freeze({
    name: 'Grok Imagine Image 2',
    capsuleName: 'Grok Image 2',
    subtitle: '极致写实摄影感与敏捷生图',
    pro: false,
    icon: 'grok',
  }),
})

export function resolveModelBrand(modelId) {
  if (!modelId || typeof modelId !== 'string') return 'bytedance'
  const id = modelId.trim().toLowerCase()
  if (/(^seed|seedance|seedream|doubao|豆包|即梦|dreamina|bytedance)/i.test(id)) return 'bytedance'
  if (/(^nanobanana|nano[-_ ]?banana)/i.test(id)) return 'nanobanana'
  if (/(^gpt|^openai)/i.test(id)) return 'openai'
  if (/(^google|^gemini)/i.test(id)) return 'google'
  if (/(^wan|\bwan\b|wanxiang|万相|通义|alibaba)/i.test(id)) return 'alibaba'
  if (/(^minimax|\bminimax\b|hailuo|海螺)/i.test(id)) return 'minimax'
  if (/(^grok|\bgrok\b|xai)/i.test(id)) return 'grok'
  return 'bytedance'
}

export function projectListedRow(row, type, presets = MODEL_METADATA_PRESETS) {
  if (!row || typeof row.id !== 'string' || !row.id.trim()) return null
  const id = row.id.trim()
  const meta = presets[id] || {}
  const hubBadge = typeof row.badge === 'string' && row.badge.trim()
    ? { text: row.badge.trim(), type: 'purple' }
    : null
  return {
    id,
    name: meta.name || row.label || id,
    capsuleName: meta.capsuleName || row.label || id,
    type,
    subtitle: meta.subtitle || row.subtitle || (type === 'video' ? '多模态高质量视频生成' : '高精细节渲染'),
    pro: typeof meta.pro === 'boolean' ? meta.pro : Boolean(row.pro),
    badge: meta.badge || hubBadge,
    icon: meta.icon || resolveModelBrand(id),
  }
}

/**
 * Project hub listed buckets only. Presets never invent ids.
 * @param {object|null|undefined} hubCatalog
 */
export function projectListedCatalog(hubCatalog, presets = MODEL_METADATA_PRESETS) {
  const source = hubCatalog && typeof hubCatalog === 'object' ? hubCatalog : {}
  const root = source.catalog && typeof source.catalog === 'object' ? source.catalog : source
  const video = []
  const image = []
  const seenVideo = new Set()
  const seenImage = new Set()
  if (Array.isArray(root.video)) {
    for (const row of root.video) {
      const item = projectListedRow(row, 'video', presets)
      if (!item || seenVideo.has(item.id)) continue
      seenVideo.add(item.id)
      video.push(item)
    }
  }
  if (Array.isArray(root.image)) {
    for (const row of root.image) {
      const item = projectListedRow(row, 'image', presets)
      if (!item || seenImage.has(item.id)) continue
      seenImage.add(item.id)
      image.push(item)
    }
  }
  const fingerprint = typeof root.fingerprint === 'string' && root.fingerprint
    ? root.fingerprint
    : [video.map((m) => m.id).join(','), image.map((m) => m.id).join(',')].join('|')
  return { video, image, fingerprint }
}

export function catalogHasRows(projected) {
  return Boolean(projected && ((projected.video && projected.video.length) || (projected.image && projected.image.length)))
}

/**
 * @param {{ getItem?: Function }|null|undefined} storage
 * @param {number} [now]
 * @param {number} [ttlMs]
 */
export function readCatalogCache(storage, now = Date.now(), ttlMs = MODEL_CATALOG_CACHE_TTL_MS) {
  if (!storage || typeof storage.getItem !== 'function') return null
  try {
    const raw = storage.getItem(MODEL_CATALOG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.savedAt !== 'number') return null
    if (now - parsed.savedAt > ttlMs) return null
    const projected = projectListedCatalog(parsed.catalog || parsed)
    if (!catalogHasRows(projected)) return null
    return projected
  } catch {
    return null
  }
}

/**
 * @param {object} projected
 * @param {object|null} hubPayload
 * @param {{ setItem?: Function }|null|undefined} storage
 */
export function writeCatalogCache(projected, hubPayload, storage) {
  if (!storage || typeof storage.setItem !== 'function' || !projected) return
  try {
    const hub = hubPayload && typeof hubPayload === 'object' ? hubPayload : null
    storage.setItem(MODEL_CATALOG_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      fingerprint: projected.fingerprint,
      catalog: {
        fingerprint: projected.fingerprint,
        video: Array.isArray(hub?.video)
          ? hub.video
          : (projected.video || []).map((m) => ({ id: m.id, label: m.name, subtitle: m.subtitle, badge: m.badge?.text })),
        image: Array.isArray(hub?.image)
          ? hub.image
          : (projected.image || []).map((m) => ({ id: m.id, label: m.name, subtitle: m.subtitle, badge: m.badge?.text })),
      },
    }))
  } catch {
    /* ignore quota / private mode */
  }
}
