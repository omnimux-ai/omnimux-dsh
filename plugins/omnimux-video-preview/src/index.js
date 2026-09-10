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
      const breakdownData = await extractVideoBreakdown(url, { ctx })

      // Step 2: Save native .vbreakdown artifact
      const { dataPath } = saveVideoBreakdownArtifacts(breakdownData, dest)

      // Step 3: Trigger sidebar preview automatically
      let previewOpened = false
      if (auto_open !== false) {
        try {
          const sidebarOpenTool = ctx.tools?.get?.('sidebar_open')
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

  // 3. Mount WebServer routes if webServer service is available
  const mountServer = (server) => {
    if (!server) return

    const streamRoute = '/omnimux/video-preview/stream'
    const handler = (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      const targetPath = url.searchParams.get('path')
      handleVideoStream(req, res, targetPath)
    }

    if (typeof server.get === 'function') {
      server.get(streamRoute, (c) => {
        const targetPath = c.req.query('path')
        const nodeReq = c.req.raw ?? c.env?.incoming
        const nodeRes = c.res?.raw ?? c.env?.outgoing
        if (nodeReq && nodeRes) {
          handleVideoStream(nodeReq, nodeRes, targetPath)
        } else {
          return c.text('Node stream bridge unavailable', 500)
        }
      })
    } else if (typeof server.use === 'function') {
      server.use((req, res, next) => {
        if (req.url && req.url.startsWith(streamRoute)) {
          handler(req, res)
        } else if (typeof next === 'function') {
          next()
        }
      })
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (inner) => {
      const s = inner.webServer ?? inner.get?.('webServer')
      if (s) mountServer(s)
    })
  } else if (ctx.webServer) {
    mountServer(ctx.webServer)
  }
}

