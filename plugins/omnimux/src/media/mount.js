import { assertCapabilityEnabled, isMediaEnabled, isToolEnabled } from '../gate/guard.js'
import { OmnimuxError } from './errors.js'
import { assertRuntimeReady, resolveRuntimeChoice } from '../settings/runtime-mode.js'
import { getModelChannelGroups, parseModelAndGroup, resolveRequestChannelIntent } from '../catalog/serving/channel-groups.js'
import { objectParams, rethrow } from '../tools/schema.js'

/**
 * 核验宿主环境官方 Token 真实性，排除伪造、空值或占位符字符串。
 * @param {unknown} token
 * @returns {boolean}
 */
export function isAuthenticOfficialToken(token) {
  if (typeof token !== 'string') return false
  const trimmed = token.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()
  const FORGERY_PLACEHOLDERS = new Set([
    'undefined',
    'null',
    'false',
    'none',
    '0',
    'nan',
    '[object object]',
    'placeholder',
    'empty',
  ])
  if (FORGERY_PLACEHOLDERS.has(lower)) {
    return false
  }
  if (/[\r\n\t\0]/.test(trimmed)) {
    return false
  }
  return true
}

/**
 * The model a submit actually routes on.
 *
 * An explicit `model` always wins: the caller is the one who knows what the
 * user asked for in this turn. Only when the caller passes none does the
 * session's pin fill in — that pin is the composer picker's choice, which
 * previously no generation path could see.
 *
 * @param {unknown} requested
 * @param {{ agent?: { session?: { id?: string } } }} [exec]
 * @returns {unknown}
 */
function resolveRequestedModel(requested, exec, sessionModel) {
  if (typeof requested === 'string') {
    // A blank string is "the caller sent nothing usable", not a model named "".
    if (requested.trim()) return requested
  } else if (requested !== undefined && requested !== null) {
    // A non-string is not a model id this layer can judge; pass it through so
    // the routing layer reports it rather than silently substituting a pin.
    return requested
  }
  const pinned = sessionModel?.get?.(exec?.agent?.session?.id)
  return pinned?.modelId || requested
}

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
 *   sessionModel?: { get: (sessionId?: unknown) => ({ modelId: string } | null) },
 *   jsonOut: object,
 * }} opts
 */
export function mountMedia(ctx, opts) {
  const { kind, execute, media, jsonOut, store, sessionModel } = opts
  const gate = opts.gate ?? opts.hub?.gate ?? ctx.get?.('gate')

  const api = {
    /**
     * @param {{ prompt?: string, dest: string, duration?: number, image?: string, taskId?: string, wait?: boolean, signal?: AbortSignal, [key: string]: unknown }} req
     */
    execute(req) {
      assertCapabilityEnabled(gate, kind, 'media')
      const current = ctx.get?.('settings')?.get?.('omnimux')
      const channelIntent = resolveRequestChannelIntent(req)

      // 官方凭据判定移至服务侧安全上下文，不信任调用方请求体自带的 req.env.OMNIMUX_API_KEY
      // 严格核验宿主环境权威凭据真实性，杜绝伪造调用越权
      const rawSystemToken = process.env.OMNIMUX_API_KEY || process.env.OMNIMUX_TOKEN
      const hasOfficialToken = typeof rawSystemToken === 'string' && isAuthenticOfficialToken(rawSystemToken)

      const runtime = resolveRuntimeChoice(current)
      const rawTargetChannel = channelIntent.requestedChannel || channelIntent.effectiveChannel
      const targetChannel = typeof rawTargetChannel === 'string' ? rawTargetChannel.toLowerCase().trim() : ''
      const { modelId: requestModelId } = parseModelAndGroup(req?.model)
      const modelGroups = requestModelId ? getModelChannelGroups(requestModelId) : []
      const isKnownOfficial = targetChannel
        ? (targetChannel === 'official' || modelGroups.some((group) => {
            const gid = typeof group.id === 'string' ? group.id.toLowerCase().trim() : ''
            const wire = typeof group.wireGroup === 'string' ? group.wireGroup.toLowerCase().trim() : ''
            return gid === targetChannel || wire === targetChannel
          }))
        : (runtime.mode === 'official')

      // 渠道严格判定：
      // 1. 若显式指定渠道，必须为已知官方专线；
      // 2. 常规官方请求未显式指定渠道组（targetChannel 为空）时，若为官方模式或已验证的兜底模式，识别为官方通道；
      // 3. 绝不能被未知自定义渠道或 BYOK 渠道冒领
      const hasVerifiedRuntime = Boolean(runtime.textReady || runtime.mediaReady)
      const isFallbackOfficial = !targetChannel && current?.allowOfficialMediaFallback === true && hasVerifiedRuntime
      const isOfficialRequest = !channelIntent.isByokChannel
        && (
          (targetChannel && isKnownOfficial && (channelIntent.isOfficialChannel || runtime.mode === 'official'))
          || (!targetChannel && (runtime.mode === 'official' || isFallbackOfficial))
        )

      // 正交共存架构：
      // 1. 凡目标渠道为官方专线的请求，只要具备权威官方 Token，彻底取消对全局 runtimeMode 的阻断，直接放行执行！
      // 2. 其余未通过官方 Bypass 的请求（如未配置的自备渠道或未指定渠道的请求），严格校验本地运行方式就绪度。
      const isOfficialBypass = isOfficialRequest && hasOfficialToken
      if (!isOfficialBypass) {
        assertRuntimeReady(current, kind)
      }
      let finalReq
      if (isOfficialBypass) {
        finalReq = {
          ...req,
          env: {
            OMNIMUX_API_KEY: rawSystemToken.trim(),
          },
        }
      } else if (isOfficialRequest) {
        finalReq = { ...req, env: {} }
      } else {
        finalReq = req
      }
      return execute({
        ...finalReq,
        media,
        store: opts.store,
        credentials: ctx.get?.('credentials'),
        runtimeSettings: current,
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
      model: { type: 'string', description: 'Model ID (e.g. seed-audio-1.0, suno, gpt-4o-mini-tts, nanobanana-2, seedream-5-0-pro, mj-v8-1, gpt-image-2.5)' },
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
          model: resolveRequestedModel(args.model, exec, sessionModel),
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
