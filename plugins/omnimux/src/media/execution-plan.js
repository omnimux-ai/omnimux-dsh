// 单一放行/渠道决策点（#2920 I1）：text/media 共用的 RouteDecision 拥有者。
// mount 只做能力门禁并调用本函数；execute 只消费 RouteDecision 不再重复判定；
// 直连 HTTP 亦经同一条链，requireListed 从 BYOK 语义推导而不是硬编码。
import { getModelChannelGroups, parseModelAndGroup, resolveRequestChannelIntent } from '../catalog/serving/channel-groups.js'
import { DEFAULT_MEDIA } from './route.js'
import { findMediaModel } from './catalog.js'
import { resolveRuntimeChoice, assertRuntimeReady } from '../settings/runtime-mode.js'
import { isAuthenticOfficialToken } from './mount.js'

/**
 * @typedef {object} RouteDecision
 * @property {string} modelId            最终使用的模型 id（请求指定或官方默认）
 * @property {boolean} isOfficialRequest 该请求命中官方专线语义
 * @property {boolean} isOfficialBypass  官方目录/服务端覆盖放行，凭证由操作执行时解析
 * @property {boolean} isTaskCollect     taskRef/taskId 收取态（上游已执行）
 * @property {boolean} isByok            显式 BYOK / 自定义渠道
 * @property {boolean} requireListed     是否要求操作已被收录（BYOK 恒 false）
 * @property {object} finalReq           依决策改写后的请求（env 注入或剥离）
 */

/**
 * @param {{ kind: 'video'|'image'|'audio', req: object, current?: object }} input
 * @returns {RouteDecision}
 */
export function resolveExecutionPlan({ kind, req, current }) {
  const channelIntent = resolveRequestChannelIntent(req)
  // Planning never reads profiles or login stores. Only an explicit server override
  // may be carried into the request; operation-time auth resolves current credentials.
  const rawSystemToken = [process.env.OMNIMUX_API_KEY, process.env.OMNIMUX_TOKEN]
    .find((value) => isAuthenticOfficialToken(value) && value.trim().startsWith('sk-'))
  const hasOfficialToken = Boolean(rawSystemToken)

  const runtime = resolveRuntimeChoice(current)
  const rawTargetChannel = channelIntent.requestedChannel || channelIntent.effectiveChannel
  const targetChannel = typeof rawTargetChannel === 'string' ? rawTargetChannel.toLowerCase().trim() : ''
  const { modelId: requestModelId } = parseModelAndGroup(req?.model)
  const defaultOfficialModel = DEFAULT_MEDIA?.providers?.omnimux?.models?.[kind] || ''
  const effectiveModelId = requestModelId || defaultOfficialModel
  const modelGroups = effectiveModelId ? getModelChannelGroups(effectiveModelId) : []

  const isKnownOfficial = targetChannel
    ? (targetChannel === 'official' || modelGroups.some((group) => {
        const gid = typeof group.id === 'string' ? group.id.toLowerCase().trim() : ''
        const wire = typeof group.wireGroup === 'string' ? group.wireGroup.toLowerCase().trim() : ''
        return gid === targetChannel || wire === targetChannel
      }))
    : (runtime.mode === 'official')

  const isCatalogOfficialModel = Boolean(effectiveModelId && findMediaModel(kind, effectiveModelId))
  const isOfficialModel = Boolean(effectiveModelId && (modelGroups.length > 0 || isCatalogOfficialModel))
  // Local, non-gateway media models run without remote auth or a verified
  // cloud runtime: the local CLI speech model (#2801) and the loopback Google
  // Vids channel (#3167). Both are reachable only by explicitly naming them.
  const isCliLocalModel = (kind === 'audio' && effectiveModelId === 'gemini-3.8-flash-tts')
    || (kind === 'video' && effectiveModelId === 'google-vids-omni')
  const hasVerifiedRuntime = Boolean(runtime.textReady || runtime.mediaReady)
  const isFallbackOfficial = !targetChannel && current?.allowOfficialMediaFallback === true && hasVerifiedRuntime
  const explicitProvider = typeof req.provider === 'string' && req.provider.trim() ? req.provider.trim() : ''
  const isOfficialRequest = !channelIntent.isByokChannel && (!explicitProvider || explicitProvider === 'omnimux')
    && (
      (targetChannel && isKnownOfficial && (channelIntent.isOfficialChannel || runtime.mode === 'official'))
      || (!targetChannel && (runtime.mode === 'official' || isOfficialModel || isFallbackOfficial))
    )

  const isTaskCollect = Boolean(req.taskRef || req.taskId)
  const isOfficialBypass = isOfficialRequest && (isOfficialModel || hasOfficialToken || isCliLocalModel)
  const shouldBypassRuntimeReady = isOfficialBypass || isTaskCollect
  if (!shouldBypassRuntimeReady) {
    assertRuntimeReady(current, kind)
  }

  let finalReq
  if (isOfficialRequest) {
    finalReq = {
      ...req,
      provider: 'omnimux',
      env: hasOfficialToken ? { OMNIMUX_API_KEY: rawSystemToken.trim() } : {},
    }
  } else {
    finalReq = req
  }

  return {
    modelId: effectiveModelId,
    channelIntent,
    isOfficialRequest,
    isOfficialBypass,
    isTaskCollect,
    isByok: Boolean(channelIntent.isByokChannel),
    requireListed: !channelIntent.isByokChannel,
    finalReq,
  }
}
