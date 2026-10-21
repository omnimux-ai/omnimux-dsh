/** Shared content card for account monitoring and the inspiration library. */

import { useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'
import { COLLECTION_MEMBER_LAYOUT, FEED_LAYOUT, rivalHasPill, rivalMediaRatioOf, rivalCardTypeOf } from './rival-masonry.js'
import {
  formatCount,
  formatEngagementCount,
  formatRelativeTime,
  rivalLocaleOf,
  rivalVelocityText,
} from './rival-format.js'
import { isSafeExternalUrl, openExternalUrl } from './open-url.js'

const TREND_SVG = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 7l-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </svg>
)

/** spec §9.1 截断行数：短视频 1、长视频 2、图文 1、纯文本 8、带媒体推文 3。 */
const TITLE_CLAMP = {
  'short-video': 1,
  'long-video': 2,
  'image': 1,
  'text': 8,
  'text-media': 3,
}

const MATCH_KEY = {
  high: 'rivalFeed.card.matchHigh',
  fair: 'rivalFeed.card.matchFair',
  '高契合': 'rivalFeed.card.matchHigh',
  '可参考': 'rivalFeed.card.matchFair',
}

function stop(e) {
  e.preventDefault()
  e.stopPropagation()
}

function VelocityPill({ velocity, surface, t }) {
  // §3.3：文案经字典派生（Host 只下发 tier/vph/multiplier 事实），
  // 旧形态直传 `text` 的字样仍原样显示。
  const text = rivalVelocityText(velocity, t)
  if (!text) return null
  const tier = String(velocity.tier || 'watch')
  const trend = tier === 'hot' || tier === 'rising'
  return (
    <span className={`omnimux-rival-vpill ${surface} ${tier}`}>
      {trend ? TREND_SVG : null}
      <span>{text}</span>
    </span>
  )
}

function metricsText(card, t) {
  const stats = card?.stats || {}
  const locale = rivalLocaleOf(t)
  const key = card?.metrics_template === 'read' ? 'rivalFeed.metrics.reads' : 'rivalFeed.metrics.views'
  // `-1` is the Host's sort sentinel for "view count unknown" (#3428): it must
  // never leak into the card as a negative number. `formatCount(null)` renders
  // the module's `--` unknown marker instead.
  const views = typeof stats.views === 'number' && Number.isFinite(stats.views) && stats.views >= 0
    ? stats.views
    : null
  return String(t(key) || '')
    .replace('{views}', formatCount(views, locale))
    .replace('{likes}', formatEngagementCount(stats.likes, locale))
    .replace('{comments}', formatEngagementCount(stats.comments, locale))
    .replace('{shares}', formatEngagementCount(stats.shares, locale))
}

function matchKeyOf(card) {
  const match = card?.match
  if (!match) return null
  const label = typeof match === 'string' ? match : (match.label || match.tier || '')
  return MATCH_KEY[label] || null
}

/** §9.2 第四种操作位的状态文字：字典值 + `interacted_at` 的本地 HH:mm。 */
function stateText(card, t) {
  const label = String(card?.state_label || '')
  if (label) return label
  if (card?.done_at) return String(t('rivalFeed.card.done'))
  const state = String(card?.state || '')
  if (state === 'done') return String(t('rivalFeed.card.done'))
  if (state === 'replicated' || card?.in_library) return String(t('rivalFeed.card.replicated'))
  if (state === 'interacted' || card?.interacted_at) {
    const at = Date.parse(String(card?.interacted_at || ''))
    const template = String(t('rivalFeed.card.interacted'))
    if (!Number.isFinite(at)) return template.replace(/\s*·\s*\{time\}/, '')
    const date = new Date(at)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return template.replace('{time}', `${hh}:${mm}`)
  }
  return ''
}

/**
 * @param {{
 *   card: Record<string, any>,
 *   t: (key: string) => string,
 *   onDetail?: (card: Record<string, any>) => void,
 *   onReplicate?: (card: Record<string, any>) => void,
 *   onDeconstruct?: (card: Record<string, any>) => void,
 *   onMarkDone?: (card: Record<string, any>) => void,
 *   style?: Record<string, any>,
 *   column?: number,
 *   busy?: boolean,
 *   mediaNode?: import('react').ReactNode,
 *   overlayNode?: import('react').ReactNode,
 *   metaNode?: import('react').ReactNode,
 *   children?: import('react').ReactNode,
 *   className?: string,
 *   selected?: boolean,
 *   inspirationId?: string,
 *   collectionId?: string,
 *   bodyClassName?: string,
 *   bodyRole?: 'status',
 * }} props
 */
export function RivalPostCard(props) {
  const {
    card, t, onDetail, onReplicate, onDeconstruct, onMarkDone, style, column, busy,
    mediaNode: customMedia, overlayNode, metaNode, children, className = '', selected, inspirationId, collectionId,
    bodyClassName = '', bodyRole, bodyLabel,
  } = props
  const cardType = rivalCardTypeOf(card)
  const onMedia = cardType === 'short-video' || cardType === 'long-video' || cardType === 'image' || cardType === 'collection'
  // 库卡片（根层信息流 / 合集成员）共用一套卡壳（Issue 3477）：封面优先、
  // 标题两行、元信息行。判据必须与估算层（rivalCardHeightPx）逐字一致——
  // 两边都用 type !== 'text'：X/Twitter 的成员行会落到 text-media，它同样有
  // 媒体，也必须走封面优先正文，否则卡片有几何、没有正文与状态胶囊。
  const libraryLayout = card?.layout === FEED_LAYOUT || card?.layout === COLLECTION_MEMBER_LAYOUT
  const coverFirst = libraryLayout && cardType !== 'text'
  // 无媒体的帖子卡：正文（最多 3 行）+ 同一元信息行，没有封面。
  const postLayout = libraryLayout && cardType === 'text'
  const interactive = cardType !== 'collection' || typeof onDetail === 'function'
  const isDone = Boolean(card?.done || card?.done_at || card?.in_library || card?.interacted_at || card?.state || card?.state_label)
  const tier = String(card?.velocity?.tier || 'watch')
  const title = String(card?.title || '')
  const mediaRatio = rivalMediaRatioOf(card)
  const clamp = postLayout ? 3 : (TITLE_CLAMP[cardType] || 2)
  const cover = String(card?.cover_key || '')
  const account = card?.account || {}
  const locale = rivalLocaleOf(t)
  const posted = formatRelativeTime(card?.posted_at, Date.now(), locale)
  const matchKey = matchKeyOf(card)
  const stateLabel = stateText(card, t)

  const openDetail = () => {
    if (typeof onDetail === 'function') onDetail(card)
  }
  // Only absolute http(s) may leave this app — a stored `javascript:`/`data:`
  // URL on a card must never reach window.open.
  const originalUrlSafe = isSafeExternalUrl(card?.source_url)
  const openOriginal = (e) => {
    stop(e)
    openExternalUrl(card?.source_url)
  }

  // 滤镜与淡出只作用在媒体元素本身（§9.2）：胶囊是与媒体同级的独立图层，
  // 绝不能被一个容器级 filter 顺带褪色。
  //
  // A media card without a cover must not render an empty `<img>` (#3428): an
  // `<img>` with no `src` reserves the 9:16 box but paints nothing, which reads
  // as a black card. A cover URL can also 404 or outlive its CDN signature, so
  // the same placeholder takes over after a load error; the failure is keyed by
  // the address, which lets a refreshed cover retry instead of staying failed.
  const [failedCover, setFailedCover] = useState('')
  const showPlaceholder = !cover || failedCover === cover
  const mediaNode = customMedia !== undefined ? customMedia : (
    showPlaceholder ? (
      <div
        className="omnimux-rival-card-media omnimux-rival-media-empty"
        style={{ '--rival-media-ratio': mediaRatio }}
        role="img"
        aria-label={String(t('noCover') || '')}
        data-media="empty"
      >
        <RivalPlatformMark platform={String(account.platform || card?.source_platform || '')} />
        <span>{t('noCover')}</span>
      </div>
    ) : (
      <img
        className="omnimux-rival-card-media"
        src={cover}
        alt={title}
        style={{ '--rival-media-ratio': mediaRatio }}
        onError={() => setFailedCover(cover)}
      />
    )
  )

  const fourth = isDone
    ? <span className="omnimux-rival-act-state">{stateLabel || String(t('rivalFeed.card.done'))}</span>
    : (typeof onMarkDone === 'function'
      ? (
        <Button
          variant="outline"
          size="sm"
          className="omnimux-rival-act-btn"
          data-act="markDone"
          onClick={(e) => { stop(e); onMarkDone(card) }}
        >
          {t('rivalFeed.card.markDone')}
        </Button>
      )
      : null)

  return (
    <article
      className={`omnimux-rival-card t-${cardType} tier-${tier}${isDone ? ' is-done' : ''}${libraryLayout ? ' is-library' : ''}${card?.layout === COLLECTION_MEMBER_LAYOUT ? ' is-media-first' : ''} ${className}`.trim()}
      data-card-id={String(card?.id ?? '')}
      data-inspiration-id={inspirationId}
      data-collection-id={collectionId}
      aria-selected={selected}
      data-card-type={cardType}
      data-col={column}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      style={style}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDetail()
        }
      }}
    >
      {coverFirst ? (
        <>
          {mediaNode}
          <div className="omnimux-rival-card-body">
            <div className="omnimux-rival-card-title clamp-2" title={title}>{title}</div>
            {metaNode || null}
          </div>
        </>
      ) : postLayout ? (
        <div className="omnimux-rival-card-body is-post">
          <div className={`omnimux-rival-card-text clamp-3 ${bodyClassName}`.trim()} role={bodyRole}>{bodyLabel || title}</div>
          {metaNode || null}
        </div>
      ) : onMedia ? (
        <>
          {mediaNode}
          <VelocityPill velocity={card?.velocity} surface="on-media" t={t} />
          {cardType !== 'collection' ? <div className="omnimux-rival-card-title-zone">
            <div className={`omnimux-rival-card-title clamp-${clamp}`}>{title}</div>
          </div> : null}
        </>
      ) : (
        <>
          {rivalHasPill(card) ? (
            <div className="omnimux-rival-pill-row">
              <VelocityPill velocity={card.velocity} surface="on-surface" t={t} />
            </div>
          ) : null}
          <div className={`omnimux-rival-card-text clamp-${clamp} ${bodyClassName}`.trim()} role={bodyRole}>{title}</div>
          {cardType === 'text-media' ? mediaNode : null}
        </>
      )}

      {children}
      {overlayNode !== undefined ? overlayNode : <div className={`omnimux-rival-card-overlay ${onMedia ? 'on-media' : 'on-surface'}`}>
        <div className="omnimux-rival-ov-author">
          <RivalPlatformMark platform={String(account.platform || card?.source_platform || '')} />
          <span className="omnimux-rival-ov-name">{String(account.nickname || account.handle || card?.author_name || '')}</span>
          <span className="omnimux-rival-ov-time">· {posted}</span>
          {matchKey ? <span className="omnimux-rival-ov-match">{t(matchKey)}</span> : null}
        </div>
        <span className="omnimux-rival-overlay-metrics">{metricsText(card, t)}</span>
        <div className="omnimux-rival-act-row">
          {/* §9.2/§9.6 V16 fixes the action row to three secondary slots:
              an unsafe source_url greys its button (same affordance the
              account filter uses) instead of collapsing the slot. Chrome
              never dispatches click on a disabled button — only synthetic
              events (jsdom/tests) bubble — but the wrapper span keeps both
              paths from reaching the card's detail handler; it reuses the
              act-slot contract so all slots share one flex treatment. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <span className="omnimux-rival-act-slot" onClick={stop}>
            <Button
              variant="outline"
              size="sm"
              className="omnimux-rival-act-btn"
              data-act="original"
              disabled={!originalUrlSafe}
              title={originalUrlSafe ? undefined : t('rivalFeed.card.originalUnavailable')}
              aria-describedby={originalUrlSafe ? undefined : `rival-original-unavailable-${String(card?.id ?? '')}`}
              // O7（已登记，生产不可达）：无 id 卡会得到重复的
              // `rival-original-unavailable-` id——feed 每张卡都带 row_id，
              // 若将来 id 来源放宽需补守卫。
              onClick={openOriginal}
            >
              {t('rivalFeed.card.original')}
            </Button>
            {/* disabled 按钮不可聚焦，title 对键盘/读屏不可达（R6-⑨）：
                同文案经可视隐藏节点挂进 aria-describedby。
                R7-⑧（PM M4）：隐藏节点必须与原按钮同级而非作为其
                子节点——作为子节点其文本会被并入可及名称，读屏把
                "Original Original link unavailable" 念两遍。挂到外层
                act-slot 即可，describedby 引用不要求后代关系。 */}
            {!originalUrlSafe ? (
              <span
                id={`rival-original-unavailable-${String(card?.id ?? '')}`}
                className="omnimux-rival-vh"
              >
                {t('rivalFeed.card.originalUnavailable')}
              </span>
            ) : null}
          </span>
          {typeof onDeconstruct === 'function' ? (
            <Button
              variant="outline"
              size="sm"
              className="omnimux-rival-act-btn"
              data-act="deconstruct"
              onClick={(e) => { stop(e); onDeconstruct(card) }}
            >
              {t('rivalFeed.card.deconstruct')}
            </Button>
          ) : null}
          <span className="omnimux-rival-act-slot">{fourth}</span>
        </div>
        {typeof onReplicate === 'function' ? (
          <Button
            variant="primary"
            className="omnimux-rival-act-primary"
            data-act="replicate"
            disabled={busy === true}
            onClick={(e) => { stop(e); if (!busy) onReplicate(card) }}
          >
            {t('rivalFeed.card.replicate')}
          </Button>
        ) : null}
      </div>}
    </article>
  )
}
