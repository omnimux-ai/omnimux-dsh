import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateCandidateRequest } from '../lib/capability-core.js'
import { avatarDirOf } from './paths.js'
import { AvatarError } from './store.js'
import { validateMentions } from './mentions.js'
import { resolveAvatarDestination } from './artifact.js'

const invalid = message => new AvatarError('invalid_request', message, 400)
const messageOf = error => error instanceof Error ? error.message : String(error)

/** Business intent only; provider fields and paid admission remain in the hub. */
export function motionPrompt(mode, extra = '', species = '') {
  const instruction = mode === 'replace'
    ? 'Replace only the main subject using the reference character images. Preserve the scene, camera movement, lighting, objects and timing of the reference video.'
    : 'Use the reference video for body movements, rhythm and camera trajectory. Keep the same location type and spatial layout; preserve shot size, camera angle and height, camera trajectory, lighting direction and time of day. Preserve the quantity, position and scale of props that touch, block or support the subject. Keep background people in their original number, positions and actions, while allowing their faces, hair and clothing to differ. Small surface/material/color changes are allowed; do not add props, people or light sources. Preserve the reference character identity and outfit.'
  const identity = species === 'cat' || species === 'dog' ? ` Keep the ${species} bipedal, retaining animal ears, muzzle, fur, tail and paws.` : ''
  return instruction + identity + (extra.trim() ? '\nAdditional direction: ' + extra.trim() : '')
}

export function selectMotionCandidate(catalog, assets, parameters, prompt) {
  const directory = Array.isArray(catalog?.models) ? catalog.models : catalog?.video ?? []
  const preferred = catalog?.defaultsByOperation?.video_multi_ref ?? catalog?.defaults?.video
  const rows = preferred ? directory.filter(row => row.id === preferred) : directory
  const matches = []
  const defaultValues = new Map()
  const ambiguous = new Set()
  const applicable = rows.filter(row => {
    const operation = row.operations?.find(op => op.id === 'video_multi_ref' && op.listed === true && op.output?.type === 'video')
    if (!operation || !(row.channelGroups ?? []).some(group => group.enabled === true) || Array.isArray(catalog?.models) && !(catalog.video ?? []).some(item => item.id === row.id)) return false
    const definitions = Object.fromEntries(Object.entries({ ...(row.parameters ?? {}), ...(operation.parameters ?? {}) }).map(([field, definition]) => { const { defaultValue, ...domain } = definition; return [field, domain] }))
    const logicalParameters = { ...parameters, ...(definitions.prompt ? { prompt } : {}) }
    const sources = Object.fromEntries(Object.keys(definitions).map(field => [field, Object.hasOwn(logicalParameters,field) ? {source:'explicit',value:logicalParameters[field]} : {source:'absent'}]))
    const inputs = operation.inputs.map(slot => {const {limitSource,...domain}=slot;return domain})
    const inputGroups = operation.inputGroups?.map(item=>{const {hint,...domain}=item;return domain})
    return row.channelGroups.some(group => {
      if (group.enabled !== true) return false
      const result = evaluateCandidateRequest({operation:{id:operation.id,inputs,...(inputGroups?{inputGroups}:{})},parameters:definitions,constraints:group.constraints??{},knownOperationIds:[...new Set(rows.flatMap(item=>(item.operations??[]).map(op=>op.id)))],currentEligibility:'pending'},
        {assets,prompt,logicalParameters,parameterSources:sources,parameterAuthority:'resolved'})
      return result.status==='pending' && result.diagnostics.every(item=>item.code==='eligibility_pending')
    })
  })
  for (const row of applicable) {
    const operation = row.operations.find(op => op.id === 'video_multi_ref')
    for (const [field, definition] of Object.entries({ ...(row.parameters ?? {}), ...(operation.parameters ?? {}) })) {
      if (Object.hasOwn(parameters, field) || field === 'prompt') continue
      const value = Object.hasOwn(definition, 'defaultValue') ? definition.defaultValue : undefined
      if (defaultValues.has(field) && !Object.is(defaultValues.get(field), value)) ambiguous.add(field)
      else defaultValues.set(field, value)
    }
  }
  for (const row of applicable) {
    const operation = row.operations.find(op => op.id === 'video_multi_ref')
    const fields = { ...(row.parameters ?? {}), ...(operation.parameters ?? {}) }
    for (const field of defaultValues.keys()) if (!Object.hasOwn(fields, field)) ambiguous.add(field)
  }
  if (ambiguous.size) return null
  for (const row of applicable) {
    const operation = row.operations?.find(op => op.id === 'video_multi_ref' && op.listed === true && op.output?.type === 'video')
    if (!operation) continue
    if (Array.isArray(catalog?.models) && !(catalog.video ?? []).some(item => item.id === row.id)) continue
    for (const group of row.channelGroups ?? []) {
      if (group.enabled !== true) continue
      const originals = { ...(row.parameters ?? {}), ...(operation.parameters ?? {}) }
      const definitions = Object.fromEntries(Object.entries(originals).map(([key, definition]) => { const { defaultValue, ...domain } = definition; return [key, domain] }))
      const logicalParameters = { ...parameters }
      if (definitions.prompt) logicalParameters.prompt = prompt
      const parameterSources = {}
      for (const [field, definition] of Object.entries(originals)) {
        if (Object.hasOwn(logicalParameters, field)) parameterSources[field] = { source: 'explicit', value: logicalParameters[field] }
        else if (Object.hasOwn(definition, 'defaultValue') && group.constraints?.parameters?.[field]?.supported !== false) {
          logicalParameters[field] = definition.defaultValue
          parameterSources[field] = { source: 'definition-default', value: definition.defaultValue }
        } else parameterSources[field] = { source: 'absent' }
      }
      const inputs = operation.inputs.map(slot => { const { limitSource, ...declaration } = slot; return declaration })
      const inputGroups = operation.inputGroups?.map(item => { const { hint, ...declaration } = item; return declaration })
      const result = evaluateCandidateRequest({ operation: { id: operation.id, inputs, ...(inputGroups ? { inputGroups } : {}) }, parameters: definitions,
        constraints: group.constraints ?? {}, knownOperationIds: [...new Set(rows.flatMap(item => (item.operations ?? []).map(op => op.id)))], currentEligibility: 'pending' },
        { assets, prompt, logicalParameters, parameterSources, parameterAuthority: 'resolved' })
      if (result.status === 'pending' && result.diagnostics.every(item => item.code === 'eligibility_pending')) matches.push({ model: row.id, group: group.id, operation: operation.id, parameters: logicalParameters, cost: group.pricing?.pointsEstimate ?? Infinity })
    }
  }
  matches.sort((a,b) => a.cost - b.cost)
  return matches[0] ?? null
}

/**
 * 选择候选 → 建任务记录 → 调 videoGenerate seam → 归档。
 * 动作复刻与爆款复刻共用这一条提交路径：同一 `video_multi_ref` 候选选择、
 * 同一个 seam，差别只在 snapshot 形状与 references 内容。
 */
export async function launchMotionTask({ ctx, store, paths, onReady, avatarId, snapshot, assets, prompt, parameters }) {
  const catalog = ctx?.get?.('modelCatalog')?.list?.()
  const selected = selectMotionCandidate(catalog, assets, parameters, prompt)
  if (!selected) throw new AvatarError('needs-provider', '当前渠道不能完整支持这些素材和视频参数', 503)
  const seam = ctx?.get?.('videoGenerate')
  if (!seam?.execute) throw new AvatarError('needs-provider', '视频生成渠道不可用', 503)
  const taskId = `avt_task_${randomBytes(4).toString('hex')}`
  const dest = join(avatarDirOf(paths, avatarId), taskId + '.mp4')
  resolveAvatarDestination(paths,avatarId,dest)
  const base = { taskId, kind: 'motion', input: { ...snapshot, effectiveParameters: selected.parameters }, model: selected.model, group: selected.group, destPath: dest, status: 'queued' }
  store.addTask(avatarId, base)
  let result
  try {
    result = await seam.execute({ prompt, dest, model: selected.model, group: selected.group, allowedGroups: [selected.group], operation: selected.operation,
      references: assets.map(({ type, role, targetSlot, pathOrUrl }) => ({ type, role, targetSlot, pathOrUrl })), ...selected.parameters, wait: false, requestKey: taskId })
  } catch (error) {
    if(error.taskRef||!['needs-provider','needs-omnimux'].includes(error.code))store.addTask(avatarId,{...base,status:error.taskRef?'generating':'failed',taskRef:error.taskRef??null,error:messageOf(error)})
    else store.removeTask(avatarId,taskId)
    throw error
  }
  const task = store.addTask(avatarId, { ...base, status: result.mode === 'live' ? 'ready' : 'generating', taskRef: result.taskRef ?? null })
  const archived = await archiveTask({ store, onReady, avatarId, task })
  return { task: archived, mode: result.mode, dest }
}

/** 任务 ready 时触发归档；归档失败只记原因，不改任务状态。 */
export async function archiveTask({ store, onReady, avatarId, task }) {
  if (task.status !== 'ready' || !onReady) return task
  let syncError = null
  try { await onReady(avatarId, task) }
  catch (error) { syncError = messageOf(error) }
  return store.updateTask(avatarId, task.taskId, { syncError })
}

/**
 * 探测候选可用性用的时长。
 *
 * 只用于「这个渠道能不能做这组素材」的判断，**不参与提交**——提交时长由拆解结果决定。
 * 依次取：客户端带上来的真实时长 → 参考片实测时长 → 候选声明的最小合法值 → null（跳过该维）。
 * 绝不把缺失值当 0：0 会撞上目录里的 4–30 区间，把所有候选误判成不支持。
 */
export function probeDuration(declared, measured, candidates) {
  for (const value of [declared, measured]) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return Math.round(number)
  }
  const mins = []
  for (const row of candidates) {
    const range = row.definitions?.duration?.range
    const min = Number(range?.min)
    if (Number.isFinite(min) && min > 0) mins.push(min)
    const options = row.definitions?.duration?.options
    if (Array.isArray(options)) for (const option of options) {
      const value = typeof option === 'object' ? Number(option?.value) : Number(option)
      if (Number.isFinite(value) && value > 0) mins.push(value)
    }
  }
  if (mins.length === 0) return null
  return Math.round(Math.min(...mins))
}

export function createMotion({ ctx, store, paths, resolveAssets, onReady, recreate } = {}) {
  const collections = new Map()
  async function submit(input = {}) {
    const { avatarId, mode, images, video, resolution, aspectRatio } = input
    store.get(avatarId)
    if (mode === 'recreate') {
      // 爆款复刻走同一候选与 seam，但提交体只有参考图 + 编译后的提示词。
      if (!recreate) throw new AvatarError('needs-analysis', '爆款复刻能力未装配', 503)
      return await recreate.submit(input)
    }
    if (!['motion','replace'].includes(mode) || !Array.isArray(images) || images.length < 1 || images.length > 30 || !video) throw invalid('选择角色图片和参考视频后再生成')
    if (typeof input.prompt !== 'string' && input.prompt !== undefined || String(input.prompt ?? '').length > 4000) throw invalid('视频说明不能超过4000字')
    if (!resolveAssets) throw new AvatarError('needs-materials', '素材检查能力不可用', 503)
    const resolved = await resolveAssets(input)
    const duration = resolved.duration
    if (!Number.isFinite(duration) || duration < 4 || duration > 30) throw invalid('参考视频时长需为4–30秒')
    if (mode === 'replace' && resolved.aspectRatio !== aspectRatio) throw invalid('角色替换需要保持参考视频的原始画幅')
    const mention = validateMentions(input.prompt ?? '', images.length, Boolean(video))
    if (mention.error) throw invalid(mention.error)
    const prompt = motionPrompt(mode, mention.text, resolved.species)
    const parameters = { ...(input.effectiveParameters??{}), resolution, aspectRatio, duration: Math.round(duration) }
    const snapshot = { mode, images, video, duration, resolution, aspectRatio, prompt: input.prompt ?? '', species: resolved.species ?? '' }
    return await launchMotionTask({ ctx, store, paths, onReady, avatarId, snapshot, assets: resolved.assets, prompt, parameters })
  }
  const archive = (avatarId, task) => archiveTask({ store, onReady, avatarId, task })
  async function collect({ avatarId, taskId }) {
    const key = avatarId + ':' + taskId
    if (collections.has(key)) return collections.get(key)
    let task = store.findTask(avatarId, taskId)
    if (!task || task.kind !== 'motion') throw invalid('视频任务不存在')
    if (task.status === 'ready' && task.syncError) return await archive(avatarId, task)
    if (['ready','failed'].includes(task.status)) return task
    if (!task.taskRef) {
      const accepted = ctx.get('videoGenerate').findAccepted?.(task.taskId)
      if (!accepted) return task
      task = store.updateTask(avatarId, taskId, { taskRef: accepted.taskRef, status: 'generating' })
    }
    const destination=resolveAvatarDestination(paths,avatarId,task.destPath)
    const promise = (async () => {
      let next = task
      try {
        const result = await ctx.get('videoGenerate').execute({ taskRef: task.taskRef, dest: destination, wait: true })
        if (result.mode === 'live') next = store.updateTask(avatarId, taskId, { status: 'ready', error: null })
      } catch (error) {
        next = store.updateTask(avatarId, taskId, { status: error.code === 'omnimux-failed' ? 'failed' : task.status, error: messageOf(error) })
      }
      return await archive(avatarId, next)
    })().finally(() => collections.delete(key))
    collections.set(key, promise)
    return promise
  }
  async function options(input) {
    const recreate = input.mode === 'recreate'
    // 复刻模式：参考视频要解析出真实时长与画幅，但它不进候选素材（提交体只有参考图）。
    const resolved = await resolveAssets(input, recreate ? { withVideo: false } : undefined)
    const catalog = ctx.get('modelCatalog').list()
    const directory = catalog.models ?? catalog.video ?? []
    const preferred = catalog.defaultsByOperation?.video_multi_ref ?? catalog.defaults?.video
    const rows = preferred ? directory.filter(row=>row.id===preferred) : directory
    const candidates = rows.flatMap(row => (row.operations??[]).filter(op=>op.id==='video_multi_ref'&&op.listed===true).map(op=>({...row,definitions:{...(row.parameters??{}),...(op.parameters??{})}})))
    const values = field => [...new Set(candidates.flatMap(row=>(row.definitions[field]?.options??[]).map(option=>typeof option==='object'?option.value:option)))].filter(value=>typeof value==='string')
    const supported=[]
    const prompt=motionPrompt(input.mode??'motion','',resolved.species)
    // 复刻的输出时长跟随参考片，参数卡只留清晰度：画幅固定 9:16，不提供画幅选择。
    const aspectRatios = recreate ? ['9:16'] : values('aspectRatio')
    const duration = probeDuration(input.duration, resolved.duration, candidates)
    for(const resolution of values('resolution'))for(const aspectRatio of aspectRatios) {
      if(input.mode==='replace'&&aspectRatio!==resolved.aspectRatio)continue
      // 时长完全无法确定时，不把编造的秒数塞进候选评估，直接跳过这一维。
      const parameters = duration === null ? { resolution, aspectRatio } : { resolution, aspectRatio, duration }
      if(selectMotionCandidate(catalog,resolved.assets,parameters,prompt))supported.push({resolution,aspectRatio})
    }
    // 对外仍回参考片实测时长（可能是小数），探测值只用于候选评估。
    // 注意 Number(null) 是 0，必须显式排除 null/0，否则又变回「缺时长当 0」。
    const measured = resolved.duration == null ? null : Number(resolved.duration)
    return {supported,referenceAspectRatio:resolved.aspectRatio??null,duration:Number.isFinite(measured)&&measured>0?measured:(duration??null)}
  }
  return { submit, collect, options }
}
