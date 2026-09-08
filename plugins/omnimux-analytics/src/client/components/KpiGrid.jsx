import { IconRightUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Badge } from 'dsh-ui-kit'
import { formatCount, formatEr, formatSignedCount } from '../format.js'

function Trend({ up, children }) {
  if (!children) return null
  return (
    <Badge
      variant={up ? 'success' : 'neutral'}
      size="sm"
      shape="capsule"
    >
      {children}
    </Badge>
  )
}

function BestPostCard({ t, post }) {
  if (!post) {
    return (
      <article className="omnimux-analytics-kpi">
        <h3 className="omnimux-analytics-kpi-title">{t('kpi.bestPost')}</h3>
        <p className="omnimux-analytics-kpi-value">-</p>
      </article>
    )
  }
  const href = post.detailHref || '#omnimux-analytics-top-posts'
  const isInternal = href.startsWith('#')
  const handleClick = (e) => {
    if (isInternal) {
      e.preventDefault()
      const targetId = href.replace(/^#/, '')
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }

  return (
    <article className="omnimux-analytics-kpi omnimux-analytics-kpi-best">
      <h3 className="omnimux-analytics-kpi-title">{t('kpi.bestPost')}</h3>
      <div className="omnimux-analytics-best">
        <div className="omnimux-analytics-best-cover" aria-hidden="true">
          {post.coverUrl
            ? <img src={post.coverUrl} alt="" />
            : (post.coverLabel || t('kpi.coverFallback'))}
        </div>
        <div className="omnimux-analytics-best-copy">
          <p className="omnimux-analytics-best-views">
            <strong>{formatCount(post.views)}</strong>
            <span>{t('kpi.plays')}</span>
          </p>
          <a
            className="omnimux-analytics-best-link"
            href={href}
            target={isInternal ? undefined : '_blank'}
            rel={isInternal ? undefined : 'noreferrer'}
            onClick={handleClick}
          >
            {t('kpi.viewDetail')}
            <IconRightUpOutline14 />
          </a>
        </div>
      </div>
    </article>
  )
}

/**
 * Five KPI cards: ER, Reach, Followers, Posts, Best Post.
 */
export function KpiGrid({ t, kpi, timeRange = '30d' }) {
  const followers = kpi?.totalFollowers?.value
  const diff = kpi?.followerDiff?.value
  const posts = kpi?.postsCount?.value
  const health = kpi?.postsHealth || 'none'
  const rangeLabel = t(`filter.range.${timeRange}`)

  return (
    <section className="omnimux-analytics-kpi-grid" aria-label={t('kpi.group')}>
      <article className="omnimux-analytics-kpi">
        <h3 className="omnimux-analytics-kpi-title">{t('kpi.er')}</h3>
        <p className="omnimux-analytics-kpi-value">{formatEr(kpi?.engagementRate?.value)}</p>
      </article>
      <article className="omnimux-analytics-kpi">
        <h3 className="omnimux-analytics-kpi-title">{t('kpi.reach')}</h3>
        <p className="omnimux-analytics-kpi-value">{formatCount(kpi?.totalReach?.value)}</p>
      </article>
      <article className="omnimux-analytics-kpi">
        <h3 className="omnimux-analytics-kpi-title">{t('kpi.followers')}</h3>
        <div className="omnimux-analytics-kpi-row">
          <p className="omnimux-analytics-kpi-value">{formatCount(followers)}</p>
          {typeof diff === 'number' && diff > 0 ? (
            <Trend up>{t('kpi.followersDelta').replace('{range}', rangeLabel).replace('{n}', formatSignedCount(diff))}</Trend>
          ) : null}
        </div>
      </article>
      <article className="omnimux-analytics-kpi">
        <h3 className="omnimux-analytics-kpi-title">{t('kpi.posts')}</h3>
        <div className="omnimux-analytics-kpi-row">
          <p className="omnimux-analytics-kpi-value">{formatCount(posts)}</p>
          <Trend up={health === 'normal'}>{t(`kpi.health.${health}`)}</Trend>
        </div>
      </article>
      <BestPostCard t={t} post={kpi?.bestPost} />
    </section>
  )
}
