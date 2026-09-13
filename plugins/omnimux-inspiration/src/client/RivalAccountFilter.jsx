/**
 * 「账号筛选（多选）」— the 32px trigger and its frosted multi-select panel.
 *
 * The panel is the *only* account control of the 账号监控 tab: the two-column
 * workbench it replaced is gone, so monitoring an account now means choosing it
 * from this list, and the grid below follows the selection immediately.
 *
 * Presentational: the selection lives in `use-rival-feed.js` and arrives as
 * props, so「反选」「重置」and the per-row checkbox are the same three rules the
 * unit tests pin down.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { formatCount } from './rival-format.js'
import { rivalSelectionSummary, toAccountFilterRow } from './rival-filter.js'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'

const ICON_ACCOUNTS = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const ICON_CARET = (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ICON_CHECK = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const ICON_EXTERNAL = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
  </svg>
)

/**
 * A row is a `div[role="checkbox"]`, not a button: it carries two independent
 * actions (check it, or jump to the creator's profile), and a button inside a
 * button is invalid markup. The keyboard contract is the checkbox one —
 * Enter and Space toggle, which is what a screen reader announces.
 * @param {{
 *   row: ReturnType<typeof toAccountFilterRow>,
 *   t: (key: string) => string,
 *   onToggle: (id: string) => void,
 *   onOpenProfile: (url: string) => void,
 * }} props
 */
function AccountFilterRow({ row, t, onToggle, onOpenProfile }) {
  const handleToggle = () => onToggle(row.id)
  return (
    <div
      className="omnimux-rival-filter-row"
      role="checkbox"
      aria-checked={row.checked ? 'true' : 'false'}
      aria-label={row.nickname || row.handle || row.id}
      tabIndex={0}
      data-account-id={row.id}
      data-checked={row.checked ? 'true' : 'false'}
      onClick={handleToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleToggle()
        }
      }}
    >
      <span className="omnimux-rival-filter-check" aria-hidden="true">
        {row.checked ? ICON_CHECK : null}
      </span>
      <span className="omnimux-rival-filter-avatar" aria-hidden="true">
        {row.avatarUrl ? <img src={row.avatarUrl} alt="" loading="lazy" /> : row.initial}
      </span>
      <span className="omnimux-rival-filter-info">
        <span className="omnimux-rival-filter-name-row">
          <span className="omnimux-rival-filter-name">{row.nickname}</span>
          {/*
            The jump button stops the event at all four entry points — click,
            mousedown, pointerdown and keydown. Selecting an account and opening
            its profile are different intentions, and a bubbling mousedown is
            what silently turns "open the profile" into "also uncheck it".
          */}
          <IconButton
            variant="ghost"
            size="xs"
            className="omnimux-rival-filter-jump"
            aria-label={t('rivalFilter.openProfile')}
            title={t('rivalFilter.openProfile')}
            disabled={!row.profileUrl}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (row.profileUrl) onOpenProfile(row.profileUrl)
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {ICON_EXTERNAL}
          </IconButton>
        </span>
        <span className="omnimux-rival-filter-id">
          <RivalPlatformMark platform={row.platform} />
          <span className="omnimux-rival-filter-handle">{row.handle}</span>
        </span>
      </span>
      <span className="omnimux-rival-filter-count">
        {t('rivalFilter.posts').replace('{n}', formatCount(row.postCount))}
      </span>
    </div>
  )
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   accounts: Array<Record<string, any>>,
 *   selection: { mode: 'all' | 'subset', ids: string[] | Set<string> },
 *   onToggle: (id: string) => void,
 *   onInvert: () => void,
 *   onReset: () => void,
 * }} props
 */
export function RivalAccountFilter(props) {
  const { t, accounts, selection, onToggle, onInvert, onReset } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const close = useCallback(() => setOpen(false), [])

  // Escape and an outside click both close the panel. Listening on the document
  // rather than on the panel is what makes the outside click work at all — the
  // click that closes it never reaches a node inside it.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }
    const onPointerDown = (event) => {
      const root = rootRef.current
      if (root && event.target instanceof root.ownerDocument.defaultView.Node
        && root.contains(event.target)) return
      close()
    }
    const doc = rootRef.current?.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
    if (!doc) return undefined
    doc.addEventListener('keydown', onKeyDown)
    doc.addEventListener('mousedown', onPointerDown)
    return () => {
      doc.removeEventListener('keydown', onKeyDown)
      doc.removeEventListener('mousedown', onPointerDown)
    }
  }, [close, open])

  const rows = (Array.isArray(accounts) ? accounts : []).map((account) => toAccountFilterRow(account, selection))
  const summary = rivalSelectionSummary(selection, rows.length, t)

  return (
    <div className="omnimux-rival-filter" ref={rootRef}>
      <Button
        variant="outline"
        className={`omnimux-rival-filter-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={`${t('rivalFilter.trigger')}：${summary}`}
        leadingIcon={ICON_ACCOUNTS}
        trailingIcon={ICON_CARET}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="omnimux-rival-filter-trigger-label">{summary}</span>
      </Button>
      {open ? (
        <div className="omnimux-rival-filter-panel" role="dialog" aria-label={t('rivalFilter.title')}>
          <div className="omnimux-rival-filter-head">
            <span className="omnimux-rival-filter-title">{t('rivalFilter.title')}</span>
            <span className="omnimux-rival-filter-actions">
              <Button variant="ghost" size="xs" onClick={onInvert}>{t('rivalFilter.invert')}</Button>
              <Button variant="ghost" size="xs" onClick={onReset}>{t('rivalFilter.reset')}</Button>
            </span>
          </div>
          <div className="omnimux-rival-filter-list">
            {rows.map((row) => (
              <AccountFilterRow
                key={row.id}
                row={row}
                t={t}
                onToggle={onToggle}
                onOpenProfile={(url) => {
                  if (typeof window !== 'undefined' && typeof window.open === 'function') {
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
