/**
 * Token-level visual mirror of omnimux-assets cards. Do not import AssetGrid.
 * @param {{
 *   asset: { id: string, name?: string, type?: string, description?: string, missing_file_count?: number, files?: unknown[] },
 *   selected?: boolean,
 *   alreadyAdded?: boolean,
 *   disabled?: boolean,
 *   typeLabel: string,
 *   alreadyLabel: string,
 *   missingLabel: string,
 *   onToggle: (asset: object) => void,
 * }} props
 */
export function AssetPickerCard({
  asset,
  selected,
  alreadyAdded,
  disabled,
  typeLabel,
  alreadyLabel,
  missingLabel,
  onToggle,
}) {
  const missing = Number(asset.missing_file_count) > 0 && (!asset.files || asset.files.length === 0)
  const locked = Boolean(disabled || alreadyAdded)
  return (
    <article
      className="omx-asset-pick-card"
      tabIndex={0}
      role="checkbox"
      aria-checked={selected || alreadyAdded ? 'true' : 'false'}
      aria-disabled={locked ? 'true' : 'false'}
      data-selected={selected || alreadyAdded ? 'true' : 'false'}
      data-already={alreadyAdded ? 'true' : 'false'}
      onClick={() => { if (!locked) onToggle(asset) }}
      onKeyDown={(event) => {
        if (locked) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle(asset)
        }
      }}
    >
      <div className="omx-asset-pick-card__thumb">
        <span
          className="omx-asset-pick-card__check"
          data-selected={selected || alreadyAdded ? 'true' : 'false'}
          aria-hidden="true"
        >
          {(selected || alreadyAdded) ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
              <path d="M5 12l5 5L20 7" />
            </svg>
          ) : null}
        </span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        <span className="omx-asset-pick-card__badge">{typeLabel}</span>
        {missing ? <span className="omx-asset-pick-card__missing">{missingLabel}</span> : null}
        {alreadyAdded ? <span className="omx-asset-pick-card__already">{alreadyLabel}</span> : null}
      </div>
      <div className="omx-asset-pick-card__body">
        <div className="omx-asset-pick-card__title">{asset.name || asset.id}</div>
        <div className="omx-asset-pick-card__desc">{asset.description || '—'}</div>
      </div>
    </article>
  )
}
