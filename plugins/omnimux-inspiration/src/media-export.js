import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { detectExt, downloadMedia } from './downloader.js'

/**
 * Export one social post out of the page into a file the user can pick up.
 *
 * The browser extension asks for exactly two shapes: the watermark-free video
 * itself, and the soundtrack of that same video. Both end up in the platform
 * Downloads folder — a location the user already knows how to open — and the
 * audio path takes a detour through a scratch directory because the soundtrack
 * has to be pulled out of the downloaded container first.
 *
 * Nothing here writes a partial file into the destination: a download that
 * fails, or an extraction that fails, leaves the destination exactly as it was.
 *
 * @module
 */

/** The two exports the extension may ask for. */
export const EXPORT_KIND = Object.freeze({ video: 'video', audio: 'audio' })

/** Environment override for the destination folder. */
export const DOWNLOADS_DIR_ENV = 'OMNIMUX_DOWNLOADS_DIR'

/** Environment override for the ffmpeg executable. */
export const FFMPEG_PATH_ENV = 'OMNIMUX_FFMPEG_PATH'

/** Whole-filename ceiling, well inside every mainstream filesystem limit. */
const FILENAME_MAX = 120

/** Characters a filesystem or a shared link would mangle. */
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|\u0000-\u001f]/g

/** Caption fragment kept in the name: enough to recognise, short enough to read. */
const CAPTION_MAX = 32

/** Author and id fragments are bounded for the same reason. */
const AUTHOR_MAX = 24
const ID_MAX = 24

/** Audio exports are always the same container. */
const AUDIO_EXT = '.m4a'

/** Wall-clock budget for one extraction. */
const FFMPEG_TIMEOUT_MS = 120_000

/**
 * Resolve the folder exported files land in.
 *
 * Defaults to the platform Downloads folder rather than a private app
 * directory: the user asked for a download, and a file they cannot find is not
 * a download.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [homeDir]
 * @returns {string}
 */
export function resolveDownloadsDir(env = process.env, homeDir = homedir()) {
  const override = String(env?.[DOWNLOADS_DIR_ENV] ?? '').trim()
  if (override) return override
  return join(homeDir, 'Downloads')
}

/**
 * Collapse a value into a filename fragment, or an empty string.
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function safeFragment(value, max) {
  return String(value ?? '')
    .replace(ILLEGAL_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/** The numeric post id inside a social video address, when it carries one. */
function postIdFromUrl(url) {
  const match = String(url ?? '').match(/\/(?:video|photo)\/(\d{5,})/) || String(url ?? '').match(/(\d{8,})/)
  return match ? match[1] : ''
}

/**
 * Build the name an exported file is saved under.
 *
 * Author, caption and post id in that order: it is the order a human scans a
 * Downloads folder in, and the id is what keeps two posts with the same hook
 * from colliding.
 * @param {Record<string, any>} [meta] resolved post metadata
 * @param {string} kind
 * @param {string} ext including the leading dot
 * @returns {string}
 */
export function exportFilename(meta, kind, ext) {
  const author = safeFragment(meta?.author?.handle || meta?.author?.name, AUTHOR_MAX)
  const caption = safeFragment(meta?.text || meta?.title, CAPTION_MAX)
  const id = safeFragment(meta?.id || postIdFromUrl(meta?.resolvedUrl), ID_MAX)
  const stem = [author, caption, id]
    .filter((part) => part !== '')
    .join('-')
    .replace(/[-\s]+$/, '')
  const fallback = stem === '' ? 'omnimux-media' : stem
  return `${fallback.slice(0, Math.max(1, FILENAME_MAX - ext.length))}${ext}`
}

/**
 * Build the ffmpeg arguments that strip the picture and keep the sound.
 *
 * A stream copy is the default because the audio inside a social video is
 * already AAC and re-encoding it would cost time and quality for nothing.
 * `reencode` is the retry used when the source container holds something a
 * `.m4a` cannot carry.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ reencode?: boolean }} [opts]
 * @returns {string[]}
 */
export function audioExtractArgs(inputPath, outputPath, opts = {}) {
  const codec = opts.reencode === true ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'copy']
  return ['-y', '-i', inputPath, '-vn', ...codec, outputPath]
}

/**
 * Run one ffmpeg command, rejecting with its own error output on failure.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function runFfmpeg(inputPath, outputPath, args) {
  const binary = String(process.env?.[FFMPEG_PATH_ENV] ?? '').trim() || 'ffmpeg'
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`音轨提取超时 (${FFMPEG_TIMEOUT_MS}ms)`))
    }, FFMPEG_TIMEOUT_MS)
    child.stderr?.on('data', (chunk) => {
      // Keep only the tail: ffmpeg's banner is noise, the last lines carry the reason.
      stderr = `${stderr}${String(chunk)}`.slice(-2000)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`无法启动 ffmpeg: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && existsSync(outputPath)) resolve()
      else reject(new Error(`ffmpeg 退出码 ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`))
    })
  })
}

/**
 * Pick a free path, so exporting the same post twice never overwrites.
 * @param {string} target
 * @returns {string}
 */
function freePath(target) {
  if (!existsSync(target)) return target
  const ext = extname(target)
  const stem = target.slice(0, target.length - ext.length)
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${stem}-${n}${ext}`
    if (!existsSync(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

/** Remove a file without letting a cleanup failure mask the real error. */
function removeQuietly(path) {
  try {
    rmSync(path, { force: true })
  } catch {
    // The export already succeeded or already failed; a leftover scratch file is
    // not worth replacing the caller's answer with a cleanup error.
  }
}

/**
 * Export one video, or the soundtrack of one video, into the destination folder.
 *
 * @param {{
 *   videoUrl: string,
 *   meta?: Record<string, any>,
 *   kind: string,
 *   downloadsDir: string,
 *   workDir: string,
 *   fetcher?: typeof fetch,
 *   resolver?: Function,
 *   maxBytes?: number,
 *   timeoutMs?: number,
 *   runFfmpeg?: (inputPath: string, outputPath: string, args: string[]) => Promise<void>,
 * }} args
 * @returns {Promise<{ kind: string, path: string, filename: string, bytes: number }>}
 */
export async function exportMediaFile(args) {
  const kind = args.kind
  if (kind !== EXPORT_KIND.video && kind !== EXPORT_KIND.audio) {
    throw new Error(`不支持的导出类型: ${String(kind)}`)
  }
  mkdirSync(args.downloadsDir, { recursive: true })
  mkdirSync(args.workDir, { recursive: true })

  const sourceExt = detectExt(args.videoUrl, '.mp4')
  const audio = kind === EXPORT_KIND.audio
  // The audio path downloads into the scratch folder: the container is only a
  // means to the soundtrack, and the user asked for a download folder that does
  // not fill up with intermediate video files.
  const downloadDir = audio ? args.workDir : args.downloadsDir
  const sourcePath = await downloadMedia(args.videoUrl, downloadDir, {
    prefix: audio ? 'audio_src_' : 'omnimux_',
    ext: sourceExt,
    fetcher: args.fetcher,
    resolver: args.resolver,
    maxBytes: args.maxBytes,
    timeoutMs: args.timeoutMs,
  })

  const outExt = audio ? AUDIO_EXT : sourceExt
  const target = freePath(join(args.downloadsDir, exportFilename(args.meta, kind, outExt)))

  if (!audio) {
    renameSync(sourcePath, target)
    return { kind, path: target, filename: basename(target), bytes: statSync(target).size }
  }

  const ffmpeg = args.runFfmpeg ?? runFfmpeg
  try {
    try {
      await ffmpeg(sourcePath, target, audioExtractArgs(sourcePath, target))
    } catch (copyError) {
      // An injected runner is a test seam, not a real ffmpeg: retrying it would
      // hide the failure the caller is asserting on.
      if (args.runFfmpeg !== undefined) throw copyError
      await ffmpeg(sourcePath, target, audioExtractArgs(sourcePath, target, { reencode: true }))
    }
  } catch (error) {
    removeQuietly(target)
    throw error
  } finally {
    removeQuietly(sourcePath)
  }
  return { kind, path: target, filename: basename(target), bytes: statSync(target).size }
}
