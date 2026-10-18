import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep, basename, resolve } from 'node:path'
import { analysisMediaItems, sourceFingerprint } from './analysis-input.js'
import { creationBasis, creationReferenceLabel, reconcileCreationDraft, resolveCreationAnalysis, validateCreationDraft } from './creation-draft.js'
import { prepareCreationMedia } from './creation-media.js'

const SOURCE_PLUGIN = 'omnimux-inspiration'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const preparing = new WeakMap()
const fail = (status, error) => ({ status, body: { error } })
function cancelled(signal) { if (signal?.aborted) throw Object.assign(new Error('创作参考准备已取消'), { name: 'AbortError', code: 'ABORT_ERR' }) }
function owned(root, path) { const part = relative(root, path); return Boolean(part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)) }
const referenceRoot = (paths) => join(paths.videosDir, 'creation-references')
const draftFingerprint = (item, draft) => sourceFingerprint({ basis: creationBasis(item, draft), text: draft.text, manual: draft.manual === true })

/** Whitelist submitted fields and replace every analysis snapshot from saved state. */
function savedDraft(item, input) {
  const validation = validateCreationDraft(item, input)
  if (!validation.ok) throw Object.assign(new Error(validation.error), { status: 400 })
  const value = { references: input.references.map((ref) => {
    if (ref.kind === 'body') return { kind: 'body' }
    if (ref.kind === 'media') return { kind: 'media', media_index: ref.media_index }
    const entry = resolveCreationAnalysis(item, ref)
    return { kind: 'analysis', scope: ref.scope, ...(ref.scope === 'media' ? { media_index: ref.media_index } : {}), input_fingerprint: entry.input_fingerprint,
      result_snapshot: structuredClone(entry.result), source: entry.source, model: entry.model || '', directions: [...(entry.directions || [])] }
  }), purpose: input.purpose, intent: input.intent || '', text: input.text, manual: input.manual === true, basis: input.basis,
  clips: input.clips.map((clip) => ({ media_index: clip.media_index, start_seconds: Number(clip.start_seconds), end_seconds: Number(clip.end_seconds) })) }
  return { ...reconcileCreationDraft(item, value), saved_at: new Date().toISOString() }
}

async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function safeFile(root, path) {
  const rootPath = await realpath(root)
  const target = await realpath(path)
  if (!owned(rootPath, target)) throw new Error('创作参考文件无效，请重新准备')
  const lexicalRoot = owned(resolve(root), resolve(path)) ? resolve(root) : rootPath
  if (!owned(lexicalRoot, resolve(path)) || (await lstat(root)).isSymbolicLink()) throw new Error('创作参考文件无效，请重新准备')
  let cursor = lexicalRoot
  for (const part of relative(lexicalRoot, resolve(path)).split(sep)) {
    cursor = join(cursor, part)
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('创作参考文件无效，请重新准备')
  }
  const info = await lstat(target)
  if (!info.isFile() || info.size <= 0) throw new Error('创作参考文件缺失，请重新准备')
  return target
}

async function loadReceipt(ctx, referenceId) {
  const root = referenceRoot(ctx.paths)
  const receiptPath = await safeFile(root, join(root, referenceId, 'reference.json'))
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  if (receipt.id !== referenceId || receipt.post_id !== ctx.id || !Array.isArray(receipt.files) || !receipt.files.length) throw new Error('创作参考已失效，请重新准备')
  for (const file of receipt.files) {
    const path = await safeFile(join(root, referenceId), file.path)
    if (await digest(path) !== file.digest) throw new Error('创作参考文件已变化，请重新准备')
  }
  return receipt
}

function sourceDocument(item, draft, mediaFiles) {
  const all = analysisMediaItems(item)
  const lines = [`# ${item.title || '帖子创作参考'}`, '', `原帖：${item.source_url || ''}`, `帖子编号：${item.id}`, '', '## 我的创作草稿', '', draft.text, '', '## 实际选用的参考']
  for (const ref of draft.references) {
    lines.push('', `### ${creationReferenceLabel(item, ref, draft)}`)
    if (ref.kind === 'body') lines.push('', String(item.content || ''))
    else if (ref.kind === 'analysis') {
      const entry = resolveCreationAnalysis(item, ref)
      lines.push(`分析来源：真实模型结果；模型：${entry.model || '未记录'}；输入版本：${entry.input_fingerprint}`, '', typeof entry.result === 'string' ? entry.result : entry.result.markdown || JSON.stringify(entry.result, null, 2))
    } else {
      const file = mediaFiles.find((value) => value.media_index === ref.media_index)
      lines.push(`原始素材：${all[ref.media_index].url}`, `本次参考文件：${basename(file.path)}`)
      if (file.clip) lines.push(`选定范围：${file.clip.start_seconds}–${file.clip.end_seconds} 秒（已保存为独立片段）`)
    }
  }
  return `${lines.join('\n')}\n`
}

export async function handleSaveCreationDraft(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, '灵感不存在')
  cancelled(ctx.signal)
  try {
    const creation_draft = savedDraft(item, ctx.req.body?.draft)
    return { status: 200, body: { data: ctx.store.update(ctx.id, { creation_draft }) } }
  } catch (error) { return fail(error.status || 400, error.message || '创作草稿保存失败') }
}

export async function handlePrepareCreationReferences(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, '灵感不存在')
  cancelled(ctx.signal)
  let locks = preparing.get(ctx.store)
  if (!locks) { locks = new Set(); preparing.set(ctx.store, locks) }
  if (locks.has(ctx.id)) return fail(409, '创作参考正在准备，请稍候')
  locks.add(ctx.id)
  let outputDir
  try {
    const draft = savedDraft(item, ctx.req.body?.draft)
    const fingerprint = draftFingerprint(item, draft)
    const originalDraft = sourceFingerprint(item.creation_draft || null)
    const assertUnchanged = () => {
      const current = ctx.store.get(ctx.id)
      if (!current || creationBasis(current, draft) !== draft.basis || sourceFingerprint(current.creation_draft || null) !== originalDraft) {
        throw Object.assign(new Error('准备期间草稿或参考来源已变化，请重新整理'), { status: 409 })
      }
      return current
    }
    if (UUID.test(item.creation_reference?.id || '')) {
      let existing
      try { existing = await loadReceipt(ctx, item.creation_reference.id) }
      catch { /* A stale produced reference is rebuilt under a fresh server-owned identity. */ }
      cancelled(ctx.signal)
      if (existing?.fingerprint === fingerprint) {
        assertUnchanged()
        return { status: 200, body: { data: ctx.store.update(ctx.id, { creation_draft: draft }) } }
      }
    }
    cancelled(ctx.signal)
    const root = referenceRoot(ctx.paths)
    await mkdir(root, { recursive: true, mode: 0o700 })
    const rootInfo = await lstat(root)
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !owned(await realpath(ctx.paths.videosDir), await realpath(root))) throw new Error('创作参考目录无效')
    const id = randomUUID()
    outputDir = join(root, id)
    await mkdir(outputDir, { mode: 0o700 })
    const processor = typeof ctx.videoProcess === 'function' ? ctx.videoProcess() : ctx.videoProcess
    const media = await prepareCreationMedia({ item, draft, paths: ctx.paths, videoProcess: processor, signal: ctx.signal, outputDir })
    cancelled(ctx.signal)
    const manifest = join(outputDir, 'references.md')
    await writeFile(manifest, sourceDocument(item, draft, media.files), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    const produced = [{ path: await realpath(manifest), title: '创作参考与来源', type: 'document' }, ...media.files]
    const files = await Promise.all(produced.map(async (file) => ({ ...file, digest: await digest(file.path) })))
    const receipt = { id, post_id: ctx.id, fingerprint, basis: draft.basis, text: draft.text, prepared_at: new Date().toISOString(), files }
    const receiptPath = join(outputDir, 'reference.json')
    await writeFile(receiptPath, JSON.stringify(receipt), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    cancelled(ctx.signal)
    const current = assertUnchanged()
    const local_paths = { ...(current.local_paths || {}) }
    for (const [index, path] of [...files.map((file) => file.path), await realpath(receiptPath)].entries()) local_paths[`creation_${id}_${index}`] = path
    const creation_reference = { id, text: draft.text, basis: draft.basis, prepared_at: receipt.prepared_at, reference_count: draft.references.length }
    const data = ctx.store.update(ctx.id, { creation_draft: draft, creation_reference, local_paths })
    outputDir = null
    return { status: 200, body: { data } }
  } catch (error) {
    if (outputDir) await rm(outputDir, { recursive: true, force: true })
    cancelled(ctx.signal)
    if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error
    return fail(error.status || 422, error.message || '创作参考准备失败，请重试')
  } finally { locks.delete(ctx.id) }
}

/** A client handle selects a receipt; client paths and snapshots are never inputs. */
export async function handleMaterializeCreationReferences(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, '灵感不存在')
  const body = ctx.req.body || {}
  if (typeof body.sessionId !== 'string' || !body.sessionId || body.sessionId === 'default' || !UUID.test(body.reference_id || '')) return fail(400, '请选择有效会话与已准备的参考')
  cancelled(ctx.signal)
  if (item.creation_reference?.id !== body.reference_id) return fail(409, '创作参考已更新，请重新准备')
  let receipt
  try {
    receipt = await loadReceipt(ctx, body.reference_id)
    if (!validateCreationDraft(item, item.creation_draft).ok || receipt.fingerprint !== draftFingerprint(item, item.creation_draft)) return fail(409, '草稿或参考来源已变化，请重新准备')
  } catch { return fail(409, '创作参考文件已变化或缺失，请重新准备') }
  cancelled(ctx.signal)
  const referenceCurrent = () => {
    const current = ctx.store.get(ctx.id)
    return current?.creation_reference?.id === receipt.id && validateCreationDraft(current, current.creation_draft).ok && receipt.fingerprint === draftFingerprint(current, current.creation_draft)
  }
  if (!referenceCurrent()) return fail(409, '草稿或参考来源已变化，请重新准备')
  const capability = typeof ctx.composerAttachments === 'function' ? ctx.composerAttachments() : ctx.composerAttachments
  if (typeof capability?.registerSource !== 'function' || typeof capability?.materializeProduced !== 'function') return fail(503, '会话附件能力未就绪，请稍后重试')
  try {
    await capability.registerSource(SOURCE_PLUGIN, referenceRoot(ctx.paths))
    const outcome = await capability.materializeProduced({ sessionId: body.sessionId, sourcePlugin: SOURCE_PLUGIN,
      requestId: `${receipt.id}-${sourceFingerprint(body.sessionId)}`, files: receipt.files.map((file) => ({ path: file.path, title: file.title })) }, { signal: ctx.signal })
    cancelled(ctx.signal)
    if (!referenceCurrent()) return fail(409, '草稿或参考来源已变化，请重新准备')
    if (!Array.isArray(outcome?.results) || outcome.results.length !== receipt.files.length || outcome.results.some((file) => file.ok !== true || typeof file.relativePath !== 'string' || !file.relativePath || isAbsolute(file.relativePath) || file.relativePath.split(/[\\/]/).includes('..'))) {
      return fail(502, '部分参考文件未能带入会话，请重试；已准备的参考仍然保留')
    }
    const attachments = outcome.results.map((file, index) => ({ sourcePlugin: SOURCE_PLUGIN, kind: receipt.files[index].type, entityId: `${receipt.id}:${index}`,
      title: receipt.files[index].title, relativePath: file.relativePath, extension: file.extension,
      ...(receipt.files[index].type !== 'document' ? { previewUrl: `/omnimux/inspiration/local/media/videos/creation-references/${receipt.id}/${basename(receipt.files[index].path)}` } : {}),
      metadata: { inspiration_id: ctx.id, reference_id: receipt.id, source_url: item.source_url, summary: receipt.files[index].type === 'document' ? '本次所选参考、分析来源与创作草稿' : receipt.files[index].title } }))
    return { status: 200, body: { attachments } }
  } catch (error) {
    cancelled(ctx.signal)
    if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error
    return fail(502, '参考文件带入会话失败，请重试')
  }
}
