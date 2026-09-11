import { assertCapabilityEnabled, isMediaEnabled, isToolEnabled } from '../gate/guard.js'
import { OmnimuxError } from './errors.js'
import { objectParams, rethrow } from '../tools/schema.js'

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   provide?: (name: string, value: unknown) => void,
 *   get?: (name: string) => unknown,
 * }} ctx
 * @param {{
 *   kind: 'video' | 'image' | 'audio',
 *   execute: (req: object) => Promise<unknown>,
 *   media: unknown,
 *   gate?: object,
 *   hub?: { gate?: object },
 *   store?: { resolve: () => Promise<string | undefined> },
 *   jsonOut: object,
 * }} opts
 */
export function mountMedia(ctx, opts) {
  const { kind, execute, media, jsonOut, store } = opts
  const gate = opts.gate ?? opts.hub?.gate ?? ctx.get?.('gate')

  const api = {
    /**
     * @param {{ prompt?: string, dest: string, duration?: number, image?: string, taskId?: string, wait?: boolean, signal?: AbortSignal, [key: string]: unknown }} req
     */
    execute(req) {
      assertCapabilityEnabled(gate, kind, 'media')
      return execute({
        ...req,
        media,
        store: opts.store,
        credentials: ctx.get?.('credentials'),
      })
    },
  }

  if (isMediaEnabled(gate, kind) && typeof ctx.provide === 'function') {
    ctx.provide(`${kind}Generate`, api)
  }

  const toolName = `omnimux_${kind}_submit`
  if (!isToolEnabled(gate, toolName)) {
    return
  }

  const destHint = kind === 'video'
    ? 'Absolute file path for the mp4'
    : kind === 'audio'
      ? 'Absolute file path for the audio'
      : 'Absolute file path for the image'

  ctx.tools.register({
    name: toolName,
    description:
      `Generate one ${kind} to dest. Default waits until the file is on disk (mode live). wait false returns mode submitted plus taskId for asynchronous models; synchronous speech always returns mode live with dest. Pass task_id with dest to poll and download an existing task. Uses OMNIMUX_API_KEY / OMNIMUX_TOKEN.`,
    parameters: objectParams({
      prompt: { type: 'string', description: 'Prompt text. Required only when the selected model operation declares it.' },
      dest: { type: 'string', required: true, description: destHint },
      model: { type: 'string', description: 'Model ID (e.g. seed-audio-1.0, suno, gpt-4o-mini-tts, nanobanana-2, seedream-5.0-pro, midjourney-8.1, gpt-image-2)' },
      operation: {
        type: 'string',
        description:
          'Contract operation id (e.g. text_to_video, first_frame, text_to_image). Required when the model has multiple listed ops or inputs are ambiguous; optional when uniquely inferable.',
      },
      duration: { type: 'number' },
      image: { type: 'string', description: 'Reference image URL or data URI' },
      image_tail: { type: 'string', description: 'Last-frame image URL or data URI for compatible video operations.' },
      references: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            role: { type: 'string' },
            targetSlot: { type: 'string' },
            pathOrUrl: { type: 'string' },
          },
          required: ['type', 'pathOrUrl'],
          additionalProperties: false,
        },
        description: 'Additional typed media references.',
      },
      audioTrack: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          role: { type: 'string' },
          pathOrUrl: { type: 'string' },
        },
        required: ['type', 'pathOrUrl'],
        additionalProperties: false,
        description: 'Typed audio track for compatible video operations.',
      },
      aspectRatio: { type: 'string', description: 'Requested aspect ratio for compatible media operations.' },
      resolution: { type: 'string', description: 'Requested resolution for compatible media operations.' },
      sound: { type: 'boolean', description: 'Generate synchronized sound when the model supports it.' },
      seed: { type: 'number', description: 'Generation seed when supported by the model.' },
      watermark: { type: 'boolean', description: 'Watermark switch when supported by the model.' },
      outputFormat: { type: 'string', description: 'Output container such as mp4 or mov.' },
      referenceTaskType: { type: 'string', description: 'Explicit APIMart reference/edit/extend task type.' },
      generationType: { type: 'string', description: 'Explicit APIMart frame/reference generation type.' },
      returnLastFrame: { type: 'boolean', description: 'Return the generated final frame when supported.' },
      webSearch: { type: 'boolean', description: 'Enable the documented web_search tool.' },
      nsfwCheck: { type: 'boolean', description: 'Enable APIMart request moderation when supported.' },
      fileUrl: { type: 'string', description: 'Public document URL for document_to_video.' },
      linkUrl: { type: 'string', description: 'Public login-free page URL for webpage_to_video.' },
      speech: { type: 'string', description: 'Talking-head / spoken text. Optional.' },
      audio: { type: 'string', description: 'Reference audio URL. Optional.' },
      voice: { type: 'string', description: 'Voice ID from the selected model contract; omitted uses its default voice.' },
      strategy: {
        type: 'string',
        enum: ['auto', 'stability_first', 'cost_first'],
        description: 'Routing strategy: auto (balanced default), stability_first (highest 24h stability SLA), cost_first (lowest points cost).',
      },
      group: {
        type: 'string',
        description: 'Explicit channel group name (e.g. pro, standard, official, cheap).',
      },
      allowed_groups: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of allowed channel groups to filter the candidate pool.',
      },
      ...(kind === 'audio' ? { format: { type: 'string', description: 'Speech audio format: mp3, wav or pcm. Default mp3.' } } : {}),
      style: { type: 'string', description: 'Music/audio style prompt. Optional.' },
      instrumental: { type: 'boolean', description: 'Instrumental only music generation. Optional.' },
      speed: { type: 'number', description: 'Speech speed multiplier. Optional.' },
      wait: { type: 'boolean', description: 'If false, return after submit. Default true.' },
      task_id: { type: 'string', description: 'Resume poll and download; skips submit and initial asset guard' },
    }),
    output: jsonOut,
    async execute(args, exec) {
      try {
        assertCapabilityEnabled(gate, toolName, 'tool')
        return await api.execute({
          prompt: args.prompt,
          dest: args.dest,
          model: args.model,
          operation: args.operation,
          duration: args.duration,
          image: args.image,
          image_tail: args.image_tail,
          references: args.references,
          audioTrack: args.audioTrack,
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          sound: args.sound,
          seed: args.seed,
          watermark: args.watermark,
          outputFormat: args.outputFormat,
          referenceTaskType: args.referenceTaskType,
          generationType: args.generationType,
          returnLastFrame: args.returnLastFrame,
          webSearch: args.webSearch,
          nsfwCheck: args.nsfwCheck,
          fileUrl: args.fileUrl,
          linkUrl: args.linkUrl,
          speech: args.speech,
          audio: args.audio,
          voice: args.voice,
          speed: args.speed,
          strategy: args.strategy,
          group: args.group,
          allowedGroups: args.allowed_groups,
          ...(kind === 'audio' ? { format: args.format } : {}),
          wait: args.wait,
          taskId: args.task_id,
          signal: exec?.signal,
        })
      } catch (error) {
        if (error instanceof OmnimuxError) throw error
        return rethrow(error)
      }
    },
  })
}
