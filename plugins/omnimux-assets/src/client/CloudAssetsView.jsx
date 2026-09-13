import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, IconButton } from 'dsh-ui-kit'
import {
  AudioIcon,
  ChatIcon,
  CheckIcon,
  DocIcon,
  ImageIcon,
  PauseIcon,
  PlayIcon,
  VideoIcon,
} from './icons.jsx'
import { activateRowKeydown } from './a11y.js'
import { addAssetToConversation } from './add-to-chat.js'
import { cloudMediaUrl } from './api.js'
import { cloudAudioTheme, cloudCardKind } from './cloud-feed-helpers.js'
import { useCloudAssetsFeed } from './use-cloud-assets-feed.js'

/** Media type -> tile icon, for media rows whose cover and original both fail. */
const TYPE_ICON = {
  audio: AudioIcon,
  video: VideoIcon,
  image: ImageIcon,
  document: DocIcon,
  other: DocIcon,
}

/** Thumb classes; the playable variant also becomes the card's play control. */
const THUMB_CLASS = 'omnimux-assets-card-thumb omnimux-assets-cloud-thumb'
const PLAYABLE_THUMB_CLASS = `${THUMB_CLASS} omnimux-assets-cloud-thumb--action omnimux-assets-focusable`

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
 * Three things live on a card: the body, the title under it, and the one hover
 * control pinned into the top-right corner that is the single way out of the
 * cloud — into the conversation. Copying a row into the local library used to
 * share that corner behind a `+`; it is gone, and the bubble is now the only
 * control on the card.
 *
 * The body follows the row (`cloudCardKind`):
 * - a picture or video gets a fixed 164px thumbnail with one line of title;
 * - a voice gets a tinted colour plate that plays and stops it, with the title and
 *   one line of voice description underneath;
 * - a text row (a description-only document) gets no plate at all — a title over
 *   its description, which is the only thing that distinguishes those rows.
 *
 * Where a click lands decides what happens. On a voice card the plate is the play
 * control, so it claims the click for itself and the rest of the card opens the
 * preview; on every other card the whole card opens the preview. The title is the
 * keyboard route to that preview, which keeps one tab stop per card rather than
 * one per region.
 * @param {{
 *   asset: any,
 *   t: (key: string) => string,
 *   playing: boolean,
 *   onTogglePlay: (asset: any) => void,
 *   onPreview?: (asset: any) => void,
 * }} props
 */
export function CloudAssetCard(props) {
  const { asset, t, playing, onTogglePlay, onPreview } = props
  const [broken, setBroken] = useState(false)
  const [added, setAdded] = useState(false)
  const addedTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))

  useEffect(() => { setBroken(false) }, [asset.id])
  useEffect(() => () => {
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current)
  }, [])

  const kind = cloudCardKind(asset)
  const canPlay = kind === 'audio'
  const handleBroken = useCallback(() => { setBroken(true) }, [])
  const togglePlay = useCallback(() => { onTogglePlay(asset) }, [asset, onTogglePlay])
  const openPreview = useCallback(() => { onPreview?.(asset) }, [asset, onPreview])

  const handleAdd = (event) => {
    event.stopPropagation()
    if (added) return
    addAssetToConversation(asset)
    setAdded(true)
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current)
    addedTimerRef.current = setTimeout(() => { setAdded(false) }, 1800)
  }

  // The control sits over the card's top-right corner, so it claims its own
  // pointer event: without that, using it would also open the preview behind it.
  const handlePlayClick = (event) => {
    event.stopPropagation()
    togglePlay()
  }

  const addLabel = added ? t('card.addedToConversation') : t('card.addToConversation')
  const previewLabel = `${asset.name} · ${t('card.view')}`
  // A voice card carries one of five restrained dark washes, picked by row id so
  // it never changes between renders. Other kinds declare no theme.
  const theme = canPlay ? cloudAudioTheme(asset.id) : undefined

  return (
    <div
      className={`omnimux-assets-card omnimux-assets-cloud-card omnimux-assets-cloud-card--${kind}`}
      data-kind={kind}
      data-media-type={asset.mediaType}
      data-theme={theme}
      onClick={openPreview}
    >
      {kind === 'text' ? null : (
        <div
          className={canPlay ? PLAYABLE_THUMB_CLASS : THUMB_CLASS}
          role={canPlay ? 'button' : undefined}
          tabIndex={canPlay ? 0 : undefined}
          aria-label={canPlay ? `${asset.name} · ${playing ? t('cloud.action.pause') : t('cloud.action.play')}` : undefined}
          aria-pressed={canPlay ? (playing ? 'true' : 'false') : undefined}
          onClick={canPlay ? handlePlayClick : undefined}
          onKeyDown={canPlay ? activateRowKeydown(togglePlay) : undefined}
        >
          {canPlay ? null : <CloudTileMedia asset={asset} broken={broken} onBroken={handleBroken} />}
          {canPlay ? (
            <span className="omnimux-assets-cloud-play" aria-hidden="true">
              {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            </span>
          ) : null}
        </div>
      )}
      <div className="omnimux-assets-cloud-actions">
        <IconButton
          variant="ghost"
          size="sm"
          className="omnimux-assets-cloud-chat"
          aria-label={addLabel}
          title={addLabel}
          disabled={added}
          onClick={handleAdd}
        >
          {added ? <CheckIcon size={16} /> : <ChatIcon size={16} />}
        </IconButton>
      </div>
      <div
        className="omnimux-assets-card-body"
        role="button"
        tabIndex={0}
        aria-label={previewLabel}
        onKeyDown={activateRowKeydown(openPreview)}
      >
        <p className="omnimux-assets-card-title" title={asset.name}>{asset.name}</p>
        {kind === 'media' || asset.description === '' ? null : (
          <p className="omnimux-assets-cloud-desc" title={asset.description}>{asset.description}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Category navigation with its optional second level.
 *
 * The second level belongs to the data: a category shows its sub-categories
 * whenever the feed reports them (声音, 素材, 角色), and 场景 and the empty 道具
 * report none. The first chip is always a plain 全部 carrying the category's own
 * count rather than a category-specific label, so no category can inherit
 * another one's wording. Both levels share one chip treatment: neutral until
 * selected, then inked with the label colour instead of a brand accent, so the
 * tab row carries no colour of its own in either theme.
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
      <div className="omnimux-assets-cloud-nav-row" role="group" aria-label={t('cloud.nav.label')}>
        {categories.map((row) => (
          <Button
            key={row.id}
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-chip"
            aria-pressed={row.id === category ? 'true' : 'false'}
            onClick={() => onCategory(row.id)}
          >
            {t(`cloud.category.${row.id}`)}
            <span className="omnimux-assets-cloud-count">{row.total}</span>
          </Button>
        ))}
      </div>
      {hasSecondLevel ? (
        <div className="omnimux-assets-cloud-subnav" role="group" aria-label={t('cloud.subnav.label')}>
          {tabs.map((row) => (
            <Button
              key={row.id || 'all'}
              variant="ghost"
              size="xs"
              className="omnimux-assets-cloud-chip"
              aria-pressed={row.id === subCategory ? 'true' : 'false'}
              onClick={() => onSubCategory(row.id)}
            >
              {row.id === '' ? t('cloud.subnav.all') : t(`cloud.subcategory.${row.id}`)}
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
 * @param {{
 *   t: (key: string) => string,
 *   open?: boolean,
 *   onPreview?: (asset: any) => void,
 * }} props
 */
export function CloudAssetsView(props) {
  const { t, open = true, onPreview } = props
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
              onPreview={onPreview}
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
      {body}
    </div>
  )
}
