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
 * Detect physical video scene cut points using ffmpeg scene detection filter.
 * Parses showinfo pts_time lines from stderr and clusters raw cut points into
 * coherent narrative shots (minimum 2.5s per shot).
 *
 * @param {string} videoPath
 * @param {object} [options]
 * @param {number} [options.threshold=0.3]
 * @param {number} [options.minDuration=2.5]
 * @returns {Array<{ shotIndex: number, startSec: number, endSec: number, timeRange: string }>}
 */
export function detectPhysicalScenes(videoPath, options = {}) {
  if (!videoPath || !existsSync(videoPath)) return []

  const threshold = typeof options.threshold === 'number' ? options.threshold : 0.3
  const minDuration = typeof options.minDuration === 'number' ? options.minDuration : 2.5

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

  const rawTimes = []
  const re = /pts_time:(\d+(?:\.\d+)?)/g
  let m
  while ((m = re.exec(stderr)) !== null) {
    const v = parseFloat(m[1])
    if (Number.isFinite(v) && v > 0) {
      rawTimes.push(Math.round(v * 10) / 10)
    }
  }

  // Deduplicate and sort
  const sortedTimes = [...new Set(rawTimes)].sort((a, b) => a - b)

  // Anchor with 0.0s
  const cutPoints = [0]
  for (const t of sortedTimes) {
    // Only accept cuts that are at least minDuration away from previous cut
    const last = cutPoints[cutPoints.length - 1]
    if (t - last >= minDuration) {
      // Also ensure it's not too close to the end
      if (totalDuration <= 0 || totalDuration - t >= 2.0) {
        cutPoints.push(Math.round(t))
      }
    }
  }

  const finalDuration = totalDuration > 0 ? Math.round(totalDuration) : (cutPoints[cutPoints.length - 1] + 5)

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
