import { realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, relative, sep } from 'node:path'
import { analysisInputFingerprint, analysisMediaItems, sourceFingerprint } from './analysis-input.js'
export { analysisInputFingerprint, sourceFingerprint } from './analysis-input.js'
import { extractStructuredBreakdown } from './analyzer.js'
import { buildTranslatePrompt, parseTranslateJson } from './structure-script.js'

/** @typedef {{scope: 'post'|'body'|'media', media_index?: number, directions: Array<'content'|'expression'|'creative'>}} AnalysisSelection */
/** @typedef {{type: 'image'|'video', pathOrUrl: string}} AnalysisReference */

const DIRECTIONS = { content: '内容：主题、事实、结构和可借鉴的观点', expression: '表达：措辞、叙事、构图及表现方式', creative: '创作：可迁移的创意方法和适用边界，不直接套用商品模板' }
/** @type {WeakMap<object, Set<string>>} */
const active = new WeakMap()
const fail = (status, error, data, key) => ({ status, body: { error, ...(data ? { data, analysis_key: key } : {}) } })

function cancelled(signal) {
  if (!signal?.aborted) return
  throw Object.assign(new Error('分析已取消'), { name: 'AbortError', code: 'ABORT_ERR' })
}

/** @param {Record<string, unknown>} body @returns {AnalysisSelection} */
function requestScope(body) {
  if (!['post', 'body', 'media'].includes(body.scope)) throw Object.assign(new Error('分析范围无效'), { status: 400 })
  if (body.scope === 'media' && (!Number.isInteger(body.media_index) || body.media_index < 0)) {
    throw Object.assign(new Error('请选择有效素材'), { status: 400 })
  }
  const directions = body.directions === undefined ? Object.keys(DIRECTIONS) : body.directions
  if (!Array.isArray(directions) || !directions.length || directions.some((value) => !Object.hasOwn(DIRECTIONS, value))) {
    throw Object.assign(new Error('请选择有效分析方向'), { status: 400 })
  }
  return { scope: body.scope, ...(body.scope === 'media' ? { media_index: body.media_index } : {}), directions: [...new Set(directions)] }
}

/** @returns {AnalysisReference | null} */
function resolveSavedReference(media, item, paths) {
  if (!['image', 'video'].includes(media?.type) || typeof media.url !== 'string') return null
  const match = media.url.match(/^\/omnimux\/inspiration\/local\/media\/(videos|images|covers)\/([^/?#]+)$/)
  if (!match) return null
  const isPhotoRecord = item.type !== 'video' && (['image', 'photo', 'gallery'].includes(String(item.type || ''))
    || ['photo', 'gallery'].includes(String(item.content_shape || '')) || item.media_kind === 'image')
  const coverPhoto = media.type === 'image' && match[1] === 'covers' && isPhotoRecord
  if (!coverPhoto && match[1] !== (media.type === 'video' ? 'videos' : 'images')) return null
  const root = coverPhoto ? paths?.coversDir : media.type === 'video' ? paths?.videosDir : paths?.imagesDir
  if (!root) return null
  for (const path of Object.values(item.local_paths || {})) {
    if (typeof path !== 'string' || basename(path) !== match[2]) continue
    try {
      const canonical = realpathSync(path)
      const rel = relative(realpathSync(root), canonical)
      const stat = statSync(canonical)
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !stat.isFile()) continue
      return { type: media.type, pathOrUrl: canonical }
    } catch {
      // Missing or external files cannot become remote fallback inputs.
      continue
    }
  }
  return null
}

/** Resolve every target before issuing one model request.
 * @param {Record<string, any>} item
 * @param {AnalysisSelection} selection
 * @param {Record<string, string>} paths
 */
export function prepareAnalysis(item, selection, paths) {
  const all = analysisMediaItems(item)
  if (selection.scope === 'media' && !all[selection.media_index]) throw Object.assign(new Error('所选素材不存在'), { status: 400 })
  const targets = selection.scope === 'body' ? [] : selection.scope === 'media' ? [all[selection.media_index]] : all
  /** @type {AnalysisReference[]} */
  const references = []
  let missing = 0
  for (const target of targets) {
    const resolved = resolveSavedReference(target, item, paths)
    if (resolved) references.push(resolved)
    else missing += 1
  }
  const body = String(item.content || '')
  const context = selection.scope === 'post' ? { quoted: item.quoted || null, thread_items: item.thread_items || [] } : null
  const input_fingerprint = analysisInputFingerprint(item, selection)
  const scopeLabel = selection.scope === 'post' ? '整帖（完整正文与全部已保存素材）' : selection.scope === 'body' ? '正文（只分析原文，不猜测未提供的画面）' : `单个${targets[0]?.type === 'video' ? '视频' : '图片'}（第${selection.media_index + 1}项素材）`
  const prompt = `请分析以下社媒参考。分析对象：${scopeLabel}。\n只分析实际提供的输入，区分观察、推断与未知；不得编造镜头、台词、人物、产品或时间码。非视频不输出时间码或逐镜头脚本。正文仅作所选素材的语境，不替其他素材作结论。\n所选分析方向：\n${selection.directions.map((key) => `- ${DIRECTIONS[key]}`).join('\n')}\n用简体中文Markdown给出摘要、各所选方向的分析和可借鉴方法。若视频确有时间码依据，可给出分镜表。\n原标题：${item.title || ''}\n完整原文：\n${body}\n${context ? `帖子引用/串帖语境：${JSON.stringify(context)}` : ''}\n附件顺序：${references.map((reference, index) => `${index + 1}. ${reference.type}`).join('，') || '无'}`
  return { input_fingerprint, references, prompt, missing, empty: !body.trim() && !targets.length, body }
}

function parsedResult(markdown) {
  const parsed = extractStructuredBreakdown(markdown)
  return { ...parsed, summary: parsed.summary !== '短视频灵感素材' ? parsed.summary : (markdown.split('\n').find((line) => line.trim() && !/^\s*#/.test(line))?.trim().slice(0, 160) || ''), markdown, sections: [] }
}

/** Scope state is merged by the store, so other scopes cannot be overwritten. */
export async function handleScopedAnalysis(ctx, options = {}) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, '灵感不存在')
  if (item.import_status === 'importing') return fail(422, '灵感正在导入，请等待完成后分析')
  let selection, prepared
  try { selection = requestScope(ctx.req.body || {}); prepared = prepareAnalysis(item, selection, ctx.paths) }
  catch (error) { return fail(error.status || 400, error.message) }
  cancelled(ctx.signal)
  const key = selection.scope === 'media' ? `media:${selection.media_index}` : selection.scope
  let locks = active.get(ctx.store)
  if (!locks) { locks = new Set(); active.set(ctx.store, locks) }
  const lock = `${ctx.id}:${key}`
  if (locks.has(lock)) return fail(409, '该范围正在分析，请稍候')
  locks.add(lock)
  const previous = item.analysis_results?.[key]
  const prior = previous?.input_fingerprint === prepared.input_fingerprint ? previous : null
  const entry = { ...selection, input_fingerprint: prepared.input_fingerprint, status: 'running', source: prior?.source || 'legacy_unknown', model: prior?.model || '', result: prior?.result || null, error: null, started_at: new Date().toISOString(), analyzed_at: prior?.analyzed_at || null }
  try {
    ctx.store.updateAnalysis(ctx.id, key, entry)
    if (prepared.missing) {
      const row = ctx.store.updateAnalysis(ctx.id, key, { ...entry, status: 'partial', error: '部分素材尚未保存或文件已不可用，未进行不完整的整帖分析' })
      return fail(422, row.analysis_results[key].error, row, key)
    }
    if (prepared.empty || (selection.scope === 'body' && !prepared.body.trim())) throw Object.assign(new Error('暂无完整正文可分析'), { status: 422 })
    if (!options.execute && !ctx.textComplete?.execute) throw new Error('分析能力未就绪，请检查模型设置')
    const response = options.execute
      ? await options.execute(prepared)
      : await ctx.textComplete.execute({ prompt: prepared.prompt, reason: `inspiration-${selection.scope}-analysis`, references: prepared.references, max_tokens: 4096 }, { signal: ctx.signal })
    cancelled(ctx.signal)
    if (response?.mode !== 'live' || typeof response.text !== 'string' || !response.text.trim()) throw new Error('分析未返回真实有效结果，请重试')
    const current = ctx.store.get(ctx.id)
    if (!current) return fail(404, '灵感已删除')
    if (prepareAnalysis(current, selection, ctx.paths).input_fingerprint !== prepared.input_fingerprint) {
      const row = ctx.store.updateAnalysis(ctx.id, key, { ...entry, status: 'partial', result: null, error: '分析期间原始内容已变更，请重新分析' })
      return fail(409, row.analysis_results[key].error, row, key)
    }
    const result = response.result || parsedResult(response.text.trim())
    const row = ctx.store.updateAnalysis(ctx.id, key, { ...entry, status: 'done', source: 'live', model: response.model || '', result, error: null, analyzed_at: new Date().toISOString() })
    const updated = options.mirrorLegacy ? ctx.store.update(ctx.id, { deconstruction: result }) : row
    return { status: 200, body: { data: updated, analysis_key: key } }
  } catch (error) {
    const aborted = ctx.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR'
    const current = ctx.store.get(ctx.id)
    const row = current ? ctx.store.updateAnalysis(ctx.id, key, { ...entry, status: 'failed', error: aborted ? '分析已取消，可重新分析' : (ctx.formatErrorMessage?.(error) || error.message || String(error)) }) : null
    if (aborted) throw Object.assign(new Error('分析已取消'), { name: 'AbortError', code: 'ABORT_ERR' })
    return fail(error.status || 502, row?.analysis_results[key].error || '分析失败，请重试', row, key)
  } finally { locks.delete(lock) }
}

/** Body translation never reads the generated script or overwrites its translation. */
export async function handleBodyTranslation(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, '灵感不存在')
  const source = String(item.content || '')
  if (!source.trim()) return fail(422, '暂无完整正文可翻译')
  if (!ctx.textComplete?.execute) return fail(503, '文本翻译能力未就绪')
  const lang = String(ctx.req.body?.lang || ctx.req.body?.target || 'zh').trim() || 'zh'
  const fingerprint = sourceFingerprint(source)
  try {
    cancelled(ctx.signal)
    const response = await ctx.textComplete.execute({ prompt: buildTranslatePrompt({ lang, source, segmentIds: [] }), reason: 'inspiration-body-translate', max_tokens: 4096 }, { signal: ctx.signal })
    cancelled(ctx.signal)
    if (response?.mode !== 'live' || typeof response.text !== 'string' || !response.text.trim()) throw new Error('正文翻译未返回真实有效结果')
    const parsed = parseTranslateJson(response.text)
    if (!parsed.text?.trim()) throw new Error('正文翻译结果为空')
    const current = ctx.store.get(ctx.id)
    if (!current) return fail(404, '灵感已删除')
    if (sourceFingerprint(String(current.content || '')) !== fingerprint) return fail(409, '正文已变更，请重新翻译')
    const row = ctx.store.update(ctx.id, { body_translation: { lang, text: parsed.text, source_fingerprint: fingerprint, source: 'live', model: response.model || '', translated_at: new Date().toISOString() } })
    return { status: 200, body: { data: row } }
  } catch (error) {
    cancelled(ctx.signal)
    if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error
    return fail(502, ctx.formatErrorMessage?.(error) || error.message || String(error))
  }
}
