import { resolveInspirationPaths } from './paths.js'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher, formatErrorMessage, readJsonBody, sendJson } from './http-routes.js'
import { capabilityOf } from './http-handlers.js'
import { fallbackResolveSocial } from './scraper-fallback.js'

export const name = 'omnimux-inspiration'
export const inject = ['tools']

export const INSPIRATION_TOOL_NAMES = [
  'inspiration_search',
  'inspiration_get',
  'inspiration_create',
  'inspiration_update',
  'inspiration_delete',
  'inspiration_favorite',
]

function objectParams(fields) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(fields)) {
    const { required: isRequired, ...rest } = spec
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

function safeJsonOutput(val) {
  if (val === undefined || val === null) return {}
  return JSON.parse(JSON.stringify(val, (_k, v) => (v === undefined ? null : v)))
}

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/** Platforms the OmniMux cloud catalog has no (platform, capability) pair for. */
const CLOUD_UNSUPPORTED_PLATFORMS = new Set(['facebook', 'threads'])

/**
 * Display names for Chinese-language failure messages. Must stay aligned with
 * the client's `platform.<key>` locale entries so one product does not name a
 * platform two ways.
 */
const PLATFORM_DISPLAY_NAMES = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  x: '推特 (X)',
  facebook: 'Facebook',
  threads: 'Threads',
}

const SUPPORTED_PLATFORM_HINT = 'TikTok / Instagram / YouTube / X'

/**
 * Human-readable label for a platform slug, falling back to the slug itself.
 * @param {string} platform
 * @returns {string}
 */
export function platformDisplayName(platform) {
  const key = typeof platform === 'string' ? platform.trim().toLowerCase() : ''
  if (!key) return ''
  return PLATFORM_DISPLAY_NAMES[key] || key
}

/**
 * A cloud/fallback social response carries usable metadata when `data` is a
 * non-empty object. Field-level validity is judged in `parseSocialMeta`, so no
 * field sniffing happens here (platform envelopes are not flat).
 * @param {unknown} data
 * @returns {boolean}
 */
function hasSocialPayload(data) {
  return Boolean(data) && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0
}

async function runFallback(fallback, params) {
  if (typeof fallback !== 'function') return null
  try {
    return await fallback(params)
  } catch {
    return null
  }
}

function socialFailureMessage({ platform, cloudUnsupported, cloudError, toolReady }) {
  if (!platform || platform === 'unknown') {
    return `未能识别该链接所属平台，请确认链接来自 ${SUPPORTED_PLATFORM_HINT}、Facebook 或 Threads`
  }
  if (cloudUnsupported) {
    const name = platformDisplayName(platform) || platform
    // No import path accepts a bare media URL as `video_url`, so suggesting one
    // would send the user into a guaranteed-failing cloud call.
    return `${name} 暂不支持云端解析，请改用受支持平台（${SUPPORTED_PLATFORM_HINT}）的链接导入`
  }
  if (cloudError) return `OmniMux 云端社媒解析失败: ${formatErrorMessage(cloudError)}`
  if (!toolReady) return 'OmniMux 社媒解析工具 (omnimux_social_data) 未就绪，请检查 omnimux 插件是否加载'
  return '未从该链接解析到内容，请确认链接是公开可访问的帖子/视频'
}

/**
 * Build the social fetcher consumed by the import pipeline.
 *
 * Order: cloud `omnimux_social_data` (skipped for platforms the catalog does
 * not serve) → public no-key fallback resolver → actionable error that names
 * the real reason instead of a generic "check the link or network".
 * @param {{ getTool?: (name: string) => any, fallback?: Function }} [deps]
 */
export function createSocialFetcher({ getTool, fallback = fallbackResolveSocial } = {}) {
  return async function socialFetcher({ platform, capability, url }) {
    const cloudUnsupported = CLOUD_UNSUPPORTED_PLATFORMS.has(platform)
    const cloudSkipped = cloudUnsupported || !platform || platform === 'unknown'
    const resolvedCapability = capability || capabilityOf(platform)
    const socialDataTool = cloudSkipped || typeof getTool !== 'function' ? undefined : getTool('omnimux_social_data')
    const toolReady = Boolean(socialDataTool && typeof socialDataTool.execute === 'function')
    let cloudError = null

    if (toolReady) {
      try {
        const res = await socialDataTool.execute({ platform, capability: resolvedCapability, url })
        if (res && hasSocialPayload(res.data)) return res
      } catch (err) {
        cloudError = err
      }
    }

    const fallbackRes = await runFallback(fallback, { platform, capability: resolvedCapability, url })
    if (fallbackRes && hasSocialPayload(fallbackRes.data)) return fallbackRes

    throw new Error(socialFailureMessage({ platform, cloudUnsupported, cloudError, toolReady }))
  }
}

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown, get?: (name: string) => any },
 *   get?: (name: string) => unknown,
 *   effect?: (factory: () => () => void, label?: string) => void,
 *   inject?: (deps: string[], callback: (inner: object) => void) => void,
 * }} ctx
 */
export function apply(ctx) {
  const paths = resolveInspirationPaths()
  const store = createLocalStore({ paths })

  const getTool = (toolName) => {
    const toolsService = ctx.tools ?? (typeof ctx.get === 'function' ? /** @type {any} */ (ctx.get('tools')) : undefined)
    if (toolsService && typeof toolsService.get === 'function') {
      return toolsService.get(toolName)
    }
    return undefined
  }

  const socialFetcher = createSocialFetcher({ getTool })

  // Video analyze tool: exclusively consumes omnimux-video tool video_analyze
  const videoAnalyzeTool = {
    async execute(args) {
      const tool = getTool('video_analyze')
      if (tool && typeof tool.execute === 'function') {
        return tool.execute(args)
      }
      throw new Error('多模态视频分析工具 (video_analyze) 未就绪，请检查 omnimux-video 插件是否加载')
    },
  }

  const textComplete = {
    async execute(args) {
      const tool = getTool('omnimux_text_complete')
      if (tool && typeof tool.execute === 'function') {
        return tool.execute(args)
      }
      throw new Error('omnimux_text_complete 未就绪')
    },
  }

  const dispatcher = createLocalInspirationDispatcher({
    localStore: store,
    socialFetcher,
    videoAnalyzeTool,
    textComplete,
  })

  // Mount HTTP server routes for /omnimux/inspiration/local
  const mountHttp = (httpCtx) => {
    const webServer = httpCtx.webServer ?? httpCtx.get?.('webServer')
    if (!webServer || typeof webServer.register !== 'function') return
    const dispose = webServer.register({
      kind: 'prefix',
      path: '/omnimux/inspiration/local',
      async handler(req, res) {
        try {
          const url = new URL(req.url || '/omnimux/inspiration/local', 'http://127.0.0.1')
          if (url.pathname.startsWith('/omnimux/inspiration/local/media/')) {
            await dispatcher.streamLocalMedia(req, res)
            return
          }
          const wantsBody = req.method === 'POST' || req.method === 'PATCH'
          const body = wantsBody ? await readJsonBody(req) : undefined
          if (wantsBody && body === null) {
            sendJson(res, 400, { error: 'invalid json' })
            return
          }
          const result = await dispatcher.dispatch({
            method: req.method || 'GET',
            url: req.url || '/omnimux/inspiration/local',
            body,
          })
          sendJson(res, result.status, result.body)
        } catch {
          sendJson(res, 500, { error: 'internal error' })
        }
      },
    })
    if (typeof httpCtx.effect === 'function') {
      httpCtx.effect(() => dispose, 'omnimux-inspiration-http-routes')
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], mountHttp)
  } else {
    mountHttp(ctx)
  }

  // Register Agent-facing Tools
  ctx.tools.register({
    name: 'inspiration_search',
    description: 'Search local and cloud inspiration items by keyword, platform, tag, or favorites.',
    parameters: objectParams({
      query: { type: 'string', description: 'Search term for title, content, hook or tags' },
      platform: { type: 'string', description: 'tiktok | instagram | youtube | x' },
      type: { type: 'string', description: 'video | image | link' },
      tag: { type: 'string', description: 'Filter by specific tag' },
      is_favorite: { type: 'boolean', description: 'Only return favorite items' },
      limit: { type: 'number', description: 'Max items to return (default 20)' },
    }),
    output: jsonOut,
    async execute(args) {
      const listRes = store.list({
        q: args.query,
        platform: args.platform,
        type: args.type,
        tag: args.tag,
        is_favorite: args.is_favorite ? '1' : undefined,
        limit: args.limit || 20,
      })
      const items = Array.isArray(listRes?.items) ? listRes.items : []
      const mapped = items.map((item) => ({
        id: item.id,
        title: item.title,
        platform: item.source_platform,
        type: item.type,
        url: item.source_url,
        tags: item.tags,
        is_favorite: item.is_favorite,
        hook_summary: typeof item.deconstruction === 'object' ? (item.deconstruction?.hook || null) : null,
      }))
      return safeJsonOutput({
        count: mapped.length,
        items: mapped,
        inspirations: mapped,
      })
    },
  })

  ctx.tools.register({
    name: 'inspiration_get',
    description: 'Get single inspiration details including five-dimension AI deconstruction report.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Inspiration item ID' },
    }),
    output: jsonOut,
    async execute(args) {
      const item = store.get(args.id)
      if (!item) throw new Error(`Inspiration not found: ${args.id}`)
      return safeJsonOutput({ item })
    },
  })

  ctx.tools.register({
    name: 'inspiration_create',
    description: 'Save a social media video URL to the local inspiration library with automatic media download. For instant video breakdown, shots analysis, and live sidebar preview, use video_breakdown_analyze.',
    parameters: objectParams({
      url: { type: 'string', required: true, description: 'Social URL (TikTok, Instagram, YouTube, X)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Custom tags' },
      auto_analyze: { type: 'boolean', description: 'Run AI five-dimension deconstruction (default true)' },
    }),
    output: jsonOut,
    async execute(args) {
      const result = await dispatcher.dispatch({
        method: 'POST',
        url: '/omnimux/inspiration/local/import-url',
        body: {
          url: args.url,
          tags: args.tags || [],
          auto_analyze: args.auto_analyze !== false,
        },
      })
      if (result.status >= 400) throw new Error(result.body?.error || `HTTP ${result.status}`)
      const payload = result.body?.data || {}
      if (!result.body?.media_degraded) return safeJsonOutput(payload)
      return safeJsonOutput({
        ...payload,
        media_degraded: true,
        degrade_reason: result.body.degrade_reason,
      })
    },
  })

  ctx.tools.register({
    name: 'inspiration_update',
    description: 'Update inspiration item metadata including title, content, tags, or deconstruction notes.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Inspiration item ID' },
      title: { type: 'string', description: 'Updated title' },
      content: { type: 'string', description: 'Updated textual notes or script content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Updated tags array' },
      is_favorite: { type: 'boolean', description: 'Favorite status' },
    }),
    output: jsonOut,
    async execute(args) {
      const id = String(args.id)
      const patch = {}
      if (typeof args.title === 'string') patch.title = args.title
      if (typeof args.content === 'string') patch.content = args.content
      if (Array.isArray(args.tags)) patch.tags = args.tags
      if (typeof args.is_favorite === 'boolean') patch.is_favorite = args.is_favorite
      const item = store.update(id, patch)
      return safeJsonOutput({ ok: true, item })
    },
  })

  ctx.tools.register({
    name: 'inspiration_delete',
    description: 'Delete an inspiration item and recycle its local media cache. Destructive action requiring confirm=true.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Inspiration item ID' },
      confirm: {
        type: 'boolean',
        required: true,
        description: 'Must be true to confirm permanent deletion of the inspiration item',
      },
    }),
    output: jsonOut,
    async execute(args) {
      if (args.confirm !== true) {
        throw new Error('inspiration_delete is destructive; confirm must be explicitly true')
      }
      const id = String(args.id)
      const removed = await store.delete(id)
      return safeJsonOutput({ ok: true, id: removed.id, deleted: true })
    },
  })

  ctx.tools.register({
    name: 'inspiration_favorite',
    description: 'Toggle or set the favorite status of an inspiration item.',
    parameters: objectParams({
      id: { type: 'string', required: true, description: 'Favorite status to set (true or false)' },
      is_favorite: { type: 'boolean', required: true, description: 'Favorite status to set (true or false)' },
    }),
    output: jsonOut,
    async execute(args) {
      const id = String(args.id)
      const is_favorite = Boolean(args.is_favorite)
      const item = store.update(id, { is_favorite })
      return safeJsonOutput({ ok: true, id: item.id, is_favorite: item.is_favorite })
    },
  })
}
