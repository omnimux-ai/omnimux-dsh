import { parseModelAndGroup, resolveRequestChannelIntent, resolveChannelPlan } from '../catalog/serving/channel-groups.js'
import { DEFAULT_MEDIA } from './route.js'
import { findMediaModel } from './catalog.js'
import { resolveScenarioChoice, assertScenarioRequestIntent } from '../settings/runtime-mode.js'
import { OmnimuxError } from './errors.js'
import { buildModelCatalog } from '../catalog/list.js'

/** @typedef {{modelId:string, channelIntent:object, isOfficialRequest:boolean, isOfficialBypass:boolean, isTaskCollect:boolean, isByok:boolean, requireListed:boolean, finalReq:object}} RouteDecision */

/** Resolve the saved scenario once; accepted tasks retain their recorded route.
 * @param {{kind:'image'|'video'|'audio', req:object, current?:object}} input
 * @returns {RouteDecision}
 */
export function resolveExecutionPlan({ kind, req, current, media, env }) {
  try { assertScenarioRequestIntent(req) }
  catch (cause) { throw new OmnimuxError('omnimux-invalid-request', cause.message) }
  const channelIntent = resolveRequestChannelIntent(req)
  const serverEnv = Object.fromEntries(['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN']
    .filter((key) => typeof process.env[key] === 'string' && process.env[key].trim().startsWith('sk-'))
    .map((key) => [key, process.env[key]]))
  const isTaskCollect = Boolean(req.taskRef || req.taskId)
  if (isTaskCollect) {
    return { modelId: req.model || '', channelIntent, isOfficialRequest: false,
      isOfficialBypass: true, isTaskCollect: true, isByok: false, requireListed: false, finalReq: { ...req, env: serverEnv } }
  }
  const { modelId: requestModelId } = parseModelAndGroup(req.model)
  const explicitProvider = typeof req.provider === 'string' ? req.provider.trim().toLowerCase() : ''
  const target = channelIntent.requestedChannel || channelIntent.effectiveChannel
  if (target && !channelIntent.isByokChannel && !channelIntent.isOfficialChannel) {
    throw new OmnimuxError('unknown-group', '所选媒体渠道不可用')
  }
  const explicitOfficial = channelIntent.isOfficialChannel || explicitProvider === 'omnimux'
    || Boolean(requestModelId && findMediaModel(kind, requestModelId) && !target && !explicitProvider)
  if (channelIntent.isOfficialChannel && target && requestModelId) {
    const lines = resolveChannelPlan(req.model, { group: req.group, allowedGroups: req.allowedGroups })
    if (!lines.candidates.length) throw new OmnimuxError('unknown-group', '所选线路尚未配置或已停用')
  }
  const explicitByok = channelIntent.isByokChannel || (explicitProvider && explicitProvider !== 'omnimux')
  if (explicitByok && explicitOfficial) throw new OmnimuxError('unknown-group', '所选媒体渠道相互冲突')
  const provider = channelIntent.byokProvider || explicitProvider
  const settings = explicitOfficial || explicitByok
    ? { ...current, scenarioBindings: { ...current?.scenarioBindings,
        [kind]: explicitByok ? { channel: 'byok', provider } : { channel: 'official' } } }
    : current
  const choice = resolveScenarioChoice(settings, kind)
  if (!choice.configured) throw new OmnimuxError('omnimux-unconfigured', choice.reason || '此媒体用途尚未配置')
  const isOfficialRequest = choice.channel === 'official'
  const isByok = choice.channel === 'byok'
  const defaultField = `default${kind[0].toUpperCase()}${kind.slice(1)}Model`
  const configuredDefault = isOfficialRequest && !requestModelId && current?.[defaultField]
    ? buildModelCatalog({ media, env: env || process.env, settingsDefaults: current }).defaults[kind] : ''
  const modelId = requestModelId || (isOfficialRequest ? configuredDefault || DEFAULT_MEDIA.providers.omnimux.models[kind] : choice.model)
  const finalReq = { ...req, provider: isOfficialRequest ? 'omnimux' : choice.provider,
    ...(req.model || isByok || configuredDefault ? { model: req.model || modelId } : {}),
    ...(isOfficialRequest ? { env: serverEnv } : {}) }
  return { modelId, channelIntent, isOfficialRequest, isOfficialBypass: isOfficialRequest,
    isTaskCollect: false, isByok, requireListed: !isByok, finalReq }
}
