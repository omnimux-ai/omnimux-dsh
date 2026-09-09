import { validateDefinition, validateValues, buildDraft } from '@omnimux/form-contract'

export function attachmentValue(file) {
  return { ref: file.assetId, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes }
}
export function defaultValues(definition) {
  return Object.fromEntries(definition.fields.filter(f => 'default' in f).map(f => [f.id, f.default]))
}
export async function draftRequest(key, body) {
  const response = await fetch(`/api/omnimux/forms/draft?${new URLSearchParams(key)}`, {
    method: body ? 'PUT' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify({ ...key, ...body }) : undefined,
  })
  const data = await response.json()
  if (!response.ok) { const error = new Error(data.error || '草稿保存失败'); error.status = response.status; throw error }
  return data
}
/** One mounted workspace/template editor owns its async results; completed old requests cannot affect a new editor. */
export function createEditor({ definition, workspaceId, hub, request = draftRequest, uuid = () => crypto.randomUUID() }) {
  const checked = validateDefinition(definition)
  const listeners = new Set()
  const key = { workspaceId, templateId: definition.id, templateVersion: definition.templateVersion }
  let state = { loading: true, values: checked.ok ? defaultValues(checked.value) : {}, errors: [], notice: '', saveStatus: '', uploads: [], busy: false, staleRefs: [], focusRevision: 0 }
  let disposed = false, revision = 0, saveTimer, saves = Promise.resolve(), saveFailure = null, dirty = false, requestKey = '', requestId = '', epoch = 0
  const emit = patch => { if (disposed) return; state = { ...state, ...patch }; listeners.forEach(fn => fn()) }
  const validate = values => { const result = validateValues(definition, values); return result.ok ? [] : result.errors }
  async function save() {
    if (!dirty || disposed || state.loading || saveFailure?.status === 409) return saves
    dirty = false
    const values = structuredClone(state.values)
    emit({ saveStatus: '保存中' })
    saves = saves.catch(() => {}).then(async () => {
      if (saveFailure?.status === 409) throw saveFailure
      const result = await request(key, { values, expectedRevision: revision })
      revision = result.draft.revision; saveFailure = null
      emit({ saveStatus: dirty ? '待保存' : '已保存' })
    }).catch(error => { saveFailure = error; dirty = true; emit({ saveStatus: '保存失败', notice: error.message }) })
    return saves
  }
  async function resolveValues(values) {
    const refs = definition.fields.filter(f => f.type === 'file').flatMap(f => Array.isArray(values[f.id]) ? values[f.id].map(a => a.ref) : [])
    if (!refs.length) return { values, staleRefs: [] }
    // Resolve separately so one missing attachment does not hide other valid previews.
    const results = await Promise.all(refs.map(async ref => {
      try { const [file] = await hub.resolveFiles({ workspaceId, assetIds: [ref] }); if (!file) throw new Error('Missing attachment'); return [ref, attachmentValue(file)] }
      catch { return [ref, null] }
    }))
    const resolved = new Map(results), next = { ...values }
    for (const field of definition.fields.filter(f => f.type === 'file')) {
      if (Array.isArray(values[field.id])) next[field.id] = values[field.id].map(item => resolved.get(item.ref) ?? item)
    }
    return { values: next, staleRefs: results.filter(([, value]) => !value).map(([ref]) => ref) }
  }
  const api = {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async load() {
      if (!checked.ok) return emit({ loading: false, errors: checked.errors, notice: '模板配置不可用，无法生成草稿。', invalid: true })
      try {
        const saved = await request(key)
        if (disposed) return
        revision = saved.draft?.revision ?? 0
        const values = saved.draft?.values ?? defaultValues(checked.value)
        const restored = validateValues(definition, values)
        if (!restored.ok && restored.errors.some(error => ['INVALID_VALUES', 'UNKNOWN_FIELD', 'INVALID_ATTACHMENT'].includes(error.code) || (error.code === 'INVALID_VALUE' && values[error.path[1]] !== ''))) {
          return emit({ loading: false, restoreInvalid: true, notice: '保存的草稿格式不符合当前模板，已保留原稿。请重置此表单后重新填写。' })
        }
        const resolved = await resolveValues(values)
        emit({ loading: false, ...resolved, errors: saved.draft ? validate(resolved.values) : [], saveStatus: saved.draft ? '已恢复草稿' : '', notice: [saved.otherVersions.length ? '保留了旧版本草稿。当前模板使用独立填写内容。' : '', saved.draft && validate(resolved.values).length ? '恢复的草稿需要检查，请修正标出的内容或重置表单。' : ''].filter(Boolean).join(' ') })
      } catch (error) { emit({ loading: false, invalid: true, notice: `无法恢复草稿：${error.message}。请重新打开模板。` }) }
    },
    set(fieldId, value) {
      if (state.loading || state.busy || state.invalid || state.restoreInvalid) return
      const values = { ...state.values }
      if (value === undefined) delete values[fieldId]; else values[fieldId] = value
      emit({ values, errors: state.errors.length ? validate(values) : [], saveStatus: '待保存', success: null })
      dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 350)
    },
    async importFiles(field, files) {
      if (state.loading || state.busy || state.invalid || state.restoreInvalid) return
      const existing = Array.isArray(state.values[field.id]) ? state.values[field.id] : []
      const outstanding = state.uploads.filter(u => u.fieldId === field.id).length
      if (existing.length + outstanding + files.length > field.maxFiles) return emit({ notice: `${field.label}最多选择 ${field.maxFiles} 个文件。` })
      for (const file of files) {
        const upload = { id: uuid(), fieldId: field.id, file, progress: 0, error: null }
        emit({ uploads: [...state.uploads, upload] })
        void api.upload(upload)
      }
    },
    async upload(upload) {
      const currentEpoch = epoch
      const field = definition.fields.find(f => f.id === upload.fieldId)
      emit({ uploads: state.uploads.map(u => u.id === upload.id ? { ...u, error: null, progress: 0 } : u) })
      try {
        if (upload.file.size > field.maxBytes) throw new Error('文件超过大小限制')
        const imported = await hub.importFile(upload.file, { workspaceId, onProgress(progress) {
          if (currentEpoch === epoch) emit({ uploads: state.uploads.map(u => u.id === upload.id ? { ...u, progress } : u) })
        } })
        if (disposed || currentEpoch !== epoch || !state.uploads.some(u => u.id === upload.id)) return
        const value = attachmentValue(imported)
        const prior = Array.isArray(state.values[field.id]) ? state.values[field.id] : []
        api.set(field.id, [...prior, value])
        emit({ uploads: state.uploads.filter(u => u.id !== upload.id) })
      } catch (error) { if (currentEpoch === epoch) emit({ uploads: state.uploads.map(u => u.id === upload.id ? { ...u, error: error.message } : u) }) }
    },
    rejectFiles() { emit({ notice: '文件类型、数量或大小不符合要求，请检查后重新选择。' }) },
    removeUpload(id) { emit({ uploads: state.uploads.filter(u => u.id !== id) }) },
    removeAttachment(fieldId, ref) { api.set(fieldId, state.values[fieldId].filter(a => a.ref !== ref)); emit({ staleRefs: state.staleRefs.filter(r => r !== ref) }) },
    async reset() {
      if (state.busy) return
      epoch++; clearTimeout(saveTimer)
      emit({ values: defaultValues(definition), errors: [], uploads: [], staleRefs: [], notice: '', success: null, restoreInvalid: false })
      dirty = true; await save()
    },
    async submit() {
      if (state.busy || state.loading || state.invalid || state.restoreInvalid) return
      if (state.uploads.length) return emit({ notice: '请完成上传，或移除失败的文件后再生成草稿。' })
      const errors = validate(state.values)
      if (errors.length) return emit({ errors, focusRevision: state.focusRevision + 1, notice: '请检查标出的字段。' })
      emit({ busy: true, errors: [], notice: '', success: null })
      try {
        await save()
        if (saveFailure) throw saveFailure
        const resolved = await resolveValues(state.values)
        if (disposed) return
        emit(resolved)
        if (resolved.staleRefs.length) throw new Error('部分素材已失效，请移除后重新选择。')
        const draft = buildDraft(definition, resolved.values)
        if (!draft.ok) { emit({ errors: draft.errors }); throw new Error('素材信息已变化，请检查字段。') }
        const fingerprint = JSON.stringify([workspaceId, draft.value.prompt, draft.value.attachments])
        if (requestKey !== fingerprint) { requestKey = fingerprint; requestId = uuid() }
        const result = await hub.prepareDraft({ requestId, workspaceId, prompt: draft.value.prompt, assetIds: draft.value.attachments.map(a => a.ref) })
        if (!result.ok) throw new Error(result.message || result.error || '会话草稿交接失败')
        emit({ success: result.sessionId, notice: '已生成会话草稿。可在输入框编辑并确认发送。' })
      } catch (error) { emit({ notice: error.message }) }
      finally { emit({ busy: false }) }
    },
    flush: save,
    dispose() { clearTimeout(saveTimer); void save(); disposed = true; epoch++; listeners.clear() },
  }
  return api
}
