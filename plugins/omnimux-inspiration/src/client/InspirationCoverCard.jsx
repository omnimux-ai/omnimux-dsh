import { useEffect, useRef, useState } from 'react'
import { Badge, Button, IconButton } from 'dsh-ui-kit'
import { isUsableCoverSize, pickCoverSrc, pickVideoSrc } from './api.js'
import { formatPlatformName } from './feed-helpers.js'
import { importErrorText, importPillLabel, importSettledNotice, isFailedRow, isImportingRow } from './import-status.js'
import { OrganicShimmerOverlay } from './OrganicShimmer.jsx'
import { RivalPostCard } from './RivalPostCard.jsx'
import { toInspirationCardRow } from './inspiration-card.js'
import { formatDuration, formatRelativeTime, rivalLocaleOf } from './rival-format.js'
import { COLLECTION_MEMBER_LAYOUT, rivalMediaRatioOf } from './rival-masonry.js'

const ICON_EYE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696A10.75 10.75 0 0 1 21.938 12.348a1 1 0 0 1 0 .696A10.75 10.75 0 0 1 2.062 12.348" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const ICON_REPLICATE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
  </svg>
)

function stopCardEvent(e) {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * Inner controls (checkbox / CTA) must never bubble keydown to the card
 * `article`, or Enter/Space would also open the detail Modal.
 */
function isolateInnerCardKey(e) {
  e.stopPropagation()
  if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
}

export function InspirationCoverCard({ card, descriptor, style, column, actionsNode }) {
  const { row, t, onSelect, onReplicate, selected, onToggleSelect, selecting, replicateBusy, revealed } = card
  const title = String(row.title || row.source_url || row.id)
  const contentCard = descriptor || toInspirationCardRow(row, t)
  const cover = contentCard.cover_key || pickCoverSrc(row)
  const hasMedia = contentCard.card_type !== 'text'
  const inlineNotice = Boolean(contentCard.notice_kind)
  const mediaStyle = { '--rival-media-ratio': rivalMediaRatioOf(contentCard) }
  // Second source for the cover area, not a different card: an item whose cover
  // is missing or undecodable still holds a playable video, and a first frame of
  // that video is a real preview where the icon placeholder is not. Covers are
  // routinely unusable through no fault of the row — a CDN poster served as HEIC,
  // a stale local file, a 1×1 stub — and the detail modal, which mounts the video
  // itself, has always shown these items fine.
  const videoSrc = pickVideoSrc(row)
  const [broken, setBroken] = useState(!cover)
  const [loaded, setLoaded] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  const [fallbackTimeout, setFallbackTimeout] = useState(false)
  const imgRef = useRef(null)
  const isRevealed = revealed !== false

  useEffect(() => {
    setBroken(!cover)
    setLoaded(false)
    setFrameReady(false)
    setFallbackTimeout(false)
  }, [cover, videoSrc])

  // If already cached or complete, mark loaded synchronously on next tick
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      if (isUsableCoverSize(imgRef.current.naturalWidth, imgRef.current.naturalHeight)) {
        setLoaded(true)
      }
    }
  }, [cover])

  const platform = formatPlatformName(row.source_platform || (row.is_local ? 'local' : 'tiktok'), t)
  const isLocal = Boolean(row.is_local)
  const anyBusy = Boolean(replicateBusy)
  // The video frame is only a fallback, so it is reached exactly when the cover
  // path has failed: `broken` alone decides which of the two representations the
  // card is showing.
  const usesVideoFrame = broken && Boolean(videoSrc) && !fallbackTimeout

  // Safety net: avoid hanging in shimmer state when video frame loading stalls
  useEffect(() => {
    if (usesVideoFrame && !frameReady) {
      const timer = setTimeout(() => {
        setFallbackTimeout(true)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [usesVideoFrame, frameReady])

  const isShowCover = isRevealed && (usesVideoFrame ? frameReady : !broken && loaded)
  const importing = isImportingRow(row)
  const failed = isFailedRow(row)
  // Empty for a settled row on purpose: `ready` is the state of every item that
  // existed before imports had a status, so a success pill would decorate the
  // whole library. Only work in progress and failures are worth announcing.
  const statusPill = importPillLabel(row, t)
  // The pill says "failed"; this says *why*. Without it the card reports a
  // problem the user cannot act on, because the reason never leaves the server.
  //
  // The order matters. A row that settled carries a reason too — its AI breakdown
  // is missing, not its video — and `importErrorText` renders that same reason as
  // "导入失败", which would be false. The settled wording therefore gets first
  // refusal, and `importSettledNotice` answers `''` for a `failed` row.
  const errorDetail = importSettledNotice(row, t) || importErrorText(row, t)
  // 合集详情成员卡 = 封面优先（#3459）：封面之下是两行标题和一行元信息，
  // 失败原因收进元信息行的状态胶囊，不再用绝对定位浮层压住任何文字。
  const mediaFirst = contentCard.layout === COLLECTION_MEMBER_LAYOUT && hasMedia
  const locale = rivalLocaleOf(t)
  const durationText = mediaFirst ? formatDuration(contentCard.duration) : ''
  const createdRaw = mediaFirst ? formatRelativeTime(row.created_at, Date.now(), locale) : ''
  const createdText = createdRaw === '--' ? '' : createdRaw
  // 封面左下只写类型，右下写时长/图数（规格：类型左下、时长/图数右下）。
  const typeLabel = mediaFirst
    ? contentCard.media_kind === 'video'
      ? t('type.video')
      : t('type.image')
    : ''
  const cornerMetric = mediaFirst
    ? contentCard.media_kind === 'video'
      ? durationText
      : contentCard.image_count > 1
        ? `${contentCard.image_count} ${t('type.image')}`
        : ''
    : ''
  // 胶囊只说状态，完整原因走 title 与详情弹窗（详情里已有 role="alert" 的原因块）。
  const statusChip = mediaFirst
    ? failed
      ? { text: t('add.status.failed'), tone: 'is-failed' }
      : errorDetail
        ? { text: t('card.status.analysisFailed'), tone: 'is-settled' }
        : importing && statusPill
          ? { text: statusPill, tone: '' }
          : null
    : null
  const metaNode = mediaFirst ? (
    <div className="omnimux-inspiration-card-meta">
      <span className="omnimux-inspiration-card-meta-source">{platform}</span>
      {durationText ? (
        <>
          <span className="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
          <span className="omnimux-inspiration-card-meta-duration">{durationText}</span>
        </>
      ) : null}
      {createdText ? (
        <>
          <span className="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
          <span className="omnimux-inspiration-card-meta-time">{createdText}</span>
        </>
      ) : null}
      {statusChip ? (
        <span
          className={`omnimux-inspiration-card-status ${statusChip.tone}`.trim()}
          role="status"
          title={errorDetail || undefined}
          aria-label={errorDetail ? `${statusChip.text}：${errorDetail}` : statusChip.text}
        >
          {statusChip.text}
        </span>
      ) : null}
    </div>
  ) : null

  const handleClick = () => {
    if (selecting && isLocal && onToggleSelect) {
      onToggleSelect(row)
      return
    }
    onSelect(row)
  }

  const handleDetail = (e) => {
    stopCardEvent(e)
    onSelect(row)
  }

  const handleReplicate = (e) => {
    stopCardEvent(e)
    if (anyBusy) return
    if (typeof onReplicate === 'function') onReplicate(row)
  }

  const decorations = (
    <>
      {/* 悬停/多选复选框 Checkbox */}
      {isLocal && onToggleSelect ? (
        <IconButton
          variant="ghost"
          size="xs"
          className="omnimux-inspiration-card-check"
          data-selected={selected ? 'true' : 'false'}
          aria-label={t('select.toggle')}
          aria-pressed={selected ? 'true' : 'false'}
          title=""
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(row)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            isolateInnerCardKey(e)
            if (e.key === 'Enter' || e.key === ' ') onToggleSelect(row)
          }}
        >
          {selected ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : <span />}
        </IconButton>
      ) : null}

      {/* 右上角平台/本地角标：合集详情把来源放进元信息行，卡片上不再重复（Issue 3459） */}
      {!mediaFirst ? (
        <Badge
          size="sm"
          shape="capsule"
          variant={isLocal ? 'brand' : 'neutral'}
          className={`omnimux-inspiration-badge-platform ${isLocal ? 'local' : ''}`}
        >
          {isLocal ? '本地' : platform}
        </Badge>
      ) : null}

      {/* 内嵌卡片骨架扫光层：素材未完全就绪或未揭幕时置顶展示。
          导入生成中时全屏渲染创作画布同款流体微光折射动效（Organic Shimmer）。 */}
      <div
        className={`omnimux-inspiration-card-shimmer ${(!hasMedia && !importing) || isShowCover || (broken && !usesVideoFrame && !importing) ? 'is-hidden' : ''} ${importing ? 'is-importing' : ''}`}
        aria-hidden="true"
      >
        {importing ? <OrganicShimmerOverlay /> : null}
      </div>

      {/* 运行状态胶囊：仅在导入失败时显示红调提示；合集详情把它收进元信息行（Issue 3459） */}
      {!mediaFirst && !inlineNotice && (failed || importing) && statusPill ? (
        <Badge
          size="sm"
          shape="capsule"
          variant={failed ? 'danger' : 'neutral'}
          className={`omnimux-inspiration-badge-status ${failed ? 'is-failed' : ''}`}
          role="status"
        >
          {statusPill}
        </Badge>
      ) : null}

      {/* 失败原因：卡片本身要能说清「为什么」。合集详情改用元信息行胶囊 +
          title/详情弹窗承载原因，绝对定位浮层会压住标题（Issue 3459）。 */}
      {!mediaFirst && !inlineNotice && errorDetail ? (
        <div
          className={`omnimux-inspiration-card-error ${failed ? 'is-failed' : ''}`}
          role="status"
        >
          {errorDetail}
        </div>
      ) : null}

      {/* 媒体类型角标：合集详情把它放在封面左下，与右下时长成对（Issue 3459） */}
      {!mediaFirst ? (
        hasMedia && contentCard.media_kind === 'video' ? (
          <Badge size="sm" shape="capsule" className="omnimux-inspiration-badge-media">{t('type.video')}</Badge>
        ) : contentCard.image_count > 1 ? (
          <Badge size="sm" shape="capsule" className="omnimux-inspiration-badge-media">{contentCard.image_count} {t('type.image')}</Badge>
        ) : null
      ) : null}
    </>
  )

  // 悬停 CTA：合集详情把它放在封面底部工具条里，普通卡仍放在整卡悬停层。
  // 两处共用同一份 DOM，紧凑宽度的容器查询退化只维护一处。
  const ctaRow = (
    <div className="omnimux-inspiration-overlay-cta">
      <Button
        type="button"
        variant="ghost"
        className="omnimux-inspiration-overlay-cta-btn secondary"
        aria-label={t('card.cta.detail')}
        leadingIcon={ICON_EYE}
        onClick={handleDetail}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          isolateInnerCardKey(e)
          if (e.key === 'Enter' || e.key === ' ') handleDetail(e)
        }}
      >
        <span className="omnimux-inspiration-overlay-cta-label">{t('card.cta.detail')}</span>
      </Button>
      <Button
        type="button"
        variant="primary"
        className="omnimux-inspiration-overlay-cta-btn primary"
        aria-label={t('card.cta.tryFull')}
        aria-disabled={anyBusy || importing ? 'true' : 'false'}
        disabled={anyBusy || importing}
        leadingIcon={ICON_REPLICATE}
        onClick={handleReplicate}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          isolateInnerCardKey(e)
          if (e.key === 'Enter' || e.key === ' ') handleReplicate(e)
        }}
      >
        <span className="omnimux-inspiration-overlay-cta-label">{t('card.cta.try')}</span>
      </Button>
    </div>
  )

  const mediaCore = hasMedia ? (
    importing ? <div className="omnimux-rival-card-media" style={mediaStyle} /> : usesVideoFrame ? (
        <video
          style={mediaStyle}
          className={`omnimux-rival-card-media omnimux-inspiration-cover-video ${isShowCover ? 'is-loaded' : ''}`}
          src={videoSrc}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onLoadedData={() => setFrameReady(true)}
          onError={() => {
            setFrameReady(false)
            setFallbackTimeout(true)
          }}
        />
      ) : broken ? (
        <div className="omnimux-rival-card-media omnimux-inspiration-cover-fallback" style={mediaStyle} aria-hidden="true">
          <div className="omnimux-inspiration-fallback-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div className="omnimux-inspiration-fallback-title">
            {title.replace(/^https?:\/\/(www\.)?/, '')}
          </div>
        </div>
      ) : (
        <img
          ref={imgRef}
          style={mediaStyle}
          className={`omnimux-rival-card-media omnimux-inspiration-cover-img ${isShowCover ? 'is-loaded' : ''}`}
          src={cover}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={() => {
            setBroken(true)
            setLoaded(true)
          }}
          onLoad={(event) => {
            const node = event.currentTarget
            if (!isUsableCoverSize(node.naturalWidth, node.naturalHeight)) {
              setBroken(true)
            } else {
              setLoaded(true)
            }
          }}
        />
      )
  ) : null

  // 合集详情：角标与悬停工具条都住在封面里，正文区只放标题与元信息。
  const mediaNode = mediaCore ? (
    mediaFirst ? (
      <div className="omnimux-inspiration-cover-wrap">
        {mediaCore}
        {typeLabel ? <span className="omnimux-inspiration-badge-type">{typeLabel}</span> : null}
        {cornerMetric ? <span className="omnimux-inspiration-badge-duration">{cornerMetric}</span> : null}
        <div className="omnimux-inspiration-cover-tools">{ctaRow}</div>
      </div>
    ) : mediaCore
  ) : null

  const overlayNode = mediaFirst ? null : (
      <div className="omnimux-inspiration-card-overlay">
        {contentCard.media_kind === 'video' ? <div className="omnimux-inspiration-overlay-play">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div> : null}
        {ctaRow}
        <div className="omnimux-inspiration-overlay-footer">
          {title.length > 32 ? `${title.slice(0, 32)}…` : title}
        </div>
      </div>
  )

  return (
    <RivalPostCard
      card={contentCard}
      t={t}
      className={`omnimux-inspiration-card-pure ${importing ? 'is-importing' : ''}`}
      selected={Boolean(selected)}
      bodyClassName={inlineNotice ? (contentCard.notice_kind === 'error' ? `omnimux-inspiration-card-error is-inline ${failed ? 'is-failed' : ''}` : 'omnimux-inspiration-card-state-text') : ''}
      bodyRole={inlineNotice ? 'status' : undefined}
      onDetail={handleClick}
      mediaNode={mediaNode}
      metaNode={metaNode}
      overlayNode={overlayNode}
      style={style}
      column={column}
      inspirationId={String(row.id)}
    >
      {decorations}
      {actionsNode}
    </RivalPostCard>
  )
}
