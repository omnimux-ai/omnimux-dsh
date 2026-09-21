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
 *   typeLabel: string,
 *   alreadyLabel: string,
 *   onToggle: (item: object) => void,
 * }} props
 */
export function InspirationPickerCard({
  item,
  selected = false,
  alreadyAdded = false,
  disabled = false,
  typeLabel,
  alreadyLabel,
  onToggle,
}) {
  const locked = Boolean(disabled || alreadyAdded)
  const isChecked = selected || alreadyAdded
  const title = item.title || item.name || item.id
  const glyph = String(title || '灵').trim().slice(0, 1)
  const [imageError, setImageError] = useState(false)

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
      <div className="omx-inspiration-pick-card__thumb">
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
            onError={() => {
              setImageError(true)
            }}
          />
        ) : (
          <CoverPlaceholder glyph={glyph} />
        )}
        {typeLabel ? <span className="omx-inspiration-pick-card__badge">{typeLabel}</span> : null}
        {alreadyAdded ? <span className="omx-inspiration-pick-card__already">{alreadyLabel}</span> : null}
      </div>
      <div className="omx-inspiration-pick-card__body">
        <div className="omx-inspiration-pick-card__title" title={title}>{title}</div>
      </div>
    </article>
  )
}
