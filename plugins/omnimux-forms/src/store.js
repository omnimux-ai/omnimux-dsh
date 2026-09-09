import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export class DraftError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
function identity(value) {
  for (const key of ['workspaceId', 'templateId', 'templateVersion']) {
    if (typeof value?.[key] !== 'string' || !value[key].trim() || value[key].length > 500) throw new DraftError(`Invalid ${key}`)
  }
  return { workspaceId: value.workspaceId, templateId: value.templateId, templateVersion: value.templateVersion }
}
function draftValues(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new DraftError('Invalid values')
  if (JSON.stringify(values).length > 128_000) throw new DraftError('Draft too large', 413)
  for (const [key, value] of Object.entries(values)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) throw new DraftError('Invalid field id')
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) continue
    if (!Array.isArray(value) || value.length > 20) throw new DraftError('Invalid field value')
    for (const item of value) {
      if (!item || typeof item !== 'object' || Object.keys(item).some(k => !['ref', 'name', 'mimeType', 'sizeBytes'].includes(k)) ||
        typeof item.ref !== 'string' || !item.ref || /^(blob:|data:|file:|https?:)/i.test(item.ref) ||
        typeof item.name !== 'string' || typeof item.mimeType !== 'string' || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes <= 0) {
        throw new DraftError('Only stable attachment references may be saved')
      }
    }
  }
  return structuredClone(values)
}
export function createDraftStore(directory) {
  // Each workspace/template file retains prior versions. Optimistic revisions prevent cross-tab overwrite.
  const queues = new Map()
  function location(key) {
    return join(directory, createHash('sha256').update(JSON.stringify([key.workspaceId, key.templateId])).digest('hex') + '.json')
  }
  async function read(key) {
    try { return JSON.parse(await readFile(location(key), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return { versions: {} }; throw error }
  }
  function serialized(key, fn) {
    const path = location(key), previous = queues.get(path) ?? Promise.resolve()
    const pending = previous.catch(() => {}).then(fn)
    queues.set(path, pending)
    pending.finally(() => { if (queues.get(path) === pending) queues.delete(path) }).catch(() => {})
    return pending
  }
  return {
    async get(input) {
      const key = identity(input)
      const data = await read(key)
      return { draft: data.versions[key.templateVersion] ?? null, otherVersions: Object.keys(data.versions).filter(v => v !== key.templateVersion) }
    },
    async put(input) {
      const key = identity(input), values = draftValues(input.values)
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new DraftError('Invalid revision')
      return serialized(key, async () => {
        const data = await read(key), previous = data.versions[key.templateVersion]
        if ((previous?.revision ?? 0) !== input.expectedRevision) throw new DraftError('表单已在其他页面更新，请重新打开后再编辑。', 409)
        const draft = { ...key, values, revision: input.expectedRevision + 1, updatedAt: new Date().toISOString() }
        data.versions[key.templateVersion] = draft
        await mkdir(directory, { recursive: true })
        const path = location(key), temporary = `${path}.${randomUUID()}.tmp`
        await writeFile(temporary, JSON.stringify(data), { mode: 0o600 })
        await rename(temporary, path)
        return { draft }
      })
    },
  }
}
