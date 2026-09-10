/**
 * Plugin config parsing (Standard Schema, mirroring omnimux's config.js).
 *
 * Entry contract: `export function apply(ctx, config = {})` — do NOT read
 * `ctx.config`. `parseVideoConfig(config)` is applied to the second arg and
 * also exposed through `Config['~standard'].validate`.
 *
 * @param {unknown} value
 * @returns {{
 *   video: { ffmpegPath: string, maxConcurrent: number, pythonPath: string, modelsDir: string },
 *   understand: {
 *     defaultModel: string,
 *     maxTokens: number,
 *     maxVideoBytes: number,
 *     analyzePromptPath: string,
 *     reversePromptPath: string,
 *   },
 * }}
 */
export function parseVideoConfig(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {}
  const video = raw.video && typeof raw.video === 'object' && !Array.isArray(raw.video)
    ? /** @type {Record<string, unknown>} */ (raw.video)
    : {}
  const understandRaw = raw.understand && typeof raw.understand === 'object' && !Array.isArray(raw.understand)
    ? /** @type {Record<string, unknown>} */ (raw.understand)
    : {}

  let ffmpegPath = typeof video.ffmpegPath === 'string' ? video.ffmpegPath : ''
  // 双读过渡：新主名 OMNIMUX_VIDEO_*，旧 DSH_VIDEO_* 兼容保留一版。
  const envPath = process.env.OMNIMUX_VIDEO_FFMPEG_PATH || process.env.DSH_VIDEO_FFMPEG_PATH
  if (typeof envPath === 'string' && envPath.trim() !== '') ffmpegPath = envPath

  let pythonPath = typeof video.pythonPath === 'string' ? video.pythonPath : ''
  const envPython = process.env.OMNIMUX_VIDEO_PYTHON_PATH || process.env.DSH_VIDEO_PYTHON_PATH
  if (typeof envPython === 'string' && envPython.trim() !== '') pythonPath = envPython

  let modelsDir = typeof video.modelsDir === 'string' ? video.modelsDir : ''
  const envModels = process.env.OMNIMUX_VIDEO_MODELS_DIR || process.env.DSH_VIDEO_MODELS_DIR
  if (typeof envModels === 'string' && envModels.trim() !== '') modelsDir = envModels

  let maxConcurrent = video.maxConcurrent === undefined || video.maxConcurrent === null ? 2 : video.maxConcurrent
  const n = Number(maxConcurrent)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Config.video.maxConcurrent must be an integer >= 1, got ${JSON.stringify(maxConcurrent)}`)
  }

  const defaultModel = typeof understandRaw.defaultModel === 'string' && understandRaw.defaultModel.trim()
    ? understandRaw.defaultModel.trim()
    : 'gemini-3.8-flash'
  const maxTokens = parsePositiveNumber(
    understandRaw.maxTokens === undefined ? 8000 : understandRaw.maxTokens,
    'Config.understand.maxTokens',
  )
  const maxVideoBytes = parsePositiveNumber(
    understandRaw.maxVideoBytes === undefined ? 20 * 1024 * 1024 : understandRaw.maxVideoBytes,
    'Config.understand.maxVideoBytes',
  )
  const analyzePromptPath = typeof understandRaw.analyzePromptPath === 'string'
    ? understandRaw.analyzePromptPath.trim()
    : ''
  const reversePromptPath = typeof understandRaw.reversePromptPath === 'string'
    ? understandRaw.reversePromptPath.trim()
    : ''

  // Unknown top-level fields are ignored.
  return {
    video: { ffmpegPath, maxConcurrent: n, pythonPath, modelsDir },
    understand: {
      defaultModel,
      maxTokens,
      maxVideoBytes,
      analyzePromptPath,
      reversePromptPath,
    },
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function parsePositiveNumber(value, label) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number, got ${JSON.stringify(value)}`)
  }
  return n
}

/**
 * @type {{ '~standard': { version: 1, vendor: string, validate: (value: unknown) => { value: ReturnType<typeof parseVideoConfig> } | { issues: Array<{ message: string }> } } }}
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'omnimux-video',
    validate(value) {
      try {
        return { value: parseVideoConfig(value) }
      } catch (error) {
        return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }
      }
    },
  },
}
