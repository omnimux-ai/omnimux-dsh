/**
 * 账号监控 v2.1 专用卡片（方案 A：与 InspirationCoverCard 分叉）。
 *
 * 分叉是有意为之，代价写在 PR 里：两张组件从此漂移，缓解靠三条纪律——
 *   1. 颜色/圆角/间距一律走 --dsw-* token，组件内不出现裸色；
 *   2. 媒体比例的判定只存在于 rival-masonry.js，卡片消费已算好的 mediaRatio；
 *   3. 形态分支（标题行数、胶囊行有无、媒体位置）只留在本文件的一张表里，
 *      不下沉到 rival-filter.js 的映射层——映射层只搬运数据。
 *
 * spec §9.1/§9.2：默认态只留「媒体 / 增速胶囊 / 标题或正文」；其余元素全部
 * 收进悬停层（作者行 + 指标行 + 四个操作位）。已处理样式（is-done）只改
 * 颜色与滤镜，不改尺寸——瀑布流因此永不因状态变化重排。
 */

import { Button } from 'dsh-ui-kit'
import { RivalPlatformMark } from './RivalPlatformMark.jsx'
import { rivalHasPill, rivalMediaRatioOf, rivalCardTypeOf } from './rival-masonry.js'
import {
  formatCount,
  formatEngagementCount,
  formatRelativeTime,
  rivalLocaleOf,
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

function VelocityPill({ velocity, surface }) {
  if (!velocity || !String(velocity.text || '')) return null
  const tier = String(velocity.tier || 'watch')
  const trend = tier === 'hot' || tier === 'rising'
  return (
    <span className={`omnimux-rival-vpill ${surface} ${tier}`}>
      {trend ? TREND_SVG : null}
      <span>{String(velocity.text)}</span>
    </span>
  )
}

function metricsText(card, t) {
  const stats = card?.stats || {}
  const locale = rivalLocaleOf(t)
  const key = card?.metrics_template === 'read' ? 'rivalFeed.metrics.reads' : 'rivalFeed.metrics.views'
  return String(t(key) || '')
    .replace('{views}', formatCount(stats.views, locale))
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
  const state = String(card?.state || '')
  if (state === 'done') return String(t('rivalFeed.card.done'))
  if (state === 'replicated') return String(t('rivalFeed.card.replicated'))
  if (state === 'interacted') {
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
 * }} props
 */
export function RivalPostCard(props) {
  const { card, t, onDetail, onReplicate, onDeconstruct, onMarkDone, style, column, busy } = props
  const cardType = rivalCardTypeOf(card)
  const onMedia = cardType === 'short-video' || cardType === 'long-video' || cardType === 'image'
  const isDone = Boolean(card?.done || card?.state || card?.state_label)
  const tier = String(card?.velocity?.tier || 'watch')
  const title = String(card?.title || '')
  const mediaRatio = rivalMediaRatioOf(card)
  const clamp = TITLE_CLAMP[cardType] || 2
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
  const mediaNode = (
    <img
      className="omnimux-rival-card-media"
      src={cover || undefined}
      alt={cover ? title : ''}
      style={{ '--rival-media-ratio': mediaRatio }}
    />
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
      className={`omnimux-rival-card t-${cardType} tier-${tier}${isDone ? ' is-done' : ''}`}
      data-card-id={String(card?.id ?? '')}
      data-card-type={cardType}
      data-col={column}
      role="button"
      tabIndex={0}
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
      {onMedia ? (
        <>
          {mediaNode}
          <VelocityPill velocity={card?.velocity} surface="on-media" />
          <div className="omnimux-rival-card-title-zone">
            <div className={`omnimux-rival-card-title clamp-${clamp}`}>{title}</div>
          </div>
        </>
      ) : (
        <>
          {rivalHasPill(card) ? (
            <div className="omnimux-rival-pill-row">
              <VelocityPill velocity={card.velocity} surface="on-surface" />
            </div>
          ) : null}
          <div className={`omnimux-rival-card-text clamp-${clamp}`}>{title}</div>
          {cardType === 'text-media' ? mediaNode : null}
        </>
      )}

      <div className={`omnimux-rival-card-overlay ${onMedia ? 'on-media' : 'on-surface'}`}>
        <div className="omnimux-rival-ov-author">
          <RivalPlatformMark platform={String(account.platform || card?.source_platform || '')} />
          <span className="omnimux-rival-ov-name">{String(account.nickname || account.handle || card?.author_name || '')}</span>
          <span className="omnimux-rival-ov-time">· {posted}</span>
          {matchKey ? <span className="omnimux-rival-ov-match">{t(matchKey)}</span> : null}
        </div>
        <span className="omnimux-rival-overlay-metrics">{metricsText(card, t)}</span>
        <div className="omnimux-rival-act-row">
          {originalUrlSafe ? (
            <Button
              variant="outline"
              size="sm"
              className="omnimux-rival-act-btn"
              data-act="original"
              onClick={openOriginal}
            >
              {t('rivalFeed.card.original')}
            </Button>
          ) : null}
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
      </div>
    </article>
  )
}
