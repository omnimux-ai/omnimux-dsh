import { spawnSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Format seconds to standard mm:ss string.
 */
function formatSeconds(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Resolve videoProcess service or tool from context.
 * @param {object} [ctx]
 * @returns {object|null}
 */
function resolveVideoProcessService(ctx) {
  if (!ctx) return null
  if (typeof ctx.get === 'function') {
    const direct = ctx.get('videoProcess')
    if (direct && typeof direct.execute === 'function') return direct
  }
  const tools = ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : null)
  if (tools && typeof tools.get === 'function') {
    const tool = tools.get('video_process')
    if (tool && typeof tool.execute === 'function') return tool
  }
  return null
}

/**
 * Detect physical video scene cut points using professional videoProcess service
 * or internal ffmpeg scene detection filter.
 * Parses cut points and clusters them into coherent narrative shots (minimum 1.2s per shot).
 *
 * @param {string} videoPath
 * @param {object} [options]
 * @param {number} [options.threshold=0.3]
 * @param {number} [options.minDuration=1.2]
 * @param {object} [options.ctx]
 * @returns {Promise<Array<{ shotIndex: number, startSec: number, endSec: number, timeRange: string }>>}
 */
export async function detectPhysicalScenes(videoPath, options = {}) {
  if (!videoPath || !existsSync(videoPath)) return []

  const threshold = typeof options.threshold === 'number' ? options.threshold : 0.3
  const minDuration = typeof options.minDuration === 'number' ? options.minDuration : 1.2
  const ctx = options.ctx || null

  let totalDuration = 0
  try {
    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { timeout: 5000, encoding: 'utf8' }
    )
    totalDuration = parseFloat(probe.trim()) || 0
  } catch {
    // ignore
  }

  let rawCutStarts = []

  // 1. Try professional omnimux-video videoProcess service capability
  const videoProcess = resolveVideoProcessService(ctx)
  if (videoProcess) {
    try {
      const res = await videoProcess.execute({
        capability: 'video_scene_detect',
        input: {
          videoUrl: videoPath,
          threshold,
          extractFrames: false,
        },
        dest: process.env.TMPDIR || '/tmp',
      })
      if (Array.isArray(res?.result?.scenes)) {
        rawCutStarts = res.result.scenes
          .map((s) => (typeof s.start === 'number' ? s.start : parseFloat(s.start)))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.round(n * 10) / 10)
      }
    } catch {
      // fallback to internal ffmpeg spawnSync
    }
  }

  // 2. Direct ffmpeg scene filter fallback if service not available or returned empty
  if (rawCutStarts.length === 0) {
    let stderr = ''
    try {
      const res = spawnSync(
        'ffmpeg',
        ['-v', 'info', '-i', videoPath, '-map', '0:v:0', '-vf', `select=gt(scene\\,${threshold}),showinfo`, '-vsync', 'vfr', '-f', 'null', '-'],
        { encoding: 'utf8', timeout: 15000 }
      )
      stderr = res?.stderr || ''
    } catch {
      // ignore
    }

    const re = /pts_time:(\d+(?:\.\d+)?)/g
    let m
    while ((m = re.exec(stderr)) !== null) {
      const v = parseFloat(m[1])
      if (Number.isFinite(v) && v > 0) {
        rawCutStarts.push(Math.round(v * 10) / 10)
      }
    }
  }

  // Deduplicate and sort
  const sortedTimes = [...new Set(rawCutStarts)].sort((a, b) => a - b)

  // Anchor with 0.0s
  const cutPoints = [0]
  for (const t of sortedTimes) {
    // Only accept cuts that are at least minDuration away from previous cut
    const last = cutPoints[cutPoints.length - 1]
    if (t - last >= minDuration) {
      // Also ensure it's not too close to the end (at least 1.0s remaining)
      if (totalDuration <= 0 || totalDuration - t >= 1.0) {
        cutPoints.push(Math.round(t * 10) / 10)
      }
    }
  }

  const finalDuration = totalDuration > 0 ? Math.round(totalDuration) : Math.round(cutPoints[cutPoints.length - 1] + 3)

  // Form scene intervals
  const scenes = []
  for (let i = 0; i < cutPoints.length; i++) {
    const startSec = cutPoints[i]
    const nextStart = i + 1 < cutPoints.length ? cutPoints[i + 1] : finalDuration
    const endSec = Math.max(startSec + 1, nextStart)
    scenes.push({
      shotIndex: i + 1,
      startSec,
      endSec,
      timeRange: `${formatSeconds(startSec)} - ${formatSeconds(endSec)}`,
    })
  }

  return scenes
}
