import { useEffect, useRef, useState } from 'react'
import { Badge, Button, IconButton, MediaCard } from 'dsh-ui-kit'
import { isUsableCoverSize, pickCoverSrc, pickVideoSrc } from './api.js'
import { formatPlatformName } from './feed-helpers.js'
import { importErrorText, importPillLabel, importSettledNotice, isFailedRow, isImportingRow } from './import-status.js'
import { OrganicShimmerOverlay } from './OrganicShimmer.jsx'

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

export function InspirationCoverCard({ card }) {
  const { row, t, onSelect, onReplicate, selected, onToggleSelect, selecting, replicateBusy, revealed } = card
  const title = String(row.title || row.source_url || row.id)
  const cover = pickCoverSrc(row)
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

  const coverNode = (
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

      {/* 右上角平台/本地角标 */}
      <Badge
        size="sm"
        shape="capsule"
        variant={isLocal ? 'brand' : 'neutral'}
        className={`omnimux-inspiration-badge-platform ${isLocal ? 'local' : ''}`}
      >
        {isLocal ? '本地' : platform}
      </Badge>

      {/* 内嵌卡片骨架扫光层：素材未完全就绪或未揭幕时置顶展示。
          导入生成中时全屏渲染创作画布同款流体微光折射动效（Organic Shimmer）。 */}
      <div
        className={`omnimux-inspiration-card-shimmer ${isShowCover || (broken && !usesVideoFrame && !importing) ? 'is-hidden' : ''} ${importing ? 'is-importing' : ''}`}
        aria-hidden="true"
      >
        {importing ? <OrganicShimmerOverlay /> : null}
      </div>

      {/* 运行状态胶囊：仅在导入失败时显示红调提示；导入生成中已通过全屏流体微光呈现，中间移除文本按钮 */}
      {failed && statusPill ? (
        <Badge
          size="sm"
          shape="capsule"
          variant="danger"
          className="omnimux-inspiration-badge-status is-failed"
          role="status"
        >
          {statusPill}
        </Badge>
      ) : null}

      {/* 失败原因：卡片本身要能说清「为什么」，否则用户只看到一个无法处置的结果 */}
      {errorDetail ? (
        <div
          className={`omnimux-inspiration-card-error ${failed ? 'is-failed' : ''}`}
          role="status"
        >
          {errorDetail}
        </div>
      ) : null}

      {importing ? null : usesVideoFrame ? (
        <video
          className={`omnimux-inspiration-cover-video ${isShowCover ? 'is-loaded' : ''}`}
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
        <div className="omnimux-inspiration-cover-fallback" aria-hidden="true">
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
          className={`omnimux-inspiration-cover-img ${isShowCover ? 'is-loaded' : ''}`}
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
      )}
      <div className="omnimux-inspiration-card-overlay">
        <div className="omnimux-inspiration-overlay-play">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
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
            {t('card.cta.detail')}
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
            {t('card.cta.try')}
          </Button>
        </div>
        <div className="omnimux-inspiration-overlay-footer">
          {title.length > 32 ? `${title.slice(0, 32)}…` : title}
        </div>
      </div>
    </>
  )

  return (
    <MediaCard
      className={`omnimux-inspiration-card-pure ${importing ? 'is-importing' : ''}`}
      aspectRatio="9:16"
      selected={selected}
      onClick={handleClick}
      coverNode={coverNode}
      title={title}
      // Identity of the row on the card element: the import reveal has to find
      // the card it just landed, and the grid order may not survive a reload.
      data-inspiration-id={String(row.id)}
    />
  )
}
