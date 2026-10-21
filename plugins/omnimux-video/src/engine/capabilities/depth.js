import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { VideoError } from '../../errors.js'
import { runControlled, truncateTail } from '../ffmpeg.js'

export const slug = 'video_depth'
export const timeoutMs = 1_800_000 // 30 minutes
export const destKind = 'single'

export const PROVIDERS = ['auto', 'coreml', 'cuda', 'cpu']

/** Python packages the depth engine imports at module scope. */
export const DEPTH_PYTHON_MODULES = ['numpy', 'cv2', 'onnxruntime']

/**
 * Auto-discovery order when no interpreter is configured explicitly. Newest
 * first; the configured value (Config.video.pythonPath / env) always wins and
 * never falls through to these.
 */
export const DEPTH_PYTHON_CANDIDATES = [
  'python3.14',
  'python3.13',
  'python3.12',
  'python3.11',
  'python3.10',
  'python3',
]

const depthPythonCache = new Map()

/** Test/verification helper: forget which interpreter auto-discovery picked. */
export function clearDepthPythonCache() {
  depthPythonCache.clear()
}

/** `configured` (explicit) → single candidate; otherwise the discovery chain. */
export function resolveDepthPythonCandidates(configured = '') {
  const explicit = String(configured || '').trim()
  return explicit ? [explicit] : DEPTH_PYTHON_CANDIDATES.slice()
}

const DEPTH_DEPS_HINT =
  'Install them with `pip install onnxruntime opencv-python`, or point Config.video.pythonPath / OMNIMUX_VIDEO_PYTHON_PATH at an interpreter that already has them.'

/** `import a; import b` probe so missing deps fail before any model work starts. */
export function buildDepthRuntimeCheckCode(modules = DEPTH_PYTHON_MODULES) {
  return modules.map((name) => `import ${name}`).join('; ')
}

/** Extract `No module named 'x'` names from a Python traceback tail. */
export function missingDepthModules(stderrTail) {
  const names = []
  const re = /No module named '([^']+)'/g
  const text = String(stderrTail || '')
  let match
  while ((match = re.exec(text)) !== null) {
    if (match[1] && !names.includes(match[1])) names.push(match[1])
  }
  return names
}

/**
 * Probe one interpreter; throws an actionable `video-depth-deps-missing` when
 * its modules are missing or it cannot be started. Never lets a raw traceback
 * become the user-facing error.
 *
 * @param {{
 *   pythonBin: string,
 *   signal?: AbortSignal,
 *   procs?: Set<unknown>,
 *   runProbe?: (pythonBin: string, args: string[]) => Promise<unknown>,
 * }} input
 */
async function probeDepthPython({ pythonBin, signal, procs, runProbe }) {
  const probe =
    runProbe ??
    ((bin, args) =>
      runControlled({
        cmd: bin,
        args,
        timeoutMs: 20_000,
        signal,
        procs,
        failCode: 'video-depth-deps-missing',
        cancelCode: 'video-canceled',
        timeoutCode: 'video-timeout',
      }))
  try {
    await probe(pythonBin, ['-c', buildDepthRuntimeCheckCode()])
    return
  } catch (error) {
    if (
      error instanceof VideoError &&
      (error.code === 'video-canceled' || error.code === 'video-timeout')
    ) {
      throw error
    }
    const detail = truncateTail(String(error?.stderrTail || error?.message || error), 600)
    const missing = missingDepthModules(detail)
    if (missing.length > 0) {
      throw new VideoError(
        'video-depth-deps-missing',
        `video_depth requires Python packages that '${pythonBin}' cannot import: ${missing.join(', ')}. ${DEPTH_DEPS_HINT}`,
        { hint: DEPTH_DEPS_HINT, stderrTail: detail },
      )
    }
    const unusable = /ENOENT|not found|failed to run/i.test(detail)
    throw new VideoError(
      'video-depth-deps-missing',
      unusable
        ? `video_depth cannot start Python interpreter '${pythonBin}'. Set Config.video.pythonPath / OMNIMUX_VIDEO_PYTHON_PATH to a usable python3. ${DEPTH_DEPS_HINT}`
        : `video_depth Python runtime check failed for '${pythonBin}'. ${DEPTH_DEPS_HINT}`,
      { hint: DEPTH_DEPS_HINT, stderrTail: detail },
    )
  }
}

/**
 * Single-interpreter check kept for callers/tests that already know the binary.
 * `runProbe` here receives only the argv (legacy signature).
 */
export async function ensureDepthPython({ pythonBin, signal, procs, runProbe }) {
  await probeDepthPython({
    pythonBin,
    signal,
    procs,
    runProbe: runProbe ? (bin, args) => runProbe(args) : undefined,
  })
}

/**
 * Pick the interpreter that can run the depth engine.
 *
 * - Explicit config/env → only that binary, failure is loud (no silent fallback).
 * - Otherwise probe the shared candidate chain and cache the first usable one
 *   per configured value so repeated depth calls do not re-probe.
 * @param {{
 *   configured?: string,
 *   signal?: AbortSignal,
 *   procs?: Set<unknown>,
 *   runProbe?: (pythonBin: string, args: string[]) => Promise<unknown>,
 *   useCache?: boolean,
 * }} input
 * @returns {Promise<string>} usable python binary
 */
export async function selectDepthPython({
  configured = '',
  signal,
  procs,
  runProbe,
  useCache = true,
} = {}) {
  const explicit = String(configured || '').trim()
  const cacheKey = explicit || '__auto__'
  if (useCache) {
    const cached = depthPythonCache.get(cacheKey)
    if (cached) return cached
  }

  const candidates = resolveDepthPythonCandidates(explicit)
  const failures = []
  for (const pythonBin of candidates) {
    try {
      await probeDepthPython({ pythonBin, signal, procs, runProbe })
      if (useCache) depthPythonCache.set(cacheKey, pythonBin)
      return pythonBin
    } catch (error) {
      if (
        error instanceof VideoError &&
        (error.code === 'video-canceled' || error.code === 'video-timeout')
      ) {
        throw error
      }
      failures.push({
        pythonBin,
        detail: truncateTail(String(error?.stderrTail || error?.message || error), 300),
      })
    }
  }

  const tried = candidates.join(' / ')
  const reason = explicit
    ? `video_depth configured python '${explicit}' cannot run the depth engine (${DEPTH_PYTHON_MODULES.join(', ')})`
    : `video_depth found no Python interpreter with ${DEPTH_PYTHON_MODULES.join(', ')}; tried: ${tried}`
  throw new VideoError('video-depth-deps-missing', `${reason}. ${DEPTH_DEPS_HINT}`, {
    hint: DEPTH_DEPS_HINT,
    tried: candidates,
    stderrTail: failures[0]?.detail || '',
  })
}

export function validate(input) {
  if (!String(input?.videoUrl || '').trim()) {
    throw new VideoError('video-invalid-input', 'video_depth requires videoUrl')
  }
  if (input.maxEdge !== undefined && input.maxEdge !== null) {
    const me = Number(input.maxEdge)
    if (!Number.isInteger(me) || me < 0) {
      throw new VideoError('video-invalid-input', 'video_depth maxEdge must be an integer >= 0')
    }
  }
  if (input.fps !== undefined && input.fps !== null) {
    const fps = Number(input.fps)
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new VideoError('video-invalid-input', 'video_depth fps must be > 0')
    }
  }
  if (input.startSeconds !== undefined && input.startSeconds !== null) {
    const ss = Number(input.startSeconds)
    if (!Number.isFinite(ss) || ss < 0) {
      throw new VideoError('video-invalid-input', 'video_depth startSeconds must be >= 0')
    }
  }
  if (input.durationSeconds !== undefined && input.durationSeconds !== null) {
    const ds = Number(input.durationSeconds)
    if (!Number.isFinite(ds) || ds <= 0) {
      throw new VideoError('video-invalid-input', 'video_depth durationSeconds must be > 0')
    }
  }
  const prov = input.device ?? input.provider
  if (prov !== undefined && prov !== null) {
    const p = String(prov).toLowerCase().trim()
    if (!PROVIDERS.includes(p)) {
      throw new VideoError(
        'video-invalid-input',
        `video_depth invalid provider '${prov}'. Available providers: ${PROVIDERS.join(', ')}`,
      )
    }
  }
}

/**
 * Build CLI args for scripts/depth_engine.py
 * @param {object} input
 * @param {{ scriptPath: string, inputPath: string, outputPath: string, modelsDir?: string }} opts
 */
export function buildDepthCliArgs(input, { scriptPath, inputPath, outputPath, modelsDir }) {
  const args = [
    scriptPath,
    '--input', String(inputPath),
    '--output', String(outputPath),
  ]
  const maxEdge = input?.maxEdge
  if (maxEdge !== undefined && maxEdge !== null) {
    args.push('--max-edge', String(maxEdge))
  }
  if (input?.fps !== undefined && input?.fps !== null) {
    args.push('--fps', String(input.fps))
  }
  if (input?.startSeconds !== undefined && input?.startSeconds !== null) {
    args.push('--start', String(input.startSeconds))
  }
  if (input?.durationSeconds !== undefined && input?.durationSeconds !== null) {
    args.push('--duration', String(input.durationSeconds))
  }
  const prov = input?.device ?? input?.provider
  if (prov) {
    args.push('--provider', String(prov).toLowerCase().trim())
  }
  if (input?.invert) args.push('--invert')
  if (input?.sideBySide) args.push('--side-by-side')
  if (modelsDir && String(modelsDir).trim()) {
    args.push('--models-dir', String(modelsDir).trim())
  }
  return args
}

/**
 * @param {string} videoPath
 * @param {string} audioPath
 * @param {object} input
 */
export function buildAudioExtractArgs(videoPath, audioPath, input = {}) {
  const args = []
  const start = Number(input.startSeconds ?? 0) || 0
  if (start > 0) args.push('-ss', String(start))
  args.push('-i', String(videoPath))
  if (input.durationSeconds !== undefined && input.durationSeconds !== null && Number(input.durationSeconds) > 0) {
    args.push('-t', String(input.durationSeconds))
  }
  args.push('-vn', '-c:a', 'aac', '-b:a', '192k', String(audioPath))
  return args
}

/**
 * @param {{ videoPath: string, audioPath?: string | null, dest: string, keepAudio?: boolean }} opts
 */
export function buildMuxArgs({ videoPath, audioPath, dest, keepAudio = true }) {
  const args = ['-i', String(videoPath)]
  if (keepAudio && audioPath) {
    args.push(
      '-i', String(audioPath),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      '-movflags', '+faststart',
      String(dest),
    )
  } else {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-an',
      '-movflags', '+faststart',
      String(dest),
    )
  }
  return args
}

function parseProbeStdout(probeRes) {
  if (typeof probeRes === 'string') return probeRes
  if (probeRes && typeof probeRes === 'object' && typeof probeRes.stdout === 'string') return probeRes.stdout
  return String(probeRes || '')
}

/**
 * @param {object} input
 * @param {{
 *   dest: string,
 *   tmpDir: string,
 *   signal?: AbortSignal,
 *   videoConfig?: { video: { pythonPath?: string, modelsDir?: string } },
 *   procs?: Set<unknown>,
 *   addFile: (path: string) => void,
 *   materialize: (urlOrPath: string, label: string) => Promise<string>,
 *   runFfmpeg: (args: string[]) => Promise<unknown>,
 *   runFprobe: (args: string[]) => Promise<{ stdout: string, stderr: string } | string>,
 *   runPython?: (args: string[], opts?: object) => Promise<unknown>,
 *   runDepthRuntimeProbe?: (pythonBin: string, args: string[]) => Promise<unknown>,
 * }} ctx
 */
export async function execute(input, ctx) {
  validate(input)
  const out = ctx.dest
  ctx.addFile(out)

  const configuredPython =
    ctx.videoConfig?.video?.pythonPath ||
    process.env.OMNIMUX_VIDEO_PYTHON_PATH ||
    process.env.DSH_VIDEO_PYTHON_PATH ||
    ''
  const modelsDir =
    ctx.videoConfig?.video?.modelsDir ||
    process.env.OMNIMUX_VIDEO_MODELS_DIR ||
    process.env.DSH_VIDEO_MODELS_DIR ||
    ''

  // Dependency gate before any encode: pick an interpreter that can import
  // numpy/cv2/onnxruntime (explicit config wins; otherwise discover by version)
  // so a usable local Python is not misreported as missing.
  const pythonBin = await selectDepthPython({
    configured: configuredPython,
    signal: ctx.signal,
    procs: ctx.procs,
    runProbe: ctx.runDepthRuntimeProbe,
    useCache: ctx.depthPythonUseCache !== false,
  })

  const videoPath = await ctx.materialize(input.videoUrl, 'depth_src')

  let hasAudioStream = false
  try {
    const probeArgs = [
      '-show_entries', 'stream=codec_type,codec_name',
      '-of', 'json',
      videoPath,
    ]
    const probeRes = await ctx.runFprobe(probeArgs)
    const info = JSON.parse(parseProbeStdout(probeRes) || '{}')
    const streams = Array.isArray(info.streams) ? info.streams : []
    hasAudioStream = streams.some((s) => s.codec_type === 'audio')
  } catch {
    hasAudioStream = false
  }

  const keepAudio = input.keepAudio !== false && hasAudioStream
  const tmpAudio = join(ctx.tmpDir, 'audio_track.m4a')
  if (keepAudio) {
    try {
      await ctx.runFfmpeg(buildAudioExtractArgs(videoPath, tmpAudio, input))
    } catch {
      // Continue without audio if extraction fails.
    }
  }

  const scriptPath = fileURLToPath(new URL('../../../scripts/depth_engine.py', import.meta.url))
  const tmpDepth = join(ctx.tmpDir, 'depth_raw.mp4')

  const pyArgs = buildDepthCliArgs(input, {
    scriptPath,
    inputPath: videoPath,
    outputPath: tmpDepth,
    modelsDir,
  })

  if (typeof ctx.runPython === 'function') {
    await ctx.runPython(pyArgs, { timeoutMs })
  } else {
    await runControlled({
      cmd: pythonBin,
      args: pyArgs,
      timeoutMs,
      signal: ctx.signal,
      procs: ctx.procs,
      failCode: 'video-depth-failed',
      cancelCode: 'video-canceled',
      timeoutCode: 'video-timeout',
    })
  }

  await ctx.runFfmpeg(buildMuxArgs({
    videoPath: tmpDepth,
    audioPath: keepAudio ? tmpAudio : null,
    dest: out,
    keepAudio,
  }))

  return {
    files: [{
      path: out,
      kind: 'video',
      meta: {
        model: 'depth-anything-v2-small',
        invert: Boolean(input.invert),
        sideBySide: Boolean(input.sideBySide),
        maxEdge: input.maxEdge ?? 518,
      },
    }],
    result: {
      model: 'depth-anything-v2-small',
      convention: input.invert ? 'near=black, far=white' : 'near=white, far=black',
      audioPreserved: keepAudio,
      // Which interpreter discovery actually used (useful for support/evidence).
      python: pythonBin,
    },
  }
}
