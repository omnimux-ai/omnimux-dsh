import React, { useState } from 'react'

function CoverPlaceholder({ glyph }) {
  return (
    <div className="omx-inspiration-pick-card__placeholder">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2v1" />
        <path d="M12 7a5 5 0 1 0 5 5c0-1.5-.7-2.8-1.8-3.7L12 7z" />
      </svg>
      <span className="omx-inspiration-pick-card__glyph">{glyph}</span>
    </div>
  )
}

/**
 * @param {{
 *   item: { id: string, title?: string, name?: string, previewUrl?: string, kind?: string, is_local?: boolean },
 *   selected?: boolean,
 *   alreadyAdded?: boolean,
 *   disabled?: boolean,
 *   alreadyLabel: string,
 *   onToggle: (item: object) => void,
 * }} props
 */
export function InspirationPickerCard({
  item,
  selected = false,
  alreadyAdded = false,
  disabled = false,
  alreadyLabel,
  onToggle,
}) {
  const locked = Boolean(disabled || alreadyAdded)
  const isChecked = selected || alreadyAdded
  const title = item.title || item.name || item.id
  const glyph = String(title || '灵').trim().slice(0, 1)
  const [imageError, setImageError] = useState(false)
  const [ratioReady, setRatioReady] = useState(false)

  return (
    <article
      className="omx-inspiration-pick-card"
      tabIndex={0}
      role="checkbox"
      aria-checked={isChecked ? 'true' : 'false'}
      aria-disabled={locked ? 'true' : 'false'}
      data-selected={isChecked ? 'true' : 'false'}
      data-already={alreadyAdded ? 'true' : 'false'}
      onClick={() => {
        if (!locked) onToggle(item)
      }}
      onKeyDown={(event) => {
        if (locked) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle(item)
        }
      }}
    >
      <div
        className="omx-inspiration-pick-card__thumb"
        data-ratio={item.previewUrl && !imageError && !ratioReady ? 'pending' : 'ready'}
      >
        <span
          className="omx-inspiration-pick-card__check"
          data-selected={isChecked ? 'true' : 'false'}
          aria-hidden="true"
        >
          {isChecked ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : null}
        </span>
        {item.previewUrl && !imageError ? (
          <img
            src={item.previewUrl}
            alt=""
            className="omx-inspiration-pick-card__img"
            onLoad={() => {
              setRatioReady(true)
            }}
            onError={() => {
              setImageError(true)
            }}
          />
        ) : (
          <CoverPlaceholder glyph={glyph} />
        )}
        {alreadyAdded ? <span className="omx-inspiration-pick-card__already">{alreadyLabel}</span> : null}
      </div>
      <div className="omx-inspiration-pick-card__body">
        <div className="omx-inspiration-pick-card__title" title={title}>{title}</div>
      </div>
    </article>
  )
}

export const INSPIRATION_CARD_CSS = `
.omx-inspiration-pick-card {
  display: flex; flex-direction: column; width: 100%;
  background: transparent; border: none; padding: 0; text-align: left;
  cursor: pointer; box-sizing: border-box;
}
.omx-inspiration-pick-card__thumb {
  position: relative; width: 100%;
  background: var(--dsw-alias-bg-module-platform); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary); overflow: hidden;
  border: 1.5px solid transparent;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.omx-inspiration-pick-card__thumb[data-ratio="pending"] { aspect-ratio: 1 / 1; }
.omx-inspiration-pick-card:hover .omx-inspiration-pick-card__thumb { transform: translateY(-2px); }
.omx-inspiration-pick-card[data-selected="true"] .omx-inspiration-pick-card__thumb {
  border-color: var(--dsw-alias-button-primary-fill);
}
.omx-inspiration-pick-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
.omx-inspiration-pick-card[aria-disabled="true"]:hover .omx-inspiration-pick-card__thumb { transform: none; }
.omx-inspiration-pick-card__img { width: 100%; height: auto; display: block; }
.omx-inspiration-pick-card__placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  width: 100%; aspect-ratio: 1 / 1;
}
.omx-inspiration-pick-card__glyph { font-size: 18px; font-weight: 600; opacity: 0.6; }
.omx-inspiration-pick-card__check {
  position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; border-radius: 5px;
  display: none; align-items: center; justify-content: center; z-index: 2;
  border: 1.5px solid var(--dsw-alias-border-l4);
  background: var(--dsw-alias-bg-layer-2);
}
.omx-inspiration-pick-card:hover .omx-inspiration-pick-card__check,
.omx-inspiration-pick-card:focus-visible .omx-inspiration-pick-card__check,
.omx-inspiration-pick-card[data-selected="true"] .omx-inspiration-pick-card__check {
  display: inline-flex;
}
.omx-inspiration-pick-card__check[data-selected="true"] {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omx-inspiration-pick-card__already {
  position: absolute; right: 8px; top: 8px; z-index: 2;
  font-size: 10px; line-height: 14px; padding: 2px 6px; border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-state-warn-primary);
  border: 1px solid var(--dsw-alias-border-l2);
}
.omx-inspiration-pick-card__body {
  display: flex; flex-direction: column; gap: 2px; margin-top: 6px; padding: 0 2px; min-width: 0;
}
.omx-inspiration-pick-card__title {
  font-size: 13px; font-weight: 600; line-height: 18px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary);
}
`

const CARD_STYLE_ID = 'omx-inspiration-pick-card-styles'

export function ensureInspirationCardStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || doc.getElementById(CARD_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = CARD_STYLE_ID
  style.textContent = INSPIRATION_CARD_CSS
  doc.head?.appendChild(style)
}
