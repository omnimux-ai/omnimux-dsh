import { analysisInputFingerprint, analysisMediaItems, sourceFingerprint } from './analysis-input.js'

/** @typedef {{kind:'body'} | {kind:'media',media_index:number} | {kind:'analysis',scope:'body'|'post'|'media',media_index?:number,input_fingerprint?:string,result_snapshot?:unknown}} CreationReference */
/** @typedef {{references:CreationReference[],purpose:string,intent:string,text:string,clips:Array<{media_index:number,start_seconds:number|string,end_seconds:number|string}>,manual:boolean,basis:string,stale?:boolean}} CreationDraft */

export const CREATION_PURPOSES = Object.freeze({ idea: '创意思路', story: '故事结构', script: '文案表达', motion: '动作节奏', visual: '画面风格', scene: '场景氛围' })
const text = (value) => typeof value === 'string' ? value : ''
const seconds = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null
const refs = (draft) => Array.isArray(draft?.references) ? draft.references : []
const clips = (draft) => Array.isArray(draft?.clips) ? draft.clips : []
export const creationAnalysisKey = (ref) => ref.scope === 'media' ? `media:${ref.media_index}` : ref.scope

/** Only a saved, current model result may become a creative reference. */
export function resolveCreationAnalysis(item, ref) {
  if (!['body', 'post', 'media'].includes(ref?.scope)) return null
  if (ref.scope === 'media' && (!Number.isInteger(ref.media_index) || !analysisMediaItems(item)[ref.media_index])) return null
  const entry = item?.analysis_results?.[creationAnalysisKey(ref)]
  if (!entry || entry.status !== 'done' || entry.source !== 'live' || !entry.result || entry.scope !== ref.scope || (ref.scope === 'media' && entry.media_index !== ref.media_index)) return null
  if (entry.input_fingerprint !== analysisInputFingerprint(item, entry)) return null
  if (ref.input_fingerprint && ref.input_fingerprint !== entry.input_fingerprint) return null
  return entry
}

/** A stable basis excludes user prose and tracks exactly the selected source identities. */
export function creationBasis(item, draft) {
  const media = analysisMediaItems(item)
  return sourceFingerprint({ post: item?.id || '', source: item?.source_url || '', purpose: draft?.purpose || 'idea', intent: text(draft?.intent),
    references: refs(draft).map((ref) => {
      if (ref.kind === 'body') return { kind: 'body', content: text(item?.content) }
      if (ref.kind === 'media') return { kind: 'media', media_index: ref.media_index, source: media[ref.media_index] || null }
      const entry = resolveCreationAnalysis(item, ref)
      return { kind: ref.kind, scope: ref.scope, media_index: ref.media_index, input_fingerprint: entry?.input_fingerprint || ref.input_fingerprint || '', result: entry?.result || null }
    }),
    clips: clips(draft).map((clip) => ({ media_index: clip.media_index, start_seconds: seconds(clip.start_seconds) ?? clip.start_seconds, end_seconds: seconds(clip.end_seconds) ?? clip.end_seconds })),
  })
}

export function creationMediaLabel(item, index) {
  const media = analysisMediaItems(item), type = media[index]?.type
  const ordinal = media.slice(0, index + 1).filter((entry) => entry?.type === type).length
  return `${type === 'video' ? '视频' : '图片'} ${ordinal}`
}

export function creationReferenceLabel(item, ref, draft = {}) {
  if (ref.kind === 'body') return '帖子正文'
  if (ref.kind === 'analysis') return `${ref.scope === 'body' ? '正文' : ref.scope === 'post' ? '整帖' : creationMediaLabel(item, ref.media_index)}的分析思路`
  const type = analysisMediaItems(item)[ref.media_index]?.type
  const label = creationMediaLabel(item, ref.media_index)
  const clip = clips(draft).find((value) => value.media_index === ref.media_index)
  return type === 'video' && clip && seconds(clip.start_seconds) !== null && seconds(clip.end_seconds) !== null
    ? `${label}（${seconds(clip.start_seconds)}–${seconds(clip.end_seconds)} 秒）` : label
}

/** This is an editable reference brief, not a fabricated model-written script. */
export function buildCreationDraftText(item, draft) {
  if (!refs(draft).length) return ''
  return [
    `借鉴用途：${CREATION_PURPOSES[draft?.purpose] || CREATION_PURPOSES.idea}`,
    ...(text(draft?.intent).trim() ? [`我的创作要求：${draft.intent.trim()}`] : []),
    '选用参考：', ...refs(draft).map((ref) => `- ${creationReferenceLabel(item, ref, draft)}`),
    ...(item?.source_url ? [`原帖来源：${item.source_url}`] : []),
    '请根据所选参考和我的要求，先整理可执行的创作方案。',
  ].join('\n')
}

export function createEmptyCreationDraft(item) {
  const draft = { references: [], purpose: 'idea', intent: '', text: '', clips: [], manual: false, stale: false }
  return { ...draft, basis: creationBasis(item, draft) }
}

/** Manual prose survives source changes until the user explicitly confirms or rebuilds. */
export function reconcileCreationDraft(item, draft, patch = {}) {
  const value = { ...createEmptyCreationDraft(item), ...draft, ...patch }
  value.references = refs(value).map((ref) => ({ ...ref }))
  value.clips = clips(value).map((clip) => ({ ...clip }))
  value.manual = value.manual === true
  const basis = creationBasis(item, value)
  if (!value.manual) return { ...value, text: buildCreationDraftText(item, value), basis, stale: false }
  return { ...value, text: text(value.text), stale: value.basis !== basis }
}

export function confirmCreationDraftBasis(item, draft) {
  return { ...draft, basis: creationBasis(item, draft), stale: false }
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
export function validateCreationDraft(item, draft) {
  const fail = (error) => ({ ok: false, error })
  if (!draft || !Array.isArray(draft.references) || !draft.references.length) return fail('请先选择创作参考')
  if (draft.references.length > 64 || !Object.hasOwn(CREATION_PURPOSES, draft.purpose)) return fail('请选择有效的借鉴用途')
  if (typeof draft.text !== 'string' || !draft.text.trim() || draft.text.length > 100_000 || typeof draft.intent !== 'string' || draft.intent.length > 10_000) return fail('请填写有效的创作草稿')
  if (draft.references.some((ref) => !ref || typeof ref !== 'object') || !Array.isArray(draft.clips) || draft.clips.some((clip) => !clip || typeof clip !== 'object')) return fail('创作参考或片段设置无效')
  if (draft.stale || draft.basis !== creationBasis(item, draft)) return fail('参考或用途已变化，请确认手工稿或重新整理')
  const media = analysisMediaItems(item)
  const selectedVideos = new Set()
  const seen = new Set()
  for (const ref of draft.references) {
    if (!['body', 'media', 'analysis'].includes(ref?.kind)) return fail('创作参考类型无效')
    const key = ref.kind === 'analysis' ? `analysis:${creationAnalysisKey(ref)}` : ref.kind === 'media' ? `media:${ref.media_index}` : 'body'
    if (seen.has(key)) return fail('请移除重复的创作参考')
    seen.add(key)
    if (ref.kind === 'body' && !text(item?.content).trim()) return fail('帖子正文不可用')
    if (ref.kind === 'media') {
      if (!Number.isInteger(ref.media_index) || !['video', 'image'].includes(media[ref.media_index]?.type)) return fail('所选素材不存在')
      if (media[ref.media_index].type === 'video') selectedVideos.add(ref.media_index)
    }
    if (ref.kind === 'analysis' && !resolveCreationAnalysis(item, ref)) return fail('所选分析尚未完成或来源已变化，请重新分析')
  }
  if (!Array.isArray(draft.clips)) return fail('视频片段设置无效')
  const clipped = new Set()
  for (const clip of draft.clips) {
    if (!selectedVideos.has(clip?.media_index) || clipped.has(clip.media_index)) return fail('片段必须对应已选择的视频')
    const start = seconds(clip.start_seconds), end = seconds(clip.end_seconds)
    if (start === null || end === null || start < 0 || end <= start) return fail('请填写有效的视频起止时间')
    const duration = Number(media[clip.media_index]?.duration || media[clip.media_index]?.duration_seconds)
    if (duration > 0 && end > duration) return fail('片段结束时间超出视频时长')
    clipped.add(clip.media_index)
  }
  if (clipped.size !== selectedVideos.size) return fail('请为每个所选视频填写明确的片段起止时间')
  return { ok: true }
}
