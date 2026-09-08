import { useEffect, useState } from 'react'
import { IconButton } from 'dsh-ui-kit'
import { isUsableCoverSize, pickCoverSrc } from './api.js'

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
  const { row, t, onSelect, onReplicate, selected, onToggleSelect, selecting, replicateBusy } = card
  const title = String(row.title || row.source_url || row.id)
  const cover = pickCoverSrc(row)
  const [broken, setBroken] = useState(!cover)
  useEffect(() => { setBroken(!cover) }, [cover])

  const platform = (row.source_platform || (row.is_local ? 'local' : 'tiktok')).toUpperCase()
  const isLocal = Boolean(row.is_local)
  const anyBusy = Boolean(replicateBusy)

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

  return (
    <article
      className="omnimux-inspiration-card-pure"
      aria-selected={selected ? 'true' : 'false'}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (selecting && isLocal && onToggleSelect) onToggleSelect(row)
          else onSelect(row)
        }
      }}
    >
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
      <span className={`omnimux-inspiration-badge-platform ${isLocal ? 'local' : ''}`}>
        {isLocal ? '本地' : platform}
      </span>

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
          className="omnimux-inspiration-cover-img"
          src={cover}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          onLoad={(event) => {
            const node = event.currentTarget
            if (!isUsableCoverSize(node.naturalWidth, node.naturalHeight)) setBroken(true)
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
          <button /* exempt-ui01: 视频卡片蒙层操作按钮 */
            type="button"
            className="omnimux-inspiration-overlay-cta-btn secondary"
            aria-label={t('card.cta.detail')}
            onClick={handleDetail}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              isolateInnerCardKey(e)
              if (e.key === 'Enter' || e.key === ' ') handleDetail(e)
            }}
          >
            {ICON_EYE}
            {t('card.cta.detail')}
          </button>
          <button /* exempt-ui01: 视频卡片蒙层操作按钮 */
            type="button"
            className="omnimux-inspiration-overlay-cta-btn primary"
            aria-label={t('card.cta.tryFull')}
            aria-disabled={anyBusy ? 'true' : 'false'}
            disabled={anyBusy}
            onClick={handleReplicate}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              isolateInnerCardKey(e)
              if (e.key === 'Enter' || e.key === ' ') handleReplicate(e)
            }}
          >
            {ICON_REPLICATE}
            {t('card.cta.try')}
          </button>
        </div>
        <div className="omnimux-inspiration-overlay-footer">
          {title.length > 32 ? `${title.slice(0, 32)}…` : title}
        </div>
      </div>
    </article>
  )
}
