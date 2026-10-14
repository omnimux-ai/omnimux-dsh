import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { OmnimuxError, unwrapAdapterError } from './errors.js'
import { hasChannelEvidence, hasGroupFailoverEvidence } from '../errors/channel-classifier.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'
import { downloadMediaFile } from './job.js'
import { createOpenAiMediaRuntime, pollOpenAiMediaTask, withRoutingGroup } from './protocols/openai-media.js'
import { parseMediaConfig, resolveMediaAuth, resolveMediaRoute } from './route.js'
import { mapOmnimuxInput, pickMediaUrl, taskPathFor } from './vendors/omnimux.js'
import {
  assertGuardOutput,
  assertGuardSubmit,
} from '../catalog/contract/submit-guard/index.js'
import { probeMediaAssets } from './asset-probe.js'
import { prepareReferencePayload } from '../reference-storage/prepare.js'
import { generateComfyUiVideo, isComfyUiVideoRoute } from './comfyui-instance.js'
import { MEDIA_EXECUTION_BUDGET_MS } from './task-deadline.js'
import { generateSpeech } from './speech.js'
import { generateCliSpeech } from './cli-speech.js'
import {
  getMediaTaskRecord,
  findMediaTaskByUpstreamId,
  findMediaTaskByRequestKey,
  createMediaTaskRecord,
  saveMediaTaskRecord,
  updateMediaTaskRecord,
  acquireMediaTaskLock,
  recordMediaCollectionFailure,
} from './task-store.js'
import { hostLocalAssetsIfNeeded, isRemoteGateway } from './gateway-upload.js'
import { appendMediaTaskLog } from './task-log.js'
import { resolveScenarioChoice, resolveMediaProviderChoice, DEFAULT_MEDIA_MODELS, assertScenarioRequestIntent } from '../settings/runtime-mode.js'
import { resolveExecutionPlan } from './execution-plan.js'
import { parseModelAndGroup, getModelChannelGroups } from '../catalog/serving/channel-groups.js'
export { probeMediaAssets } from './asset-probe.js'
export { hostLocalAssetsIfNeeded, uploadMediaToGateway, isLocalMediaSource } from './gateway-upload.js'

const CAPABILITY_TO_KEY = Object.freeze({
  image: 'runtimeMediaImage',
  video: 'runtimeMediaVideo',
  audio: 'runtimeMediaAudio',
})

/**
 * 校验指定 BYOK Provider 条目是否支持目标媒体模态能力。
 *
 * @param {Record<string, unknown> | null | undefined} item
 * @param {'image' | 'video' | 'audio' | string} capability
 * @returns {boolean}
 */
function isByokItemCapabilityMatch(item, capability) {
  if (!item || typeof item !== 'object') return false
  if (Array.isArray(item.capabilities) && item.capabilities.length > 0) {
    return item.capabilities.includes(capability)
  }
  if (typeof item.capability === 'string' && item.capability.trim()) {
    return item.capability.trim().toLowerCase() === capability
  }
  const capKey = CAPABILITY_TO_KEY[capability] || ''
  const isCurrentCapTrue = Boolean(item[capability] === true || (capKey && item[capKey] === true))
  const isCurrentCapFalse = Boolean(item[capability] === false || (capKey && item[capKey] === false))
  const hasCapModel = Boolean(
    (item.models && typeof item.models === 'object' && item.models[capability])
    || item[`${capability}Model`]
  )
  if (isCurrentCapFalse) return false
  if (isCurrentCapTrue) return true
  return hasCapModel
}

/**
 * 解析媒体生成请求的最終有效模型 ID。
 *
 * 优先级契约（从高到低）：
 * 1. 消费端显式传入的 `inputModel`（剥离 `@channelGroup` 后缀后的非空模型 ID）；
 * 2. 指定 Provider 对应的特定模型配置（优先匹配 runtimeSettings.byokProviders 中的 provider 配置，其次匹配主媒体 provider 配置）；
 * 3. 全局自定义模型 `runtimeSettings.runtimeKeyModel`；
 * 4. 能力级兜底默认模型 `DEFAULT_MEDIA_MODELS[capability]`。
 *
 * @param {unknown} inputModel - 调用方/画布节点传入的 model 参数（可能带 `@group` 后缀）
 * @param {string} [provider] - 目标提供商标识 ('omnimux' | 'fal' | 'openai' | 'openrouter' | 'siliconflow' | 'custom')
 * @param {'image' | 'video' | 'audio'} capability - 媒体能力类型
 * @param {Record<string, unknown> | undefined} [runtimeSettings] - 运行时设置快照
 * @returns {string} 解析后的有效模型 ID
 */
export function resolveEffectiveMediaModel(inputModel, provider, capability, runtimeSettings) {
  const { modelId: inputModelId, group: inputGroup } = typeof inputModel === 'string'
    ? parseModelAndGroup(inputModel)
    : { modelId: '', group: null }
  const inputTargetsByok = typeof inputGroup === 'string' && inputGroup.toLowerCase().startsWith('byok-')

  const normProvider = typeof provider === 'string' && provider.trim()
    ? provider.toLowerCase().trim()
    : (inputTargetsByok && typeof inputGroup === 'string' ? inputGroup.slice(5).toLowerCase().trim() : '')

  // 1. 若存在非空的 inputModelId，优先返回调用方显式传入的逻辑模型 ID（剥离 @group 路由后缀）
  if (inputModelId) {
    return inputModelId
  }

  // 2. 检查多 Provider 扩展列表 (byokProviders) 中是否有对应 provider 的模型配置
  // 健壮化：过滤所有匹配记录，严格校验生成模态 capability，优先选取已验证且配置了该模态模型的记录
  if (Array.isArray(runtimeSettings?.byokProviders) && normProvider) {
    const matchedItems = runtimeSettings.byokProviders.filter((item) =>
      item && typeof item === 'object' && typeof item.provider === 'string' && item.provider.toLowerCase().trim() === normProvider
    )
    const hasExplicitModel = (item) => {
      const m = (item.models && typeof item.models === 'object' && item.models[capability])
        || item[`${capability}Model`]
      return typeof m === 'string' && m.trim().length > 0
    }
    const hasAnyModel = (item) => {
      const m = (item.models && typeof item.models === 'object' && item.models[capability])
        || item[`${capability}Model`]
        || item.model
      return typeof m === 'string' && m.trim().length > 0
    }
    const verifiedItems = matchedItems.filter((item) => item.verified === true && isByokItemCapabilityMatch(item, capability))
    const bestMatched = verifiedItems.find(hasExplicitModel)
      || verifiedItems.find(hasAnyModel)
      || null

    if (bestMatched) {
      const capModel = (bestMatched.models && typeof bestMatched.models === 'object' && bestMatched.models[capability])
        || bestMatched[`${capability}Model`]
        || bestMatched.model
      if (typeof capModel === 'string' && capModel.trim()) {
        return capModel.trim()
      }
    }
  }

  const activeMediaProvider = typeof runtimeSettings?.runtimeMediaProvider === 'string' && runtimeSettings.runtimeMediaProvider.trim()
    ? runtimeSettings.runtimeMediaProvider.toLowerCase().trim()
    : 'fal'
  const isMatchingActiveProvider = !normProvider || normProvider === activeMediaProvider

  // 3. 检查主媒体 Provider 中用户显式配置的专属物理模型（如 runtimeMediaVideoModel: '...'）
  const explicitCapKey = `runtimeMedia${capability.charAt(0).toUpperCase() + capability.slice(1)}Model`
  const explicitMainCapModel = isMatchingActiveProvider && typeof runtimeSettings?.[explicitCapKey] === 'string'
    ? runtimeSettings[explicitCapKey].trim()
    : ''
  if (explicitMainCapModel) {
    return explicitMainCapModel
  }

  const mediaChoice = resolveMediaProviderChoice(runtimeSettings, capability)
  const hasMediaProvider = Boolean(runtimeSettings?.runtimeMediaProvider)
  const customModel = typeof runtimeSettings?.runtimeKeyModel === 'string'
    ? runtimeSettings.runtimeKeyModel.trim()
    : ''
  const safeActiveModel = isMatchingActiveProvider && typeof mediaChoice.activeModel === 'string' && mediaChoice.activeModel.trim()
    ? mediaChoice.activeModel.trim()
    : ''

  // 5. 兜底回退：customModel -> safeActiveModel -> DEFAULT_MEDIA_MODELS -> 'default'
  if (hasMediaProvider) {
    return safeActiveModel || customModel || (DEFAULT_MEDIA_MODELS && DEFAULT_MEDIA_MODELS[capability]) || 'default'
  }
  return customModel || safeActiveModel || (DEFAULT_MEDIA_MODELS && DEFAULT_MEDIA_MODELS[capability]) || 'default'
}

export const EXTERNAL_MEDIA_PROVIDERS = Object.freeze(['byok', 'fal', 'openai', 'openrouter', 'siliconflow', 'custom'])

/**
 * 判定指定的媒体提供商是否属于外部/BYOK 提供商（豁免官方 SubmitGuard 目录契约）
 * @param {unknown} providerId
 * @returns {boolean}
 */
export function isExternalMediaProvider(providerId) {
  return typeof providerId === 'string' && EXTERNAL_MEDIA_PROVIDERS.includes(providerId.toLowerCase().trim())
}

const CAPABILITY_SEAM = Object.freeze({
  video: 'videoGenerate',
  image: 'imageGenerate',
  audio: 'audioGenerate',
})

/**
 * @param {string} capability
 * @param {{
 *   prompt?: string,
 *   dest: string,
 *   duration?: number,
 *   image?: string,
 *   speech?: string,
 *   audio?: string,
 *   references?: Array<{ role?: string, type: string, pathOrUrl: string, [key: string]: unknown }>,
 *   audioTrack?: { role?: string, type: string, pathOrUrl: string, [key: string]: unknown },
 *   voice?: string,
 *   style?: string,
 *   instrumental?: boolean,
 *   speed?: number,
 *   format?: string,
 *   aspectRatio?: string,
 *   resolution?: string,
 *   sound?: boolean,
 *   seed?: number,
 *   watermark?: boolean,
 *   outputFormat?: string,
 *   referenceTaskType?: string,
 *   generationType?: string,
 *   returnLastFrame?: boolean,
 *   webSearch?: boolean,
 *   nsfwCheck?: boolean,
 *   fileUrl?: string,
 *   linkUrl?: string,
 *   provider?: string,
 *   model?: string,
 *   operation?: string,
 *   image_tail?: string,
 *   imageTail?: string,
 *   taskId?: string,
 *   submittedAt?: number,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 *   requestTimeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   wait?: boolean,
 *   signal?: AbortSignal,
 *   env?: Record<string, string | undefined>,
 *   media?: unknown,
 *   fetcher?: typeof fetch,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   runtime?: { execute: (req: object) => Promise<{ taskId?: string, outputs: Array<{ type: string, url?: string }> }> },
 * }} input
 */
const KNOWN_CAPABILITIES = Object.freeze(['image', 'video', 'audio'])

export async function executeOmnimuxMedia(capability, input) {
  if (!KNOWN_CAPABILITIES.includes(capability)) {
    throw new OmnimuxError('omnimux-invalid-request', `不支持的媒体能力类型: ${capability}，仅支持 image/video/audio`)
  }
  if (!input || typeof input !== 'object') {
    throw new OmnimuxError('omnimux-invalid-request', 'input must be an object')
  }
  if (!input.dest) {
    throw new OmnimuxError('omnimux-invalid-request', 'dest is required')
  }
  const taskRef = typeof input.taskRef === 'string' ? input.taskRef.trim() : ''
  const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : ''
  const isCollectRequest = Boolean(taskRef || taskId)
  const taskRecord = taskRef
    ? getMediaTaskRecord(taskRef)
    : (taskId ? findMediaTaskByUpstreamId(taskId) : null)

  let media = parseMediaConfig(input.media)

  // Collection belongs to the persisted provider, never today's composer settings.
  if (isCollectRequest) {
    if (taskRef && !taskRecord && !taskId) {
      throw new OmnimuxError('omnimux-task-not-found', '未找到对应的媒体任务记录，请重新提交生成')
    }
    if (taskRecord && taskRecord.capability !== capability) {
      throw new OmnimuxError('omnimux-invalid-request', '任务媒体类型与取回请求不一致')
    }
    if(taskRecord?.status==='ready'&&taskRecord.artifact?.cachePath&&existsSync(taskRecord.artifact.cachePath)) {
      if(input.dest!==taskRecord.artifact.cachePath){mkdirSync(dirname(input.dest),{recursive:true});copyFileSync(taskRecord.artifact.cachePath,input.dest)}
      return {mode:'live',taskRef:taskRecord.taskRef,taskId:taskRecord.upstreamTaskId??null,dest:input.dest,url:input.dest}
    }
    const effectiveTaskId = taskRecord?.upstreamTaskId || taskId
    if (!effectiveTaskId && !taskRecord?.artifact?.sourceUrl) throw new OmnimuxError('omnimux-invalid-request', '缺少有效的任务标识，无法轮询取回产物')
    let route
    if (taskRecord) {
      const providerId = taskRecord.providerId
      const row = media.providers[providerId]
      const credentialRef = taskRecord.credentialRef || row?.apiKeyEnv
        || (providerId === 'omnimux' ? 'OMNIMUX_API_KEY' : `OMNIMUX_MEDIA_KEY_${String(providerId).toUpperCase()}`)
      route = {
        capability,
        providerId,
        protocol: taskRecord.protocol,
        baseUrl: taskRecord.baseUrl,
        modelId: taskRecord.model,
        group: taskRecord.group,
        apiKeyEnv: credentialRef,
        // Inline credentials are read only from the same configured provider/origin.
        apiKey: row?.baseUrl === taskRecord.baseUrl && row?.protocol === taskRecord.protocol ? row?.apiKey : undefined,
      }
      if (providerId !== 'omnimux' && (input.runtimeSettings || input.credentials?.resolve)) {
        const matches = input.runtimeSettings?.byokProviders?.filter((item) => item && typeof item.provider === 'string'
          && item.provider.trim().toLowerCase() === providerId) || []
        if (input.runtimeSettings && matches.length !== 1) throw new OmnimuxError('omnimux-unconfigured', '原任务来源的供应商身份尚未确认；保留任务，不会沿用其它来源')
        const saved = matches[0]
        const currentOrigin = input.runtimeSettings ? saved?.endpoint?.trim() : row?.baseUrl
        if (!currentOrigin || currentOrigin.replace(/\/+$/, '') !== taskRecord.baseUrl.replace(/\/+$/, '') || saved?.saveState === 'pending') {
          throw new OmnimuxError('omnimux-unconfigured', '原任务来源的凭据尚未确认；保留任务记录，不会重新生成')
        }
        if (!input.credentials?.resolve) throw new OmnimuxError('omnimux-unconfigured', '原任务来源的当前凭据服务不可用；不会沿用调用方密钥')
        const hit = await input.credentials.resolve(credentialRef)
        if (hit?.value?.trim()) {
          route.apiKey = hit.value.trim()
          input = { ...input, env: { [credentialRef]: route.apiKey } }
        } else {
          route.apiKey = undefined
          throw new OmnimuxError('omnimux-unconfigured', '原任务来源的当前专属凭据未配置；不会沿用旧配置密钥')
        }
      }
    } else {
      route = resolveMediaRoute(capability, input, media, input.env)
    }
    const auth = await resolveMediaAuth(route, { env: input.env, store: input.store, credentials: input.credentials })
    if (taskRecord?.artifact?.sourceUrl) {
      try {
        await downloadMediaFile({ dest: input.dest, url: taskRecord.artifact.sourceUrl, capability, apiKey: auth.apiKey, providerId: route.providerId, fetcher: input.fetcher, signal: input.signal })
      } catch (error) {
        recordMediaCollectionFailure(taskRecord.taskRef, error)
        void appendMediaTaskLog({
          event: 'retrieve.failed',
          taskRef: taskRecord.taskRef,
          capability,
          message: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
      updateMediaTaskRecord(taskRecord.taskRef, { status: 'ready', collectionError: undefined, collectionErrorCode: undefined,
        artifact: { ...taskRecord.artifact, cachePath: input.dest } })
      return { mode: 'live', taskId: effectiveTaskId || null, taskRef: taskRecord.taskRef, url: taskRecord.artifact.sourceUrl }
    }
    let result
    try {
      result = await finishMediaTask(capability, route, {
        ...input,
        taskId: effectiveTaskId,
        taskPath: taskRecord?.taskPath || input.taskPath,
        submittedAt: taskRecord?.submittedAt ?? input.submittedAt,
        deadlineMs: taskRecord?.deadlineMs ?? input.deadlineMs,
        authKey: auth.apiKey,
      })
    } catch (error) {
      if (taskRecord) recordMediaCollectionFailure(taskRecord.taskRef, error)
      void appendMediaTaskLog({
        event: 'retrieve.failed',
        taskRef: taskRecord?.taskRef,
        capability,
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    if (taskRecord && result.mode === 'live') {
      updateMediaTaskRecord(taskRecord.taskRef, {
        status: 'ready', error: undefined, errorCode: undefined,
        collectionError: undefined, collectionErrorCode: undefined,
        artifact: { cachePath: input.dest, mimeType: `${capability}/${input.dest.split('.').pop() || 'octet-stream'}`, sizeBytes: 0 },
      })
      result.taskRef = taskRecord.taskRef
    }
    return result
  }

  try { assertScenarioRequestIntent(input) }
  catch (cause) { throw new OmnimuxError('omnimux-invalid-request', cause.message) }
  const configuredProvider = input.provider || media.defaultProvider
  const serverConfigured = !input.runtimeSettings && configuredProvider !== 'omnimux'
    && Boolean(media.providers?.[configuredProvider])
  if (serverConfigured) {
    const inline = parseModelAndGroup(input.model).group?.trim().toLowerCase()
    const selected = String(input.group || inline || '').trim().toLowerCase()
    const expected = `byok-${configuredProvider.toLowerCase()}`
    if ((selected && selected !== expected) || (Array.isArray(input.allowedGroups) && input.allowedGroups.length
      && input.allowedGroups.some((group) => group.trim().toLowerCase() !== expected))) {
      throw new OmnimuxError('unknown-group', '显式渠道与已配置媒体服务相互冲突')
    }
  }
  const plan = serverConfigured
    ? { finalReq: { ...input, provider: configuredProvider }, requireListed: false, isByok: false }
    : resolveExecutionPlan({ kind: capability, req: input, current: input.runtimeSettings, media, env: input.env })
  input = { ...input, ...plan.finalReq, env: input.env ?? plan.finalReq.env, requireListed: plan.requireListed }
  if (plan.isByok) {
    const provider = input.provider
    const choice = resolveScenarioChoice({ ...input.runtimeSettings,
      scenarioBindings: { ...input.runtimeSettings?.scenarioBindings,
        [capability]: { channel: 'byok', provider } } }, capability)
    const keyRef = choice.credentialRef
    const hit = await input.credentials?.resolve?.(keyRef)
    const providerKey = typeof hit?.value === 'string' ? hit.value.trim() : ''
    if (!providerKey) throw new OmnimuxError('omnimux-unconfigured', '此媒体服务的密钥未配置')
    const effectiveModel = parseModelAndGroup(input.model).modelId || choice.model
    const registered = media.providers?.[provider]
    if (!registered || registered.baseUrl?.replace(/\/+$/, '') !== choice.endpoint.replace(/\/+$/, '')) {
      throw new OmnimuxError('needs-provider', '此媒体服务尚未接入对应生成格式；保存配置不代表可以生成')
    }
    media = { ...media, providers: { ...media.providers,
      [provider]: { ...registered, apiKeyEnv: keyRef,
        models: { ...registered.models, [capability]: effectiveModel } } } }
    input = { ...input, provider, model: effectiveModel,
      env: { [keyRef]: providerKey } }
  }

  const route = resolveMediaRoute(capability, input, media, input.env)

  // 基于 requestKey 的幂等查重短路与原子排他占位：若账本中已存在相同调用意图，直接复用任务句柄，杜绝二次提交与扣费
  const requestKey = typeof input.requestKey === 'string' ? input.requestKey.trim() : ''
  let pendingTaskRecord = null
  let taskLock = null
  if (!isCollectRequest && requestKey) {
    const existingRecord = findMediaTaskByRequestKey(requestKey)
    if (existingRecord && existingRecord.capability === capability && existingRecord.model === route.modelId) {
      if (existingRecord.status === 'ready' && existingRecord.artifact?.cachePath && existsSync(existingRecord.artifact.cachePath)) {
        let finalUrl = existingRecord.artifact.cachePath
        if (input.dest && existingRecord.artifact.cachePath !== input.dest && existsSync(existingRecord.artifact.cachePath)) {
          try {
            mkdirSync(dirname(input.dest), { recursive: true })
            copyFileSync(existingRecord.artifact.cachePath, input.dest)
            finalUrl = input.dest
          } catch {
            // copy 失败仍回退 cachePath
          }
        }
        return {
          mode: 'live',
          taskId: existingRecord.upstreamTaskId || existingRecord.taskRef,
          taskRef: existingRecord.taskRef,
          url: finalUrl,
        }
      }
      if (existingRecord.status === 'ready') {
        if (!existingRecord.upstreamTaskId && !existingRecord.artifact?.sourceUrl) throw new OmnimuxError('omnimux-artifact-unavailable', '原生成文件已不可用；不会自动重新生成')
        return executeOmnimuxMedia(capability, { ...input, taskRef: existingRecord.taskRef, taskId: existingRecord.upstreamTaskId })
      }
      if (existingRecord.status === 'failed' && existingRecord.upstreamTaskId) {
        throw new OmnimuxError('omnimux-task-conflict', '原任务结果需按任务引用核实，不能以相同请求标识重新提交')
      }
      if (existingRecord.status === 'submitted' || (existingRecord.status === 'submitting' && existingRecord.upstreamTaskId)) {
        return {
          mode: 'submitted',
          taskId: existingRecord.upstreamTaskId || null,
          taskRef: existingRecord.taskRef,
          url: null,
        }
      }
    }

    // 审查意见 1 & 2 & 3: 建立确定性排他占位锁，防止高并发瞬时重复提交
    taskLock = acquireMediaTaskLock(requestKey)
    if (!taskLock.acquired) {
      const concurrentRecord = findMediaTaskByRequestKey(requestKey)
      if (concurrentRecord && concurrentRecord.capability === capability && concurrentRecord.model === route.modelId) {
        if (concurrentRecord.status === 'submitted' || (concurrentRecord.status === 'submitting' && concurrentRecord.upstreamTaskId)) {
          return {
            mode: 'submitted',
            taskId: concurrentRecord.upstreamTaskId || null,
            taskRef: concurrentRecord.taskRef,
            url: null,
          }
        }
      }
      throw new OmnimuxError('omnimux-task-conflict', 'A matching media task is already being submitted')
    }
  }

  try {
    const prompt = typeof input.prompt === 'string' ? input.prompt : ''
  const seam = CAPABILITY_SEAM[capability] ?? capability
  const assets = await probeMediaAssets(input, { capability, seam })

  // Media providers (fal, openai, openrouter, siliconflow, custom, byok) are external endpoints.
  // Skip the submit guard for them; the endpoint decides what it accepts.
  const isByok = isExternalMediaProvider(route.providerId)
  let guardPlan = null
  let guardRequest = null
  if (isByok) {
    guardPlan = {
      plan: null,
      byok: true,
      prompt,
      modelId: route.modelId,
      // A BYOK endpoint speaks the generic speech shape; ride the synchronous
      // channel unless the caller named another operation.
      operationId: typeof input.operation === 'string' && input.operation.trim()
        ? input.operation.trim()
        : (capability === 'audio' ? 'text_to_speech' : undefined),
    }
  } else {
    guardRequest = {
      prompt,
      model: route.modelId,
      group: splitRoutingCandidate(route.candidates[0] || route.modelId).group ?? route.group,
      quality: input.quality,
      n: input.n,
      operation: input.operation,
      speech: input.speech,
      duration: input.duration,
      voice: input.voice,
      style: input.style,
      instrumental: input.instrumental,
      speed: input.speed,
      format: input.format,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      sound: input.sound,
      seed: input.seed,
      watermark: input.watermark,
      outputFormat: input.outputFormat,
      referenceTaskType: input.referenceTaskType,
      generationType: input.generationType,
      returnLastFrame: input.returnLastFrame,
      webSearch: input.webSearch,
      nsfwCheck: input.nsfwCheck,
      fileUrl: input.fileUrl,
      linkUrl: input.linkUrl,
      assets,
      capability,
      seam,
    }
    guardPlan = assertGuardSubmit(guardRequest,
    {
      seam,
      capability,
      outputType: capability === 'video' || capability === 'image' || capability === 'audio' ? capability : undefined,
      requireListed: input.requireListed,
    },
  )
  }

  const mappedInput = mapOmnimuxInput(capability, {
    prompt: guardPlan.prompt,
    model: guardPlan.modelId,
    duration: input.duration,
    image: input.image,
    speech: input.speech,
    audio: input.audio,
    references: input.references,
    audioTrack: input.audioTrack,
    voice: input.voice,
    style: input.style,
    instrumental: input.instrumental,
    speed: input.speed,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    operation: guardPlan.operationId,
    guardPlan,
  })

  // Local CLI speech models (gemini-3.8-flash-tts) run directly via opencli without remote auth
  if (capability === 'audio' && guardPlan.operationId === 'text_to_speech' && guardPlan.modelId === 'gemini-3.8-flash-tts') {
    return generateCliSpeech({
      route,
      guardPlan,
      payload: mappedInput,
      dest: input.dest,
      signal: input.signal,
      runner: input.cliRunner,
    })
  }

  // ComfyUI 专属 GPU 算力实例（工作流 U06，docs/comfyui-instance-api-spec.md）：
  // 画布/调用方以 minimax-h3@comfyui 显式选中「全能参考版」渠道组时才命中；
  // 该实例自有多模态素材上传与任务队列，不依赖云端网关凭据，未配置地址时响亮失败。
  if (isComfyUiVideoRoute({ capability, group: route.group, candidates: route.candidates, modelId: guardPlan.modelId })) {
    return generateComfyUiVideo({
      payload: mappedInput,
      dest: input.dest,
      signal: input.signal,
      env: input.env,
      fetcher: input.fetcher,
      deadlineMs: input.deadlineMs,
      pollIntervalMs: input.pollIntervalMs,
    })
  }

  const auth = await resolveMediaAuth(route, {
    env: input.env,
    store: input.store,
    credentials: input.credentials,
  })

  const wait = input.wait !== false

  if (capability === 'audio' && guardPlan.operationId === 'text_to_speech') {
    return generateSpeech({
      route, guardPlan, payload: mappedInput, apiKey: auth.apiKey,
      dest: input.dest, fetcher: input.fetcher, signal: input.signal,
    })
  }

  const shouldHost = (input.uploadLocalAssets ?? !input.runtime) && isRemoteGateway(route.baseUrl) && Boolean(auth.apiKey)
  const useReferenceStorage = ['image', 'video'].includes(capability) && input.runtimeSettings?.referenceStorage?.enabled === true
  const finalInput = useReferenceStorage
    ? await prepareReferencePayload(mappedInput, {
      config: input.runtimeSettings.referenceStorage,
      expectedAssets: assets,
      credentials: input.credentials,
      signal: input.signal,
    })
    : shouldHost
      ? await hostLocalAssetsIfNeeded(mappedInput, {
        baseUrl: route.baseUrl,
        apiKey: auth.apiKey,
        fetcher: input.fetcher,
        signal: input.signal,
      })
      : mappedInput

  {
      pendingTaskRecord = createMediaTaskRecord({
        capability,
        model: route.modelId,
        operation: input.operation,
        providerId: route.providerId,
        protocol: route.protocol || 'openai-media',
        baseUrl: route.baseUrl,
        wireModel: route.wireModel || route.modelId,
        group: route.group,
        taskPath: taskPathFor(capability, route.modelId),
        requestKey,
        credentialRef: route.apiKeyEnv,
      })
      saveMediaTaskRecord(pendingTaskRecord)
  }

  let result
  let acceptedRoute = route
  const isChannelRouting = Boolean(route.group || route.candidates?.some((c) => c.includes('@')))
  const candidates = (route.candidates && route.candidates.length > 0 ? route.candidates : [route.modelId])
    .slice(0, isChannelRouting ? 4 : 2)
  for (const [attempt, candidate] of candidates.entries()) {
    let submitted = false
    // A candidate carries routing intent as `model@wireGroup`. The group travels
    // as its own header, so the model id sent upstream must be the bare id — not
    // the candidate string, which the gateway would read as an unknown model.
    const { modelId: candidateModelId, group: candidateGroup } = splitRoutingCandidate(candidate)
    const candidateRoute = { ...route, modelId: candidateModelId || route.modelId, group: candidateGroup ?? route.group, taskPath: taskPathFor(capability, route.modelId) }
    const onSubmitted = (upstreamTaskId) => {
      submitted = true
      acceptedRoute = candidateRoute
      updateMediaTaskRecord(pendingTaskRecord.taskRef, {
        status: 'submitted', upstreamTaskId,
        wireModel: candidateRoute.modelId, group: candidateRoute.group,
        credentialRef: candidateRoute.apiKeyEnv,
      })
      void appendMediaTaskLog({
        event: 'submit.accepted',
        taskRef: pendingTaskRecord.taskRef,
        requestKey,
        capability,
        model: candidateRoute.modelId,
        channel: candidateRoute.group,
        attempt,
      })
    }
    const runtime = input.runtime ?? createProtocolRuntime(candidateRoute, input.fetcher, auth.apiKey, onSubmitted)
    try {
      acceptedRoute = candidateRoute
      if (!isByok && guardRequest) {
        const candidateRow = getModelChannelGroups(route.modelId).find((row) =>
          (row.wireModel || route.modelId) === candidateRoute.modelId
          && (row.wireGroup || row.id) === candidateRoute.group)
        const constraints = candidateRow?.constraints
        if (constraints?.operations?.length && !constraints.operations.includes(guardPlan.operationId)) {
          throw new OmnimuxError('omnimux-invalid-request', '所选备用线路不支持此生成操作')
        }
        for (const [key, domain] of Object.entries(constraints?.parameters || {})) {
          const value = finalInput[key] ?? guardRequest[key]
          if (value === undefined) continue
          if ((domain.fixed !== undefined && value !== domain.fixed)
            || (Array.isArray(domain.only) && !domain.only.includes(value))
            || (typeof domain.min === 'number' && value < domain.min)
            || (typeof domain.max === 'number' && value > domain.max)) {
            throw new OmnimuxError('omnimux-invalid-request', `${key} 不满足备用线路限制${domain.fixed !== undefined ? `：${domain.fixed}` : ''}`)
          }
        }
        assertGuardSubmit({ ...guardRequest, group: candidateRow?.id || candidateRoute.group }, {
          seam, capability, outputType: capability, requireListed: input.requireListed,
        })
      }
      // Pools may cross image protocols. Re-admit each candidate against the
      // original logical intent; never reuse beta size fields on a pixel line.
      let candidateInput = finalInput
      if (!isByok && route.modelId === 'gpt-image-2.5') {
        const remapped = assertGuardSubmit({ ...guardRequest, group: candidateRoute.group }, {
          seam, capability, outputType: capability, requireListed: input.requireListed,
        }).vendorPayload
        // Asset hosting is independent of the line's size protocol. Preserve its
        // public URLs and remap only the line-dependent generation parameters.
        candidateInput = { ...finalInput }
        for (const key of ['size', 'resolution', 'quality', 'n']) {
          delete candidateInput[key]
          if (remapped[key] !== undefined) candidateInput[key] = remapped[key]
        }
      }
      result = await runtime.execute({
        providerId: route.providerId,
        modelId: `${route.providerId}-${capability}`,
        input: { ...candidateInput, model: candidateModelId || candidate },
        // Covers submit *and* the poll this same call performs when it waits
        // (`metadata.wait`): the outer budget must sit above the poll deadline,
        // otherwise runtime-kit's own abort replaces `omnimux-task-timeout`.
        timeoutMs: MEDIA_EXECUTION_BUDGET_MS,
        metadata: { wait, onSubmitted },
        ...(input.signal ? { signal: input.signal } : {}),
      })
      break
    } catch (error) {
      const unwrapped = unwrapAdapterError(error)
      void appendMediaTaskLog({
        event: 'submit.failed',
        taskRef: pendingTaskRecord.taskRef,
        requestKey,
        capability,
        model: candidateModelId || candidate,
        channel: candidateGroup ?? route.group,
        upstreamCode: typeof unwrapped?.code === 'string' ? unwrapped.code : undefined,
        httpStatus: typeof unwrapped?.status === 'number' ? unwrapped.status : undefined,
        attempt,
        message: unwrapped?.message ?? (error instanceof Error ? error.message : String(error)),
      })
      const classified = classifyQuotaFailure({ error, cause: error, message: error?.message })
      if (classified.kind === 'quota-exceeded') {
        throw new OmnimuxError('quota-exceeded', classified.message)
      }
      // A group plan may still succeed on its next group when this one is
      // forbidden or does not serve the model. A plain alias fallback must not:
      // "model not found" tells the alias nothing new, so it keeps the narrow
      // channel-evidence rule.
      const channelUnavailable = unwrapped?.code === 'CHANNEL_UNAVAILABLE'
        || (isChannelRouting ? hasGroupFailoverEvidence(unwrapped) : hasChannelEvidence(unwrapped))
      if (channelUnavailable && classified.kind === 'needs-omnimux') {
        throw new OmnimuxError(classified.code, classified.message)
      }
      if (channelUnavailable && !submitted && !input.signal?.aborted && attempt + 1 < candidates.length) continue
      throw unwrapped
    }
  }

  if (!guardPlan?.byok) {
    assertGuardOutput(guardPlan, result, { capability })
  }

  const url = result.outputs.find((item) => item.type === capability)?.url
  const submittedId = result.taskId ?? null
  if (url) updateMediaTaskRecord(pendingTaskRecord.taskRef, {
    status: 'submitted', artifact: { sourceUrl: url }, wireModel: acceptedRoute.modelId, group: acceptedRoute.group,
  })
  if (submittedId) {
    updateMediaTaskRecord(pendingTaskRecord.taskRef, {
      status: 'submitted', upstreamTaskId: submittedId,
      wireModel: acceptedRoute.modelId, group: acceptedRoute.group,
    })
  }
  if (!wait && !url) {
    if (!submittedId) {
      throw new OmnimuxError('omnimux-invalid-response', 'submit returned no task_id')
    }
    return { mode: 'submitted', taskId: submittedId, taskRef: pendingTaskRecord.taskRef, url: null }
  }

  if (!url) {
    throw new OmnimuxError('omnimux-invalid-response', `runtime completed without a ${capability} url`)
  }
  await downloadMediaFile({
    dest: input.dest,
    url,
    capability,
    apiKey: auth.apiKey,
    providerId: route.providerId,
    fetcher: input.fetcher,
    signal: input.signal,
    sleep: input.sleep,
  })

  // wait: true 同步生成模式下，成功下载后同样持久化 ready 账本，确保相同 requestKey 命中完成态缓存。
  // 上游同步出图时（wait:false 也直接拿到 url）：更新提交前创建的 pendingTaskRecord 同一条记录为
  // ready，不再另起孤儿 submitting 记录，并把 taskRef 返回给前端续传（#3011）。
  updateMediaTaskRecord(pendingTaskRecord.taskRef, {
    status: 'ready',
    upstreamTaskId: submittedId || undefined,
    artifact: {
      cachePath: input.dest,
      mimeType: `${capability}/${input.dest.split('.').pop() || 'octet-stream'}`,
      sizeBytes: 0,
    },
  })
  return { mode: 'live', taskId: submittedId, url, taskRef: pendingTaskRecord.taskRef }
} catch (submitError) {
  // 提交链路任何失败都要把占位记录标为 failed：否则账本永远停在 submitting，
  // 前端刷新续传时会误判为“已中断”（#3011）
  if (pendingTaskRecord) {
    try {
      const current = getMediaTaskRecord(pendingTaskRecord.taskRef)
      if (current?.upstreamTaskId || current?.artifact?.sourceUrl) {
        recordMediaCollectionFailure(pendingTaskRecord.taskRef, submitError)
        if (submitError && typeof submitError === 'object') {
          submitError.taskRef = pendingTaskRecord.taskRef
          submitError.recoverable = submitError.code !== 'omnimux-failed'
        }
      }
      else updateMediaTaskRecord(pendingTaskRecord.taskRef, {
        status: 'failed',
        error: submitError instanceof Error ? submitError.message : String(submitError),
        errorCode: typeof submitError?.code === 'string' ? submitError.code : undefined,
      })
    } catch (ledgerError) {
      console.warn('[media] failure diagnostic could not be persisted:', ledgerError.message)
    }
  }
  throw submitError
} finally {
  taskLock?.release()
}
}

/**
 * Poll a task by id and download its artifact — the hub's reconcile entry.
 *
 * Issue #1382: this path reads no process-local state (the hub keeps no task
 * ledger), which is exactly why it can finish a task submitted by a *previous*
 * process. What it gained here is a bound and an anchor: `submittedAt` (the
 * persisted first-submit time) fixes the deadline so a restart cannot restart
 * the clock, and past that deadline the call fails immediately without issuing
 * a single request.
 *
 * @param {string} capability
 * @param {ReturnType<typeof resolveMediaRoute>} route
 * @param {{
 *   dest: string,
 *   taskId: string,
 *   fetcher?: typeof fetch,
 *   signal?: AbortSignal,
 *   authKey?: string,
 *   env?: Record<string, string | undefined>,
 *   store?: { resolve: () => Promise<string | undefined> },
 *   credentials?: { resolve: (ref: string) => Promise<{ value?: string } | undefined> },
 *   submittedAt?: number,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 *   requestTimeoutMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} input
 */
export async function finishMediaTask(capability, route, input) {
  let apiKey = input.authKey
  if (apiKey === undefined) {
    const auth = await resolveMediaAuth(route, {
      env: input.env,
      store: input.store,
      credentials: input.credentials,
    })
    apiKey = auth.apiKey
  }
  const done = await pollOpenAiMediaTask({
    fetcher: withRoutingGroup(input.fetcher ?? fetch, route.group).fetcher,
    baseUrl: route.baseUrl,
    apiKey,
    taskId: input.taskId,
    capability,
    // Submit and reconcile must address the same task route; an audio model
    // served on the shared video task endpoint carries its own path.
    taskPath: input.taskPath ?? taskPathFor(capability, route.modelId),
    signal: input.signal,
    // This is the reconcile entry a canvas node reports through, so it opts into
    // the detail read that names a terminal failure's cause (Issue #2092).
    resolveFailureReason: true,
    ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
    ...(input.deadlineMs !== undefined ? { deadlineMs: input.deadlineMs } : {}),
    ...(input.pollIntervalMs !== undefined ? { pollIntervalMs: input.pollIntervalMs } : {}),
    ...(input.requestTimeoutMs !== undefined ? { requestTimeoutMs: input.requestTimeoutMs } : {}),
    ...(input.sleep !== undefined ? { sleep: input.sleep } : {}),
  })
  const url = pickMediaUrl(done)
  if (!url) {
    throw new OmnimuxError('omnimux-invalid-response', `task ${input.taskId} completed without a ${capability} url`)
  }
  // A poll has no original submit operation to recover, but it still crosses
  // the output boundary. Validate the completed result shape here; the
  // download layer below validates the response MIME before it writes bytes.
  assertGuardOutput(
    { operation: { output: { type: capability } } },
    { mode: 'live', outputs: [{ type: capability, url }] },
    { capability },
  )
  await downloadMediaFile({
    dest: input.dest,
    url,
    capability,
    apiKey,
    providerId: route.providerId,
    fetcher: input.fetcher,
    signal: input.signal,
  })
  return { mode: 'live', taskId: input.taskId, url }
}

/**
 * @param {ReturnType<typeof resolveMediaRoute>} route
 * @param {typeof fetch} [fetcher]
 * @param {string} [apiKey]
 * @param {(taskId: string) => void} [onSubmitted]
 */
function createProtocolRuntime(route, fetcher, apiKey = route.apiKey, onSubmitted) {
  if (route.protocol === 'openai-media') {
    return createOpenAiMediaRuntime({
      fetcher,
      apiKey: apiKey || '',
      baseUrl: route.baseUrl,
      providerId: route.providerId,
      modelId: route.modelId,
      capability: route.capability,
      group: route.group,
      taskPath: route.taskPath,
      onSubmitted,
    })
  }
  throw new OmnimuxError('unknown-protocol', `unsupported media protocol '${route.protocol}'`)
}

/**
 * Split a routing candidate `model@wireGroup` into its two halves.
 *
 * Routing candidates are *gateway* ids, not product ids: `gatewayCandidates`
 * deliberately keeps every upstream-accepted spelling (e.g. `seedance-2-0-fast`
 * and `seedance-2.0-fast`) so the alias retry can walk them in order. Resolving
 * the candidate through the product-id normalizer would collapse those spellings
 * into one and silently drop the retry, so this split stays literal.
 *
 * @param {unknown} candidate
 * @returns {{ modelId: string, group: string | null }}
 */
function splitRoutingCandidate(candidate) {
  const raw = typeof candidate === 'string' ? candidate.trim() : ''
  if (!raw) return { modelId: '', group: null }
  const atIndex = raw.indexOf('@')
  if (atIndex <= 0) return { modelId: raw, group: null }
  const modelId = raw.slice(0, atIndex).trim()
  const group = raw.slice(atIndex + 1).trim()
  if (!modelId) return { modelId: raw, group: null }
  return { modelId, group: group || null }
}
