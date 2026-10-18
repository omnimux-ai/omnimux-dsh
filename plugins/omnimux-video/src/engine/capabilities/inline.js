import { stat } from 'node:fs/promises'
import { VideoError } from '../../errors.js'

export const slug = 'video_inline_analysis_prepare'
export const timeoutMs = 600_000
export const destKind = 'single'

const DEFAULT_MAX_REQUEST_BYTES = 9 * 1024 * 1024 // 9437184
const DEFAULT_MAX_SOURCE_BYTES = 209_715_200 // 200 MiB
const SCALE_TIERS = [540, 360, 270, 240]

export function validate(input) {
  if (!String(input?.videoUrl || '').trim()) {
    throw new VideoError('video-invalid-input', 'video_inline_analysis_prepare requires videoUrl')
  }
}

export function maxRequestBytesOf(input) {
  const n = Number(input?.maxRequestBytes)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_REQUEST_BYTES
}

export function maxSourceBytesOf(input) {
  const n = Number(input?.maxSourceBytes)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_SOURCE_BYTES
}

/** Pure argv for a crf compression at a given long-edge scale tier. */
export function buildInlineArgs(input, longEdge, out) {
  return [
    '-i', String(input.videoUrl),
    ...(input.preserveTimeline === true ? [] : ['-t', '100']), // legacy preview default
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-vf', `scale='min(${longEdge},iw)':-2`,
    ...(input.keepAudio === true ? ['-map', '0:v:0', '-map', '0:a:0?', '-c:a', 'aac', '-b:a', '64k'] : ['-an']),
    '-movflags', '+faststart',
    String(out),
  ]
}

/**
 * Execute: compress via crf + scale tiers until the output is within
 * `maxRequestBytes`; keep lowering when over budget.
 * @param {object} input @param {{ dest: string, tmpDir: string, runFfmpeg: (args: string[]) => Promise<unknown>, statBytes?: (p: string) => Promise<number> }} ctx
 */
export async function execute(input, ctx) {
  validate(input)
  const maxReq = maxRequestBytesOf(input)
  const complete = input.preserveTimeline === true
  let source
  if (complete) {
    const videoUrl = ctx.materialize ? await ctx.materialize(String(input.videoUrl), 'inline-source') : String(input.videoUrl)
    if ((await stat(videoUrl)).size > maxSourceBytesOf(input)) throw new VideoError('video-invalid-input', 'video source exceeds preparation limit')
    input = { ...input, videoUrl }
    source = await probeComplete(videoUrl, ctx)
  }
  const statBytes = ctx.statBytes || ((p) => stat(p).then((s) => s.size))
  for (let i = 0; i < SCALE_TIERS.length; i += 1) {
    const longEdge = SCALE_TIERS[i]
    ctx.addFile(ctx.dest)
    await ctx.runFfmpeg(buildInlineArgs(input, longEdge, ctx.dest))
    const bytes = await statBytes(ctx.dest)
    if (bytes <= maxReq) {
      let meta = { longEdge, bytes }
      if (complete) {
        const output = await probeComplete(ctx.dest, ctx)
        if (Math.abs(source.duration - output.duration) > 0.5 || Math.abs(source.videoDuration - output.videoDuration) > 0.5 || (input.keepAudio === true && source.hasAudio && (!output.aacAudio || (source.audioDuration && (!output.audioDuration || Math.abs(source.audioDuration - output.audioDuration) > 0.5))))) {
          throw new VideoError('video-ffmpeg-failed', 'prepared video did not preserve complete duration and audio')
        }
        meta = { ...meta, preserveTimeline: true, keepAudio: input.keepAudio === true, sourceDuration: source.duration, duration: output.duration, sourceHasAudio: source.hasAudio, hasAudio: output.hasAudio }
      }
      return { files: [{ path: ctx.dest, kind: 'video', meta }] }
    }
  }
  if (complete) throw new VideoError('video-invalid-input', 'complete video cannot fit inline analysis budget')
  // None of the tiers fit: keep the smallest output and surface the overshoot.
  return { files: [{ path: ctx.dest, kind: 'video', meta: { overshoot: true } }] }
}

/** Verify the entire container timeline and optional audio after preparation. */
async function probeComplete(path, ctx) {
  const info = JSON.parse(await ctx.runFprobe(['-show_entries', 'stream=codec_type,codec_name,duration:format=duration', '-of', 'json', path]))
  const streams = Array.isArray(info.streams) ? info.streams : []
  const duration = Number(info.format?.duration)
  const video = streams.find((stream) => stream.codec_type === 'video')
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new VideoError('video-invalid-input', 'complete video duration could not be verified')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  return { duration, videoDuration: Number(video.duration) || duration, audioDuration: Number(audio?.duration) || null, hasAudio: Boolean(audio), aacAudio: audio?.codec_name === 'aac' }
}
