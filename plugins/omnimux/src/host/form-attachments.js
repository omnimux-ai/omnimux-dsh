import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, rename, rm, realpath, stat, lstat } from 'node:fs/promises'
import { join, basename, resolve, sep } from 'node:path'
import { probeTextImage } from '../text/image.js'
import { probeTextVideo } from '../text/video.js'
import { materializePaths, resolveSessionCwd } from './composer-attachments.js'

export const MAX_FORM_FILE_BYTES = 100 * 1024 * 1024
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/
function checkId(id) { if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('invalid-reference'); return id }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** Persistent, immutable byte references; client paths and metadata are never trusted. */
export function createFormAttachmentService({ root, getWorkspaceRegistry, getSessionQuery }) {
  const pending = new Map()
  async function workspace(id) {
    checkId(id)
    const row = getWorkspaceRegistry()?.get(id)
    if (!row?.path) throw new Error('workspace-unavailable')
    return await realpath(row.path)
  }
  async function probe(path, claimedType) {
    const options = { attachments: { imageLimits: { maxImageBytes: MAX_FORM_FILE_BYTES } } }
    const data = claimedType.startsWith('video/')
      ? await probeTextVideo(path, { maxVideoBytes: MAX_FORM_FILE_BYTES })
      : await probeTextImage(path, options)
    if (data.mediaType !== claimedType) throw new Error('file-type-mismatch')
    return { mimeType: data.mediaType, sizeBytes: data.sizeBytes,
      ...(data.durationSec !== undefined ? { durationSeconds: data.durationSec } : {}) }
  }
  async function importFile({ workspaceId, name, mimeType, bytes }) {
    await workspace(workspaceId)
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_FORM_FILE_BYTES) throw new Error('file-size-invalid')
    if (!['video/mp4', 'video/webm', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) throw new Error('file-type-invalid')
    const assetId = randomUUID()
    const dir = join(root, assetId)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const safeName = basename(String(name || 'file')).replace(/[\u0000-\u001f"@\\]/g, '_').slice(0, 160)
    const path = join(dir, 'bytes')
    try {
      await writeFile(path, bytes, { mode: 0o600, flag: 'wx' })
      const metadata = await probe(path, mimeType)
      const record = { assetId, workspaceId, name: safeName, ...metadata, digest: hash(bytes) }
      await writeFile(join(dir, 'record.json'), JSON.stringify(record), { mode: 0o600, flag: 'wx' })
      return publicRecord(record)
    } catch (error) { await rm(dir, { recursive: true, force: true }); throw error }
  }
  function publicRecord({ assetId, name, mimeType, sizeBytes, durationSeconds }) {
    return { assetId, name, mimeType, sizeBytes, ...(durationSeconds !== undefined ? { durationSeconds } : {}) }
  }
  async function resolveFile(workspaceId, assetId) {
    await workspace(workspaceId)
    checkId(assetId)
    const dir = join(root, assetId)
    const record = JSON.parse(await readFile(join(dir, 'record.json'), 'utf8'))
    if (record.workspaceId !== workspaceId || record.assetId !== assetId) throw new Error('reference-workspace-mismatch')
    const path = join(dir, 'bytes')
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_FORM_FILE_BYTES || info.size !== record.sizeBytes) throw new Error('reference-invalid')
    const bytes = await readFile(path)
    if (hash(bytes) !== record.digest) throw new Error('reference-changed')
    await probe(path, record.mimeType)
    return { record, path }
  }
  async function resolveFiles({ workspaceId, assetIds }) {
    if (!Array.isArray(assetIds) || assetIds.length > 8) throw new Error('attachment-count-invalid')
    return Promise.all(assetIds.map(async id => publicRecord((await resolveFile(workspaceId, id)).record)))
  }
  async function materialize({ requestId, workspaceId, sessionId, assetIds }) {
    checkId(requestId)
    const fingerprint = JSON.stringify({ workspaceId, sessionId, assetIds })
    const key = requestId
    if (pending.has(key)) {
      const existing = pending.get(key)
      if (existing.fingerprint !== fingerprint) throw new Error('request-conflict')
      return existing.promise
    }
    const promise = run()
    pending.set(key, { fingerprint, promise })
    try { return await promise } finally { pending.delete(key) }
    async function run() {
      const cwd = await workspace(workspaceId)
      if (await realpath(await resolveSessionCwd(sessionId, getSessionQuery())) !== cwd) throw new Error('session-workspace-mismatch')
      await resolveFiles({ workspaceId, assetIds })
      const receiptDir = join(root, 'handoffs')
      await mkdir(receiptDir, { recursive: true, mode: 0o700 })
      const receiptPath = join(receiptDir, `${requestId}.json`)
      let receipt
      try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
      if (receipt && receipt.fingerprint !== fingerprint) throw new Error('request-conflict')
      receipt ||= { fingerprint, results: [] }
      for (const assetId of assetIds) {
        const { record, path } = await resolveFile(workspaceId, assetId)
        const old = receipt.results.find(row => row.assetId === assetId)
        if (old && await validMaterialized(cwd, old, record)) continue
        // Preserve changed/missing/symlink entries; rebuild only to a fresh task-owned name.
        await ensureImportedDirectory(cwd)
        // Existing composer materialization owns disk capacity, copies and path safety.
        const named = join(root, assetId, `source-${requestId}-${randomUUID()}-${record.name}`)
        await writeFile(named, await readFile(path), { mode: 0o600 })
        let item
        try { item = (await materializePaths({ sessionId, paths: [named], filesOnly: true, sessionQuery: getSessionQuery() })).results[0] }
        finally { await rm(named, { force: true }) }
        if (!item?.ok) throw new Error(item?.error || 'materialize-failed')
        const next = { ...publicRecord(record), relativePath: item.relativePath, kind: item.kind }
        if (!await validMaterialized(cwd, next, record)) throw new Error('materialized-file-invalid')
        receipt.results = receipt.results.filter(row => row.assetId !== assetId)
        receipt.results.push(next)
        await writeFile(`${receiptPath}.tmp`, JSON.stringify(receipt), { mode: 0o600 })
        await rename(`${receiptPath}.tmp`, receiptPath)
      }
      return receipt.results
    }
  }

  async function validMaterialized(cwd, row, record) {
    if (typeof row.relativePath !== 'string') return false
    const path = resolve(cwd, row.relativePath)
    if (!path.startsWith(cwd + sep)) return false
    try {
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size !== record.sizeBytes) return false
      // Reject an intermediate directory symlink as well as a symlink leaf.
      if (await realpath(path) !== path) return false
      if (hash(await readFile(path)) !== record.digest) return false
      const metadata = await probe(path, record.mimeType)
      return row.mimeType === metadata.mimeType && row.sizeBytes === metadata.sizeBytes
        && row.durationSeconds === metadata.durationSeconds
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
      throw error
    }
  }
  async function ensureImportedDirectory(cwd) {
    let path = cwd
    for (const part of ['assets', 'imported']) {
      path = join(path, part)
      try {
        const info = await lstat(path)
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('import-directory-invalid')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        await mkdir(path, { mode: 0o700 })
      }
      if (await realpath(path) !== path) throw new Error('import-directory-invalid')
    }
  }
  return { importFile, resolveFiles, resolveFile, materialize }
}
