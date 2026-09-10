import { useEffect, useMemo, useState } from 'react'
import { Button, CopyButton, IconButton, Tabs } from 'dsh-ui-kit'
import {
  pickCoverSrc,
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

const ICON_CLOSE = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
const ICON_REPLICATE = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>
const ICON_EXTERNAL = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 4h6v6M20 4 11 13" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>
const ICON_CLAPPERBOARD = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12.3 3.5 3 4" />
    <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z" />
    <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="m6.2 5.3 3.1 3.9" />
  </svg>
)

function formatDocQuote(quote) {
  const plain = renderPlainBreakdownText(quote).replace(/^["“]|["”]$/g, '').trim()
  return plain ? `"${plain}"` : ''
}

function renderDocAnalysis(analysis) {
  const plain = renderPlainBreakdownText(analysis)
  if (!plain) return null
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className="omnimux-inspiration-doc-analysis">
      {lines.map((line, idx) => {
        const textWithoutBullet = line.replace(/^[•·*-]\s*/, '')
        return (
          <p key={idx} className="omnimux-inspiration-doc-bullet">
            <span className="omnimux-inspiration-bullet-dot">•</span>
            <span>{textWithoutBullet}</span>
          </p>
        )
      })}
    </div>
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

  const mobileTabs = ['video', 'script', 'deconstruction'].map((tab) => ({
    id: tab,
    label: t(`modal.panel.${tab}`),
  }))

  return (
    <div className="omnimux-inspiration-modal-backdrop" onClick={onClose} onWheel={(e) => e.stopPropagation()}>
      <div className="omnimux-inspiration-modal-wrapper" onClick={(event) => event.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="omnimux-inspiration-modal-container" onWheel={(e) => e.stopPropagation()}>
          <header className="omnimux-inspiration-modal-header">
            <div className="omnimux-inspiration-modal-heading">
              <h2 title={data.title}>{data.title}</h2>
              <CopyButton
                text={data.title}
                label=""
                copiedLabel=""
                title={t('modal.header.copy')}
                aria-label={t('modal.header.copy')}
                size="sm"
                variant="ghost"
                className="omnimux-inspiration-modal-copy is-icon-only"
              />
            </div>
            <IconButton className="omnimux-inspiration-modal-close" variant="ghost" size="sm" aria-label={t('close')} onClick={onClose}>
              {ICON_CLOSE}
            </IconButton>
          </header>

          <Tabs
            className="omnimux-inspiration-modal-mobile-tabs"
            variant="pill"
            size="sm"
            items={mobileTabs}
            activeId={activeTab}
            onChange={setActiveTab}
            aria-label={t('modal.header.tabs')}
          />

          <main className="omnimux-inspiration-modal-body">
            <section className={`omnimux-inspiration-modal-panel omnimux-inspiration-modal-video-panel ${activeTab === 'video' ? 'is-active' : ''}`}>
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
                {sourceUrl ? (
                  <div className="omnimux-inspiration-player-actions">
                    <CopyButton
                      text={sourceUrl}
                      label=""
                      copiedLabel=""
                      title={t('modal.meta.copyLink') || '复制链接'}
                      aria-label={t('modal.meta.copyLink') || '复制链接'}
                      size="sm"
                      variant="ghost"
                      className="omnimux-inspiration-modal-copy is-icon-only"
                    />
                    <a
                      className="omnimux-inspiration-modal-copy is-icon-only omnimux-inspiration-player-open-link"
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('modal.meta.visitLink') || '访问此链接'}
                      aria-label={t('modal.meta.visitLink') || '访问此链接'}
                    >
                      {ICON_EXTERNAL}
                    </a>
                  </div>
                ) : null}
              </div>
            </section>

            <section className={`omnimux-inspiration-modal-panel omnimux-inspiration-modal-script-panel ${activeTab === 'script' ? 'is-active' : ''}`}>
              <div className="omnimux-inspiration-modal-panel-heading">
                <h3>{t('modal.panel.script')}</h3>
                <div className="omnimux-inspiration-modal-panel-actions">
                  {scriptValue ? <CopyButton
                    text={scriptValue}
                    label={t('modal.script.copy')}
                    copiedLabel={t('modal.header.copied')}
                    size="sm"
                    variant="ghost"
                    className="omnimux-inspiration-modal-copy"
                  /> : null}
                  {data.script ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="omnimux-inspiration-modal-copy"
                      onClick={handleTranslate}
                      disabled={translating}
                    >
                      {translating ? t('modal.script.translating') : (showTranslation && data.translationText ? t('modal.script.showSource') : t('modal.script.translate'))}
                    </Button>
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
                      <CopyButton
                        text={showTranslation ? translatedSegmentText(data, segment) : segment.text}
                        label={t('modal.script.copySegment')}
                        copiedLabel={t('modal.header.copied')}
                        size="sm"
                        variant="ghost"
                        className="omnimux-inspiration-modal-copy"
                      />
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
              <div className="omnimux-inspiration-modal-panel-heading omnimux-inspiration-deconstruct-heading">
                <div className="omnimux-inspiration-deconstruct-title">
                  {ICON_CLAPPERBOARD}
                  <h3>{t('modal.panel.deconstruction')}</h3>
                </div>
                {deconValue ? <CopyButton
                  text={deconValue}
                  label={t('modal.deconstruction.copy')}
                  copiedLabel={t('modal.header.copied')}
                  size="sm"
                  variant="ghost"
                  className="omnimux-inspiration-modal-copy"
                /> : null}
              </div>
              <div className="omnimux-inspiration-modal-deconstruction-body">
                {hasDeconstruction(data) ? (
                  <div className="omnimux-inspiration-modal-dimensions is-doc-style">
                    {data.sections.length ? data.sections.map((section) => (
                      <article
                        key={section.id}
                        className={`omnimux-inspiration-doc-section ${section.source_segment_ids.includes(activeSegmentId) ? 'is-active' : ''}`}
                        onClick={() => section.source_segment_ids[0] && highlightSegment(section.source_segment_ids[0])}
                      >
                        <h4 className="omnimux-inspiration-doc-title">{section.title}</h4>
                        {section.quote ? (
                          <blockquote className="omnimux-inspiration-doc-quote">
                            {formatDocQuote(section.quote)}
                          </blockquote>
                        ) : null}
                        {section.analysis ? renderDocAnalysis(section.analysis) : null}
                      </article>
                    )) : dimensions.map(([key, label, value]) => value ? (
                      <article key={key} className="omnimux-inspiration-doc-section">
                        <h4 className="omnimux-inspiration-doc-title">{label}</h4>
                        {renderDocAnalysis(value)}
                      </article>
                    ) : null)}
                    {data.rawMarkdown ? (
                      <div className="omnimux-inspiration-modal-raw">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="omnimux-inspiration-modal-copy"
                          onClick={() => setShowRaw((value) => !value)}
                        >
                          {showRaw ? t('modal.deconstruction.hideRaw') : t('modal.deconstruction.showRaw')}
                        </Button>
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
              </div>
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
