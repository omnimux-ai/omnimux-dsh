/**
 * One account row of the 账号监控 account column (#3451).
 *
 * Single-select grouped navigation: the row's main area is one navigation
 * button; warning/retry/profile/more live beside it as sibling controls, so no
 * interactive element is nested inside another button.
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from 'dsh-ui-kit'
import { isSafeExternalUrl } from './open-url.js'
import { accountHealth, browserRefreshAvailable, coolingMinutesLeft, rivalErrorKey, stoppedReasonText } from './rival-health.js'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'

const ICON_EXTERNAL = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
  </svg>
)

const ICON_MORE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
)

const ICON_RETRY = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M20 11a8 8 0 1 0-2.34 5.66" />
    <path d="M20 4v7h-7" />
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
 * @param {{
 *   row: Record<string, any>,
 *   t: (key: string) => string,
 *   selected?: boolean,
 *   onSelect: (id: string) => void,
 *   onMore?: (event: any, id: string) => void,
 *   onOpenProfile: (url: string) => void,
 *   onRetry?: (id: string) => void,
 *   onPluginRefresh?: (id: string) => void,
 *   quotaLeft?: number,
 *   refreshBusy?: boolean,
 * }} props
 */
export function AccountFilterRow({ row, t, selected = false, onSelect, onMore, onOpenProfile, onRetry, onPluginRefresh, quotaLeft, refreshBusy, menuOpen = false }) {
  const profileUrlSafe = isSafeExternalUrl(row.profileUrl)
  const health = accountHealth(row)
  const cooling = health === 'cooling' ? coolingMinutesLeft(row) : null
  const stoppedReason = health === 'stopped' ? stoppedReasonText(row) : null
  const quotaEmpty = typeof quotaLeft === 'number' && quotaLeft <= 0
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
  const warningTitle = warningText ? [warningText, quotaReason].filter(Boolean).join(' · ') : ''
  const warningId = `omnimux-rival-warning-${row.id}`
  const [tipPos, setTipPos] = useState(null)

  const handleRetry = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (refreshBusy || quotaEmpty) return
    onRetry?.(row.id)
  }
  const select = () => onSelect(row.id)

  return (
    <div
      className={`omnimux-rival-filter-row${selected ? ' is-selected' : ''}`}
      data-account-id={row.id}
      data-health={health}
      data-selected={selected ? 'true' : 'false'}
      onClick={select}
    >
      <div
        className="omnimux-rival-filter-select"
        role="button"
        tabIndex={0}
        aria-current={selected ? 'true' : undefined}
        aria-label={row.nickname || row.handle || row.id}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            select()
          }
        }}
      >
        <span className="omnimux-rival-filter-avatar" aria-hidden="true">
          {row.avatarUrl ? <img src={row.avatarUrl} alt="" loading="lazy" /> : row.initial}
        </span>
        <span className="omnimux-rival-filter-info">
          <span className="omnimux-rival-filter-name-row">
            <span className="omnimux-rival-filter-name">{row.nickname}</span>
            <span className="omnimux-rival-filter-platform" aria-hidden="true">
              <RivalPlatformMark platform={row.platform} />
            </span>
          </span>
          <span className="omnimux-rival-filter-handle">{row.handle}</span>
        </span>
      </div>
      <span className="omnimux-rival-filter-actions">
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
        >
          {ICON_EXTERNAL}
        </IconButton>
        {warningTitle ? (
          <span
            className={`omnimux-rival-filter-warning is-${health}`}
            role="img"
            tabIndex={0}
            aria-label={warningTitle}
            aria-describedby={warningId}
            title={warningTitle}
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setTipPos({ left: rect.left + rect.width / 2, top: rect.top - 6 })
            }}
            onMouseLeave={() => setTipPos(null)}
            onFocus={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setTipPos({ left: rect.left + rect.width / 2, top: rect.top - 6 })
            }}
            onBlur={() => setTipPos(null)}
          >
            {ICON_WARNING}
            <span className="omnimux-rival-warning-sr" id={warningId} role="tooltip">{warningTitle}</span>
            {tipPos && typeof document !== 'undefined'
              ? createPortal(
                <span className="omnimux-rival-warning-pop" role="presentation" style={{ '--omnimux-tip-x': `${tipPos.left}px`, '--omnimux-tip-y': `${tipPos.top}px` }}>{warningTitle}</span>,
                document.body,
              )
              : null}
          </span>
        ) : null}
        {health === 'stopped' ? (
          browserRefreshAvailable(row) ? (
            // 小红书等「云端没有采集能力」的平台：终态原因不是故障，是能力缺口，
            // 再点一次云端刷新必然同样失败。行内只给真正能采到笔记的那条通道。
            <Button
              variant="ghost"
              size="xs"
              className="omnimux-rival-retry is-browser-update"
              title={t('rivalAccounts.health.browserUpdateHint')}
              aria-label={t('rivalAccounts.health.browserUpdate')}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onPluginRefresh?.(row.id)
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <span className="omnimux-rival-retry-icon" aria-hidden="true">{ICON_RETRY}</span>
              <span className="omnimux-rival-retry-label">{t('rivalAccounts.health.browserUpdate')}</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              className={`omnimux-rival-retry${quotaEmpty ? ' is-blocked' : ''}`}
              aria-disabled={quotaEmpty || refreshBusy ? 'true' : 'false'}
              disabled={refreshBusy || quotaEmpty}
              title={quotaEmpty ? quotaReason : t('rivalAccounts.health.retry')}
              aria-label={t('rivalAccounts.health.retry')}
              onClick={handleRetry}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <span className="omnimux-rival-retry-icon" aria-hidden="true">{ICON_RETRY}</span>
              <span className="omnimux-rival-retry-label">{t('rivalAccounts.health.retry')}</span>
            </Button>
          )
        ) : null}
        <IconButton
          variant="ghost"
          size="xs"
          className="omnimux-rival-filter-more"
          aria-label={t('rivalAccounts.column.more')}
          title={t('rivalAccounts.column.more')}
          aria-haspopup="menu"
          aria-expanded={menuOpen ? 'true' : 'false'}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onMore?.(event, row.id)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
          }}
        >
          {ICON_MORE}
        </IconButton>
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
