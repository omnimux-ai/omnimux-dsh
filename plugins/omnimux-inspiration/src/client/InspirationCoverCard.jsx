import { useEffect, useRef, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { isUsableCoverSize, pickCoverSrc, pickVideoSrc } from './api.js'
import { formatPlatformName } from './feed-helpers.js'
import { importErrorText, importPillLabel, importSettledNotice, isFailedRow, isImportingRow } from './import-status.js'
import { OrganicShimmerOverlay } from './OrganicShimmer.jsx'
import { RivalPostCard } from './RivalPostCard.jsx'
import { toInspirationCardRow } from './inspiration-card.js'
import { formatCount, formatRelativeTime, rivalLocaleOf } from './rival-format.js'
import { COLLECTION_MEMBER_LAYOUT, FEED_LAYOUT, rivalMediaRatioOf } from './rival-masonry.js'

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
  // 库卡片 = 根层与合集共用一套卡壳（Issue 3477）：封面优先、两行标题、
  // 元信息行（平台 · 播放量 · 时间）+ 状态胶囊；帖子卡没有封面，用正文 +
  // 同一元信息行。根层与合集唯一差异是封面比例（数据比例 vs 固定 4:5）。
  const libraryLayout = contentCard.layout === FEED_LAYOUT || contentCard.layout === COLLECTION_MEMBER_LAYOUT
  const coverFirst = libraryLayout && hasMedia
  const locale = rivalLocaleOf(t)
  // 本地行有 created_at，云端/对标行只有 posted_at：两者都接受，缺了就不显示。
  const createdRaw = libraryLayout ? formatRelativeTime(row.created_at || row.posted_at, Date.now(), locale) : ''
  const createdText = createdRaw === '--' ? '' : createdRaw
  // 播放量只在数据真的带了这个字段时出现；本地行没有 stats，整段省略。
  const rawViews = contentCard.stats ? Number(contentCard.stats.views) : NaN
  const viewsText = libraryLayout && Number.isFinite(rawViews) && rawViews >= 0
    ? t('card.meta.views').replace('{views}', formatCount(rawViews, locale))
    : ''
  // 失败信息收敛为一个常显小图标，悬停图标看完整原因（Issue 3502）。
  // 导入中的卡片没有「失败」可看，继续用 shimmer/阶段正文表达。
  const failureReason = failed || errorDetail ? (errorDetail || statusPill || t('add.status.failed')) : ''
  const metaNode = libraryLayout ? (
    <div className="omnimux-inspiration-card-meta">
      <span className="omnimux-inspiration-card-meta-source">{platform}</span>
      {viewsText ? (
        <>
          <span className="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
          <span className="omnimux-inspiration-card-meta-views">{viewsText}</span>
        </>
      ) : null}
      {createdText ? (
        <>
          <span className="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
          <span className="omnimux-inspiration-card-meta-time">{createdText}</span>
        </>
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

      {/* 导入中：内容还没到，保留一个常显的小阶段标签（默认卡面仍然没有其他 chrome）。 */}
      {coverFirst && importing && statusPill ? (
        <span className="omnimux-inspiration-card-progress" role="status">{statusPill}</span>
      ) : null}

      {/* 失败收敛图标（Issue 3502）：常显一个小图标，悬停/读屏取完整原因。 */}
      {failureReason ? (
        <span
          className={`omnimux-inspiration-card-failure ${failed ? 'is-failed' : 'is-settled'}`}
          role="img"
          title={failureReason}
          aria-label={failureReason}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
        </span>
      ) : null}

      {/* 内嵌卡片骨架扫光层：素材未完全就绪或未揭幕时置顶展示。
          导入生成中时全屏渲染创作画布同款流体微光折射动效（Organic Shimmer）。 */}
      <div
        className={`omnimux-inspiration-card-shimmer ${(!hasMedia && !importing) || isShowCover || (broken && !usesVideoFrame && !importing) ? 'is-hidden' : ''} ${importing ? 'is-importing' : ''}`}
        aria-hidden="true"
      >
        {importing ? <OrganicShimmerOverlay /> : null}
      </div>
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

  // 媒体卡默认只有封面：标题/元信息在悬停层里（CSS 绝对定位），CTA 也走悬停层。
  const mediaNode = mediaCore ? (
    coverFirst ? <div className="omnimux-inspiration-cover-wrap">{mediaCore}</div> : mediaCore
  ) : null

  // 媒体卡：封面上的悬停层只有居中 CTA；标题/元信息由正文层叠在封面底部。
  // 帖子卡：正文常显，元信息 + CTA 一起放进悬停层。
  const overlayNode = coverFirst ? (
    <div className="omnimux-inspiration-card-overlay is-cover">
      {ctaRow}
    </div>
  ) : (
    <div className="omnimux-inspiration-card-overlay is-post">
      {metaNode}
      {ctaRow}
    </div>
  )

  return (
    <RivalPostCard
      card={contentCard}
      t={t}
      className={`omnimux-inspiration-card-pure ${importing ? 'is-importing' : ''}`}
      selected={Boolean(selected)}
      bodyClassName={inlineNotice ? (contentCard.notice_kind === 'error' ? `omnimux-inspiration-card-error is-inline ${failed ? 'is-failed' : ''}` : 'omnimux-inspiration-card-state-text') : ''}
      bodyLabel={!coverFirst && failed ? t('add.status.failed') : ''}
      bodyRole={inlineNotice ? 'status' : undefined}
      onDetail={handleClick}
      mediaNode={mediaNode}
      metaNode={coverFirst ? metaNode : null}
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
