import { useEffect, useState } from 'react'
import { Badge, Button, IconButton, MediaCard } from 'dsh-ui-kit'
import { isUsableCoverSize, pickCoverSrc } from './api.js'
import { formatPlatformName } from './feed-helpers.js'
import { importErrorText, importPillLabel, importSettledNotice, isFailedRow, isImportingRow } from './import-status.js'

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
  const [broken, setBroken] = useState(!cover)
  const [loaded, setLoaded] = useState(false)
  const isRevealed = revealed !== false

  useEffect(() => {
    setBroken(!cover)
    setLoaded(false)
  }, [cover])

  const platform = formatPlatformName(row.source_platform || (row.is_local ? 'local' : 'tiktok'), t)
  const isLocal = Boolean(row.is_local)
  const anyBusy = Boolean(replicateBusy)
  const isShowCover = !broken && loaded && isRevealed
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

      {/* 内嵌卡片骨架扫光层：素材未完全就绪或未揭幕时置顶展示 */}
      <div
        className={`omnimux-inspiration-card-shimmer ${isShowCover || broken ? 'is-hidden' : ''} ${importing ? 'is-importing' : ''}`}
        aria-hidden="true"
      />

      {/* 运行状态胶囊：导入中显示阶段文案，失败显示红调提示；完成态不渲染 */}
      {statusPill ? (
        <Badge
          size="sm"
          shape="capsule"
          variant={failed ? 'danger' : 'brand'}
          className={`omnimux-inspiration-badge-status ${importing ? 'is-importing' : ''} ${failed ? 'is-failed' : ''}`}
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

      {broken ? (
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
      className="omnimux-inspiration-card-pure"
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
