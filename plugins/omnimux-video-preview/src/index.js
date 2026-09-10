import { existsSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { handleVideoStream, getMimeType } from './stream.js'
import { extractVideoBreakdown, saveVideoBreakdownArtifacts, formatShotsCopyText } from './breakdown.js'

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
    description: 'Probe metadata for a local video file and get local streaming URL.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to video' },
      },
      required: ['path'],
    },
    output: jsonOut,
    execute: async ({ path: filePath }) => {
      const abs = resolve(filePath)
      if (!existsSync(abs)) throw new Error(`File not found: ${filePath}`)
      const stats = statSync(abs)
      return {
        path: abs,
        size: stats.size,
        mimeType: getMimeType(abs),
        streamUrl: `/omnimux/video-preview/stream?path=${encodeURIComponent(abs)}`,
      }
    },
  })

  // 2. Register video breakdown & shots analysis tool
  ctx.tools?.register?.({
    name: 'video_breakdown_analyze',
    description: 'Understand and deconstruct a video or video URL into granular shots (景别/机位/角度/动态/描述) and structural stages (Hook/Product Intro/Usage Detail/Demo Scene). Generates structured .vbreakdown data, and automatically opens the right sidebar preview.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Video URL (TikTok, Douyin, YouTube Shorts, Instagram Reels, Xiaohongshu, Bilibili) or local file path.',
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
      const { dataPath } = saveVideoBreakdownArtifacts(breakdownData, dest, { ctx, execCtx })

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

      return {
        success: true,
        preview_opened: previewOpened,
        data_path: dataPath,
        video: breakdownData.video,
        pipeline: breakdownData.pipeline,
        shots_count: breakdownData.shots.length,
        shots: breakdownData.shots,
        structure: breakdownData.structure,
        formatted_shots: formatShotsCopyText(breakdownData.shots),
      }
    },
  })

  // 3. Mount WebServer routes via official DSH webServer.register contract
  const mountHttp = (server) => {
    const webServer = server?.webServer ?? server
    if (!webServer || typeof webServer.register !== 'function') return () => {}

    const streamRoute = '/omnimux/video-preview/stream'
    return webServer.register({
      kind: 'prefix',
      path: streamRoute,
      async handler(req, res) {
        try {
          const url = new URL(req.url || '', 'http://localhost')
          const targetPath = url.searchParams.get('path')
          handleVideoStream(req, res, targetPath)
        } catch (err) {
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err?.message || 'Video stream error' }))
          } catch {}
        }
      },
    })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (inner) => {
      mountHttp(inner.webServer ?? inner)
    })
  } else if (typeof ctx.get === 'function' && ctx.get('webServer')) {
    mountHttp(ctx.get('webServer'))
  }
}

