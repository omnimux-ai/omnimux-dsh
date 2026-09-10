import { parseVideoConfig, Config } from './config.js'
import { resolveBin, killAll } from './engine/ffmpeg.js'
import { createSemaphore } from './engine/queue.js'
import { executeVideoProcess } from './engine/job.js'
import { SLUGS } from './engine/video.js'
import { executeVideoAnalyze } from './understand/analyze.js'
import { executeVideoReversePrompt, IDENTITY_MODES } from './understand/reverse.js'

export const name = 'omnimux-video'
export const inject = ['tools', 'textComplete']
export { Config }

/**
 * Compile a flat field table into a JSON Schema object. Raw `register`
 * does not run defineTool, so the wire schema must already be type:object.
 * `additionalProperties` defaults to false (OmniMux plugin convention); the
 * `input` field of video_process opts into `true` because each capability
 * carries its own field set (11 different shapes, not one flattened table).
 *
 * @param {Record<string, Record<string, unknown> & { required?: boolean }>} fields
 * @param {{ additionalProperties?: boolean }} [opts]
 */
function objectParams(fields, { additionalProperties = false } = {}) {
  /** @type {Record<string, unknown>} */
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
    additionalProperties,
  }
}

const jsonOut = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

const PROCESS_DESCRIPTION =
  'Local ffmpeg video processing. capability selects one of 12 operations; input carries that capability\'s fields; dest is the output file (single) or directory (multi). ' +
  'Input values are local absolute paths or http(s) URLs. Multi-source work (2+ clips/images) → video_merge / video_export / slideshow_export. ' +
  'Burning subtitles → video_export with input.subtitles. Probing a file → media_metadata. Depth map video → video_depth. ' +
  'For content understanding (五维拆解 / I2V reverse prompt) use video_analyze or video_reverse_prompt — not this tool. ' +
  'Throws on failure (ffmpeg-missing / video-invalid-input / video-ffmpeg-failed / video-incompatible-streams / video-canceled / video-timeout / video-<capability>-failed).'

const DEPTH_DESCRIPTION =
  'Generate a grayscale monocular depth-map video (Depth Anything V2 Small ONNX). ' +
  'Default convention: near=white, far=black. Optional invert / side-by-side preview. Keeps original audio by default. ' +
  'Uses local onnxruntime (CoreML/CUDA/CPU). Not a style-transfer / anime stylize tool.'

const ANALYZE_DESCRIPTION =
  'Understand a local short video into a Chinese five-dimension breakdown markdown (目标/影响力/叙事/画面/复刻策略). ' +
  'Uses hub textComplete with native video input (image_url data:video). Does not hold API keys. ' +
  'Pass absolute video path; optional dest writes the markdown. Not a ffmpeg cut/merge tool.'

const REVERSE_DESCRIPTION =
  'Reverse a local reference video into an I2V-friendly structured generation prompt (<<<PROMPT>>> + optional <<<APPENDIX>>>). ' +
  'Silent/no-talking hard constraints. identityMode A=lock参考图 / B=匿名 / C=只复刻结构. ' +
  'Uses hub textComplete with native video; does not call videoGenerate. Not video-reverse-pad (that is ffmpeg ping-pong).'

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   provide?: (name: string, value: unknown) => void,
 *   get?: (name: string) => unknown,
 *   effect?: (factory: () => () => void, label?: string) => unknown,
 * }} ctx
 * @param {unknown} [config]
 */
export function apply(ctx, config = {}) {
  const videoConfig = parseVideoConfig(config)
  const bin = resolveBin(videoConfig.video) // probe once; missing does not block load
  const procs = new Set()
  const acquire = createSemaphore(videoConfig.video.maxConcurrent)

  const processApi = {
    /**
     * @param {{ capability: string, input: object, dest?: string, signal?: AbortSignal }} req
     */
    execute(req) {
      return executeVideoProcess({ ...req, bin, acquire, procs, videoConfig })
    },
  }
  ctx.provide('videoProcess', processApi)

  // Unload: kill every tracked ffmpeg/ffprobe child.
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => killAll(procs), 'omnimux-video.procs')
  }

  ctx.tools.register({
    name: 'video_process',
    description: PROCESS_DESCRIPTION,
    parameters: objectParams({
      capability: {
        type: 'string',
        enum: SLUGS,
        required: true,
        description: 'Which video operation to run: ' + SLUGS.join(', '),
      },
      input: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description:
          'Capability-specific fields (values = local absolute paths or http(s) URLs). ' +
          'media_metadata: { mediaUrl }. video_trim: { videoUrl, startSeconds?, durationSeconds?|endSeconds?, keepAudio?, precise? }. ' +
          'video_merge: { videoUrls[], keepAudio? }. video_split: { videoUrl, segments:[{startSeconds?, durationSeconds?|endSeconds?}] }. ' +
          'audio_extract: { videoUrl, startSeconds?, durationSeconds?, outputFormat?, audioBitrate? }. ' +
          'audio_prepare: { audioUrl, durationSeconds?, outputFormat?, audioBitrate?, sampleRate?, channels? }. ' +
          'video_thumbnail_extract: { videoUrl, timeSeconds?, width?, height?, maxEdge?, fit? }. ' +
          'video_inline_analysis_prepare: { videoUrl, maxRequestBytes?, maxSourceBytes? }. ' +
          'video_scene_detect: { videoUrl, threshold?, extractFrames? }. ' +
          'slideshow_export: { imageUrls[], durationPerImage?, aspectRatio?, resolution?, transitionType?, frameRate?, audioUrl?, audioVolume? }. ' +
          'video_export: { clips:[{url,type?,duration?,start?,volume?}], resolution?, aspectRatio?, width?, height?, frameRate?, subtitles?, timeline? }. ' +
          'video_depth: { videoUrl, maxEdge?, invert?, sideBySide?, keepAudio?, startSeconds?, durationSeconds?, provider?, fps? }.',
      },
      dest: {
        type: 'string',
        required: true,
        description:
          'Output file path (single-output capabilities) or directory (multi-output: video_split segments / video_scene_detect frames). media_metadata ignores dest.',
      },
    }, { additionalProperties: false }),
    output: jsonOut,
    async execute(args, exec) {
      return processApi.execute({
        capability: args.capability,
        input: args.input,
        dest: args.dest,
        signal: exec?.signal,
      })
    },
  })

  ctx.tools.register({
    name: 'video_depth',
    description: DEPTH_DESCRIPTION,
    parameters: objectParams({
      video: {
        type: 'string',
        required: true,
        description: 'Local absolute path or http(s) URL of the source video.',
      },
      dest: {
        type: 'string',
        required: true,
        description: 'Absolute output .mp4 path for the grayscale depth video.',
      },
      max_edge: {
        type: 'number',
        description: 'Long-edge resize before inference (default 518; 0 keeps source rounded to multiples of 14).',
      },
      invert: {
        type: 'boolean',
        description: 'Invert polarity (default false = near white / far black).',
      },
      side_by_side: {
        type: 'boolean',
        description: 'If true, output left=original / right=depth preview.',
      },
      keep_audio: {
        type: 'boolean',
        description: 'Keep original audio track (default true).',
      },
      start_seconds: {
        type: 'number',
        description: 'Optional trim start in seconds.',
      },
      duration_seconds: {
        type: 'number',
        description: 'Optional trim duration in seconds.',
      },
      provider: {
        type: 'string',
        enum: ['auto', 'coreml', 'cuda', 'cpu'],
        description: 'ONNX execution provider preference (default auto).',
      },
      fps: {
        type: 'number',
        description: 'Optional output FPS override.',
      },
    }),
    output: jsonOut,
    async execute(args, exec) {
      return processApi.execute({
        capability: 'video_depth',
        input: {
          videoUrl: args.video,
          maxEdge: args.max_edge,
          invert: args.invert,
          sideBySide: args.side_by_side,
          keepAudio: args.keep_audio,
          startSeconds: args.start_seconds,
          durationSeconds: args.duration_seconds,
          provider: args.provider,
          fps: args.fps,
        },
        dest: args.dest,
        signal: exec?.signal,
      })
    },
  })

  /**
   * @returns {{ execute: Function } | undefined}
   */
  const getTextComplete = () => {
    const api = ctx.textComplete ?? ctx.get?.('textComplete')
    if (api && typeof api === 'object' && typeof /** @type {any} */ (api).execute === 'function') {
      return /** @type {{ execute: Function }} */ (api)
    }
    return undefined
  }

  ctx.tools.register({
    name: 'video_analyze',
    description: ANALYZE_DESCRIPTION,
    parameters: objectParams({
      video: {
        type: 'string',
        required: true,
        description: 'Absolute local path (.mp4/.webm/.mov) or data:video URI.',
      },
      dest: {
        type: 'string',
        description: 'Optional absolute path to write the markdown report.',
      },
      model: {
        type: 'string',
        description: `Whitelist model that accepts video (default ${videoConfig.understand.defaultModel}).`,
      },
      max_tokens: {
        type: 'number',
        description: 'Optional output cap. Defaults to Config.understand.maxTokens.',
      },
      prompt_path: {
        type: 'string',
        description: 'Optional absolute override for the five-dimension system prompt.',
      },
      notes: {
        type: 'string',
        description: 'Optional extra instructions appended to the user text.',
      },
    }),
    output: jsonOut,
    async execute(args, exec) {
      return executeVideoAnalyze({
        video: args.video,
        dest: args.dest,
        model: args.model,
        maxTokens: args.max_tokens,
        promptPath: args.prompt_path,
        notes: args.notes,
        signal: exec?.signal,
        textComplete: getTextComplete(),
        understand: videoConfig.understand,
      })
    },
  })

  ctx.tools.register({
    name: 'video_reverse_prompt',
    description: REVERSE_DESCRIPTION,
    parameters: objectParams({
      video: {
        type: 'string',
        required: true,
        description: 'Absolute local path (.mp4/.webm/.mov) or data:video URI.',
      },
      dest: {
        type: 'string',
        description: 'Optional absolute path for the <<<PROMPT>>> body.',
      },
      appendix_dest: {
        type: 'string',
        description: 'Optional absolute path for the <<<APPENDIX>>> body when present.',
      },
      identity_mode: {
        type: 'string',
        enum: ['A', 'B', 'C', ...Object.values(IDENTITY_MODES)],
        description: 'A=character_lock_upload_image, B=describe_anonymous, C=structure_only.',
      },
      duration: {
        type: 'number',
        description: 'Optional target duration seconds override.',
      },
      aspect: {
        type: 'string',
        description: 'Optional target aspect ratio override (e.g. 9:16).',
      },
      notes: {
        type: 'string',
        description: 'Optional extra notes for the reverse pass.',
      },
      product_or_prop_swap: {
        type: 'string',
        description: 'Optional product/prop swap hint (do not expand appearance catalogs).',
      },
      model: {
        type: 'string',
        description: `Whitelist model that accepts video (default ${videoConfig.understand.defaultModel}).`,
      },
      max_tokens: {
        type: 'number',
        description: 'Optional output cap. Defaults to Config.understand.maxTokens.',
      },
      prompt_path: {
        type: 'string',
        description: 'Optional absolute override for the reverse system prompt.',
      },
    }),
    output: jsonOut,
    async execute(args, exec) {
      return executeVideoReversePrompt({
        video: args.video,
        dest: args.dest,
        appendixDest: args.appendix_dest,
        identityMode: args.identity_mode,
        duration: args.duration,
        aspect: args.aspect,
        notes: args.notes,
        productOrPropSwap: args.product_or_prop_swap,
        model: args.model,
        maxTokens: args.max_tokens,
        promptPath: args.prompt_path,
        signal: exec?.signal,
        textComplete: getTextComplete(),
        understand: videoConfig.understand,
      })
    },
  })
}
