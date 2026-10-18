import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, CopyButton, Drawer, IconButton, InputField, Tabs } from 'dsh-ui-kit'
import { ArrowRight, Check, ExternalLink, FileText, Film, Minus, Plus, RotateCcw, Sparkles, X, ZoomIn } from 'lucide-react'
import { getPostBody, getPostMedia, analysisTargetKey, getTargetAnalysis, getBodyTranslation, analysisDirections } from './post-detail.js'
import { getInspirationPreviewData, parseDocAnalysis, renderPlainBreakdownText, scriptCopyText, deconstructionCopyText } from './inspiration-preview-data.js'
import { triggerAnalyzeInspiration, translateInspiration, saveCreationDraft, prepareCreationReferences, ensureLocalInspiration, importLocalInspiration, pickCoverSrc, resolveTikTokEmbedUrl } from './api.js'
import { formatPlatformName } from './feed-helpers.js'
import { parseShotTimeWindow } from '../structure-script.js'
import { createEmptyCreationDraft, creationBasis, reconcileCreationDraft, validateCreationDraft, confirmCreationDraftBasis } from '../creation-draft.js'

/** @typedef {{ scope: 'post' | 'body' | 'media', media_index?: number }} AnalysisTarget */
/** @typedef {{ kind: 'body' | 'media' | 'analysis', media_index?: number, scope?: string, input_fingerprint?: string, result_snapshot?: Record<string, unknown> }} PostReference */

function AnalysisText({ value }) {
  return parseDocAnalysis(value).map((group, index) => (
    <section className="omnimux-inspiration-doc-group" key={index}>
      {group.title && <h4 className="omnimux-inspiration-doc-title">{group.title}</h4>}
      <div className="omnimux-inspiration-doc-analysis">
        {group.entries.map((entry, i) => entry.type === 'record'
          ? <div className="omnimux-inspiration-doc-record" key={i}>{entry.fields.map((field, n) => <div className="omnimux-inspiration-doc-labeled-row" key={n}><span className="omnimux-inspiration-doc-label">{field.label}:</span><span className="omnimux-inspiration-doc-desc">{field.desc}</span></div>)}</div>
          : <p className="omnimux-inspiration-doc-desc" key={i}>{entry.label && <strong>{entry.label}: </strong>}{entry.desc || entry.text}</p>)}
      </div>
    </section>
  ))
}

function AnalysisResult({ result, t, onSeek }) {
  const data = getInspirationPreviewData({ analysis: result })
  return <>
    {result.summary && <p className="omnimux-post-analysis-summary">{renderPlainBreakdownText(result.summary)}</p>}
    {data.sections.map((section) => <article className="omnimux-inspiration-doc-section" key={section.id}>
      <h4 className="omnimux-inspiration-doc-title">{section.title}</h4>
      {section.quote && <blockquote className="omnimux-inspiration-doc-quote">{section.quote}</blockquote>}
      <AnalysisText value={section.analysis} />
    </article>)}
    {!data.sections.length && (data.rawMarkdown ? <AnalysisText value={data.rawMarkdown} /> : [
      ['hook', data.hook], ['goal', data.targetGoal], ['narrative', data.narrative], ['visual', data.visual], ['replication', data.replication],
    ].filter(([, value]) => value).map(([name, value]) => <article className="omnimux-inspiration-doc-section" key={name}><h4>{t(`modal.deconstruction.${name}`)}</h4><AnalysisText value={value} /></article>))}
    {data.shots.length > 0 && <section className="omnimux-inspiration-modal-script-panel">
      <div className="omnimux-post-section-heading"><h3>{t('modal.deconstruction.shotsTitle')} ({data.shots.length})</h3><CopyButton text={scriptCopyText(data)} label={t('modal.script.copy')} size="sm" variant="ghost" /></div>
      {data.shots.map((shot, index) => <article className="omnimux-inspiration-shot-card" key={shot.id || index}>
        <Button variant="ghost" size="sm" onClick={() => onSeek(parseShotTimeWindow(shot).start)}>{shot.time_range || `${t('post.shot')} ${index + 1}`}</Button>
        {shot.title && <h4>{shot.title}</h4>}{shot.description && <p>{shot.description}</p>}{shot.script && <p>{shot.script}</p>}{shot.prompt && <p className="omnimux-inspiration-shot-prompt">{shot.prompt}</p>}
      </article>)}
    </section>}
    {!data.shots.length && data.segments.length > 0 && <ol className="omnimux-inspiration-modal-script-list">{data.segments.map(segment => <li key={segment.id}><Button variant="ghost" size="sm" onClick={() => onSeek(segment.start || 0)}>{segment.startLabel || t('post.body')}</Button><span>{segment.text}</span></li>)}</ol>}
  </>
}

function ReferenceButton({ selected, onClick, t, disabled }) {
  return <Button size="sm" disabled={disabled} variant={selected ? 'secondary' : 'ghost'} aria-pressed={selected} onClick={onClick} leadingIcon={selected ? <Check size={14} /> : <Plus size={14} />}>{t(selected ? 'post.selected' : 'post.selectReference')}</Button>
}

/** A post remains mounted while analysis, reference selection and drawers change. */
export function InspirationPostDetail({ item, t, onItemUpdated, onReplicate, replicateBusy, onClose, notice }) {
  const root = useRef(null)
  const videos = useRef(new Map())
  const mediaNodes = useRef(new Map())
  const clipPlayback = useRef(null)
  const requestIdentity = useRef(String(item.source_url || item.id))
  const body = getPostBody(item)
  const media = useMemo(() => getPostMedia(item), [item])
  const missingMedia = media.some(asset => asset.missing)
  const [expanded, setExpanded] = useState(false)
  const [translated, setTranslated] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translationError, setTranslationError] = useState('')
  const [target, setTarget] = useState(() => {
    const video = media.find(asset => asset.type === 'video' && !asset.missing)
    return /** @type {AnalysisTarget} */ (video && (item.deconstruction || item.analysis) && !item.analysis_results?.post ? { scope: 'media', media_index: video.index } : { scope: 'post' })
  })
  const [directions, setDirections] = useState(() => analysisDirections())
  const [runningKey, setRunningKey] = useState('')
  const [localizing, setLocalizing] = useState(false)
  const [retryError, setRetryError] = useState('')
  const [configureKey, setConfigureKey] = useState('')
  const [analysisErrors, setAnalysisErrors] = useState({})
  const [mobilePane, setMobilePane] = useState('post')
  const [image, setImage] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [dimensions, setDimensions] = useState({})
  const [failedMedia, setFailedMedia] = useState({})
  const [failedImages, setFailedImages] = useState({})
  const [drawer, setDrawer] = useState(false)
  const [draft, setDraft] = useState(() => reconcileCreationDraft(item, item.creation_draft || createEmptyCreationDraft(item)))
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [draftError, setDraftError] = useState('')
  const [saved, setSaved] = useState(false)
  const id = String(item.id)
  const postIdentity = String(item.source_url || item.id)
  const preview = getInspirationPreviewData(item)
  const key = analysisTargetKey(target)
  const record = getTargetAnalysis(item, target)
  const selectedResult = record?.result || null
  const configuring = !selectedResult || configureKey === key
  const historicalResult = record?.status === 'legacy' || record?.source === 'legacy_unknown'
  const bodyTranslation = getBodyTranslation(item)?.text || ''
  const displayedBody = translated && bodyTranslation ? bodyTranslation : body
  const selected = draft.references || []
  const basis = creationBasis(item, draft)
  const manualStale = Boolean(draft.manual && draft.stale)
  const copy = (name) => t(`post.${name}`)
  const refKey = (ref) => ref.kind === 'media' ? `media:${ref.media_index}` : ref.kind === 'analysis' ? `analysis:${analysisTargetKey(ref)}` : 'body'
  const hasReference = (ref) => selected.some((entry) => refKey(entry) === refKey(ref))
  const labelFor = (ref) => ref.kind === 'body' ? copy('body') : ref.kind === 'analysis' ? `${copy('analysis')} · ${targetLabel(ref)}` : media.find(value => value.index === ref.media_index)?.label || copy('media')
  function targetLabel(value) { return value.scope === 'post' ? copy('wholePost') : value.scope === 'body' ? copy('body') : media.find(entry => entry.index === value.media_index)?.label || copy('media') }

  const mediaIdentity = media.map(asset => `${asset.id}:${asset.url}`).join('\n')
  useEffect(() => {
    setFailedMedia({}); setFailedImages({}); setDimensions({})
    setImage(current => current && media.some(asset => asset.id === current.id && asset.url === current.url) ? current : null)
    setTarget(current => current.scope === 'media' && !media.some(asset => asset.index === current.media_index) ? { scope: 'post' } : current)
  }, [mediaIdentity])
  useEffect(() => {
    requestIdentity.current = postIdentity
    return () => { requestIdentity.current = ''; clipPlayback.current?.() }
  }, [postIdentity])
  useEffect(() => {
    if (!image && !drawer) return
    const cancel = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (image) setImage(null)
      else setDrawer(false)
    }
    window.addEventListener('keydown', cancel, true)
    return () => window.removeEventListener('keydown', cancel, true)
  }, [image, drawer])
  const container = () => root.current?.closest('dialog') || root.current?.closest('.omnimux-inspiration-modal-container') || root.current
  const changeDraft = (next) => { if (savingRef.current) return; setDraft(current => reconcileCreationDraft(item, current, next)); setSaved(false); setDraftError('') }
  const toggleReference = (reference) => {
    if (savingRef.current) return
    const exists = hasReference(reference)
    const next = exists ? selected.filter(entry => refKey(entry) !== refKey(reference)) : [...selected, reference]
    const clips = (draft.clips || []).filter(clip => next.some(entry => entry.kind === 'media' && entry.media_index === clip.media_index))
    if (!exists && reference.kind === 'media' && media.find(value => value.index === reference.media_index)?.type === 'video') {
      clips.push({ media_index: reference.media_index, start_seconds: '', end_seconds: '' })
    }
    changeDraft({ references: next, clips })
  }
  const chooseTarget = (next) => { setTarget(next); setMobilePane('analysis') }
  const seek = (seconds, index = target.scope === 'media' ? target.media_index : media.find(value => value.type === 'video')?.index) => {
    clipPlayback.current?.()
    const node = videos.current.get(index)
    if (!node) return
    setMobilePane('post')
    mediaNodes.current.get(index)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    node.currentTime = Number(seconds) || 0
    node.play?.().catch(() => {})
    return node
  }
  const previewClip = (clip) => {
    if (clipError) { setDraftError(copy('clipInvalid')); return }
    setDrawer(false)
    const node = seek(clip.start_seconds, clip.media_index)
    if (!node) return
    const stop = () => {
      if (node.currentTime < Number(clip.end_seconds)) return
      node.pause()
      clipPlayback.current?.()
    }
    node.addEventListener('timeupdate', stop)
    clipPlayback.current = () => { node.removeEventListener('timeupdate', stop); clipPlayback.current = null }
  }
  const ensureCurrent = async () => {
    if (item.is_local === false) setLocalizing(true)
    try {
      const savedRow = await ensureLocalInspiration(item)
      if (requestIdentity.current !== postIdentity) throw new Error(copy('savedReview'))
      const nextMediaIdentity = getPostMedia(savedRow).map(asset => `${asset.id}:${asset.url}`).join('\n')
      const mediaChanged = nextMediaIdentity !== mediaIdentity
      const bodyChanged = getPostBody(savedRow) !== body
      const promoted = String(savedRow.id) !== id
      if (mediaChanged || bodyChanged || promoted) {
        setDraft(current => {
          const references = (current.references || []).filter(ref => {
            const selectedDraft = { ...current, references: [ref], clips: (current.clips || []).filter(clip => ref.kind === 'media' && clip.media_index === ref.media_index) }
            return creationBasis(item, selectedDraft) === creationBasis(savedRow, selectedDraft)
          })
          return reconcileCreationDraft(savedRow, current, { references,
            clips: (current.clips || []).filter(clip => references.some(ref => ref.kind === 'media' && ref.media_index === clip.media_index)),
          })
        })
      }
      onItemUpdated?.(savedRow)
      return { savedRow, mediaChanged, bodyChanged, promoted }
    } finally { if (requestIdentity.current === postIdentity) setLocalizing(false) }
  }
  const retrySave = async () => {
    if (localizing || !item.source_url) return
    const identity = postIdentity
    setLocalizing(true); setRetryError('')
    try {
      const response = await importLocalInspiration({ url: item.source_url, background: true, auto_analyze: false, return_existing: true,
        preserve_available: true, ...(item.capture ? { capture: item.capture } : {}), tags: item.tags || [],
      })
      if (!response.ok || !response.body?.data?.id) throw new Error(response.body?.error || copy('saveRetryFailed'))
      const savedRow = await ensureLocalInspiration({ ...response.body.data, is_local: true }, { onProgress: row => {
        if (requestIdentity.current === identity) onItemUpdated?.({ ...row, is_local: true })
      } })
      if (requestIdentity.current === identity) onItemUpdated?.(savedRow)
    } catch (error) { if (requestIdentity.current === identity) setRetryError(error.message || copy('saveRetryFailed')) }
    finally { if (requestIdentity.current === identity) setLocalizing(false) }
  }
  const analyze = async () => {
    if (runningKey || !directions.length) return
    const identity = postIdentity
    setRunningKey(key); setAnalysisErrors(current => ({ ...current, [key]: '' }))
    try {
      const local = await ensureCurrent()
      if (requestIdentity.current !== identity) return
      if (target.scope === 'media' && local.mediaChanged) { setAnalysisErrors(current => ({ ...current, [key]: copy('savedReview') })); return }
      const response = await triggerAnalyzeInspiration(local.savedRow.id, { ...target, directions })
      if (requestIdentity.current !== identity) return
      if (response.body?.data) { onItemUpdated?.(response.body.data); setConfigureKey('') }
      if (!response.ok) setAnalysisErrors(current => ({ ...current, [key]: response.body?.error || copy('analysisFailed') }))
    } catch (error) { if (requestIdentity.current === identity) setAnalysisErrors(current => ({ ...current, [key]: error.message || copy('analysisFailed') })) }
    finally { if (requestIdentity.current === identity) setRunningKey('') }
  }
  const translate = async () => {
    if (bodyTranslation) { setTranslated(value => !value); return }
    if (translating || !body) return
    const identity = postIdentity
    setTranslating(true); setTranslationError('')
    try {
      const local = await ensureCurrent()
      if (requestIdentity.current !== identity) return
      const response = await translateInspiration(local.savedRow.id, 'zh', { scope: 'body' })
      if (requestIdentity.current !== identity) return
      if (response.body?.data) onItemUpdated?.(response.body.data)
      if (response.ok) setTranslated(true)
      else setTranslationError(response.body?.error || t('modal.script.translateFailed'))
    } catch (error) { if (requestIdentity.current === identity) setTranslationError(error.message) }
    finally { if (requestIdentity.current === identity) setTranslating(false) }
  }
  useEffect(() => {
    setDraft(current => reconcileCreationDraft(item, current))
  }, [item])
  const clipError = (draft.clips || []).some(clip => clip.start_seconds === '' || clip.end_seconds === '' || !Number.isFinite(Number(clip.start_seconds)) || !Number.isFinite(Number(clip.end_seconds)) || Number(clip.start_seconds) < 0 || Number(clip.end_seconds) <= Number(clip.start_seconds) || (dimensions[clip.media_index]?.duration && Number(clip.end_seconds) > dimensions[clip.media_index].duration))
  const save = async (prepare = false) => {
    if (savingRef.current || !selected.length) return
    if (clipError) { setDraftError(copy('clipInvalid')); return }
    if (manualStale) { setDraftError(copy('manualChanged')); return }
    const validation = validateCreationDraft(item, draft)
    if (!validation.ok) { setDraftError(validation.error); return }
    const identity = postIdentity
    savingRef.current = true
    setSaving(true); setDraftError('')
    try {
      const local = await ensureCurrent()
      if (requestIdentity.current !== identity) return
      if (local.mediaChanged || local.bodyChanged || local.promoted) { setDraftError(copy('savedReview')); return }
      const payload = { ...draft, basis, clips: (draft.clips || []).map(clip => ({ ...clip, start_seconds: Number(clip.start_seconds), end_seconds: Number(clip.end_seconds) })) }
      const response = prepare ? await prepareCreationReferences(local.savedRow.id, payload) : await saveCreationDraft(local.savedRow.id, payload)
      if (requestIdentity.current !== identity) return
      if (!response.ok) { setDraftError(response.body?.error || copy('saveFailed')); return }
      const updated = response.body?.data
      if (updated?.id) onItemUpdated?.(updated)
      setDraft(payload); setSaved(true)
      if (prepare) {
        const reference = updated?.creation_reference
        if (!reference) { setDraftError(copy('prepareFailed')); return }
        const result = await onReplicate?.({ ...local.savedRow, ...(updated?.id ? updated : {}), creation_reference: reference })
        if (requestIdentity.current !== identity) return
        if (result?.ok !== true) { setDraftError(result?.error || copy('prepareFailed')); return }
        setDrawer(false)
        onClose?.()
      }
    } catch (error) { if (requestIdentity.current === identity) setDraftError(error.message || copy('saveFailed')) }
    finally { savingRef.current = false; if (requestIdentity.current === identity) setSaving(false) }
  }

  return <div ref={root} className="omnimux-post-detail">
    <Tabs className="omnimux-post-mobile-tabs" items={[{ id: 'post', label: copy('originalPost') }, { id: 'analysis', label: copy('analysis') }]} activeId={mobilePane} onChange={setMobilePane} aria-label={copy('panes')} />
    <main className="omnimux-inspiration-modal-body omnimux-post-columns">
      <section className={`omnimux-post-source omnimux-inspiration-modal-video-panel ${mobilePane === 'post' ? 'is-active' : ''}`} aria-label={copy('originalPost')}>
        <div className="omnimux-post-author"><div className="omnimux-post-avatar" aria-hidden="true">{(preview.creator.name || preview.title).slice(0, 1)}</div><div><strong>{preview.creator.name || copy('unknownAuthor')}</strong><div className="omnimux-post-meta">{preview.creator.handle && <span>@{preview.creator.handle}</span>}<Badge size="xs" variant="neutral">{formatPlatformName(preview.platform, t)}</Badge><span>{preview.publishedAt || preview.createdAt}</span></div></div>{item.source_url && <a className="omnimux-post-source-link" href={item.source_url} target="_blank" rel="noopener noreferrer" aria-label={copy('openSource')}><ExternalLink size={16} /></a>}</div>
        {body && <article className="omnimux-post-original" data-reference="body">
          <div className={`omnimux-post-body ${expanded ? 'is-expanded' : ''}`}>{expanded || displayedBody.length <= 420 ? displayedBody : `${displayedBody.slice(0, 420)}…`}</div>
          <div className="omnimux-post-actions">
            {displayedBody.length > 420 && <Button variant="ghost" size="sm" onClick={() => setExpanded(value => !value)}>{copy(expanded ? 'collapse' : 'expand')}</Button>}
            <Button variant="ghost" size="sm" loading={translating} onClick={translate}>{copy(translated ? 'showOriginal' : 'translateBody')}</Button>
            <CopyButton text={body} label={copy('copyOriginal')} size="sm" variant="ghost" />
            <ReferenceButton disabled={saving} selected={hasReference({ kind: 'body' })} onClick={() => toggleReference({ kind: 'body' })} t={t} />
          </div>{translationError && <p role="alert" className="omnimux-inspiration-error-text">{translationError}</p>}
        </article>}
        {notice}
        {(item.import_status === 'degraded' || missingMedia) && <div className="omnimux-post-warning" role="status">
          <strong>{copy('partialSave')}</strong>{item.import_error && <p>{item.import_error}</p>}
          <Button size="sm" variant="ghost" disabled={localizing || item.import_status === 'importing'} loading={localizing} onClick={retrySave}>{copy('retrySave')}</Button>
        </div>}
        {retryError && <p role="alert" className="omnimux-inspiration-error-text">{retryError}</p>}
        {localizing && <p role="status" className="omnimux-post-help">{copy('savingPost')}</p>}
        {media.map(asset => <article key={asset.id} ref={node => node ? mediaNodes.current.set(asset.index, node) : mediaNodes.current.delete(asset.index)} className="omnimux-post-media" data-media-id={asset.id}>
          <div className="omnimux-inspiration-modal-player-box omnimux-post-media-viewer">
            {asset.missing ? <p className="omnimux-post-help" role="status">{asset.label} · {copy('mediaMissing')}{asset.error && <span>：{asset.error}</span>}</p>
              : asset.type === 'video' ? <video ref={node => node ? videos.current.set(asset.index, node) : videos.current.delete(asset.index)} src={asset.url} poster={asset.poster || pickCoverSrc(item) || undefined} hidden={Boolean(failedMedia[asset.id])} controls playsInline preload="metadata" className="omnimux-inspiration-player-frame" aria-label={asset.label} onError={() => setFailedMedia(value => ({ ...value, [asset.id]: true }))} onLoadedMetadata={event => { const node = event.currentTarget; setDimensions(value => ({ ...value, [asset.index]: { width: node.videoWidth, height: node.videoHeight, duration: node.duration } })) }} />
              : <Button className="omnimux-post-image-open" variant="ghost" aria-label={`${copy('openImage')} ${asset.label}`} onClick={() => { setImage(asset); setZoom(1) }}><img src={asset.url} alt={asset.title || asset.label} className="omnimux-inspiration-modal-cover-bg" onError={() => setFailedImages(value => ({ ...value, [asset.id]: true }))} onLoad={event => { const node = event.currentTarget; setDimensions(value => ({ ...value, [asset.index]: { width: node.naturalWidth, height: node.naturalHeight } })) }} /><span className="omnimux-post-image-caption"><ZoomIn size={14} />{copy('openImage')}</span></Button>}
          {failedMedia[asset.id] && pickCoverSrc(item) && <img src={pickCoverSrc(item)} alt={copy('videoCover')} className="omnimux-inspiration-modal-cover-bg" />}
          </div>
          {failedImages[asset.id] && <p role="alert" className="omnimux-inspiration-error-text">{copy('imageUnavailable')}</p>}
          {failedMedia[asset.id] && <p className="omnimux-inspiration-player-notice" role="alert">{t('modal.video.unplayable')}</p>}
          <div className="omnimux-post-asset-footer"><div><strong>{asset.label}</strong><p>{dimensions[asset.index]?.width > 0 && `${dimensions[asset.index].width} × ${dimensions[asset.index].height}`}{asset.type === 'video' && dimensions[asset.index]?.duration > 0 && ` · ${Math.round(dimensions[asset.index].duration)} ${copy('seconds')}`}</p></div><div className="omnimux-post-actions"><Button variant="ghost" size="sm" disabled={asset.missing} leadingIcon={<Sparkles size={14} />} onClick={() => chooseTarget({ scope: 'media', media_index: asset.index })}>{copy(asset.type === 'video' ? 'analyzeVideo' : 'analyzeImage')}</Button><ReferenceButton disabled={saving || asset.missing} selected={hasReference({ kind: 'media', media_index: asset.index })} onClick={() => toggleReference({ kind: 'media', media_index: asset.index })} t={t} /></div></div>
        </article>)}
        {!media.length && resolveTikTokEmbedUrl(item.source_url) && <iframe className="omnimux-post-embed" src={resolveTikTokEmbedUrl(item.source_url)} title={preview.title} allowFullScreen />}
        {!media.length && !body && pickCoverSrc(item) && <img className="omnimux-post-orphan-cover" src={pickCoverSrc(item)} alt={copy('videoCover')} />}
        {!body && !media.length && <p className="omnimux-inspiration-modal-empty">{copy('noOriginal')}</p>}
      </section>
      <section className={`omnimux-post-analysis omnimux-inspiration-modal-deconstruction-panel ${mobilePane === 'analysis' ? 'is-active' : ''}`} aria-label={copy('analysis')}>
        <header className="omnimux-post-analysis-header"><h3><Sparkles size={17} />{copy('analysis')}</h3><span className="omnimux-post-meta">{copy('separate')}</span></header>
        <div className="omnimux-post-targets" role="group" aria-label={copy('scope')}>
          {[{ scope: 'post' }, ...(body ? [{ scope: 'body' }] : []), ...media.map(asset => ({ scope: 'media', media_index: asset.index }))].map(value => <Button key={analysisTargetKey(value)} size="sm" disabled={value.scope === 'media' && media.find(asset => asset.index === value.media_index)?.missing} variant={key === analysisTargetKey(value) ? 'secondary' : 'ghost'} aria-pressed={key === analysisTargetKey(value)} onClick={() => chooseTarget(value)}>{targetLabel(value)}</Button>)}
        </div>
        <div className="omnimux-post-analysis-scroll">
          <h2 className="omnimux-post-scope-title">{targetLabel(target)}</h2>
          {configuring ? <>
          <p className="omnimux-post-help">{copy('analysisIntro')}</p>
          <div className="omnimux-post-directions">{analysisDirections().map(value => <label className="omnimux-post-direction" key={value}><input type="checkbox" checked={directions.includes(value)} onChange={() => setDirections(current => current.includes(value) ? current.filter(entry => entry !== value) : [...current, value])} /><span><strong>{copy(`direction.${value}`)}</strong><small>{copy(`directionHint.${value}`)}</small></span></label>)}</div>
          <Button variant="primary" leadingIcon={<Sparkles size={14} />} loading={runningKey === key} disabled={Boolean(runningKey) || !directions.length || item.import_status === 'importing' || (target.scope === 'post' && missingMedia) || (target.scope === 'media' && media.find(asset => asset.index === target.media_index)?.missing)} onClick={analyze}>{copy(record ? 'reanalyze' : 'analyzeTarget')}</Button>
          </> : <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={14} />} onClick={() => setConfigureKey(key)}>{copy('reanalyze')}</Button>}
          {(analysisErrors[key] || record?.error) && <p className="omnimux-inspiration-error-text" role="alert">{analysisErrors[key] || record.error}</p>}
          {record?.status === 'stale' && <p role="status" className="omnimux-post-warning">{copy('staleAnalysis')}</p>}
          {record?.status === 'running' && <p role="status" className="omnimux-post-help">{copy('running')}</p>}
          {record?.status === 'partial' && <p className="omnimux-post-warning" role="status">{copy('partial')}</p>}
          {selectedResult && <div className="omnimux-post-result" data-analysis-scope={key}>
            <div className="omnimux-post-section-heading omnimux-inspiration-deconstruct-heading"><span className="omnimux-post-meta">{historicalResult ? copy('historical') : [copy('modelResult'), record?.model].filter(Boolean).join(' · ')}</span><CopyButton text={deconstructionCopyText(getInspirationPreviewData({ analysis: selectedResult })) || selectedResult.summary || ''} label={t('modal.deconstruction.copy')} size="sm" variant="ghost" /></div>
            <AnalysisResult result={selectedResult} t={t} onSeek={seconds => seek(seconds)} />
            {record?.status === 'done' && record?.source === 'live' && <ReferenceButton disabled={saving} t={t} selected={hasReference({ kind: 'analysis', ...target })} onClick={() => toggleReference({ kind: 'analysis', ...target, input_fingerprint: record.input_fingerprint, result_snapshot: record.result })} />}
          </div>}
          {!record && <p className="omnimux-post-analysis-empty">{copy('noAnalysis')}</p>}
        </div>
      </section>
    </main>
    <footer className="omnimux-inspiration-modal-footer omnimux-post-reference-bar"><div><strong>{selected.length ? `${copy('selectedReferences')} ${selected.length}` : copy('chooseHint')}</strong><div className="omnimux-post-reference-chips">{selected.map(ref => <span key={refKey(ref)}>{labelFor(ref)}</span>)}</div></div><Button className="omnimux-inspiration-modal-replicate" variant="primary" leadingIcon={<ArrowRight size={15} />} disabled={!selected.length} onClick={() => setDrawer(true)}>{copy('create')}</Button></footer>
    <Drawer open={Boolean(image)} onClose={() => setImage(null)} title={<div className="omnimux-post-drawer-heading"><span>{image?.label || copy('image')}</span><IconButton variant="ghost" aria-label={t('close')} onClick={() => setImage(null)}><X size={16} /></IconButton></div>} closable={false} className="omnimux-post-lightbox" width="100%" container={container} closeOnEsc={false} footer={image && <ReferenceButton disabled={saving} selected={hasReference({ kind: 'media', media_index: image.index })} onClick={() => toggleReference({ kind: 'media', media_index: image.index })} t={t} />}>
      {image && <><div className="omnimux-post-lightbox-tools"><IconButton variant="ghost" aria-label={copy('zoomOut')} onClick={() => setZoom(value => Math.max(1, value - .5))}><Minus size={16} /></IconButton><Button size="sm" variant="ghost" leadingIcon={<RotateCcw size={14} />} onClick={() => setZoom(1)}>{zoom === 1 ? copy('fit') : `${Math.round(zoom * 100)}%`}</Button><IconButton variant="ghost" aria-label={copy('zoomIn')} onClick={() => setZoom(value => Math.min(4, value + .5))}><Plus size={16} /></IconButton><a href={image.url} target="_blank" rel="noopener noreferrer">{copy('openOriginal')}</a></div><div className={`omnimux-post-lightbox-canvas ${zoom > 1 ? 'is-zoomed' : ''}`}><img src={image.url} alt={image.title || image.label} style={zoom > 1 ? { width: `${(dimensions[image.index]?.width || 600) * zoom}px`, maxWidth: 'none', maxHeight: 'none' } : undefined} /></div></>}
    </Drawer>
    <Drawer open={drawer} onClose={() => setDrawer(false)} title={<div className="omnimux-post-drawer-heading"><span>{copy('creationTitle')}</span><IconButton variant="ghost" aria-label={t('close')} onClick={() => setDrawer(false)}><X size={16} /></IconButton></div>} closable={false} description={copy('creationHint')} width={460} container={container} closeOnEsc={false} className="omnimux-post-creation-drawer" footer={<div className="omnimux-post-draft-actions"><Button variant="secondary" loading={saving} disabled={!selected.length} onClick={() => save(false)}>{copy('saveDraft')}</Button><Button variant="primary" loading={saving || replicateBusy} disabled={!selected.length || !onReplicate || manualStale || clipError} onClick={() => save(true)}>{copy('useInChat')}</Button></div>}>
      <div className="omnimux-post-draft-content">
        <section><h4>{copy('reference')}</h4>{selected.map(ref => <div className="omnimux-post-draft-reference" key={refKey(ref)}><span>{ref.kind === 'media' ? <Film size={15} /> : <FileText size={15} />}{labelFor(ref)}</span><Button size="sm" variant="ghost" disabled={saving} onClick={() => toggleReference(ref)}>{copy('remove')}</Button></div>)}</section>
        {(draft.clips || []).map(clip => <fieldset className="omnimux-post-clip" key={clip.media_index}><legend>{labelFor({ kind: 'media', media_index: clip.media_index })} · {copy('clip')}</legend><p>{copy('clipHint')}</p><div>{['start_seconds', 'end_seconds'].map(field => <InputField key={field} label={copy(field === 'start_seconds' ? 'start' : 'end')} disabled={saving} type="number" min="0" step="0.1" value={clip[field]} onChange={event => changeDraft({ clips: draft.clips.map(value => value.media_index === clip.media_index ? { ...value, [field]: event.target.value } : value) })} />)}<Button size="sm" variant="ghost" disabled={clipError} onClick={() => previewClip(clip)}>{copy('previewClip')}</Button></div></fieldset>)}
        <section><h4>{copy('purpose')}</h4><div className="omnimux-post-purpose">{['idea', 'story', 'script', 'motion', 'visual', 'scene'].map(value => <Button key={value} size="sm" variant={draft.purpose === value ? 'secondary' : 'ghost'} aria-pressed={draft.purpose === value} disabled={saving} onClick={() => changeDraft({ purpose: value })}>{copy(`purpose.${value}`)}</Button>)}</div></section>
        <label className="omnimux-post-draft-field">{copy('intent')}<textarea disabled={saving} rows={3} value={draft.intent || ''} placeholder={copy('intentPlaceholder')} onChange={event => changeDraft({ intent: event.target.value })} /></label>
        <label className="omnimux-post-draft-field">{copy('draftText')}<textarea disabled={saving} rows={9} value={draft.text || ''} onChange={event => changeDraft({ text: event.target.value, manual: true, basis })} /></label>
        {manualStale && <div className="omnimux-post-warning" role="status"><p>{copy('manualChanged')}</p><Button size="sm" variant="secondary" disabled={saving} onClick={() => changeDraft({ manual: false })}>{copy('rebuildDraft')}</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => { if (savingRef.current) return; setDraft(current => confirmCreationDraftBasis(item, current)); setSaved(false) }}>{copy('keepDraft')}</Button></div>}
        {draftError && <p role="alert" className="omnimux-inspiration-error-text">{draftError}</p>}{saved && <p role="status">{copy('saved')}</p>}
        <p className="omnimux-post-help">{copy('noAutoSend')}</p>
      </div>
    </Drawer>
  </div>
}
