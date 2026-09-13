import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, IconButton } from 'dsh-ui-kit'
import {
  AudioIcon,
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  DocIcon,
  ImageIcon,
  PauseIcon,
  PlayIcon,
  VideoIcon,
} from './icons.jsx'
import { activateRowKeydown } from './a11y.js'
import { addAssetToConversation } from './add-to-chat.js'
import { cloudMediaUrl } from './api.js'
import { activeDimensionCount, dimensionLabelOf, optionLabelOf } from './character-dimensions.js'
import { cloudAudioTheme, cloudCardKind } from './cloud-feed-helpers.js'
import { useCloudAssetsFeed } from './use-cloud-assets-feed.js'

/** Media type -> tile icon, for a media row whose picture and clip are both gone. */
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
/** Clip classes; the bare variant is the tile's face instead of a hover overlay. */
const PREVIEW_CLASS = 'omnimux-assets-cloud-preview'
const BARE_PREVIEW_CLASS = `${PREVIEW_CLASS} omnimux-assets-cloud-preview--bare`

/**
 * Tile media.
 *
 * The tile draws the picture it actually has, in one fixed order: the cover the
 * catalog published; for a picture row its own file (`which=media`, since an
 * image is its own cover); and otherwise the clip's first frame.
 *
 * An `<img>` is only ever pointed at a picture. The tile used to retry a failed
 * cover against `which=media` for every type, which for a clip means asking the
 * browser to draw an mp4: that request can only fail, the row was marked broken,
 * and a card whose clip was perfectly fine collapsed into a grey type icon. A
 * clip with no picture above it now *is* the face of the tile, decoding the frame
 * it shows (`preload="metadata"`); a clip that does have a poster keeps
 * `preload="none"`, so a 24-card page issues no clip requests up front.
 *
 * `hovering` belongs to the card and covers all of it, so what plays is what the
 * stylesheet already fades in.
 * @param {{ asset: any, broken: boolean, onBroken: () => void, hovering: boolean }} props
 */
function CloudTileMedia(props) {
  const { asset, broken, onBroken, hovering } = props
  const [coverFailed, setCoverFailed] = useState(false)
  const videoRef = useRef(/** @type {HTMLVideoElement | null} */ (null))

  const isVideo = asset.mediaType === 'video'
  const coverSrc = asset.hasCover === true && !coverFailed ? cloudMediaUrl(asset.id, 'cover') : ''
  const imageSrc = asset.mediaType === 'image' ? cloudMediaUrl(asset.id, 'media') : coverSrc
  const hasClip = asset.hasMedia === true
  // The clip is mounted for every video row — that is what plays on hover — and
  // for any other row whose file is the only thing left to draw. It is bare when
  // no picture sits above it, which is when it has to be visible on its own.
  const showClip = hasClip && (isVideo || imageSrc === '')
  const bareClip = showClip && imageSrc === ''

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

  // A bare clip has to decode the frame it already shows: at mount, and again if
  // the cover request failed after mount. A clip with a poster above it waits for
  // hover, so nothing is fetched up front.
  useEffect(() => {
    const element = videoRef.current
    if (!element || !bareClip || element.readyState > 0) return
    element.load()
  }, [bareClip])

  useEffect(() => { setCoverFailed(false) }, [asset.id])

  const Icon = TYPE_ICON[asset.mediaType] ?? DocIcon
  if (broken) return <Icon size={22} />

  const handleImageError = () => {
    // A lost picture is survivable only when a clip can take its place: there is
    // no second image source to try, because the row's original is a clip. A
    // picture row has no clip behind it, so there the icon is the last resort.
    if (asset.mediaType !== 'image' && hasClip) setCoverFailed(true)
    else onBroken()
  }

  const handleVideoError = () => {
    // The clip was the tile's only picture, so with it gone the tile falls back
    // to its type icon instead of sitting there blank.
    if (bareClip) onBroken()
  }

  return (
    <>
      {imageSrc === '' ? null : (
        <img
          src={imageSrc}
          className="omnimux-assets-card-media"
          alt=""
          loading="lazy"
          onError={handleImageError}
        />
      )}
      {showClip ? (
        <video
          ref={videoRef}
          className={bareClip ? BARE_PREVIEW_CLASS : PREVIEW_CLASS}
          src={cloudMediaUrl(asset.id, 'media')}
          muted
          loop
          playsInline
          preload={bareClip ? 'metadata' : 'none'}
          onError={handleVideoError}
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
 *
 * The card is also the pointer surface of its own preview: the pointer landing
 * anywhere on it starts the clip, leaving resets it to its first frame, and that
 * is the very area the stylesheet fades the preview in over.
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
  const [hovering, setHovering] = useState(false)
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
      onMouseEnter={() => { setHovering(true) }}
      onMouseLeave={() => { setHovering(false) }}
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
          {canPlay ? null : <CloudTileMedia asset={asset} broken={broken} onBroken={handleBroken} hovering={hovering} />}
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
 * One dimension of the 角色 filter bar: a pill that opens its own option list.
 *
 * The pill reads as its own title until a value is picked, then as
 * `标题：值`, so a filtered tab says what it is filtered by without the list
 * being open. Every option carries the number of rows on it, counted by the
 * catalog rather than by the client, and 全部 leads the list as the way back out
 * of that one dimension.
 * @param {{
 *   t: (key: string) => string,
 *   dimension: any,
 *   value: string,
 *   onSelect: (value: string) => void,
 * }} props
 */
function CloudDimensionFilter(props) {
  const { t, dimension, value, onSelect } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const label = dimensionLabelOf({ t, dimension, value })

  // One listener for the whole bar: a pointer landing anywhere outside this pill
  // closes it, which is what keeps two pills from being open at once without
  // lifting the open state into every parent.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      const node = rootRef.current
      if (node && !node.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => { document.removeEventListener('mousedown', onPointerDown) }
  }, [open])

  /** @param {string} next */
  const pick = (next) => {
    onSelect(next)
    setOpen(false)
  }

  /** @param {{ value: string, total: number }} option */
  const renderOption = (option) => (
    <Button
      key={option.value || 'all'}
      variant="ghost"
      size="xs"
      className="omnimux-assets-cloud-dimension-option"
      aria-pressed={option.value === value ? 'true' : 'false'}
      onClick={() => { pick(option.value) }}
    >
      <span className="omnimux-assets-cloud-dimension-option-label">
        {optionLabelOf({ t, dimension, value: option.value })}
      </span>
      <span className="omnimux-assets-cloud-count">{option.total}</span>
    </Button>
  )

  return (
    <div className="omnimux-assets-cloud-dimension" ref={rootRef}>
      <Button
        variant="ghost"
        size="sm"
        className="omnimux-assets-cloud-dimension-btn"
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-pressed={value === '' ? 'false' : 'true'}
        aria-label={label}
        onClick={() => { setOpen((prev) => !prev) }}
      >
        <span className="omnimux-assets-cloud-dimension-label">{label}</span>
        <ChevronRightIcon size={12} className="omnimux-assets-cloud-dimension-caret" />
      </Button>
      {open ? (
        <div className="omnimux-assets-cloud-dimension-menu" role="listbox" aria-label={t(`dim.${dimension.id}`)}>
          {renderOption({ value: '', total: dimension.total })}
          {dimension.options.map((option) => renderOption(option))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The 角色 filter bar: eight dimension pills, plus the one control that clears
 * them all.
 *
 * It replaces the sub-category chip row for 角色 only, because that category's
 * shelves (女性 / 男性 / 生活居家 / 职场商务) were the first two axes of a job that
 * genuinely has eight. The bar is data-driven: it renders whatever the catalog's
 * `dimensions` table holds, in the order the scope key is built from, so a
 * catalog that publishes fewer dimensions simply shows fewer pills.
 * @param {{
 *   t: (key: string) => string,
 *   dimensions: any[],
 *   filters: Record<string, string>,
 *   active: number,
 *   onSelect: (dimensionId: string, value: string) => void,
 *   onReset: () => void,
 * }} props
 */
function CloudDimensionBar(props) {
  const { t, dimensions, filters, active, onSelect, onReset } = props
  if (dimensions.length === 0) return null

  return (
    <div className="omnimux-assets-cloud-dimensions" role="group" aria-label={t('dim.label')}>
      {dimensions.map((dimension) => (
        <CloudDimensionFilter
          key={dimension.id}
          t={t}
          dimension={dimension}
          value={filters[dimension.id] ?? ''}
          onSelect={(value) => { onSelect(dimension.id, value) }}
        />
      ))}
      {/* One reset control, and only while there is something to reset: an
          always-visible button that usually does nothing is noise. */}
      {active > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="omnimux-assets-cloud-dimension-reset"
          onClick={onReset}
        >
          {t('dim.reset')}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Category navigation with its optional second level.
 *
 * The second level belongs to the data: a category shows its sub-categories
 * whenever the feed reports them (声音, 素材), and 场景 and the empty 道具 report
 * none. The first chip is always a plain 全部 carrying the category's own count
 * rather than a category-specific label, so no category can inherit another one's
 * wording. Both levels share one chip treatment: neutral until selected, then
 * inked with the label colour instead of a brand accent, so the tab row carries
 * no colour of its own in either theme.
 *
 * 角色 is the one category whose second level is the filter bar instead: its
 * eight professional dimensions replace the four shelves, which were only ever
 * two of those axes.
 * @param {{
 *   t: (key: string) => string,
 *   categories: any[],
 *   category: string,
 *   subCategory: string,
 *   tabs: any[],
 *   hasSecondLevel: boolean,
 *   characterFilters: { dimensions: any[], filters: Record<string, string>, active: number },
 *   onCategory: (id: string) => void,
 *   onSubCategory: (id: string) => void,
 *   onDimension: (dimensionId: string, value: string) => void,
 *   onResetDimensions: () => void,
 * }} props
 */
function CloudCategoryNav(props) {
  const {
    t, categories, category, subCategory, tabs, hasSecondLevel, characterFilters,
    onCategory, onSubCategory, onDimension, onResetDimensions,
  } = props
  const filterBarOwnsSecondLevel = characterFilters.dimensions.length > 0

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
      <CloudDimensionBar
        t={t}
        dimensions={characterFilters.dimensions}
        filters={characterFilters.filters}
        active={characterFilters.active}
        onSelect={onDimension}
        onReset={onResetDimensions}
      />
      {hasSecondLevel && !filterBarOwnsSecondLevel ? (
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
  const filtered = feed.characterFilters.active > 0

  const emptyState = useMemo(() => {
    // A dimension combination that the catalog holds no rows for is the one
    // empty case the user caused themselves, so it is the one that names the
    // filter rather than the search.
    if (filtered) {
      return { title: t('dim.empty.title'), description: t('dim.empty.desc') }
    }
    if (searchActive) {
      return { title: t('cloud.empty.search'), description: t('cloud.empty.searchDesc') }
    }
    return { title: t('cloud.empty.title'), description: t('cloud.empty.desc') }
  }, [filtered, searchActive, t])

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
        characterFilters={feed.characterFilters}
        onCategory={feed.selectCategory}
        onSubCategory={feed.selectSubCategory}
        onDimension={feed.selectDimension}
        onResetDimensions={feed.resetDimensions}
      />
      {feed.error !== '' ? <p className="omnimux-assets-error">{feed.error}</p> : null}
      {body}
    </div>
  )
}
