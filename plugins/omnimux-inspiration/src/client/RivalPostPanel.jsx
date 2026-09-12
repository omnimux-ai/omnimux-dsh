/**
 * Right column of the rival workbench: the post stream and the per-post actions.
 *
 * Every post shows the fields the design requires — cover, text, time, views,
 * likes, comments, shares, duration, type and library status — and carries the
 * two actions that matter: "add to session" and "convert to inspiration".
 */

import { Button } from 'dsh-ui-kit'
import { toPostView } from './rival-format.js'

/**
 * @param {{
 *   post: Record<string, any>,
 *   t: (key: string) => string,
 *   busy: boolean,
 *   onAddToChat: (post: Record<string, any>) => void,
 *   onToInspiration: (post: Record<string, any>) => void,
 * }} props
 */
function PostCard({ post, t, busy, onAddToChat, onToInspiration }) {
  const view = toPostView(post)
  const cover = typeof post?.cover_http_url === 'string' ? post.cover_http_url : ''
  return (
    <div className="omnimux-rival-post-card" data-post-id={view.id}>
      <div className="omnimux-rival-post-cover">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="omnimux-rival-post-image" />
        ) : (
          <span className="omnimux-rival-post-placeholder" aria-hidden="true" />
        )}
        {view.durationText ? (
          <span className="omnimux-rival-post-duration">{view.durationText}</span>
        ) : null}
        {view.potential.flagged ? (
          <span className="omnimux-rival-post-badge">{t('rivalAccounts.potential.flagged')}</span>
        ) : null}
      </div>
      <div className="omnimux-rival-post-body">
        <p className="omnimux-rival-post-title">{view.title}</p>
        <div className="omnimux-rival-post-meta">
          <span>{view.postedAtText}</span>
          <span>{t(`rivalAccounts.type.${view.type}`)}</span>
          {view.inLibrary ? <span>{t('rivalAccounts.post.inLibrary')}</span> : null}
        </div>
        <div className="omnimux-rival-post-stats">
          {view.stats.map((entry) => (
            <span key={entry.key} className="omnimux-rival-post-stat">
              <span className="omnimux-rival-post-stat-label">{t(entry.label)}</span>
              <span className="omnimux-rival-post-stat-value">{entry.value}</span>
            </span>
          ))}
        </div>
        {view.potential.flagged ? (
          <div className="omnimux-rival-post-rules">
            {view.potential.rules.map((rule) => (
              <span key={rule} className="omnimux-rival-rule" title={t(`rivalAccounts.potential.${rule.toLowerCase()}`)}>
                {rule}
              </span>
            ))}
          </div>
        ) : null}
        <div className="omnimux-rival-post-actions">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => onAddToChat(post)}>
            {t('rivalAccounts.post.addToChat')}
          </Button>
          {view.hasVideo ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onAddToChat(post, { preferVideo: true })}>
              {t('rivalAccounts.post.addToChatWithVideo')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || view.inLibrary}
            onClick={() => onToInspiration(post)}
          >
            {view.inLibrary ? t('rivalAccounts.post.inLibrary') : t('rivalAccounts.post.toInspiration')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   posts: Array<Record<string, any>>,
 *   loading: boolean,
 *   carryOver: number,
 *   onlyPotential: boolean,
 *   onTogglePotential: (next: boolean) => void,
 *   onAddToChat: (post: Record<string, any>, opts?: { preferVideo?: boolean }) => void,
 *   onToInspiration: (post: Record<string, any>) => void,
 *   busyPostId: string | null,
 * }} props
 */
export function RivalPostPanel(props) {
  const {
    t, posts, loading, carryOver, onlyPotential, onTogglePotential,
    onAddToChat, onToInspiration, busyPostId,
  } = props

  return (
    <div className="omnimux-rival-right">
      <div className="omnimux-rival-post-toolbar">
        <Button
          variant={onlyPotential ? 'primary' : 'outline'}
          size="sm"
          aria-pressed={onlyPotential}
          onClick={() => onTogglePotential(!onlyPotential)}
        >
          {t('rivalAccounts.potential.filter')}
        </Button>
        {carryOver > 0 ? (
          <span className="omnimux-rival-carryover">
            {t('rivalAccounts.post.carryOver').replace('{n}', String(carryOver))}
          </span>
        ) : null}
      </div>
      {loading && posts.length === 0 ? (
        <div className="omnimux-rival-post-skeleton">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="omnimux-rival-post-skel" />
          ))}
        </div>
      ) : null}
      {!loading && posts.length === 0 ? (
        <div className="omnimux-rival-empty">
          <p className="omnimux-rival-empty-title">{t('rivalAccounts.posts.empty')}</p>
        </div>
      ) : null}
      <div className="omnimux-rival-post-list">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            t={t}
            busy={busyPostId === post.id}
            onAddToChat={onAddToChat}
            onToInspiration={onToInspiration}
          />
        ))}
      </div>
    </div>
  )
}
