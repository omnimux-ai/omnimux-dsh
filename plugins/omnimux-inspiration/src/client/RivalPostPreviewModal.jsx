/**
 * 「详情」— one monitored work, opened from a card in the 账号监控 grid.
 *
 * Its own dialog rather than the library's `InspirationPreviewModal`, which is
 * about library items: it offers collection, tags, removal and AI breakdown, all
 * of which are actions a monitored post does not have. Reusing it would present
 * a work as a library entry and offer buttons that cannot keep their promise.
 * What this one offers is what the work actually supports: look at it, open the
 * original, or start replicating it.
 */

import { Button, ModalDialog } from 'dsh-ui-kit'
import { hostMediaSrc } from './api.js'
import { formatCount, formatDuration, formatRelativeTime } from './rival-format.js'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'

const ICON_EXTERNAL = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M14 4h6v6M20 4 11 13" />
    <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
  </svg>
)

const ICON_REPLICATE = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
  </svg>
)

/**
 * @param {{
 *   row: Record<string, any>,
 *   t: (key: string) => string,
 *   busy: boolean,
 *   onClose: () => void,
 *   onReplicate: (row: Record<string, any>) => void,
 * }} props
 */
export function RivalPostPreviewModal(props) {
  const { row, t, busy, onClose, onReplicate } = props
  if (!row) return null

  const account = row.account || {}
  const cover = hostMediaSrc(row.cover_src || '')
  // The grid hands this dialog a card descriptor, whose original-post field is
  // `source_url`; `url` is what a raw feed row calls it.
  const originalUrl = String(row.source_url || row.url || '')
  const stats = row.stats || {}
  const duration = formatDuration(row.duration)
  const author = String(account.nickname || account.handle || '')
  const handle = String(account.handle || '')

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={t('rivalFeed.detail.title')}
      closeLabel={t('rivalFeed.detail.close')}
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>{t('rivalFeed.detail.close')}</Button>
          {originalUrl ? (
            <Button
              variant="outline"
              leadingIcon={ICON_EXTERNAL}
              onClick={() => {
                if (typeof window !== 'undefined' && typeof window.open === 'function') {
                  window.open(originalUrl, '_blank', 'noopener,noreferrer')
                }
              }}
            >
              {t('rivalFeed.detail.original')}
            </Button>
          ) : null}
          <Button
            variant="primary"
            leadingIcon={ICON_REPLICATE}
            loading={busy}
            disabled={busy}
            onClick={() => onReplicate(row)}
          >
            {t('rivalFeed.detail.replicate')}
          </Button>
        </>
      )}
    >
      <div className="omnimux-rival-detail">
        <div className="omnimux-rival-detail-cover">
          {cover ? <img src={cover} alt="" loading="lazy" /> : null}
          {duration ? <span className="omnimux-rival-detail-duration">{duration}</span> : null}
        </div>
        <div className="omnimux-rival-detail-body">
          <p className="omnimux-rival-detail-title">{row.title || row.url || row.id}</p>
          <div className="omnimux-rival-detail-author">
            <RivalPlatformMark platform={account.platform || row.source_platform} />
            <span>{author}</span>
            {handle ? <span className="omnimux-rival-detail-handle">{handle}</span> : null}
          </div>
          <div className="omnimux-rival-detail-stats">
            {[
              ['rivalAccounts.post.views', stats.views],
              ['rivalAccounts.post.likes', stats.likes],
              ['rivalAccounts.post.comments', stats.comments],
              ['rivalAccounts.post.shares', stats.shares],
            ].map(([labelKey, value]) => (
              <span key={labelKey} className="omnimux-rival-detail-stat">
                <span className="omnimux-rival-detail-stat-label">{t(labelKey)}</span>
                <span className="omnimux-rival-detail-stat-value">{formatCount(value)}</span>
              </span>
            ))}
          </div>
          {row.posted_at ? (
            <p className="omnimux-rival-detail-time">
              {t('rivalFeed.detail.postedAt')}
              {`：${formatRelativeTime(row.posted_at)}`}
            </p>
          ) : null}
        </div>
      </div>
    </ModalDialog>
  )
}
