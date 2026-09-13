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
  PlusIcon,
  VideoIcon,
} from './icons.jsx'
import { activateRowKeydown } from './a11y.js'
import { addAssetToConversation } from './add-to-chat.js'
import { cloudMediaUrl } from './api.js'
import { useCloudAssetsFeed } from './use-cloud-assets-feed.js'

/** Media type -> tile icon, for rows with no cover image. */
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
 * Does this card body carry the description?
 *
 * A picture card is scanned by its thumbnail and title alone. A voice is picked
 * by the character it reads in and a text asset by what it holds, so those two
 * keep the description under the title as the thing that tells them apart.
 * @param {string} mediaType
 */
function showsDescription(mediaType) {
  return mediaType === 'audio' || mediaType === 'document'
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
 * Four things live on a card: the thumbnail, the title, and the two hover
 * controls in the top-right that are the two ways out of the cloud — into the
 * conversation, or into the local library. A media-type badge, tags and a
 * bottom action bar used to compete with the thumbnail for attention; they are
 * gone.
 *
 * Where a click lands decides what happens. On a voice card the thumbnail is
 * the play control, so it claims the click for itself and the rest of the card
 * opens the preview; on every other card the whole card opens the preview. The
 * title is the keyboard route to that preview, which keeps one tab stop per card
 * rather than one per region.
 * @param {{
 *   asset: any,
 *   t: (key: string) => string,
 *   playing: boolean,
 *   onTogglePlay: (asset: any) => void,
 *   onPreview?: (asset: any) => void,
 *   saved?: boolean,
 *   saving?: boolean,
 *   onSave?: (asset: any) => void,
 * }} props
 */
export function CloudAssetCard(props) {
  const { asset, t, playing, onTogglePlay, onPreview, saved = false, saving = false, onSave } = props
  const [broken, setBroken] = useState(false)
  const [added, setAdded] = useState(false)
  const addedTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))

  useEffect(() => { setBroken(false) }, [asset.id])
  useEffect(() => () => {
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current)
  }, [])

  const canPlay = asset.mediaType === 'audio' && asset.playable
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

  // Both controls sit over the thumbnail, so each claims its own pointer event:
  // without that, using one would also open the preview behind it.
  const handleSave = (event) => {
    event.stopPropagation()
    if (saved || saving) return
    onSave?.(asset)
  }
  const handlePlayClick = (event) => {
    event.stopPropagation()
    togglePlay()
  }

  const addLabel = added ? t('card.addedToConversation') : t('card.addToConversation')
  const saveLabel = saved ? t('cloud.action.saved') : t('cloud.action.save')
  const previewLabel = `${asset.name} · ${t('card.view')}`

  return (
    <div
      className="omnimux-assets-card omnimux-assets-cloud-card"
      data-media-type={asset.mediaType}
      data-saved={saved ? 'true' : 'false'}
      onClick={openPreview}
    >
      <div
        className={canPlay ? PLAYABLE_THUMB_CLASS : THUMB_CLASS}
        role={canPlay ? 'button' : undefined}
        tabIndex={canPlay ? 0 : undefined}
        aria-label={canPlay ? `${asset.name} · ${playing ? t('cloud.action.pause') : t('cloud.action.play')}` : undefined}
        aria-pressed={canPlay ? (playing ? 'true' : 'false') : undefined}
        onClick={canPlay ? handlePlayClick : undefined}
        onKeyDown={canPlay ? activateRowKeydown(togglePlay) : undefined}
      >
        <CloudTileMedia asset={asset} broken={broken} onBroken={handleBroken} />
        {canPlay ? (
          <span className="omnimux-assets-cloud-play" aria-hidden="true">
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </span>
        ) : null}
      </div>
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
        <IconButton
          variant="ghost"
          size="sm"
          className="omnimux-assets-cloud-save"
          aria-label={saveLabel}
          title={saveLabel}
          aria-pressed={saved ? 'true' : 'false'}
          disabled={saved || saving}
          onClick={handleSave}
        >
          {saved ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
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
        {showsDescription(asset.mediaType) && asset.description !== '' ? (
          <p className="omnimux-assets-cloud-desc" title={asset.description}>{asset.description}</p>
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
 * Both levels share one chip treatment: neutral until selected, then inked with
 * the label colour instead of a brand accent, so the tab row carries no colour
 * of its own in either theme.
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
 * @param {{
 *   t: (key: string) => string,
 *   open?: boolean,
 *   onPreview?: (asset: any) => void,
 *   save?: {
 *     savedIds: Set<string>,
 *     savingId: string,
 *     save: (asset: any) => Promise<boolean>,
 *   },
 * }} props
 */
export function CloudAssetsView(props) {
  const { t, open = true, onPreview, save } = props
  const feed = useCloudAssetsFeed({ t, open, save })
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
              saved={feed.savedIds.has(asset.id)}
              saving={feed.savingId === asset.id}
              onSave={feed.saveToLocal}
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
