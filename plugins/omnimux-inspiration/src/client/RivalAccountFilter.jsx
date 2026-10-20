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
import { formatCount } from './rival-format.js'
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
 *   locale?: 'zh' | 'en',
 * }} props
 */
export function AccountFilterRow({ row, t, onToggle, onOpenProfile, onRetry, quotaLeft, locale, refreshBusy }) {
  const handleToggle = () => onToggle(row.id)
  const profileUrlSafe = isSafeExternalUrl(row.profileUrl)
  const [retryReasonOpen, setRetryReasonOpen] = useState(false)
  // 四态判据的唯一来源是 rival-health.js——行上的标记、原因行与状态条
  // 的计数读同一套事实，永远不会出现两个实现互相打脸。
  const health = accountHealth(row)
  const cooling = health === 'cooling' ? coolingMinutesLeft(row) : null
  const stoppedReason = health === 'stopped' ? stoppedReasonText(row) : null
  const quotaEmpty = typeof quotaLeft === 'number' && quotaLeft <= 0

  const healthLabel = health === 'reimport'
    ? t('rivalAccounts.health.reimport')
    : health === 'stopped'
      ? t('rivalAccounts.health.stopped')
      : health === 'cooling'
        ? t('rivalAccounts.health.cooling').replace('{n}', String(cooling ?? 1))
        : t('rivalAccounts.health.ok')

  const handleRetry = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (refreshBusy) return
    // 额度为 0 时重试置灰但可点：D4 的额度原因在这里回答，不静默。
    if (quotaEmpty) {
      setRetryReasonOpen((previous) => !previous)
      return
    }
    onRetry?.(row.id)
  }
  return (
    <div
      className={`omnimux-rival-filter-row is-${health}`}
      role="checkbox"
      aria-checked={row.checked ? 'true' : 'false'}
      aria-label={row.nickname || row.handle || row.id}
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
          <span className={`omnimux-rival-health is-${health}`}>{healthLabel}</span>
          {health === 'stopped' ? (
            <span className="omnimux-rival-retry-wrap">
              <Button
                variant="ghost"
                size="xs"
                className={`omnimux-rival-retry${quotaEmpty ? ' is-blocked' : ''}`}
                aria-disabled={quotaEmpty || refreshBusy ? 'true' : 'false'}
                disabled={refreshBusy}
                onClick={handleRetry}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {t('rivalAccounts.health.retry')}
              </Button>
              {retryReasonOpen ? (
                <span className="omnimux-rival-reason" role="alert">
                  {t('rivalAccounts.refresh.quota').replace('{n}', String(hoursToMidnight()))}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="omnimux-rival-filter-id">
          <RivalPlatformMark platform={row.platform} />
          <span className="omnimux-rival-filter-handle">{row.handle}</span>
          <span className="omnimux-rival-filter-count">
            {t('rivalFilter.posts').replace('{n}', formatCount(row.postCount, locale))}
          </span>
        </span>
        {health === 'reimport' ? (
          <span className="omnimux-rival-filter-reason">{t('rivalAccounts.health.reimportReason')}</span>
        ) : null}
        {/* `{n}` 未由 Host 上报时原因行整行不渲染，标记仍在——无占位符。 */}
        {health === 'stopped' ? (
          <span className="omnimux-rival-filter-reason">
            {[stoppedReason, t(rivalErrorKey(row.error_code))].filter(Boolean).join('。')}
          </span>
        ) : null}
      </span>
    </div>
  )
}

/**
 * Hours until the daily ledger resets at local midnight — the `{n}` of
 * `refresh.quota`, duplicated as a one-liner so the row never imports the
 * status bar it cannot see.
 * @returns {number}
 */
function hoursToMidnight() {
  const next = new Date()
  next.setHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((next.getTime() - Date.now()) / 3_600_000))
}
