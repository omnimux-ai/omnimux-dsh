/**
 * One monitored-account row of the 账号监控 account column (#3432).
 *
 * The popover that used to wrap these rows is retired; the row itself is still
 * the single place the four health states, the profile jump and the retry
 * action are rendered. Presentational: the selection lives in
 * `use-rival-feed.js` and arrives as props, so「反选」「重置」and the checkbox are
 * the same three rules the unit tests pin down.
 */

import { useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { isSafeExternalUrl } from './open-url.js'
import { toAccountFilterRow } from './rival-filter.js'
import { accountHealth, coolingMinutesLeft, rivalErrorKey, stoppedReasonText } from './rival-health.js'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'

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

const ICON_WARNING = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 9v5" />
    <path d="M12 17.5v.5" />
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
 *   onRetry?: (id: string) => void,
 *   quotaLeft?: number,
 * }} props
 */
export function AccountFilterRow({ row, t, onToggle, onOpenProfile, onRetry, quotaLeft, refreshBusy }) {
  const handleToggle = () => onToggle(row.id)
  const profileUrlSafe = isSafeExternalUrl(row.profileUrl)
  // 四态判据的唯一来源是 rival-health.js；行内只在异常时露一个图标，
  // 具体原因放进图标自身的悬停提示，不再用常驻文字解释。
  const health = accountHealth(row)
  const cooling = health === 'cooling' ? coolingMinutesLeft(row) : null
  const stoppedReason = health === 'stopped' ? stoppedReasonText(row) : null
  const quotaEmpty = typeof quotaLeft === 'number' && quotaLeft <= 0
  const [tip, setTip] = useState(null)
  const quotaReason = quotaEmpty
    ? t('rivalAccounts.refresh.quota').replace('{n}', String(hoursToMidnight()))
    : ''
  const warningText = health === 'reimport'
    ? t('rivalAccounts.health.reimportReason')
    : health === 'stopped'
      ? [stoppedReason, t(rivalErrorKey(row.error_code))].filter(Boolean).join('。')
      : health === 'cooling'
        ? t('rivalAccounts.health.cooling').replace('{n}', String(cooling ?? 1))
        : ''
  // Quota is a pool-level fact: only rows that already carry a health warning
  // may append it, so a normal row never grows a warning icon (#3436 review).
  const warningTitle = warningText ? [warningText, quotaReason].filter(Boolean).join(' · ') : ''
  const rowLabel = warningTitle ? `${row.nickname || row.handle || row.id} · ${warningTitle}` : (row.nickname || row.handle || row.id)

  const handleRetry = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (refreshBusy || quotaEmpty) return
    onRetry?.(row.id)
  }
  return (
    <div
      className={`omnimux-rival-filter-row is-${health}`}
      role="checkbox"
      aria-checked={row.checked ? 'true' : 'false'}
      aria-label={rowLabel}
      tabIndex={0}
      data-account-id={row.id}
      data-checked={row.checked ? 'true' : 'false'}
      data-health={health}
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
          <span className="omnimux-rival-filter-platform" aria-hidden="true">
            <RivalPlatformMark platform={row.platform} />
          </span>
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
            disabled={!profileUrlSafe}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (profileUrlSafe) onOpenProfile(row.profileUrl)
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {ICON_EXTERNAL}
          </IconButton>
          <span className="omnimux-rival-filter-status">
            {warningTitle ? (
              <span
                className={`omnimux-rival-filter-warning is-${health}`}
                role="img"
                tabIndex={0}
                aria-label={warningTitle}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  const rect = event.currentTarget.getBoundingClientRect()
                  setTip({ left: rect.left, top: rect.bottom })
                }}
                onMouseEnter={(event) => setTip({ left: event.currentTarget.getBoundingClientRect().left, top: event.currentTarget.getBoundingClientRect().bottom })}
                onMouseLeave={() => setTip(null)}
                onFocus={(event) => setTip({ left: event.currentTarget.getBoundingClientRect().left, top: event.currentTarget.getBoundingClientRect().bottom })}
                onBlur={() => setTip(null)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Escape') setTip(null)
                }}
              >
                {ICON_WARNING}
              </span>
            ) : null}
              {warningTitle && tip ? (
                <span
                  className="omnimux-rival-filter-warning-tip"
                  role="tooltip"
                  style={{
                    left: `${Math.max(8, Math.min(tip.left, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 228))}px`,
                    top: `${Math.min(tip.top + 6, (typeof window !== 'undefined' ? window.innerHeight : 768) - 132)}px`,
                  }}
                >
                  {warningTitle}
                </span>
              ) : null}
            {health === 'stopped' ? (
              <Button
                variant="ghost"
                size="xs"
                className={`omnimux-rival-retry${quotaEmpty ? ' is-blocked' : ''}`}
                aria-disabled={quotaEmpty || refreshBusy ? 'true' : 'false'}
                disabled={refreshBusy || quotaEmpty}
                title={quotaEmpty ? quotaReason : t('rivalAccounts.health.retry')}
                onClick={handleRetry}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {t('rivalAccounts.health.retry')}
              </Button>
            ) : null}
          </span>
        </span>
        <span className="omnimux-rival-filter-handle">{row.handle}</span>
      </span>
    </div>
  )
}

/**
 * Hours until the daily ledger resets at local midnight — the `{n}` of
 * `refresh.quota`, kept local so the row never imports the status bar.
 * @returns {number}
 */
function hoursToMidnight() {
  const next = new Date()
  next.setHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((next.getTime() - Date.now()) / 3_600_000))
}
