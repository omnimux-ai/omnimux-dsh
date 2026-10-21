/**
 * One post in the account-monitor timeline (#3432).
 *
 * The row mirrors the source platform's own post card instead of the retired
 * 9:16 work card: avatar, author, handle, platform mark, publish time, body,
 * media cover, engagement counters and the monitor's actions (original /
 * detail / replicate / AI breakdown / mark done). The actions sit in a hover
 * row so the default state stays a readable timeline.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, IconButton } from 'dsh-ui-kit'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'
import {
  formatCount,
  formatDuration,
  formatEngagementCount,
  formatRelativeTime,
  rivalLocaleOf,
} from './rival-format.js'
import { isSafeExternalUrl, openExternalUrl } from './open-url.js'
import { rivalEmbedTarget } from './rival-embed.js'
import { RivalTimelineEmbed, embedTheme, embedWidgetLang } from './rival-timeline-embed.jsx'
import { timelineBody, timelineInitial, timelineStateText } from './rival-timeline.js'

const ICON_PLAY = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7L8 5Z" />
  </svg>
)

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
  const [videoFailed, setVideoFailed] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [embedVisible, setEmbedVisible] = useState(false)
  const [embedState, setEmbedState] = useState('idle')
  const rowRef = useRef(null)
  const embedTarget = rivalEmbedTarget(card)
  const locale = rivalLocaleOf(t)
  const account = card?.account || {}
  const authorName = String(account.nickname || card?.author_name || account.handle || t('rivalAccounts.refresh.account'))
  const handle = String(account.handle || card?.author_handle || '')
  const platform = String(account.platform || card?.source_platform || '')
  const posted = formatRelativeTime(card?.posted_at, Date.now(), locale)
  const body = timelineBody(card)
  const cover = String(card?.cover_key || card?.cover_src || '')
  const isVideo = String(card?.type || '') === 'video' || String(card?.media_kind || '') === 'video'
  const videoSrc = String(card?.video_src || '')
  const coverIsHeic = /\.heic(?:$|[?#])/i.test(cover)
  const useVideoPreview = isVideo && Boolean(videoSrc) && !videoFailed && (coverIsHeic || !cover || mediaFailed)
  const showImage = Boolean(cover) && !coverIsHeic && !mediaFailed && !useVideoPreview
  const showPlaceholder = !useVideoPreview && !showImage && (Boolean(cover) || isVideo)
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
  const stateLabel = timelineStateText(card, t)
  const showAvatar = Boolean(account.avatar_url || card?.avatar_url) && !avatarFailed

  useEffect(() => {
    setVideoFailed(false)
    setVideoLoaded(false)
    setMediaFailed(false)
  }, [cover, videoSrc])

  useEffect(() => {
    if (!useVideoPreview || videoLoaded) return undefined
    const timer = setTimeout(() => setVideoFailed(true), 5000)
    return () => clearTimeout(timer)
  }, [useVideoPreview, videoLoaded, videoSrc])

  // Lazy official embed (#3542): only a row within 600px of the viewport may
  // create a third-party iframe. `IntersectionObserver` is always available in
  // the app (Chromium); without it (jsdom/legacy) the row keeps its own card
  // and never touches the network.
  useEffect(() => {
    if (!embedTarget) return undefined
    const node = rowRef.current
    if (!node || typeof IntersectionObserver !== 'function') return undefined
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      setEmbedVisible(true)
    }, { rootMargin: '600px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
    // Primitive identity: the target object is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedTarget?.platform, embedTarget?.id, embedTarget?.kind])

  const cardEmbedReady = embedTarget?.kind === 'card' && embedState === 'ready'
  const playerEmbedReady = embedTarget?.kind === 'player' && embedState === 'ready'
  const mountEmbed = Boolean(embedTarget) && embedVisible && embedState !== 'failed'
  const embedNode = mountEmbed
    ? (
      <RivalTimelineEmbed
        target={embedTarget}
        card={card}
        theme={embedTheme()}
        lang={embedWidgetLang(locale)}
        title={`${authorName} · ${t(`platform.${platform === 'twitter' ? 'x' : platform}`)}`}
        onState={setEmbedState}
      />
    )
    : null
  const hasMediaBlock = useVideoPreview || showImage || showPlaceholder || (embedTarget?.kind === 'player' && mountEmbed)

  const stop = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const openDetail = (event) => {
    // A click that lands on the official embed belongs to the platform player,
    // not to「作品详情」: the iframe swallows real clicks, and this guard also
    // covers clicks synthesized on the iframe element itself (#3542).
    if (event?.target?.closest?.('.omnimux-rival-timeline-embed')) return
    if (typeof onDetail === 'function') onDetail(card)
  }

  return (
    <article
      ref={rowRef}
      className={`omnimux-rival-timeline-item is-${platform || 'unknown'}${done ? ' is-done' : ''}${cardEmbedReady ? ' is-embed-card' : ''}${playerEmbedReady ? ' is-embed-player' : ''}`}
      data-card-id={String(card?.id ?? '')}
      data-platform={platform}
      data-embed-platform={embedTarget?.platform || ''}
      data-embed-kind={embedTarget?.kind || ''}
      data-embed-mounted={mountEmbed ? 'true' : 'false'}
      tabIndex={0}
      role="article"
      aria-label={`${authorName} · ${posted}`}
      onClick={openDetail}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
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
        {embedTarget?.kind === 'card' ? embedNode : null}

        <header className="omnimux-rival-timeline-head">
          <span className="omnimux-rival-timeline-author">{authorName}</span>
          <span className="omnimux-rival-timeline-platform" aria-hidden="true">
            <RivalPlatformMark platform={platform} />
          </span>
          {handle ? <span className="omnimux-rival-timeline-handle">{handle}</span> : null}
          <span className="omnimux-rival-timeline-time">· {posted}</span>
          {stateLabel ? <span className="omnimux-rival-timeline-state">{stateLabel}</span> : null}
        </header>

        {body ? <p className="omnimux-rival-timeline-body">{body}</p> : null}

        {hasMediaBlock ? (
          <div className={`omnimux-rival-timeline-media${isVideo ? ' is-video' : ''}${showPlaceholder ? ' is-placeholder' : ''}`}>
            {useVideoPreview ? (
              <video
                className="omnimux-rival-timeline-video"
                src={(() => {
                  try {
                    const url = new URL(videoSrc)
                    url.hash = 't=0.1'
                    return url.href
                  } catch {
                    return `${videoSrc}#t=0.1`
                  }
                })()}
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
                onError={() => setVideoFailed(true)}
                onLoadedData={() => setVideoLoaded(true)}
              />
            ) : null}
            {showImage ? (
              <img
                src={cover}
                alt=""
                loading="lazy"
                onError={() => setMediaFailed(true)}
              />
            ) : null}
            {showPlaceholder ? (
              <span className="omnimux-rival-timeline-placeholder">
                <RivalPlatformMark platform={platform} />
                <span>{t(isVideo ? 'rivalFeed.card.videoFallback' : 'rivalFeed.card.mediaFallback')}</span>
              </span>
            ) : null}
            {isVideo ? (
              <IconButton
                variant="ghost"
                size="xs"
                className="omnimux-rival-timeline-play"
                aria-label={t('rivalFeed.card.play')}
                title={t('rivalFeed.card.play')}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openDetail()
                }}
              >
                {ICON_PLAY}
              </IconButton>
            ) : null}
            {isVideo && duration ? <span className="omnimux-rival-timeline-duration">{duration}</span> : null}
            {embedTarget?.kind === 'player' ? embedNode : null}
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
