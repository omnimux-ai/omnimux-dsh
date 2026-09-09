import { createDocument, textPart, tokenPart, serializeDocument, validateToken, validateDocument } from './editor-document.js'
import { modelsFor, PRESETS, MEDIA } from './fixtures.js'
import { MockAdapter } from './mock-adapter.js'

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}
export function initialDraft(mode) {
  return { mode, document: createDocument(), submode: mode === 'video' ? 'edit' : null,
    skillId: null, presetId: null, modelId: mode === 'video' ? 'mock:seedance-25' : mode === 'image' ? 'mock:nano-2' : 'mock:agent-veo-fast',
    spec: { resolution: mode === 'image' ? '2K' : mode === 'agent' ? '720P' : '480P', aspect: mode === 'image' ? 'Auto' : mode === 'agent' ? '9:16' : '16:9', durationMode: mode === 'image' ? 'none' : mode === 'agent' ? 'fixed' : 'auto', durationSeconds: mode === 'agent' ? 8 : null, batchCount: 1 }, references: [] }
}
/** Scope-owned immutable store. No browser persistence or provider I/O. */
export class StudioStore {
  constructor(key, adapter = new MockAdapter()) {
    this.scopeKey = key
    this.adapter = adapter
    this.disposed = false
    this.epoch = 0
    this.visible = false
    this.submitting = false
    this.listeners = new Set()
    this.jobs = new Map()
    this.resources = new Map()
    this.state = deepFreeze({ drafts: Object.fromEntries(['agent', 'video', 'image'].map(mode => [mode, initialDraft(mode)])), tasks: [], mockCredits: 3463, view: 'dashboard', mode: 'video', filters: { modelId: null, resolution: null, aspect: null }, section: 'history' })
  }
  getSnapshot = () => this.state
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  publish(patch) {
    if (this.disposed) return
    this.state = deepFreeze({ ...this.state, ...patch })
    for (const listener of this.listeners) listener()
  }
  updateDraft(mode, patch) {
    if (!this.state.drafts[mode] || !patch || typeof patch !== 'object') return
    if (Object.hasOwn(patch, 'document') && !validateDocument(patch.document)) return
    if (Object.hasOwn(patch, 'references') && (!Array.isArray(patch.references) || patch.references.some(ref => !ref || typeof ref !== 'object'))) return
    const current = this.state.drafts[mode]
    const draft = { ...current, ...structuredClone(patch) }
    if (patch.spec && current.spec) draft.spec = { ...current.spec, ...patch.spec }
    if (draft.skillId === '视频分析') { draft.spec = null; draft.modelId = null }
    this.publish({ drafts: { ...this.state.drafts, [mode]: draft } })
    this.releaseUnusedResources()
  }
  applyPreset(id) {
    const preset = PRESETS.find(item => item.id === id)
    if (!preset) return
    const draft = initialDraft('agent')
    draft.presetId = id
    draft.skillId = preset.skillId
    draft.modelId = preset.modelId
    draft.spec = preset.modelId ? { ...draft.spec, durationSeconds: preset.seconds } : null
    draft.document = { version: 1, parts: [textPart(preset.label + '：'), ...preset.tokens.flatMap(type => [tokenPart(type), textPart(' ')])] }
    this.publish({ mode: 'agent', drafts: { ...this.state.drafts, agent: draft } })
  }
  navigate(view) { if (['dashboard', 'video', 'image'].includes(view)) this.publish({ view }) }
  setFilter(patch) { this.publish({ filters: { ...this.state.filters, ...patch } }) }
  setVisible(visible) {
    if (this.disposed) return
    this.visible = visible
    for (const { handle } of this.jobs.values()) visible ? handle.resume() : handle.pause()
  }
  validateDraft(draft) {
    const errors = []
    if (!draft || !validateDocument(draft.document) || !Array.isArray(draft.references) || draft.references.some(ref => !ref || typeof ref !== 'object')) {
      return { errors: ['草稿文档或参考结构无效'], prompt: '', model: null, totalCost: 0 }
    }
    const prompt = serializeDocument(draft.document)
    if (!prompt.trim()) errors.push('请输入创作内容')
    if (prompt.length > (draft.mode === 'image' ? 2000 : 8000)) errors.push('正文超过长度限制')
    if (draft.document.parts.some(part => part.kind === 'url-token' && validateToken(part).validation !== 'valid')) errors.push('请修正链接 Token')
    const analysis = draft.mode === 'agent' && draft.skillId === '视频分析'
    const model = modelsFor(draft.mode).find(item => item.id === draft.modelId)
    if (!analysis && !model) errors.push('请选择演示模型')
    const spec = draft.spec
    if (!analysis) {
      const image = draft.mode === 'image'
      if (!spec || !(image ? ['1K', '2K', '4K'] : ['480P', '720P', '1080P']).includes(spec.resolution) || !(image ? ['Auto', '1:1', '9:16', '16:9', '3:4'] : ['1:1', '9:16', '16:9']).includes(spec.aspect)) errors.push('规格无效')
      if (!spec || !Number.isInteger(spec.batchCount) || spec.batchCount < 1 || spec.batchCount > (image ? 4 : 1)) errors.push('批量无效')
      if (spec && (image ? spec.durationMode !== 'none' || spec.durationSeconds !== null : !['auto', 'fixed'].includes(spec.durationMode) || (spec.durationMode === 'auto' ? spec.durationSeconds !== null : ![5, 8, 10, 15].includes(spec.durationSeconds)))) errors.push('时长无效')
    }
    const allowedSlots = draft.mode === 'image' ? { reference: 'image' } : draft.mode === 'agent' ? {} : draft.submode === 'firstlast' ? { first: 'image', last: 'image' } : draft.submode === 'ref' ? { 'reference-video': 'video', 'reference-image': 'image' } : { 'edit-video': 'video', 'edit-image': 'image', 'edit-portrait': 'image' }
    const slots = new Set()
    for (const ref of draft.references) {
      if (slots.has(ref.slot) || allowedSlots[ref.slot] !== ref.kind || (ref.source === 'fixture' ? !MEDIA[ref.fixtureId] || ref.fixtureId !== `mock:sample-${ref.kind}` : ref.source !== 'local' || !this.resources.has(ref.fileId))) errors.push('参考槽与当前模式不兼容，请移除或切回原模式')
      slots.add(ref.slot)
    }
    return { errors, prompt, model, totalCost: analysis ? 0 : (model?.cost ?? 0) * (spec?.batchCount ?? 1) }
  }
  submitDraft(mode) {
    if (this.disposed || this.submitting) return { ok: false, errors: ['工作台不可提交'] }
    this.submitting = true
    try {
      const draft = this.state.drafts[mode]
      if (!draft) return { ok: false, errors: ['未知模式'] }
      const { errors, prompt, model, totalCost } = this.validateDraft(draft)
      if (totalCost > this.state.mockCredits) errors.push('演示点数不足')
      if (errors.length) return { ok: false, errors }
      const request = deepFreeze(structuredClone({ version: 1, requestId: crypto.randomUUID(), scopeKey: this.scopeKey, mode: 'mock', draft, modelLabel: model?.name ?? null, prompt, unitCost: model?.cost ?? 0, totalCost, createdAt: new Date().toISOString() }))
      const task = { id: crypto.randomUUID(), attemptId: crypto.randomUUID(), request, status: 'pending', results: [], refunded: false, error: null }
      const epoch = this.epoch
      const controller = new AbortController()
      this.publish({ tasks: [task, ...this.state.tasks], mockCredits: this.state.mockCredits - totalCost, view: mode === 'image' ? 'image' : draft.spec ? 'video' : 'dashboard', section: 'history', mode })
      const onResult = outcome => {
        const current = this.state.tasks.find(item => item.id === task.id)
        if (this.disposed || this.epoch !== epoch || request.scopeKey !== this.scopeKey || controller.signal.aborted || current?.attemptId !== task.attemptId || current.status !== 'pending') return
        this.jobs.delete(task.id)
        const expectedKind = request.draft.spec === null ? 'text' : request.draft.mode === 'image' ? 'image' : 'video'
        const ids = new Set()
        const completed = outcome?.status === 'completed' && Array.isArray(outcome.results)
          && outcome.results.length === (request.draft.spec?.batchCount ?? 1)
          && outcome.results.every(result => {
            if (!result || typeof result.id !== 'string' || !result.id || ids.has(result.id)) return false
            ids.add(result.id)
            return result.kind === expectedKind && result.fixtureId === `mock:sample-${expectedKind}`
              && ['idle', 'loading', 'ready', 'error'].includes(result.mediaState)
              && result.actualMetadata && typeof result.actualMetadata === 'object'
              && !Array.isArray(result.actualMetadata)
              && (expectedKind === 'text' ? typeof result.actualMetadata.text === 'string'
                : typeof result.actualMetadata.source === 'string' && typeof result.actualMetadata.dimensions === 'string'
                  && (result.actualMetadata.durationSeconds === null || Number.isFinite(result.actualMetadata.durationSeconds)))
          })
        this.publish({ tasks: this.state.tasks.map(item => item.id === task.id ? { ...item, status: completed ? 'completed' : 'failed', results: completed ? outcome.results : [], refunded: !completed, error: completed ? null : 'mock-failure' } : item), mockCredits: this.state.mockCredits + (completed ? 0 : totalCost) })
      }
      try {
        const handle = this.adapter.start(request, controller.signal, onResult)
        if (this.state.tasks.find(item => item.id === task.id)?.status === 'pending') {
          this.jobs.set(task.id, { handle, controller })
          if (this.visible) handle.resume()
        } else {
          handle.cancel()
        }
      } catch { onResult({ status: 'failed', results: [] }) }
      return { ok: true, taskId: task.id }
    } finally { this.submitting = false }
  }
  cancelTask(id) {
    const task = this.state.tasks.find(item => item.id === id)
    if (!task || task.status !== 'pending' || this.disposed) return
    const job = this.jobs.get(id)
    job?.handle.cancel()
    job?.controller.abort()
    this.jobs.delete(id)
    this.publish({ tasks: this.state.tasks.map(item => item.id === id ? { ...item, status: 'cancelled', refunded: true } : item), mockCredits: this.state.mockCredits + (task.refunded ? 0 : task.request.totalCost) })
  }
  deleteTask(id) { this.cancelTask(id); this.publish({ tasks: this.state.tasks.filter(item => item.id !== id) }); this.releaseUnusedResources() }
  restoreDraft(id) {
    const task = this.state.tasks.find(item => item.id === id)
    if (!task) return
    const draft = structuredClone(task.request.draft)
    this.publish({ mode: draft.mode, view: 'dashboard', drafts: { ...this.state.drafts, [draft.mode]: draft } })
  }
  releaseUnusedResources() {
    const used = new Set([...Object.values(this.state.drafts), ...this.state.tasks.map(task => task.request.draft)].flatMap(draft => draft.references.map(ref => ref.fileId)))
    for (const [id, resource] of this.resources) if (!used.has(id)) { URL.revokeObjectURL(resource.url); this.resources.delete(id) }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.epoch++
    for (const job of this.jobs.values()) { job.handle.cancel(); job.controller.abort() }
    this.jobs.clear()
    for (const resource of this.resources.values()) URL.revokeObjectURL(resource.url)
    this.resources.clear()
    this.listeners.clear()
  }
}
