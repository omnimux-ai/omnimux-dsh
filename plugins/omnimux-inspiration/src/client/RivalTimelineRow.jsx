/**
 * One post in the account-monitor timeline (#3432).
 *
 * The row mirrors the source platform's own post card instead of the retired
 * 9:16 work card: avatar, author, handle, platform mark, publish time, body,
 * media cover, engagement counters and the monitor's actions (original /
 * detail / replicate / AI breakdown / mark done). The actions sit in a hover
 * row so the default state stays a readable timeline.
 */

import { useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'
import {
  formatCount,
  formatDuration,
  formatEngagementCount,
  formatRelativeTime,
  rivalLocaleOf,
} from './rival-format.js'
import { isSafeExternalUrl, openExternalUrl } from './open-url.js'
import { timelineBody, timelineInitial } from './rival-timeline.js'

/**
 * @param {{
 *   card: Record<string, any>,
 *   t: (key: string) => string,
 *   onDetail?: (card: Record<string, any>) => void,
 *   onReplicate?: (card: Record<string, any>) => void,
 *   onDeconstruct?: (card: Record<string, any>) => void,
 *   onMarkDone?: (card: Record<string, any>) => void,
 *   busy?: boolean,
 * }} props
 */
export function RivalTimelineRow(props) {
  const { card, t, onDetail, onReplicate, onDeconstruct, onMarkDone, busy } = props
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(false)
  const locale = rivalLocaleOf(t)
  const account = card?.account || {}
  const authorName = String(account.nickname || card?.author_name || account.handle || t('rivalAccounts.refresh.account'))
  const handle = String(account.handle || card?.author_handle || '')
  const platform = String(account.platform || card?.source_platform || '')
  const posted = formatRelativeTime(card?.posted_at, Date.now(), locale)
  const body = timelineBody(card)
  const cover = String(card?.cover_key || card?.cover_src || '')
  const isVideo = String(card?.type || '') === 'video' || String(card?.media_kind || '') === 'video'
  const duration = formatDuration(card?.duration)
  const stats = card?.stats || {}
  const views = typeof stats.views === 'number' && Number.isFinite(stats.views) && stats.views >= 0 ? stats.views : null
  const metricsKey = card?.metrics_template === 'read' ? 'rivalFeed.metrics.reads' : 'rivalFeed.metrics.views'
  const metrics = String(t(metricsKey) || '')
    .replace('{views}', formatCount(views, locale))
    .replace('{likes}', formatEngagementCount(stats.likes, locale))
    .replace('{comments}', formatEngagementCount(stats.comments, locale))
    .replace('{shares}', formatEngagementCount(stats.shares, locale))
  const originalSafe = isSafeExternalUrl(card?.source_url)
  const done = Boolean(card?.done || card?.done_at || card?.in_library || card?.interacted_at || card?.state || card?.state_label)
  const stateLabel = String(card?.state_label || '')
  const showAvatar = Boolean(account.avatar_url || card?.avatar_url) && !avatarFailed

  const stop = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const openDetail = () => {
    if (typeof onDetail === 'function') onDetail(card)
  }

  return (
    <article
      className={`omnimux-rival-timeline-item is-${platform || 'unknown'}${done ? ' is-done' : ''}`}
      data-card-id={String(card?.id ?? '')}
      data-platform={platform}
      tabIndex={0}
      role="article"
      aria-label={`${authorName} · ${posted}`}
      onClick={openDetail}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault()
          openDetail()
        }
      }}
    >
      <div className="omnimux-rival-timeline-avatar" aria-hidden="true">
        {showAvatar
          ? <img src={account.avatar_url || card.avatar_url} alt="" loading="lazy" onError={() => setAvatarFailed(true)} />
          : <span>{timelineInitial(card)}</span>}
      </div>

      <div className="omnimux-rival-timeline-main">
        <header className="omnimux-rival-timeline-head">
          <span className="omnimux-rival-timeline-author">{authorName}</span>
          <span className="omnimux-rival-timeline-platform" aria-hidden="true">
            <RivalPlatformMark platform={platform} />
          </span>
          {handle ? <span className="omnimux-rival-timeline-handle">{handle}</span> : null}
          <span className="omnimux-rival-timeline-time">· {posted}</span>
          {done ? <span className="omnimux-rival-timeline-state">{stateLabel || t('rivalFeed.card.done')}</span> : null}
        </header>

        {body ? <p className="omnimux-rival-timeline-body">{body}</p> : null}

        {cover && !mediaFailed ? (
          <div className={`omnimux-rival-timeline-media${isVideo ? ' is-video' : ''}`}>
            <img
              src={cover}
              alt=""
              loading="lazy"
              onError={() => setMediaFailed(true)}
            />
            {isVideo ? <span className="omnimux-rival-timeline-play" aria-hidden="true" /> : null}
            {isVideo && duration ? <span className="omnimux-rival-timeline-duration">{duration}</span> : null}
          </div>
        ) : null}

        <footer className="omnimux-rival-timeline-foot">
          <span className="omnimux-rival-timeline-metrics">{metrics}</span>
          <div className="omnimux-rival-timeline-actions">
            <span className="omnimux-rival-act-slot" onClick={stop}>
              <Button
                variant="ghost"
                size="xs"
                className="omnimux-rival-timeline-act"
                data-act="original"
                disabled={!originalSafe}
                title={originalSafe ? undefined : t('rivalFeed.card.originalUnavailable')}
                onClick={(event) => { stop(event); openExternalUrl(card?.source_url) }}
              >
                {t('rivalFeed.card.original')}
              </Button>
            </span>
            {typeof onReplicate === 'function' ? (
              <Button
                variant="ghost"
                size="xs"
                className="omnimux-rival-timeline-act"
                data-act="replicate"
                disabled={busy === true}
                onClick={(event) => { stop(event); if (!busy) onReplicate(card) }}
              >
                {t('rivalFeed.card.replicate')}
              </Button>
            ) : null}
            {typeof onDeconstruct === 'function' ? (
              <Button
                variant="ghost"
                size="xs"
                className="omnimux-rival-timeline-act"
                data-act="deconstruct"
                onClick={(event) => { stop(event); onDeconstruct(card) }}
              >
                {t('rivalFeed.card.deconstruct')}
              </Button>
            ) : null}
            {!done && typeof onMarkDone === 'function' ? (
              <Button
                variant="ghost"
                size="xs"
                className="omnimux-rival-timeline-act"
                data-act="markDone"
                onClick={(event) => { stop(event); onMarkDone(card) }}
              >
                {t('rivalFeed.card.markDone')}
              </Button>
            ) : null}
          </div>
        </footer>
      </div>
    </article>
  )
}
