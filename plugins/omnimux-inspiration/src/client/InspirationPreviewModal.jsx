import { useEffect, useMemo, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import {
  pickCoverSrc,
  resolveCreatorProfileUrl,
  resolveTikTokEmbedUrl,
  translateInspiration,
  triggerAnalyzeInspiration,
} from './api.js'
import {
  deconstructionCopyText,
  getInspirationPreviewData,
  hasDeconstruction,
  scriptCopyText,
  renderPlainBreakdownText,
} from './inspiration-preview-data.js'

const ICON_COPY = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>
const ICON_CLOSE = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
const ICON_REPLICATE = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>
const ICON_EXTERNAL = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 4h6v6M20 4 11 13" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>
const ICON_CHEVRON = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>

function CopyButton({ value, label, copiedLabel, iconOnly = false }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const copy = async () => {
    try {
      const clipboardApi = navigator['clipboard']
      await clipboardApi?.writeText(String(value))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      className={`omnimux-inspiration-modal-copy${iconOnly ? ' is-icon-only' : ''}`}
      onClick={copy}
      title={iconOnly ? label : undefined}
      aria-label={label}
    >
      {ICON_COPY}
      {iconOnly ? null : <span>{copied ? copiedLabel : label}</span>}
    </button>
  )
}

function translatedSegmentText(data, segment) {
  const hit = data.translationSegments.find((row) => row.id === segment.id)
  return hit?.text || data.translationText || segment.text
}

export function InspirationPreviewModal({ row, t, onClose, onItemUpdated, onReplicate, replicateBusy }) {
  const [item, setItem] = useState(row)
  const [activeTab, setActiveTab] = useState('video')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [activeSegmentId, setActiveSegmentId] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => setItem(row), [row])
  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const data = useMemo(() => getInspirationPreviewData(item), [item])
  if (!row) return null

  const sourceUrl = data.safeItem.source_url
  const embedUrl = resolveTikTokEmbedUrl(data.analysis.embed_player_url || data.analysis.tiktok_video_id || sourceUrl)
  const localVideoUrl = data.safeItem.local_paths?.video
    ? `/omnimux/inspiration/local/media/${encodeURIComponent(data.safeItem.id)}/video.mp4`
    : null
  const cover = pickCoverSrc(data.safeItem)
  const creator = data.creator && typeof data.creator === 'object' ? data.creator : {}
  const creatorUrl = resolveCreatorProfileUrl(creator, sourceUrl, data.platform)
  const creatorLabel = creator.name || creator.handle || ''
  const dimensions = [
    ['hook', t('modal.deconstruction.hook'), data.hook],
    ['goal', t('modal.deconstruction.goal'), data.targetGoal],
    ['narrative', t('modal.deconstruction.narrative'), data.narrative],
    ['visual', t('modal.deconstruction.visual'), data.visual],
    ['replication', t('modal.deconstruction.replication'), data.replication],
  ]
  const applyItem = (next) => {
    setItem(next)
    onItemUpdated?.(next)
  }

  const handleAnalyze = async () => {
    if (analyzing || !data.safeItem.id) return
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const response = await triggerAnalyzeInspiration(data.safeItem.id)
      if (response.ok && response.body?.data) {
        applyItem(response.body.data)
        setActiveTab('deconstruction')
      } else {
        setAnalyzeError(response.body?.error || t('modal.deconstruction.error'))
      }
    } catch (error) {
      setAnalyzeError(String(error?.message || error))
    } finally {
      setAnalyzing(false)
    }
  }

  const handleTranslate = async () => {
    if (translating || !data.safeItem.id || !data.script) return
    if (data.translationText) {
      setShowTranslation((value) => !value)
      return
    }
    setTranslating(true)
    setTranslateError(null)
    try {
      const lang = typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
      const response = await translateInspiration(data.safeItem.id, lang)
      if (response.ok && response.body?.data) {
        applyItem(response.body.data)
        setShowTranslation(true)
      } else {
        setTranslateError(response.body?.error || t('modal.script.translateFailed'))
      }
    } catch (error) {
      setTranslateError(String(error?.message || error))
    } finally {
      setTranslating(false)
    }
  }

  const highlightSegment = (id) => {
    setActiveSegmentId(id)
    setActiveTab('script')
  }

  const highlightSectionFromSegment = (segment) => {
    setActiveSegmentId(segment.id)
    const section = data.sections.find((row) => row.source_segment_ids.includes(segment.id))
    if (section) setActiveTab('deconstruction')
  }

  const scriptValue = scriptCopyText(data, showTranslation)
  const deconValue = deconstructionCopyText(data)

  return (
    <div className="omnimux-inspiration-modal-backdrop" onClick={onClose}>
      <div className="omnimux-inspiration-modal-wrapper" onClick={(event) => event.stopPropagation()}>
        <div className="omnimux-inspiration-modal-container">
          <header className="omnimux-inspiration-modal-header">
            <div className="omnimux-inspiration-modal-heading">
              <h2 title={data.title}>{data.title}</h2>
              <CopyButton value={data.title} label={t('modal.header.copy')} copiedLabel={t('modal.header.copied')} iconOnly />
            </div>
            <IconButton className="omnimux-inspiration-modal-close" variant="ghost" size="sm" aria-label={t('close')} onClick={onClose}>
              {ICON_CLOSE}
            </IconButton>
          </header>

          <nav className="omnimux-inspiration-modal-mobile-tabs" role="tablist" aria-label={t('modal.header.tabs')}>
            {['video', 'script', 'deconstruction'].map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? 'active' : ''}
                onClick={() => setActiveTab(tab)}
                key={tab}
              >
                {t(`modal.panel.${tab}`)}
              </button>
            ))}
          </nav>

          <main className="omnimux-inspiration-modal-body">
            <section className={`omnimux-inspiration-modal-panel omnimux-inspiration-modal-video-panel ${activeTab === 'video' ? 'is-active' : ''}`}>
              <div className="omnimux-inspiration-modal-panel-heading"><h3>{t('modal.panel.video')}</h3></div>
              <div className="omnimux-inspiration-modal-player-box">
                {embedUrl ? (
                  <iframe title={data.title} src={embedUrl} className="omnimux-inspiration-player-frame" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                ) : localVideoUrl ? (
                  <video src={localVideoUrl} controls className="omnimux-inspiration-player-frame" />
                ) : cover ? (
                  <img src={cover} alt={data.title} className="omnimux-inspiration-modal-cover-bg" />
                ) : (
                  <div className="omnimux-inspiration-cover-fallback">{data.title.slice(0, 1)}</div>
                )}
              </div>
              {sourceUrl ? (
                <div className="omnimux-inspiration-modal-meta-row">
                  <a className="omnimux-inspiration-modal-link" href={sourceUrl} target="_blank" rel="noopener noreferrer" title={sourceUrl}>{sourceUrl} {ICON_EXTERNAL}</a>
                  <CopyButton value={sourceUrl} label={t('modal.meta.copyLink')} copiedLabel={t('modal.header.copied')} iconOnly />
                </div>
              ) : null}
              <div className="omnimux-inspiration-modal-meta-list">
                {creatorLabel ? (
                  <div className="omnimux-inspiration-modal-meta-row">
                    {creatorUrl ? (
                      <a className="omnimux-inspiration-creator-link" href={creatorUrl} target="_blank" rel="noopener noreferrer">{t('modal.meta.author')}: {creatorLabel}</a>
                    ) : (
                      <span>{t('modal.meta.author')}: {creatorLabel}</span>
                    )}
                    <CopyButton value={creator.handle || creatorLabel} label={t('modal.meta.copyAuthor')} copiedLabel={t('modal.header.copied')} iconOnly />
                  </div>
                ) : null}
                {data.publishedAt || data.createdAt ? (
                  <span>
                    {data.publishedAt ? `${t('modal.meta.publishedAt')} ${data.publishedAt}` : ''}
                    {data.publishedAt && data.createdAt ? ' · ' : ''}
                    {data.createdAt ? `${t('modal.meta.createdAt')} ${data.createdAt}` : ''}
                  </span>
                ) : null}
              </div>
              {!embedUrl && Object.keys(data.stats).length ? (
                <div className="omnimux-inspiration-stats-grid">
                  {[['likes', 'stat.likes', 'digg_count'], ['comments', 'stat.comments', 'comment_count'], ['shares', 'stat.shares', 'share_count']].map(([key, label, fallback]) => (
                    <div className="omnimux-inspiration-stat-item" key={key}>
                      <span className="omnimux-inspiration-stat-label">{t(label)}</span>
                      <span className="omnimux-inspiration-stat-val">{data.stats[key] ?? data.stats[fallback] ?? '-'}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={`omnimux-inspiration-modal-panel omnimux-inspiration-modal-script-panel ${activeTab === 'script' ? 'is-active' : ''}`}>
              <div className="omnimux-inspiration-modal-panel-heading">
                <h3>{t('modal.panel.script')}</h3>
                <div className="omnimux-inspiration-modal-panel-actions">
                  <CopyButton value={scriptValue} label={t('modal.script.copy')} copiedLabel={t('modal.header.copied')} />
                  {data.script ? (
                    <button type="button" className="omnimux-inspiration-modal-copy" onClick={handleTranslate} disabled={translating}>
                      {translating ? t('modal.script.translating') : (showTranslation && data.translationText ? t('modal.script.showSource') : t('modal.script.translate'))}
                    </button>
                  ) : null}
                </div>
              </div>
              {translateError ? <div className="omnimux-inspiration-error-text">{translateError}</div> : null}
              {data.segments.length ? (
                <ol className={`omnimux-inspiration-modal-script-list ${data.hasTimecodes ? 'has-timecode' : ''}`}>
                  {data.segments.map((segment) => (
                    <li
                      key={segment.id}
                      className={activeSegmentId === segment.id ? 'is-active' : ''}
                      onClick={() => highlightSectionFromSegment(segment)}
                    >
                      {data.hasTimecodes ? <span className="omnimux-inspiration-modal-timecode">{segment.startLabel || '—'}</span> : null}
                      <span className="omnimux-inspiration-modal-script-line">
                        {showTranslation ? translatedSegmentText(data, segment) : segment.text}
                      </span>
                      <CopyButton value={showTranslation ? translatedSegmentText(data, segment) : segment.text} label={t('modal.script.copySegment')} copiedLabel={t('modal.header.copied')} />
                    </li>
                  ))}
                </ol>
              ) : data.script ? (
                <>
                  <div className="omnimux-inspiration-modal-script-content is-card">{renderPlainBreakdownText(showTranslation && data.translationText ? data.translationText : data.script)}</div>
                  <div className="omnimux-inspiration-modal-script-hint">{t('modal.script.noSegmentsHint')}</div>
                </>
              ) : (
                <div className="omnimux-inspiration-modal-empty">
                  <p>{t('modal.script.empty')}</p>
                  <p>{t('modal.script.emptyHint')}</p>
                  {!hasDeconstruction(data) ? <Button variant="primary" onClick={handleAnalyze} loading={analyzing} disabled={analyzing}>{t('modal.deconstruction.analyze')}</Button> : null}
                </div>
              )}
            </section>

            <section className={`omnimux-inspiration-modal-panel omnimux-inspiration-modal-deconstruction-panel ${activeTab === 'deconstruction' ? 'is-active' : ''}`}>
              <div className="omnimux-inspiration-modal-panel-heading">
                <h3>{t('modal.panel.deconstruction')}</h3>
                <CopyButton value={deconValue} label={t('modal.deconstruction.copy')} copiedLabel={t('modal.header.copied')} />
              </div>
              {hasDeconstruction(data) ? (
                <div className="omnimux-inspiration-modal-dimensions">
                  {data.sections.length ? data.sections.map((section) => (
                    <article
                      key={section.id}
                      className={section.source_segment_ids.includes(activeSegmentId) ? 'is-active' : ''}
                      onClick={() => section.source_segment_ids[0] && highlightSegment(section.source_segment_ids[0])}
                    >
                      <button
                        type="button"
                        className="omnimux-inspiration-modal-fold"
                        onClick={(event) => {
                          event.stopPropagation()
                          setCollapsed((prev) => ({ ...prev, [section.id]: !prev[section.id] }))
                        }}
                      >
                        <h4>{section.title}</h4>
                      </button>
                      {collapsed[section.id] ? null : (
                        <>
                          {section.quote ? <blockquote>{renderPlainBreakdownText(section.quote)}</blockquote> : null}
                          {section.analysis ? <p>{renderPlainBreakdownText(section.analysis)}</p> : null}
                        </>
                      )}
                    </article>
                  )) : dimensions.map(([key, label, value]) => value ? (
                    <article key={key}>
                      <button
                        type="button"
                        className="omnimux-inspiration-modal-fold"
                        onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
                        aria-expanded={!collapsed[key]}
                      >
                        <h4>{label}</h4>
                        <span className={`omnimux-inspiration-modal-chevron${collapsed[key] ? ' is-collapsed' : ''}`}>{ICON_CHEVRON}</span>
                      </button>
                      {collapsed[key] ? null : <p>{renderPlainBreakdownText(value)}</p>}
                    </article>
                  ) : null)}
                  {data.rawMarkdown ? (
                    <div className="omnimux-inspiration-modal-raw">
                      <button type="button" className="omnimux-inspiration-modal-copy" onClick={() => setShowRaw((value) => !value)}>
                        {showRaw ? t('modal.deconstruction.hideRaw') : t('modal.deconstruction.showRaw')}
                      </button>
                      {showRaw ? <pre>{data.rawMarkdown}</pre> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="omnimux-inspiration-modal-empty">
                  <p>{analyzing ? t('modal.deconstruction.analyzing') : t('modal.deconstruction.empty')}</p>
                  {analyzeError ? <div className="omnimux-inspiration-error-text">{analyzeError}</div> : null}
                  <Button variant="primary" onClick={handleAnalyze} loading={analyzing} disabled={analyzing}>{t('modal.deconstruction.analyze')}</Button>
                </div>
              )}
            </section>
          </main>

          <footer className="omnimux-inspiration-modal-footer">
            {typeof onReplicate === 'function' ? (
              <Button
                className="omnimux-inspiration-modal-replicate"
                variant="primary"
                disabled={Boolean(replicateBusy)}
                onClick={() => {
                  onReplicate(data.safeItem)
                  onClose?.()
                }}
              >
                {ICON_REPLICATE}
                {t('card.cta.try')}
              </Button>
            ) : null}
          </footer>
        </div>
      </div>
    </div>
  )
}
