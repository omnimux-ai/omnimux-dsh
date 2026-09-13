import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, EmptyState } from 'dsh-ui-kit'
import { AudioIcon, CheckIcon, DocIcon, ImageIcon, PauseIcon, PlayIcon, PlusIcon, VideoIcon } from './icons.jsx'
import { cloudMediaUrl } from './api.js'
import { mediaLabelOf } from './cloud-feed-helpers.js'
import { useCloudAssetsFeed } from './use-cloud-assets-feed.js'

/** Media type -> tile icon, for rows with no cover image. */
const TYPE_ICON = {
  audio: AudioIcon,
  video: VideoIcon,
  image: ImageIcon,
  document: DocIcon,
  other: DocIcon,
}

/**
 * Tile media.
 *
 * Small images are their own cover (`which=media`); everything else asks for the
 * thumbnail. A row with no poster reports no cover, and the tile then falls back
 * once to the playable media — for a video that is a frame the browser decodes
 * itself — before settling on the type icon. The `preload="none"` preview only
 * plays while the pointer is over the tile, so a 24-card page issues no video
 * requests up front.
 * @param {{ asset: any, broken: boolean, onBroken: () => void }} props
 */
function CloudTileMedia(props) {
  const { asset, broken, onBroken } = props
  const [hovering, setHovering] = useState(false)
  const [retriedWithMedia, setRetriedWithMedia] = useState(false)
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null))

  useEffect(() => {
    const element = videoRef.current
    if (!element) return
    if (hovering) {
      void element.play().catch(() => {})
    } else {
      element.pause()
      element.currentTime = 0
    }
  }, [hovering])

  useEffect(() => { setRetriedWithMedia(false) }, [asset.id])

  const Icon = TYPE_ICON[asset.mediaType] ?? DocIcon
  if (broken) return <Icon size={22} />

  const isImage = asset.mediaType === 'image'
  const wantsCover = !isImage && !retriedWithMedia
  const coverSrc = cloudMediaUrl(asset.id, wantsCover ? 'cover' : 'media')

  const handleImageError = () => {
    // One retry against the playable media, then give up and show the icon.
    if (wantsCover) setRetriedWithMedia(true)
    else onBroken()
  }

  return (
    <>
      <img
        src={coverSrc}
        className="omnimux-assets-card-media"
        alt=""
        loading="lazy"
        onError={handleImageError}
      />
      {asset.mediaType === 'video' ? (
        <video
          ref={videoRef}
          className="omnimux-assets-cloud-preview"
          src={cloudMediaUrl(asset.id, 'media')}
          muted
          loop
          playsInline
          preload="none"
        />
      ) : null}
    </>
  )
}

/**
 * One cloud asset card.
 *
 * Layout deliberately reuses the local library's card classes so both source
 * tabs share one visual language; only the actions differ.
 * @param {{
 *   asset: any,
 *   t: (key: string) => string,
 *   playing: boolean,
 *   onTogglePlay: (asset: any) => void,
 *   onSave: (asset: any) => void,
 *   saved: boolean,
 *   saving: boolean,
 *   mediaLabel: string,
 * }} props
 */
export function CloudAssetCard(props) {
  const { asset, t, playing, onTogglePlay, onSave, saved, saving, mediaLabel } = props
  const [broken, setBroken] = useState(false)

  useEffect(() => { setBroken(false) }, [asset.id])

  const canPlay = asset.mediaType === 'audio' && asset.playable
  const handleBroken = useCallback(() => { setBroken(true) }, [])

  return (
    <div className="omnimux-assets-card omnimux-assets-cloud-card" data-media-type={asset.mediaType}>
      <div className="omnimux-assets-card-thumb omnimux-assets-cloud-thumb">
        <CloudTileMedia asset={asset} broken={broken} onBroken={handleBroken} />
        <Badge size="sm" shape="capsule" className="omnimux-assets-badge">
          {mediaLabel}
        </Badge>
        <div className="omnimux-assets-card-overlay">
          <div className="omnimux-assets-card-overlay-actions">
            {canPlay ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--primary"
                aria-label={playing ? t('cloud.action.pause') : t('cloud.action.play')}
                aria-pressed={playing ? 'true' : 'false'}
                leadingIcon={playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                onClick={(event) => {
                  event.stopPropagation()
                  onTogglePlay(asset)
                }}
              >
                {playing ? t('cloud.action.pause') : t('cloud.action.play')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="omnimux-assets-overlay-btn omnimux-assets-overlay-btn--secondary"
              aria-label={t('cloud.action.save')}
              disabled={saving}
              leadingIcon={saved ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
              onClick={(event) => {
                event.stopPropagation()
                onSave(asset)
              }}
            >
              {saved ? t('cloud.action.saved') : t('cloud.action.save')}
            </Button>
          </div>
        </div>
      </div>
      <div className="omnimux-assets-card-body">
        <p className="omnimux-assets-card-title" title={asset.name}>{asset.name}</p>
        {asset.description !== '' ? (
          <p className="omnimux-assets-cloud-desc" title={asset.description}>{asset.description}</p>
        ) : null}
        {asset.tags.length > 0 ? (
          <div className="omnimux-assets-cloud-tags">
            {asset.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="omnimux-assets-cloud-tag">{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Category navigation with its optional second level.
 *
 * The second level is data-driven rather than hard-coded to audio: any category
 * whose manifest entry carries sub-categories reveals it, which is why the
 * audio tab shows 全部声音 / 配音 / 音效 / 背景音 without a special case here.
 * @param {{
 *   t: (key: string) => string,
 *   categories: any[],
 *   category: string,
 *   subCategory: string,
 *   tabs: any[],
 *   hasSecondLevel: boolean,
 *   onCategory: (id: string) => void,
 *   onSubCategory: (id: string) => void,
 * }} props
 */
function CloudCategoryNav(props) {
  const { t, categories, category, subCategory, tabs, hasSecondLevel, onCategory, onSubCategory } = props

  return (
    <div className="omnimux-assets-cloud-nav">
      <div className="omnimux-assets-cloud-nav-row">
        {categories.map((row) => (
          <Button
            key={row.id}
            variant={row.id === category ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={row.id === category ? 'true' : 'false'}
            onClick={() => onCategory(row.id)}
          >
            {t(`cloud.category.${row.id}`)}
            <span className="omnimux-assets-cloud-count">{row.total}</span>
          </Button>
        ))}
      </div>
      {hasSecondLevel ? (
        <div className="omnimux-assets-cloud-subnav">
          {tabs.map((row) => (
            <Button
              key={row.id || 'all'}
              variant={row.id === subCategory ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={row.id === subCategory ? 'true' : 'false'}
              onClick={() => onSubCategory(row.id)}
            >
              {row.id === '' ? t('cloud.audio.all') : t(`cloud.subcategory.${row.id}`)}
              <span className="omnimux-assets-cloud-count">{row.total}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Cloud source tab body: category navigation, a card grid with a fixed tile
 * ratio, and paging driven by a bottom sentinel.
 * @param {{ t: (key: string) => string, open?: boolean }} props
 */
export function CloudAssetsView(props) {
  const { t, open = true } = props
  const feed = useCloudAssetsFeed({ t, open })
  const sentinelRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const { loadMore, hasMore, loadingMore, items, audition } = feed

  // IntersectionObserver, not a scroll listener: paging costs one request per
  // page, and an observer fires once per crossing instead of per pixel.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return undefined
    if (typeof IntersectionObserver !== 'function') return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore()
    }, { rootMargin: '320px' })
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [hasMore, loadMore])

  const onTogglePlay = useCallback((asset) => { audition.toggle(asset) }, [audition])
  const searchActive = feed.query.trim() !== ''

  const emptyState = useMemo(() => {
    if (searchActive) {
      return { title: t('cloud.empty.search'), description: t('cloud.empty.searchDesc') }
    }
    return { title: t('cloud.empty.title'), description: t('cloud.empty.desc') }
  }, [searchActive, t])

  let body = null
  if (feed.loading) {
    body = <div className="omnimux-assets-empty"><p>{t('cloud.loading')}</p></div>
  } else if (items.length === 0) {
    body = <EmptyState title={emptyState.title} description={emptyState.description} />
  } else {
    body = (
      <div className="omnimux-assets-cloud-scroll">
        <div className="omnimux-assets-grid omnimux-assets-cloud-grid">
          {items.map((asset) => (
            <CloudAssetCard
              key={asset.id}
              asset={asset}
              t={t}
              playing={audition.playingId === asset.id}
              onTogglePlay={onTogglePlay}
              onSave={feed.saveToLocal}
              saved={feed.savedIds.has(asset.id)}
              saving={feed.savingId === asset.id}
              mediaLabel={mediaLabelOf({ t, mediaType: asset.mediaType })}
            />
          ))}
        </div>
        <div ref={sentinelRef} className="omnimux-assets-cloud-sentinel" aria-hidden="true" />
        {hasMore ? (
          <div className="omnimux-assets-cloud-more">
            <Button variant="ghost" size="sm" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? t('cloud.loadingMore') : t('cloud.loadMore')}
            </Button>
          </div>
        ) : (
          <p className="omnimux-assets-cloud-end">{t('cloud.end')}</p>
        )}
      </div>
    )
  }

  return (
    <div className="omnimux-assets-cloud">
      <CloudCategoryNav
        t={t}
        categories={feed.categories}
        category={feed.category}
        subCategory={feed.subCategory}
        tabs={feed.tabs.items}
        hasSecondLevel={feed.hasSecondLevel}
        onCategory={feed.selectCategory}
        onSubCategory={feed.selectSubCategory}
      />
      {feed.error !== '' ? <p className="omnimux-assets-error">{feed.error}</p> : null}
      {feed.notice !== '' ? <p className="omnimux-assets-cloud-notice">{feed.notice}</p> : null}
      {body}
    </div>
  )
}
