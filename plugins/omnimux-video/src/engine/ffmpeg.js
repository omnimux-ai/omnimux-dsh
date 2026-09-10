import { spawnSync, spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { VideoError } from '../errors.js'

/**
 * Truncate a message to keep stderr dumps from exploding token budgets.
 * Default cap 800 chars.
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function truncateTail(text, max = 800) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  return `…[truncated ${text.length - max}]${text.slice(-max)}`
}

/**
 * `ffmpeg -version` → "8.1.2" (or null when unparseable).
 * @param {string} stdout
 * @returns {string | null}
 */
export function parseVersion(stdout) {
  const m = /version\s+(\d+\.\d+(?:\.\d+)?)/.exec(String(stdout))
  return m ? m[1] : null
}

/**
 * "8.1.2" → [8, 1, 2].
 * @param {string} version
 * @returns {[number, number, number]}
 */
export function versionTuple(version) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(version || ''))
  if (!m) return [0, 0, 0]
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)]
}

/**
 * xfade requires ffmpeg >= 4.3.
 * @param {string} version
 * @returns {boolean}
 */
export function supportsXfade(version) {
  const [a, b] = versionTuple(version)
  return a > 4 || (a === 4 && b >= 3)
}

/**
 * Return the fallback binary names/paths for a given ffmpegPath.
 * Empty path → PATH (`ffmpeg` / `ffprobe`). A directory → join `ffmpeg` /
 * `ffprobe` inside it; a file path → sibling ffprobe in same dir.
 * @param {string} ffmpegPath
 * @returns {{ ffmpeg: string, ffprobe: string }}
 */
export function resolveBinaryPaths(ffmpegPath) {
  const p = String(ffmpegPath || '').trim()
  if (!p) return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }
  let isDir = false
  try {
    isDir = statSync(p).isDirectory()
  } catch {
    isDir = false
  }
  if (isDir) {
    return { ffmpeg: join(p, 'ffmpeg'), ffprobe: join(p, 'ffprobe') }
  }
  const d = dirname(p)
  const ffprobe = d && d !== '.' ? join(d, 'ffprobe') : 'ffprobe'
  return { ffmpeg: p, ffprobe }
}

/**
 * Probe ffmpeg / ffprobe once (sync so `apply()` can stay synchronous).
 * A missing binary yields `missing: true` and never throws.
 * @param {{ ffmpegPath: string }} [opts]
 * @returns {{ ffmpeg: string, ffprobe: string, version: string | null, missing: boolean }}
 */
export function resolveBin({ ffmpegPath } = {}) {
  const { ffmpeg, ffprobe } = resolveBinaryPaths(ffmpegPath)
  const result = { ffmpeg, ffprobe, version: null, missing: true }

  const tryProbe = (f, pr) => {
    try {
      const v = spawnSync(f, ['-version'], { encoding: 'utf8', timeout: 15000 })
      if (v.status !== 0) return null
      const p = spawnSync(pr, ['-version'], { encoding: 'utf8', timeout: 15000 })
      if (p.status !== 0) return null
      return {
        ffmpeg: f,
        ffprobe: pr,
        version: parseVersion(v.stdout),
        missing: false,
      }
    } catch {
      return null
    }
  }

  const primary = tryProbe(ffmpeg, ffprobe)
  if (primary) return primary

  // When ffmpegPath was not explicitly provided and PATH lookup failed (e.g. GUI Electron app on macOS without /opt/homebrew/bin in PATH):
  if (!ffmpegPath) {
    for (const binDir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
      const hit = tryProbe(join(binDir, 'ffmpeg'), join(binDir, 'ffprobe'))
      if (hit) return hit
    }
  }

  return result
}

/**
 * Default async child runner. Returns `{ child, done }` where `done`
 * resolves to `{ code, stdout, stderr }`. Extraction into its own function
 * lets tests inject a mock `runChild` without a real binary.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {{ child: import('node:child_process').ChildProcess, done: Promise<{ code: number | null, stdout: string, stderr: string }> }}
 */
export function defaultRunChild(cmd, args) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  if (child.stdout) child.stdout.on('data', (d) => { stdout += d })
  if (child.stderr) child.stderr.on('data', (d) => { stderr += d })
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
  return { child, done }
}

/**
 * Shared controlled runner: handles timeout, external AbortSignal, process
 * registry, non-zero exit mapping to a VideoError.
 *
 * @param {{
 *   cmd: string,
 *   args: string[],
 *   timeoutMs?: number,
 *   signal?: AbortSignal | null,
 *   procs?: Set<unknown>,
 *   runChild?: typeof defaultRunChild,
 *   failCode?: string,
 *   cancelCode?: string,
 *   timeoutCode?: string,
 *   loglevel?: string,
 * }} opts
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export async function runControlled(opts) {
  const {
    cmd,
    args = [],
    timeoutMs = 0,
    signal = null,
    procs,
    runChild,
    failCode = 'video-ffmpeg-failed',
    cancelCode = 'video-canceled',
    timeoutCode = 'video-timeout',
  } = opts
  const run = runChild || defaultRunChild
  const { child, done } = run(cmd, args)
  if (child && procs) procs.add(child)

  let timedOut = false
  let aborted = Boolean(signal?.aborted)
  let onAbort = null
  let timer = null
  // Graceful-stop escalation (PRD §5.3): SIGTERM first, then SIGKILL 1s later
  // only if the child has not exited. `done` resolving marks exit so we never
  // re-signal a finished child.
  let childExited = false
  done.then(() => { childExited = true }).catch(() => { childExited = true })
  let escalateTimer = null
  const stopChild = () => {
    if (!child || childExited) return
    try { child.kill('SIGTERM') } catch { /* already gone */ }
    if (escalateTimer) clearTimeout(escalateTimer)
    escalateTimer = setTimeout(() => {
      if (!childExited) {
        try { child.kill('SIGKILL') } catch { /* already gone */ }
      }
    }, 1000)
  }

  const cleanup = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (escalateTimer) { clearTimeout(escalateTimer); escalateTimer = null }
    if (signal && onAbort && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', onAbort)
    }
    if (child && procs) procs.delete(child)
  }
  onAbort = () => { aborted = true; stopChild() }
  if (typeof signal?.addEventListener === 'function') {
    signal.addEventListener('abort', onAbort, { once: true })
  }
  if (signal?.aborted) stopChild()
  if (timeoutMs > 0) timer = setTimeout(() => { timedOut = true; stopChild() }, timeoutMs)

  try {
    const { code, stdout, stderr } = await done
    if (aborted) {
      throw new VideoError(cancelCode, `'${cmd}' canceled`, { stderrTail: truncateTail(String(stderr), 800) })
    }
    if (timedOut) {
      throw new VideoError(timeoutCode, `'${cmd}' timed out after ${timeoutMs}ms`, {
        stderrTail: truncateTail(String(stderr), 800),
      })
    }
    if (child && typeof child?.killedOnAbort === 'number') {
      // (unused sentinel; kept for symmetry if a mocked child reports a flag)
    }
    if (code !== 0) {
      throw new VideoError(failCode, `'${cmd}' exited (${code}): ${truncateTail(String(stderr), 800)}`, {
        stderrTail: truncateTail(String(stderr), 800),
      })
    }
    return { code: 0, stdout: String(stdout), stderr: String(stderr) }
  } catch (error) {
    if (error instanceof VideoError) throw error
    throw new VideoError(failCode, `'${cmd}' failed to run: ${truncateTail(String(error), 800)}`, {
      stderrTail: truncateTail(String(error), 800),
    })
  } finally {
    cleanup()
  }
}

/**
 * Run ffmpeg. The spawn layer prepends `-hide_banner -loglevel <level> -y`;
 * capability modules MUST NOT add those themselves (nor `-y`). Default level
 * is `error` (keeps unrelated capabilities quiet); scene detection needs
 * `info` so `showinfo`'s `pts_time` lines reach stderr.
 *
 * @param {{ bin: { ffmpeg: string }, args: string[], timeoutMs?: number, signal?: AbortSignal, procs?: Set<unknown>, runChild?: typeof defaultRunChild, loglevel?: string }} opts
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export async function spawnFfmpeg({ bin, args, timeoutMs, signal, procs, runChild, loglevel = 'error' }) {
  return runControlled({
    cmd: bin.ffmpeg ?? bin,
    args: ['-hide_banner', '-loglevel', loglevel, '-y', ...(args || [])],
    timeoutMs,
    signal,
    procs,
    runChild,
    failCode: 'video-ffmpeg-failed',
  })
}

/**
 * Run ffprobe. Returns the stdout text on success; throws on non-zero.
 * Prefix `-hide_banner -loglevel error`.
 *
 * @param {{ bin: { ffprobe: string }, args: string[], timeoutMs?: number, signal?: AbortSignal, procs?: Set<unknown>, runChild?: typeof defaultRunChild }} opts
 * @returns {Promise<string>}
 */
export async function spawnFfprobe({ bin, args, timeoutMs, signal, procs, runChild }) {
  const out = await runControlled({
    cmd: bin.ffprobe ?? bin,
    args: ['-hide_banner', '-loglevel', 'error', ...(args || [])],
    timeoutMs,
    signal,
    procs,
    runChild,
    failCode: 'video-ffmpeg-failed',
  })
  return out.stdout
}

/**
 * Kill every tracked child (used on plugin unload via ctx.effect).
 * @param {Set<unknown>} procs
 */
export function killAll(procs) {
  if (!procs) return
  for (const child of procs) {
    try { child.kill('SIGKILL') } catch { /* ignore */ }
  }
}