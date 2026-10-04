import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, IconButton } from 'dsh-ui-kit'
import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
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
import { preloadMedia } from './media-cache.js'
import { activeDimensionCount, dimensionLabelOf, optionLabelOf } from './character-dimensions.js'
import { cloudAudioTheme, cloudCardKind, isOfficialVoicePreviewAsset, isOfficialVoicePreviewPlayable } from './cloud-feed-helpers.js'
import { CLOUD_ALL_CATEGORY } from './cloud-feed-helpers.js'
import { useCloudAssetsFeed } from './use-cloud-assets-feed.js'
import { useGridColumns } from './use-grid-columns.js'
import { MasonryGrid } from './masonry-grid.jsx'
import { pageSizeFor } from './page-size.js'
import { coverRatioCache } from './ratio-cache.js'
import { CloudCategoryRow } from './CloudCategoryRow.jsx'

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
 * 缺省读面：没有控制器注入时（例如只渲染骨架的场合）两张卡都按「未保存」渲染。
 * 逐文件声明而不跨文件共享，避免在两个互相 import 的文件之间多出一个导出。
 */
const NO_IDS = new Set()

/**
 * 首次加载骨架卡张数随列数自适应（3 行，见 pageSizeFor），不再固定 12 张。
 */

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

  // 挂载时预加载视频首帧与元数据，确保鼠标移上去时能瞬时秒播而不卡顿
  useEffect(() => {
    const element = videoRef.current
    if (!element || !showClip || element.readyState > 0) return
    element.load()
  }, [showClip])

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
          width={9}
          height={16}
          onLoad={(event) => {
            const image = event.currentTarget
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              image.setAttribute('width', String(image.naturalWidth))
              image.setAttribute('height', String(image.naturalHeight))
              if (asset?.id) {
                coverRatioCache.set(asset.id, image.naturalWidth / image.naturalHeight)
              }
            }
          }}
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
 * Three things live on a card: the body, the title under it, and the hover
 * cluster pinned into the top-right corner — 保存到本地, which copies the row
 * into the local library, and 加入会话, which mounts it into the conversation.
 * The save control sits first in the DOM, so it reads to the left of the bubble.
 *
 * The card holds no save state of its own: `saved` and `saving` are handed down
 * by the stage's controller (the same one the preview modal reads), so a row
 * saved from either entry point is marked in both, and the tick survives a
 * re-sort, a sub-category switch or a re-mount of the grid. What the card does
 * own is the 1800ms tick on 加入会话, which is a receipt — not a state.
 *
 * The body follows the row (`cloudCardKind`):
 * - a picture or video gets a thumbnail at the cover's original ratio with one line of title;
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
 *   onTogglePlay: (asset: any, explicit?: boolean) => void,
 *   onPreview?: (asset: any) => void,
 *   aspect?: string,
 *   autoplaySuppressed?: boolean,
 *   saved?: boolean,
 *   saving?: boolean,
 *   onSave?: (asset: any) => void,
 * }} props
 */
export function CloudAssetCard(props) {
  const { asset, t, playing, onTogglePlay, onPreview, aspect, autoplaySuppressed = false, saved = false, saving = false, onSave } = props
  const [broken, setBroken] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [added, setAdded] = useState(false)
  const addedTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  // 用户显式接管标记：点击/键盘 toggle 之后，同一次悬停内 hover 副作用把
  // 播放权交还给用户——不得把显式暂停又翻回播放，也不得把显式启动的播放
  // 在指针移出时强行停掉。只在指针再次进入时重置：离开那一次渲染的副作用必须
  // 仍看到「已接管」并跳过，否则用户显式启动的播放会被移出强停。
  const userControlledRef = useRef(false)

  useEffect(() => { setBroken(false) }, [asset.id])
  useEffect(() => () => {
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current)
  }, [])

  const kind = cloudCardKind(asset)
  // Issue #3058：官方音色 preview-only——卡片不渲染保存/会话动作簇，handler
  // 同样早退；播放资格由 preview DTO（verified-file + primary）裁定，
  // 未验证行即使误带 media_url 也不出播放键，DTO-only 已验证行（无 media_url）
  // 照样出播放键——hasMedia 与 legacy playable 门只属于普通资产分支，
  // 官方行误带 meta.playable=false 同样出播放键（ocr-final #3058）。普通资产行为不变。
  const isOfficialVoice = isOfficialVoicePreviewAsset(asset)
  const canPlay = asset?.mediaType === 'audio'
    && (isOfficialVoice ? isOfficialVoicePreviewPlayable(asset) : asset?.playable !== false && asset?.hasMedia === true)
  const showArt = asset?.hasCover === true || (asset?.hasMedia === true && asset?.mediaType !== 'audio')
  const handleBroken = useCallback(() => { setBroken(true) }, [])
  const togglePlay = useCallback(() => {
    userControlledRef.current = true
    onTogglePlay(asset, true)
  }, [asset, onTogglePlay])
  const openPreview = useCallback(() => { onPreview?.(asset) }, [asset, onPreview])
  /**
   * OCR round2 F4：悬停自动试听后打开详情（点击卡体/卡片或键盘标题），
   * 视图的 stop 清掉 playingId 后，指针仍悬停会让 hover 副作用立刻把
   * toggle 再打回去——详情开着卡片又自动重启试听、与详情音频并播。
   * 详情入口与显式播放键同一接管语义：先标记 user-controlled 再走
   * openPreview；指针再次进入卡片时 hover 入口照常重置该标记。
   * 指针路径由卡片 onMouseDown 标记（先于 click）；键盘路径由卡片上的
   * Enter/Space keydown 侦听器标记（注册序先于 body 的激活 handler）。
   * sol-spec-final：接管只认详情入口与显式播放键——落在保存/会话动作簇上的
   * 按下不算接管，否则「悬停试听 → 点保存/会话 → 移出」会把自动播放留在
   * 卡片上继续播，改变普通音频的旧语义（修复前 mousedown 无差别标记）。
   */
  const cardRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const markUserControlled = useCallback(() => {
    userControlledRef.current = true
  }, [])
  const markOnCardMouseDown = useCallback((event) => {
    if (event.target?.closest?.('.omnimux-assets-cloud-actions')) return
    markUserControlled()
  }, [markUserControlled])

  useEffect(() => {
    const node = cardRef.current
    if (!node) return undefined
    const markOnActivateKey = (event) => {
      if ((event.key === 'Enter' || event.key === ' ')
        && !event.target?.closest?.('.omnimux-assets-cloud-actions')) {
        markUserControlled()
      }
    }
    node.addEventListener('keydown', markOnActivateKey)
    return () => { node.removeEventListener('keydown', markOnActivateKey) }
  }, [markUserControlled])

  const handleAdd = (event) => {
    event.stopPropagation()
    // 防御性早退：官方试听样音没有「添加到会话」语义，按钮不渲染之外再拦一手。
    if (isOfficialVoicePreviewAsset(asset)) return
    if (added) return
    addAssetToConversation(asset)
    setAdded(true)
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current)
    addedTimerRef.current = setTimeout(() => { setAdded(false) }, 1800)
  }

  // The save itself belongs to the stage's controller: this only forwards the
  // click, and stops it from reaching the card's own preview handler.
  const handleSave = (event) => {
    event.stopPropagation()
    // 防御性早退：preview-only 用途不进入普通保存链路。
    if (isOfficialVoicePreviewAsset(asset)) return
    if (saved || saving) return
    onSave?.(asset)
  }

  // 悬停直接播放试听（音频/角色卡）。
  // autoplaySuppressed（hook 上报：自动播放被拒/候选穷尽）期间不自动重启——
  // 否则 playingId 清空与 hovering 会制造「重试 + 重复提示」循环（OCR #12）。
  useEffect(() => {
    if (!canPlay || userControlledRef.current || autoplaySuppressed) return
    if (hovering && !playing) {
      onTogglePlay(asset)
    } else if (!hovering && playing) {
      onTogglePlay(asset)
    }
  }, [hovering, canPlay, playing, asset, onTogglePlay, autoplaySuppressed])

  // The control sits over the card's top-right corner, so it claims its own
  // pointer event: without that, using it would also open the preview behind it.
  const handlePlayClick = (event) => {
    event.stopPropagation()
    togglePlay()
  }

  const addLabel = added ? t('card.addedToConversation') : t('card.addToConversation')
  const saveLabel = saved ? t('card.savedToLocal') : t('card.saveToLocal')
  const previewLabel = `${asset.name} · ${t('card.view')}`
  // A voice card carries one of five restrained dark washes, picked by row id so
  // it never changes between renders. Other kinds declare no theme.
  const theme = canPlay && !showArt ? cloudAudioTheme(asset.id) : undefined

  return (
    <div
      ref={cardRef}
      className={`omnimux-assets-card omnimux-assets-cloud-card omnimux-assets-cloud-card--${kind}`}
      data-kind={kind}
      data-media-type={asset.mediaType}
      data-theme={theme}
      data-aspect={aspect}
      onMouseEnter={() => {
      userControlledRef.current = false
      setHovering(true)
    }}
      onMouseLeave={() => { setHovering(false) }}
      onMouseDown={markOnCardMouseDown}
      onClick={openPreview}
    >
      {kind === 'text' ? null : (
        <div
          className={canPlay ? PLAYABLE_THUMB_CLASS : THUMB_CLASS}
          role={canPlay ? 'button' : undefined}
          tabIndex={canPlay ? 0 : undefined}
          aria-label={canPlay ? `${asset.name} · ${playing ? t('cloud.action.pause') : t('cloud.action.play')}` : undefined}
          title={canPlay ? `${asset.name} · ${playing ? t('cloud.action.pause') : t('cloud.action.play')}` : undefined}
          aria-pressed={canPlay ? (playing ? 'true' : 'false') : undefined}
          onClick={canPlay ? handlePlayClick : undefined}
          onKeyDown={canPlay ? activateRowKeydown(togglePlay) : undefined}
        >
          {showArt ? <CloudTileMedia asset={asset} broken={broken} onBroken={handleBroken} hovering={hovering} /> : null}
          {canPlay ? (
            <span className="omnimux-assets-cloud-play" aria-hidden="true">
              {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            </span>
          ) : null}
        </div>
      )}
      {/* 悬停暗化遮罩蒙层（对标图 3） */}
      <div className="omnimux-assets-cloud-card-mask" aria-hidden="true" />
      {!isOfficialVoicePreviewAsset(asset) ? (
        <div className="omnimux-assets-cloud-actions">
          {/* FIRST in the cluster, so the save plate sits to the LEFT of the bubble. */}
          <IconButton
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-action omnimux-assets-cloud-save"
            aria-label={saveLabel}
            title={saveLabel}
            disabled={saved}
            loading={saving}
            onClick={handleSave}
          >
            {saved ? <CheckIcon size={16} /> : <IconDownloadOutline16 size={16} />}
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-action omnimux-assets-cloud-chat"
            aria-label={addLabel}
            title={addLabel}
            disabled={added}
            onClick={handleAdd}
          >
            {added ? <CheckIcon size={16} /> : <ChatIcon size={16} />}
          </IconButton>
        </div>
      ) : null}
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
 * none. The first chip is always a plain 全部 rather than a category-specific label,
 * so no category can inherit another one's wording. Both levels share one chip treatment: neutral until selected, then
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
    <div className="omnimux-assets-cloud-nav omx-stage-sticky">
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
 *
 * The save trio is injected by the stage's controller — read-only sets plus the
 * one callback — so the cards and the preview modal report the same saved state
 * for the same row. A caller that passes none of it simply gets no save entry.
 * @param {{
 *   t: (key: string) => string,
 *   open?: boolean,
 *   onPreview?: (asset: any) => void,
 *   query?: string,
 *   savedIds?: Set<string>,
 *   savingIds?: Set<string>,
 *   onSave?: (asset: any) => void,
 * }} props
 */
export function CloudAssetsView(props) {
  const { t, open = true, onPreview, savedIds = NO_IDS, savingIds = NO_IDS, onSave } = props
  const query = props.query ?? ''
  const sentinelRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  // 网格列数由容器宽度决定并封顶 5 列，写在容器的 data-columns 上（见 grid-columns.js）。
  const [gridRef, gridColumns] = useGridColumns()
  // 每批加载/展示条数按当前列数推导（3 行），随视口自适应，首屏更快（见 page-size.js）。
  const pageSize = pageSizeFor(gridColumns)
  const feed = useCloudAssetsFeed({ t, open, pageSize, query })
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

  const onTogglePlay = useCallback((asset, explicit = false) => { audition.toggle(asset, explicit) }, [audition])
  // 打开详情前先停卡片试听，避免卡片与详情音频并行发声（Issue #3058 A6）。
  const handleOpenPreview = useCallback((asset) => {
    audition.stop()
    onPreview?.(asset)
  }, [audition, onPreview])
  const searchActive = feed.query.trim() !== ''
  const filtered = feed.characterFilters.active > 0
  const isAllCategory = feed.category === CLOUD_ALL_CATEGORY
  const showRowLayout = isAllCategory && !searchActive && !filtered

  const rowCategories = useMemo(() => {
    return feed.categories.filter((cat) => cat.id !== CLOUD_ALL_CATEGORY)
  }, [feed.categories])

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

  // 视口封面优化（Issue 2151）：去掉整批封面全量预解码，依靠 img loading="lazy" 按视口懒加载；
  // 仅在数据尾部保留下一屏条数的提前缓冲，避免滚到底时瞬时白块。
  useEffect(() => {
    const trailing = items.slice(Math.max(0, items.length - pageSize))
    const covers = trailing
      .filter((row) => row?.hasCover === true)
      .map((row) => cloudMediaUrl(row.id, 'cover'))
    preloadMedia(covers)
  }, [items, pageSize])

  let body = null
  if (showRowLayout) {
    body = (
      <div className="omnimux-assets-cloud-scroll omnimux-assets-cloud-rows-scroll">
        {rowCategories.map((cat) => (
          <CloudCategoryRow
            key={cat.id}
            category={cat}
            t={t}
            onSelectCategory={feed.selectCategory}
            onTogglePlay={onTogglePlay}
            onPreview={handleOpenPreview}
            playingId={audition.playingId}
            suppressedIds={audition.suppressedIds}
            refreshKey={feed.refreshKey}
            savedIds={savedIds}
            savingIds={savingIds}
            onSave={onSave}
          />
        ))}
      </div>
    )
  } else if (feed.loading) {
    // 首次加载铺骨架网格而不是一句「正在加载」：卡片位置先占住，数据到达时在原位
    // 换成真卡片，不做二次布局，观感上是从模糊到清晰而不是从空白到出现。
    body = (
      <div className="omnimux-assets-cloud-scroll">
        <MasonryGrid
          gridRef={gridRef}
          columns={gridColumns}
          items={Array.from({ length: pageSize }, (_unused, index) => ({ id: `skeleton-${index}` }))}
          className="omnimux-assets-grid omnimux-assets-cloud-grid"
          data-skeleton="true"
          aria-busy="true"
          aria-label={t('cloud.loading')}
          renderItem={(row) => (
            <div className="omnimux-assets-card omnimux-assets-cloud-skeleton" key={row.id}>
              <div className="omnimux-assets-cloud-skeleton-thumb" />
              <div className="omnimux-assets-cloud-skeleton-line" />
            </div>
          )}
        />
      </div>
    )
  } else if (items.length === 0) {
    body = <EmptyState title={emptyState.title} description={emptyState.description} />
  } else {
    body = (
      <div className="omnimux-assets-cloud-scroll">
        <MasonryGrid
          gridRef={gridRef}
          columns={gridColumns}
          items={items}
          className="omnimux-assets-grid omnimux-assets-cloud-grid"
          renderItem={(asset) => (
            <CloudAssetCard
              key={asset.id}
              asset={asset}
              t={t}
              playing={audition.playingId === asset.id}
              autoplaySuppressed={audition.suppressedIds.has(asset.id)}
              onTogglePlay={onTogglePlay}
              onPreview={handleOpenPreview}
              saved={savedIds.has(asset.id)}
              saving={savingIds.has(asset.id)}
              onSave={onSave}
            />
          )}
        />
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
      {/* 官方试听失败一次核定提示：复用既有 notice 载体，不新造组件（Issue 3058） */}
      {audition.notice !== '' ? <p className="omnimux-assets-cloud-notice">{audition.notice}</p> : null}
      {body}
    </div>
  )
}
