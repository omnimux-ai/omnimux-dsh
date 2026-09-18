import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, CopyButton, IconButton, Tabs } from 'dsh-ui-kit'
import { formatPlatformName } from './feed-helpers.js'
import { cleanScriptDisplay, parseShotTimeWindow } from '../structure-script.js'
import {
  createShareLink,
  getLocalInspiration,
  pickCoverSrc,
  pickVideoSrc,
  resolveTikTokEmbedUrl,
  shareRequestPayload,
  triggerAnalyzeInspiration,
  translateInspiration,
} from './api.js'
import {
  importErrorText,
  importSettledNotice,
  importStageLabel,
  isFailedRow,
  isImportingRow,
} from './import-status.js'
import { createImportPoller } from './import-poller.js'
import {
  decideSharePollOutcome,
  isShareRunning,
  shareErrorText,
  shareMediaNotice,
  shareSteps,
  shareUrlOf,
  shareValidityText,
} from './share-status.js'
import {
  canAnalyzeInspiration,
  deconstructionCopyText,
  getInspirationPreviewData,
  hasDeconstruction,
  parseDocAnalysis,
  scriptCopyText,
  renderPlainBreakdownText,
} from './inspiration-preview-data.js'

const ICON_SHARE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
)

const ICON_CLOSE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
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

const ICON_MIC = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
)

export { cleanScriptDisplay } from '../structure-script.js'

function formatDocQuote(quote) {
  const plain = renderPlainBreakdownText(quote).replace(/^["“]|["”]$/g, '').trim()
  return plain ? `"${plain}"` : ''
}

function renderDocAnalysis(analysis) {
  if (!analysis) return null
  const groups = parseDocAnalysis(analysis)
  if (!groups.length) return null
  return (
    <div className="omnimux-inspiration-doc-analysis">
      {groups.map((group, gIdx) => (
        <div key={gIdx} className="omnimux-inspiration-doc-group">
          {group.title ? (
            <div className="omnimux-inspiration-doc-item-title">
              <span className="omnimux-inspiration-doc-item-indicator" aria-hidden="true" />
              <span>{group.title}</span>
            </div>
          ) : null}
          <div className={group.title ? 'omnimux-inspiration-doc-desc-block' : undefined}>
            {group.entries.map((entry, eIdx) => {
              if (entry.type === 'record') {
                return (
                  <div key={eIdx} className="omnimux-inspiration-doc-record">
                    {entry.fields.map((field, fIdx) => (
                      <div key={fIdx} className="omnimux-inspiration-doc-labeled-row">
                        <span className="omnimux-inspiration-doc-label">{field.label}:</span>
                        <span className="omnimux-inspiration-doc-desc">{field.desc}</span>
                      </div>
                    ))}
                  </div>
                )
              }
              if (entry.type === 'labeled') {
                return (
                  <div key={eIdx} className="omnimux-inspiration-doc-labeled-row">
                    <span className="omnimux-inspiration-doc-label">{entry.label}:</span>
                    <span className="omnimux-inspiration-doc-desc">{entry.desc}</span>
                  </div>
                )
              }
              return (
                <p key={eIdx} className="omnimux-inspiration-doc-desc">
                  {entry.text}
                </p>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function translatedSegmentText(data, segment) {
  const hit = data.translationSegments.find((row) => row.id === segment.id)
  return hit?.text || data.translationText || segment.text
}

/**
 * Breakdown call to action.
 *
 * An item without any video stream cannot be decomposed (the backend answers
 * 422), so it gets an explanation instead of a button that is guaranteed to fail.
 */
function AnalyzeAction({ t, canAnalyze, analyzing, onAnalyze }) {
  if (!canAnalyze) {
    return <p className="omnimux-inspiration-modal-hint">{t('modal.deconstruction.noVideo')}</p>
  }
  return (
    <Button variant="primary" onClick={onAnalyze} loading={analyzing} disabled={analyzing}>
      {t('modal.deconstruction.analyze')}
    </Button>
  )
}

export function InspirationPreviewModal({ row, t, onClose, onItemUpdated, onReplicate, replicateBusy }) {
  const [item, setItem] = useState(row)
  const [activeTab, setActiveTab] = useState('shots')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef(null)

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
  }

  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [activeSegmentId, setActiveSegmentId] = useState('')
  const [videoFailed, setVideoFailed] = useState(false)
  const [showSharePopover, setShowSharePopover] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState(null)

  /**
   * The identity of the entry on screen, as text.
   *
   * A catalogue row numbers its entries (`2789`) while the Host's own row for
   * the same entry answers the string form (`"2789"`), so the raw value flips
   * type the moment a publish starts and the row is replaced. Comparing the
   * text form keeps that flip from reading as "a different entry", which would
   * close the popover and wipe the reason the publish failed — leaving the user
   * with a click that appears to do nothing at all.
   */
  const itemKey = item?.id == null ? '' : String(item.id)

  useEffect(() => {
    setShowSharePopover(false)
    setShareError(null)
  }, [itemKey])

  const applyItemRef = useRef(() => {})

  // The row is the single source of the publish's state: the Host starts the job
  // and writes every stage into it, so the page asks about that row until it
  // settles. Same poller the background imports use, told how to read a publish
  // row instead of an import row.
  const sharePoller = useMemo(() => createImportPoller({
    interpret: decideSharePollOutcome,
    deps: {
      fetchItem: (id) => getLocalInspiration(id),
      onItem: (row) => applyItemRef.current(row),
      onSettled: (row) => applyItemRef.current(row),
      onFailed: (row) => applyItemRef.current(row),
    },
  }), [])

  useEffect(() => {
    sharePoller.start()
    return () => sharePoller.dispose()
  }, [sharePoller])

  // Kept fresh on every render so the poll callbacks below never close over a
  // stale `onItemUpdated`.
  useEffect(() => {
    applyItemRef.current = (next) => {
      if (!next || typeof next !== 'object') return
      setItem(next)
      onItemUpdated?.(next)
    }
  })

  // A publish started before this popover was opened (closed and reopened, or a
  // page reload) is still running on the server: pick it back up instead of
  // showing a create button for work that is already happening.
  useEffect(() => {
    if (item?.id && isShareRunning(item)) sharePoller.track(String(item.id))
  }, [item?.id, item?.share_status, sharePoller])

  const handleCreateShare = async () => {
    if (sharing || !data.safeItem.id) return
    setSharing(true)
    setShareError(null)
    try {
      const response = await createShareLink(data.safeItem.id, shareRequestPayload(data.safeItem))
      const row = response.body?.data
      if (!response.ok) {
        // Shown in the popover, not as a full-screen error: the user asked for a
        // link, and the reason they did not get one belongs next to the button.
        setShareError(response.body?.error || t('modal.share.failed') || '创建失败')
        return
      }
      if (row) {
        applyItemRef.current(row)
        if (isShareRunning(row)) sharePoller.track(row.id)
      }
    } catch (error) {
      setShareError(String(error?.message || error))
    } finally {
      setSharing(false)
    }
  }

  useEffect(() => {
    setItem(row)
    if (row?.id && row?.is_local && !row.deconstruction) {
      getLocalInspiration(row.id).then((res) => {
        if (res.ok && res.body?.data) {
          setItem(res.body.data)
        }
      }).catch(() => {})
    }
  }, [row])
  // The media source of the row currently on screen. Declared before the reset
  // effect below because that effect keys off it.
  const videoSrc = pickVideoSrc(item)
  // A message that belongs to one media source must never outlive it: without
  // this reset the next row opened in the same modal would render its cover
  // under the previous row's "cannot be played" notice.
  useEffect(() => setVideoFailed(false), [videoSrc, item?.id])
  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const data = useMemo(() => getInspirationPreviewData(item), [item])
  if (!row) return null

  const currentShotIndex = useMemo(() => {
    if (!data?.shots?.length) return -1
    return data.shots.findIndex((shot) => {
      const { start, end } = parseShotTimeWindow(shot)
      return currentTime >= start && currentTime < end
    })
  }, [data?.shots, currentTime])

  const handleSeekShot = (shot) => {
    if (!shot) return
    const { start } = parseShotTimeWindow(shot)
    if (videoRef.current) {
      videoRef.current.currentTime = start
      videoRef.current.play?.().catch(() => {})
      setIsPlaying(true)
    }
  }

  const sourceUrl = data.safeItem.source_url
  const embedUrl = resolveTikTokEmbedUrl(data.analysis.embed_player_url || data.analysis.tiktok_video_id || sourceUrl)
  const canAnalyze = canAnalyzeInspiration(data.safeItem)
  const cover = pickCoverSrc(data.safeItem)
  const importing = isImportingRow(data.safeItem)
  const failed = isFailedRow(data.safeItem)
  // A settled row that carries an `import_error` imported fine but could not be
  // broken down; `importSettledNotice` is empty for a clean completion and for a
  // row already covered by the failure alert above.
  const settledNotice = importSettledNotice(data.safeItem, t)
  // Publish state, all of it read off the row: a running job contributes its
  // real stage list, a finished one contributes the link the cloud returned.
  const shareUrl = shareUrlOf(data.safeItem)
  const shareRunning = isShareRunning(data.safeItem)
  const shareStepsList = shareRunning ? shareSteps(data.safeItem, t) : []
  const shareFailure = shareError || shareErrorText(data.safeItem)
  const shareValidity = shareValidityText(data.safeItem, t)
  // A cloud share that had to leave its video/image out still succeeds, so the
  // warning belongs beside the link it applies to — never in place of it.
  const shareMediaWarning = shareMediaNotice(data.safeItem, t)
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

  const analyzeAction = (
    <AnalyzeAction t={t} canAnalyze={canAnalyze} analyzing={analyzing} onAnalyze={handleAnalyze} />
  )

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
        {/* 全局统一外悬浮圆形关闭按钮 */}
        <IconButton
          className="omnimux-modal-close-btn is-external omnimux-inspiration-modal-close"
          variant="ghost"
          aria-label={t('close') || 'Close'}
          onClick={(e) => { e.stopPropagation(); onClose?.() }}
        >
          {ICON_CLOSE}
        </IconButton>

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

            <div className="omnimux-inspiration-modal-header-actions">
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={ICON_SHARE}
                className={`omnimux-inspiration-share-trigger-btn ${showSharePopover ? 'is-active' : ''}`}
                onClick={() => setShowSharePopover((prev) => !prev)}
                title={t('modal.share.btn') || '分享'}
                aria-label={t('modal.share.btn') || '分享'}
                aria-expanded={showSharePopover}
              >
                {t('modal.share.btn') || '分享'}
              </Button>

              {showSharePopover && (
                <div className="omnimux-inspiration-share-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="omnimux-inspiration-share-popover-header">
                    <span className="omnimux-inspiration-share-popover-title">
                      {t('modal.share.title') || '分享灵感'}
                    </span>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      className="omnimux-inspiration-share-popover-close"
                      onClick={() => setShowSharePopover(false)}
                      aria-label={t('close') || '关闭'}
                    >
                      {ICON_CLOSE}
                    </IconButton>
                  </div>

                  {shareUrl ? (
                    <div className="omnimux-inspiration-share-result">
                      <div className="omnimux-inspiration-share-link-box">
                        <input
                          type="text"
                          readOnly
                          value={shareUrl}
                          className="omnimux-inspiration-share-input"
                        />
                        <CopyButton
                          text={shareUrl}
                          label={t('modal.share.copy') || '复制'}
                          copiedLabel={t('modal.share.copied') || '已复制'}
                          size="sm"
                          variant="secondary"
                          className="omnimux-inspiration-share-copy-btn"
                        />
                      </div>
                      <div className="omnimux-inspiration-share-meta">
                        <span>{shareValidity}</span>
                        <span className="omnimux-inspiration-share-done">{t('modal.share.doneTag') || '已发布'}</span>
                      </div>
                      {shareMediaWarning ? (
                        <div className="omnimux-inspiration-share-tip" role="status" data-share-notice="media-unavailable">
                          {shareMediaWarning}
                        </div>
                      ) : null}
                    </div>
                  ) : shareRunning ? (
                    <div className="omnimux-inspiration-share-progress" role="status" aria-live="polite" aria-label={t('modal.share.progress') || '发布进度'}>
                      <ol className="omnimux-inspiration-share-steps">
                        {shareStepsList.map((step) => (
                          <li
                            key={step.id}
                            className={`omnimux-inspiration-share-step is-${step.state}`}
                            data-share-step={step.id}
                            data-share-state={step.state}
                            aria-current={step.state === 'active' ? 'step' : undefined}
                          >
                            <span className="omnimux-inspiration-share-step-dot" aria-hidden="true" />
                            <span className="omnimux-inspiration-share-step-label">{step.label}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <div className="omnimux-inspiration-share-form">
                      <p className="omnimux-inspiration-share-hint">{t('modal.share.validityHint')}</p>

                      {shareFailure && (
                        <div className="omnimux-inspiration-share-tip is-error" role="alert">
                          {shareFailure}
                        </div>
                      )}

                      <Button
                        className="omnimux-inspiration-share-submit-btn"
                        variant="primary"
                        size="sm"
                        onClick={handleCreateShare}
                        loading={sharing}
                        disabled={sharing}
                      >
                        {sharing
                          ? (t('modal.share.creating') || '创建中…')
                          : shareFailure
                            ? (t('modal.share.retry') || '重新创建链接')
                            : (t('modal.share.create') || '创建链接')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
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

          <main className="omnimux-inspiration-modal-body is-workbench">
            {/* 左侧：视听主控面板 (9:16 大画幅播放器与底部精炼元数据) */}
            <section className="omnimux-inspiration-modal-panel omnimux-inspiration-modal-video-panel omnimux-inspiration-workbench-left">
              <div className="omnimux-inspiration-modal-player-box">
                {videoSrc && !videoFailed ? (
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    controls
                    className="omnimux-inspiration-player-frame"
                    onError={() => setVideoFailed(true)}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                ) : embedUrl ? (
                  <iframe title={data.title} src={embedUrl} className="omnimux-inspiration-player-frame" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                ) : cover ? (
                  <img src={cover} alt={data.title} className="omnimux-inspiration-modal-cover-bg" />
                ) : (
                  <div className="omnimux-inspiration-cover-fallback">{data.title.slice(0, 1)}</div>
                )}
                {videoFailed ? (
                  <p className="omnimux-inspiration-player-notice">{t('modal.video.unplayable')}</p>
                ) : null}
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

              {/* 播放器下方精炼元数据栏 */}
              <div className="omnimux-inspiration-player-meta-box">
                <div className="omnimux-inspiration-player-meta-heading">
                  <h4 className="omnimux-inspiration-player-title" title={data.title}>{data.title}</h4>
                </div>
                <div className="omnimux-inspiration-player-meta-row">
                  <Badge size="xs" shape="capsule" variant="neutral" className="omnimux-inspiration-player-platform-badge">
                    {formatPlatformName(data.platform, t)}
                  </Badge>
                  {data.creator?.name ? (
                    <span className="omnimux-inspiration-player-creator">
                      @{data.creator.handle || data.creator.name}
                    </span>
                  ) : null}
                  {data.durationLabel ? (
                    <span className="omnimux-inspiration-player-duration">
                      {data.durationLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              {importing ? (
                <p className="omnimux-inspiration-player-status">{importStageLabel(data.safeItem, t)}</p>
              ) : null}
              {failed ? (
                <p className="omnimux-inspiration-error-text" role="alert">
                  {importErrorText(data.safeItem, t) || t('add.status.failed')}
                </p>
              ) : null}
              {!failed && settledNotice ? (
                <p className="omnimux-inspiration-player-status" role="status">{settledNotice}</p>
              ) : null}
            </section>

            {/* 右侧：双视角工作台 (分镜脚本与结构拆解) */}
            <section className="omnimux-inspiration-modal-panel omnimux-inspiration-workbench-right">
              {/* 顶部分段切换栏 */}
              <div className="omnimux-inspiration-segmented-bar">
                <div className="omnimux-inspiration-segmented-container">
                  <Button
                    variant={activeTab === 'shots' ? 'secondary' : 'ghost'}
                    size="sm"
                    className={`omnimux-inspiration-segmented-btn ${activeTab === 'shots' ? 'is-active' : ''}`}
                    onClick={() => setActiveTab('shots')}
                  >
                    分镜脚本 ({data.shots.length || data.segments.length})
                  </Button>
                  <Button
                    variant={activeTab === 'structure' ? 'secondary' : 'ghost'}
                    size="sm"
                    className={`omnimux-inspiration-segmented-btn ${activeTab === 'structure' ? 'is-active' : ''}`}
                    onClick={() => setActiveTab('structure')}
                  >
                    结构拆解
                  </Button>
                </div>
              </div>

              {/* 保持测试断言需要的标题类名 */}
              <div className="omnimux-inspiration-modal-panel-heading omnimux-inspiration-deconstruct-heading">
                <div className="omnimux-inspiration-deconstruct-title">
                  {ICON_CLAPPERBOARD}
                  <h3>{activeTab === 'shots' ? '逐镜头分镜脚本' : t('modal.panel.deconstruction')}</h3>
                </div>
                {deconValue ? (
                  <CopyButton
                    text={deconValue}
                    label={t('modal.deconstruction.copy')}
                    copiedLabel={t('modal.header.copied')}
                    size="sm"
                    variant="ghost"
                    className="omnimux-inspiration-modal-copy"
                  />
                ) : null}
              </div>

              {/* 右侧主工作区内容 */}
              <div className="omnimux-inspiration-workbench-content">
                {/* 分镜脚本视图 */}
                <div className={`omnimux-inspiration-shots-view ${activeTab === 'shots' ? 'is-active' : 'is-hidden'}`}>
                  {data.shots.length ? (
                    <div className="omnimux-inspiration-shots-list">
                      {data.shots.map((shot, sIdx) => {
                        const isCurrent = currentShotIndex === sIdx && isPlaying
                        const cleanScript = cleanScriptDisplay(shot.script)
                        return (
                          <article
                            key={shot.id || sIdx}
                            className={`omnimux-inspiration-doc-section omnimux-inspiration-shot-card ${isCurrent ? 'is-active' : ''}`}
                            onClick={() => handleSeekShot(shot)}
                            title="点击跳转并从该分镜开始播放"
                          >
                            <div className="omnimux-inspiration-shot-header">
                              <div className="omnimux-inspiration-shot-meta">
                                <span className="omnimux-inspiration-shot-time">{shot.time_range || `镜头 ${sIdx + 1}`}</span>
                                {shot.stage ? <span className="omnimux-inspiration-shot-stage">{shot.stage}</span> : null}
                                {isCurrent ? (
                                  <span className="omnimux-inspiration-shot-playing-badge">
                                    <span className="omnimux-inspiration-shot-playing-dot" />
                                    <span>播放中</span>
                                  </span>
                                ) : null}
                              </div>
                              <div className="omnimux-inspiration-shot-tags">
                                {(shot.tags || []).map((tag, tIdx) => (
                                  <span key={tIdx} className="omnimux-inspiration-shot-tag">{tag}</span>
                                ))}
                              </div>
                            </div>
                            {shot.title && shot.title !== shot.description ? (
                              <h5 className="omnimux-inspiration-shot-title">{shot.title}</h5>
                            ) : null}
                            {shot.description ? (
                              <p className="omnimux-inspiration-shot-desc">{shot.description}</p>
                            ) : null}
                            {cleanScript ? (
                              <div className="omnimux-inspiration-shot-speech-container">
                                <span className="omnimux-inspiration-shot-speech-icon">{ICON_MIC}</span>
                                <span className="omnimux-inspiration-shot-speech-text">{cleanScript}</span>
                              </div>
                            ) : null}
                            {shot.prompt ? (
                              <div className="omnimux-inspiration-shot-prompt-box">
                                <code className="omnimux-inspiration-shot-prompt">{shot.prompt}</code>
                                <CopyButton
                                  text={shot.prompt}
                                  label={t('modal.deconstruction.copyPrompt') || '复制 Prompt'}
                                  copiedLabel={t('modal.header.copied') || '已复制'}
                                  size="xs"
                                  variant="ghost"
                                  className="omnimux-inspiration-shot-copy-btn"
                                />
                              </div>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  ) : data.segments.length ? (
                    <ol className="omnimux-inspiration-modal-script-list has-timecode">
                      {data.segments.map((segment) => {
                        const cleanSegmentText = cleanScriptDisplay(showTranslation ? translatedSegmentText(data, segment) : segment.text)
                        return (
                          <li
                            key={segment.id}
                            className={activeSegmentId === segment.id ? 'is-active' : ''}
                            onClick={() => {
                              setActiveSegmentId(segment.id)
                              if (videoRef.current && segment.start != null) {
                                videoRef.current.currentTime = segment.start
                                videoRef.current.play?.().catch(() => {})
                              }
                            }}
                          >
                            <span className="omnimux-inspiration-modal-timecode">{segment.startLabel || '—'}</span>
                            <span className="omnimux-inspiration-modal-script-line">
                              {cleanSegmentText}
                            </span>
                            <CopyButton
                              text={cleanSegmentText}
                              label={t('modal.script.copySegment') || '复制'}
                              copiedLabel={t('modal.header.copied') || '已复制'}
                              size="sm"
                              variant="ghost"
                              className="omnimux-inspiration-modal-copy"
                            />
                          </li>
                        )
                      })}
                    </ol>
                  ) : (
                    <div className="omnimux-inspiration-modal-empty">
                      <p>{t('modal.script.empty') || '暂无分镜脚本'}</p>
                      {analyzeAction}
                    </div>
                  )}
                </div>

                {/* 结构拆解视图 */}
                <div className={`omnimux-inspiration-modal-deconstruction-body omnimux-inspiration-modal-dimensions is-doc-style omnimux-inspiration-structure-view ${activeTab === 'structure' ? 'is-active' : 'is-hidden'}`}>
                  {data.sections && data.sections.length ? (
                    data.sections.map((section) => (
                      <article
                        key={section.id}
                        className={`omnimux-inspiration-doc-section ${section.source_segment_ids.includes(activeSegmentId) ? 'is-active' : ''}`}
                        onClick={() => section.source_segment_ids[0] && highlightSegment(section.source_segment_ids[0])}
                      >
                        <h4 className="omnimux-inspiration-doc-title">
                          <span className="omnimux-inspiration-doc-title-bar" aria-hidden="true" />
                          <span>{section.title}</span>
                        </h4>
                        {section.quote ? (
                          <blockquote className="omnimux-inspiration-doc-quote">
                            {formatDocQuote(section.quote)}
                          </blockquote>
                        ) : null}
                        {section.analysis ? renderDocAnalysis(section.analysis) : null}
                      </article>
                    ))
                  ) : (
                    <>
                      {data.hook ? (
                        <article className="omnimux-inspiration-doc-section omnimux-inspiration-strategy-card">
                          <h4 className="omnimux-inspiration-doc-title">
                            <span className="omnimux-inspiration-doc-title-bar" aria-hidden="true" />
                            <span>{t('modal.deconstruction.hook') || '黄金钩子 (0-3s)'}</span>
                          </h4>
                          <blockquote className="omnimux-inspiration-doc-quote">
                            {cleanScriptDisplay(data.hook)}
                          </blockquote>
                        </article>
                      ) : null}

                      {data.targetGoal ? (
                        <article className="omnimux-inspiration-doc-section omnimux-inspiration-strategy-card">
                          <h4 className="omnimux-inspiration-doc-title">
                            <span className="omnimux-inspiration-doc-title-bar" aria-hidden="true" />
                            <span>{t('modal.deconstruction.goal') || '核心转化目标'}</span>
                          </h4>
                          {renderDocAnalysis(data.targetGoal)}
                        </article>
                      ) : null}

                      {data.narrative ? (
                        <article className="omnimux-inspiration-doc-section omnimux-inspiration-strategy-card">
                          <h4 className="omnimux-inspiration-doc-title">
                            <span className="omnimux-inspiration-doc-title-bar" aria-hidden="true" />
                            <span>{t('modal.deconstruction.narrative') || '叙事分析与人声DNA'}</span>
                          </h4>
                          {renderDocAnalysis(data.narrative)}
                        </article>
                      ) : null}

                      {data.visual ? (
                        <article className="omnimux-inspiration-doc-section omnimux-inspiration-strategy-card">
                          <h4 className="omnimux-inspiration-doc-title">
                            <span className="omnimux-inspiration-doc-title-bar" aria-hidden="true" />
                            <span>{t('modal.deconstruction.visual') || '画面与镜头语言'}</span>
                          </h4>
                          {renderDocAnalysis(data.visual)}
                        </article>
                      ) : null}

                      {data.replication ? (
                        <article className="omnimux-inspiration-doc-section omnimux-inspiration-strategy-card">
                          <h4 className="omnimux-inspiration-doc-title">
                            <span className="omnimux-inspiration-doc-title-bar" aria-hidden="true" />
                            <span>{t('modal.deconstruction.replication') || '核心复刻策略'}</span>
                          </h4>
                          {renderDocAnalysis(data.replication)}
                        </article>
                      ) : null}
                    </>
                  )}
                </div>
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
