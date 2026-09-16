import { requestRejection } from './request-authorization.js'
import { createVideoAuthorizationHandler } from './authorize-stream.js'
import { refreshBreakdownMedia } from './refresh-breakdown-media.js'
import { createVideoStreamUrl } from './stream-capability.js'
import { existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { handleVideoStream, getMimeType } from './stream.js'
import { extractVideoBreakdown, saveVideoBreakdownArtifacts, formatShotsCopyText, attachShotFrames } from './breakdown.js'
import { translateBreakdownShots, TRANSLATE_LANGUAGES } from './translate.js'

export const name = 'omnimux-video-preview'
export const inject = ['tools']

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * Host plugin entry for omnimux-video-preview.
 * Exposes local video streaming route, metadata inspection tool,
 * and AI video breakdown/shots analysis tool with auto sidebar preview.
 */
export function apply(ctx) {
  let sidebarService = null
  if (typeof ctx.inject === 'function') {
    ctx.inject(['betterSidebar'], (inner) => {
      sidebarService = inner.betterSidebar ?? inner.get?.('betterSidebar')
    })
  }

  // 1. Register video preview metadata tool
  ctx.tools?.register?.({
    name: 'video_preview_info',
    description: 'Probe a selected local video and obtain its authorized streaming URL. To reopen an old saved breakdown without re-analysis, pass its path and explicitly selected authorizeMediaPaths; only those media files are admitted and cached URLs refreshed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Selected video file, or saved breakdown file when refreshing media permissions' },
        authorizeMediaPaths: { type: 'array', items: { type: 'string' }, description: 'Explicitly selected local media paths for refreshing an old saved breakdown; document paths alone never authorize reads' },
      },
      required: ['path'],
    },
    output: jsonOut,
    execute: async ({ path: filePath, authorizeMediaPaths }) => {
      if (authorizeMediaPaths !== undefined) return refreshBreakdownMedia(filePath, authorizeMediaPaths)
      const abs = resolve(filePath)
      if (!existsSync(abs)) throw new Error(`File not found: ${filePath}`)
      const stats = statSync(abs)
      return {
        path: abs,
        size: stats.size,
        mimeType: getMimeType(abs),
        streamUrl: createVideoStreamUrl(abs),
      }
    },
  })

  // 2. Register video breakdown & shots analysis tool
  ctx.tools?.register?.({
    name: 'video_breakdown_analyze',
    description: 'Understand and deconstruct a video or video URL into granular shots (景别/机位/角度/动态/描述) and structural stages (Hook/Product Intro/Usage Detail/Demo Scene). Saves one representative still per shot (frame_path / shot_frames) for visual analysis and replication, writes structured .vbreakdown data, and automatically opens the right sidebar preview.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Video URL (TikTok, Douyin, YouTube Shorts, Instagram Reels, Xiaohongshu, Bilibili), local file path, or virtual reference (e.g. @inspiration/insp_xxxx.mp4, @asset/xxxx).',
        },
        dest: {
          type: 'string',
          description: 'Optional output destination path prefix (without extension).',
        },
        auto_open: {
          type: 'boolean',
          description: 'Whether to automatically open the generated preview in the right sidebar (default true).',
        },
      },
      required: ['url'],
    },
    output: jsonOut,
    execute: async ({ url, dest, auto_open = true }, execCtx) => {
      // Step 1: Extract high-fidelity shots and structural breakdown using real social data / multimodal analysis
      const breakdownData = await extractVideoBreakdown(url, { ctx, execCtx })

      // Step 2: Save native .vbreakdown artifact (prioritizing active workspace directory)
      const { dataPath, basePath } = saveVideoBreakdownArtifacts(breakdownData, dest, { ctx, execCtx })

      // Step 2b: Extract one still per shot next to the artifact (soft-fail per shot)
      const framesAttached = await attachShotFrames(breakdownData, { dataPath, basePath, ctx })
      if (framesAttached > 0) {
        saveVideoBreakdownArtifacts(breakdownData, dataPath, { ctx, execCtx })
      }

      // Step 3: Trigger sidebar preview automatically
      let previewOpened = false
      if (auto_open !== false) {
        try {
          const toolsService = ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : null)
          const sidebarOpenTool = toolsService?.get?.('sidebar_open')
          if (sidebarOpenTool && typeof sidebarOpenTool.execute === 'function') {
            await sidebarOpenTool.execute({ target: dataPath, title: '视频分析' }, execCtx)
            previewOpened = true
          } else if (sidebarService && typeof sidebarService.openTab === 'function') {
            sidebarService.openTab({ path: dataPath, title: '视频分析' })
            previewOpened = true
          }
        } catch {
          // Soft-fail auto_open without breaking data delivery
        }
      }

      const shotFrames = (breakdownData.shots || [])
        .filter((shot) => shot && shot.frame_path)
        .map((shot) => ({
          id: shot.id,
          time_range: shot.time_range,
          title: shot.title,
          frame_path: shot.frame_path,
          frame_url: shot.frame_url || '',
        }))

      return {
        success: true,
        preview_opened: previewOpened,
        data_path: dataPath,
        frames_dir: framesAttached > 0 ? `${basePath}.frames` : '',
        frames_attached: framesAttached,
        video: breakdownData.video,
        pipeline: breakdownData.pipeline,
        shots_count: breakdownData.shots.length,
        shots: breakdownData.shots,
        shot_frames: shotFrames,
        structure: breakdownData.structure,
        formatted_shots: formatShotsCopyText(breakdownData.shots),
      }
    },
  })

  // 3. Register video breakdown speech translation tool
  ctx.tools?.register?.({
    name: 'video_breakdown_translate',
    description: 'Translate video breakdown voiceover/speech lines into one of 18 languages using unified Hub LLM channel.',
    parameters: {
      type: 'object',
      properties: {
        targetLang: {
          type: 'string',
          description: 'Target language code (e.g. "zh-CN", "ru", "en", "ja", "ko", "es", "fr", "de", "original").',
        },
        shots: {
          type: 'array',
          description: 'List of shots with id and speech to translate.',
          items: { type: 'object' },
        },
        filePath: {
          type: 'string',
          description: 'Optional path to .vbreakdown file to persist cached translations.',
        },
      },
      required: ['targetLang'],
    },
    output: jsonOut,
    execute: async ({ targetLang, shots = [], filePath = '' }, execCtx) => {
      const result = await translateBreakdownShots({
        shots,
        targetLang,
        filePath,
        ctx,
        signal: execCtx?.signal,
      })
      return result
    },
  })

  // 4. Mount WebServer routes via official DSH webServer.register contract
  const mountHttp = (server) => {
    const webServer = server?.webServer ?? server
    if (!webServer || typeof webServer.register !== 'function') return () => {}

    const unregisters = []

    const unregAuthorize = webServer.register({
      kind: 'exact',
      path: '/omnimux/video-preview/authorize',
      handler: createVideoAuthorizationHandler(() => ctx.get?.('connection')),
    })
    if (typeof unregAuthorize === 'function') unregisters.push(unregAuthorize)

    // Route 1: Video stream
    const unregStream = webServer.register({
      kind: 'prefix',
      path: '/omnimux/video-preview/stream',
      async handler(req, res) {
        try {
          handleVideoStream(req, res)
        } catch (err) {
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err?.message || 'Video stream error' }))
          } catch {}
        }
      },
    })
    if (typeof unregStream === 'function') unregisters.push(unregStream)

    // Route 2: Multilingual Speech Translation
    const unregTranslate = webServer.register({
      kind: 'prefix',
      path: '/omnimux/video-preview/translate',
      async handler(req, res) {
        const rejection = requestRejection(req, () => ctx.get?.('connection'))
        if (rejection !== undefined) {
          res.writeHead(rejection, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'request-denied' }))
        }
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ supported_languages: TRANSLATE_LANGUAGES }))
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Method Not Allowed' }))
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', async () => {
          try {
            const payload = body ? JSON.parse(body) : {}
            const { targetLang, shots = [], filePath = '' } = payload
            const result = await translateBreakdownShots({
              shots,
              targetLang,
              filePath,
              ctx,
            })
            res.writeHead(200, {
              'Content-Type': 'application/json',
            })
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(500, {
              'Content-Type': 'application/json',
            })
            res.end(JSON.stringify({ error: err?.message || 'Translation error' }))
          }
        })
      },
    })
    if (typeof unregTranslate === 'function') unregisters.push(unregTranslate)

    return () => {
      unregisters.forEach((fn) => {
        try {
          fn()
        } catch {}
      })
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (inner) => {
      mountHttp(inner.webServer ?? inner)
    })
  } else if (typeof ctx.get === 'function' && ctx.get('webServer')) {
    mountHttp(ctx.get('webServer'))
  }
}

