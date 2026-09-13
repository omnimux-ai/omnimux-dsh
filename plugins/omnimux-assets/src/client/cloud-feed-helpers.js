/**
 * Pure helpers for the cloud assets feed: page-list arithmetic, scope naming,
 * card-kind classification, the audio card's colour rotation, and row-shape
 * normalization. Kept free of React and `fetch` so the paging contract can be
 * tested directly.
 */

/** Rows per page. Mirrors `PAGE_SIZE` in the catalog build script. */
export const CLOUD_PAGE_SIZE = 24

/**
 * Scope of the cross-category "全部" view.
 *
 * It is not a manifest category — the builder writes its shards from the whole
 * row set (`all/page-NNNN.json`) — but it is a real fetchable scope, so the id
 * lives here rather than being spelled out at each call site.
 */
export const CLOUD_ALL_CATEGORY = 'all'

/**
 * Scope id for a category (+ optional sub-category).
 * @param {string} category
 * @param {string} [subCategory]
 */
export function cloudScope(category, subCategory = '') {
  return subCategory === '' ? category : `${category}/${subCategory}`
}

/**
 * Rows the catalog holds in total, across every category.
 * @param {any} manifest
 */
export function wholeCatalogTotal(manifest) {
  return Math.max(0, Number(manifest?.totalAssets) || 0)
}

/**
 * How many pages a scope has. A scope with no rows still has page 0, so an empty
 * category renders an empty state instead of a broken pager.
 *
 * 全部 has no manifest entry to read, so its size is derived from the catalog
 * totals the manifest does carry.
 * @param {any} manifest
 * @param {string} category
 * @param {string} [subCategory]
 */
export function pageCountOf(manifest, category, subCategory = '') {
  if (category === CLOUD_ALL_CATEGORY && subCategory === '') {
    const size = Math.max(1, Number(manifest?.pageSize) || CLOUD_PAGE_SIZE)
    return Math.max(1, Math.ceil(wholeCatalogTotal(manifest) / size))
  }
  const entry = findCategory(manifest, category)
  if (!entry) return 1
  if (subCategory !== '') {
    const sub = (entry.sub_categories ?? []).find((row) => row?.id === subCategory)
    return Math.max(1, Number(sub?.pages) || 1)
  }
  return Math.max(1, Number(entry.pages) || 1)
}

/**
 * Row count a scope advertises, before any page is fetched.
 * @param {any} manifest
 * @param {string} category
 * @param {string} [subCategory]
 */
export function totalOf(manifest, category, subCategory = '') {
  if (category === CLOUD_ALL_CATEGORY && subCategory === '') return wholeCatalogTotal(manifest)
  const entry = findCategory(manifest, category)
  if (!entry) return 0
  if (subCategory !== '') {
    const sub = (entry.sub_categories ?? []).find((row) => row?.id === subCategory)
    return Math.max(0, Number(sub?.total) || 0)
  }
  return Math.max(0, Number(entry.total) || 0)
}

/**
 * @param {any} manifest
 * @param {string} category
 */
export function findCategory(manifest, category) {
  if (!manifest || !Array.isArray(manifest.categories)) return null
  return manifest.categories.find((row) => row?.id === category) ?? null
}

/** No second level, shared so a category without one never allocates it. */
const NO_SECOND_LEVEL = { items: [], hasSecondLevel: false }

/**
 * The leading 全部 entry of the category nav.
 *
 * It spans every category rather than one manifest entry, so the manifest stays
 * a plain list of what the library actually holds while the nav still opens on a
 * tab that shows everything. Counts come from the same helpers the pages are
 * paged with, so the chip and the pager cannot disagree.
 * @param {any} manifest
 * @param {(key: string) => string} t
 */
export function allCategoryEntry(manifest, t) {
  return {
    id: CLOUD_ALL_CATEGORY,
    zh: t('cloud.category.all'),
    en: 'All',
    total: totalOf(manifest, CLOUD_ALL_CATEGORY),
    pages: pageCountOf(manifest, CLOUD_ALL_CATEGORY),
    sub_categories: [],
  }
}

/**
 * Sub-category tabs for a category, always led by the "all" pseudo-entry.
 *
 * A category owns a second level exactly when the manifest gives it at least one
 * populated sub-category — 声音 (配音 / 音效 / 背景音), 素材 (绿幕 / 钩子 /
 * 表情包) and 角色 (女性 / 男性 / 生活居家 / 职场商务) all qualify; 场景 and the
 * deliberately empty 道具 do not. The rule is read from the data rather than
 * hard-coded per category, so a category that gains or loses a shelf follows the
 * layout without a code change.
 *
 * The first entry is always `''` — 全部 — carrying the category's own total, so
 * the second level never opens onto an empty selection and no category inherits
 * another one's wording.
 * @param {any} manifest
 * @param {string} category
 */
export function subCategoryTabs(manifest, category) {
  // 全部 has no shelves of its own: it spans every category, so a second level
  // would have to borrow some other category's wording. It stays single-level.
  if (category === CLOUD_ALL_CATEGORY) return NO_SECOND_LEVEL
  const entry = findCategory(manifest, category)
  const subs = Array.isArray(entry?.sub_categories)
    ? entry.sub_categories.filter((row) => row && Number(row.total) > 0)
    : []
  if (subs.length === 0) return NO_SECOND_LEVEL
  return {
    items: [{ id: '', total: Number(entry?.total) || 0 }, ...subs],
    hasSecondLevel: true,
  }
}

/**
 * Normalize one catalog row for rendering.
 *
 * The catalog is committed data, so a malformed row is possible after a manual
 * edit; defaulting every field keeps a bad row from crashing the whole grid.
 *
 * `hasCover` / `hasMedia` are what tell a card whether it has a picture before
 * anything is requested. The builder leaves both locators empty for a text row —
 * a description-only document — and a card that has to learn that from a failed
 * image request paints a grey plate with a meaningless icon in the meantime.
 * @param {any} row
 */
export function normalizeCloudAsset(row) {
  const mediaType = ['image', 'video', 'audio', 'document', 'other'].includes(row?.media_type)
    ? row.media_type
    : 'other'
  return {
    id: String(row?.id ?? ''),
    category: String(row?.category ?? ''),
    subCategory: String(row?.sub_category ?? ''),
    name: String(row?.name ?? ''),
    description: String(row?.description ?? ''),
    mediaType,
    tags: Array.isArray(row?.tags) ? row.tags.map((tag) => String(tag)) : [],
    // `playable` is set by the builder for descriptor-only rows such as the
    // official voice catalogue, which has no audio to preview.
    playable: row?.meta?.playable !== false,
    hasCover: String(row?.cover_url ?? '') !== '',
    hasMedia: String(row?.media_url ?? '') !== '',
  }
}

/**
 * Which body a cloud card renders.
 *
 * - `audio` — a playable voice, sound or score: the thumbnail is the colour
 *   plate that starts and stops the row.
 * - `media` — a picture, or a video whose own first frame stands in for a missing
 *   poster: the thumbnail is the card's face and one line of title sits under it.
 * - `text` — a row with neither. Such a row is a title plus a description and
 *   nothing else, so the card has to be that text rather than a 4:3 placeholder.
 *
 * A voice row with no audio file (the descriptor-only 音色 catalogue) is text as
 * well: there is nothing to play, so a play control would be a dead one.
 * @param {any} asset normalized cloud row (see `normalizeCloudAsset`)
 * @returns {'audio' | 'media' | 'text'}
 */
export function cloudCardKind(asset) {
  const hasMedia = asset?.hasMedia === true
  if (asset?.mediaType === 'audio') return hasMedia && asset?.playable !== false ? 'audio' : 'text'
  if (asset?.hasCover === true || hasMedia) return 'media'
  return 'text'
}

/**
 * The restrained dark washes an audio card rotates through.
 *
 * 深靛青 / 墨绿 / 曜蓝 / 暗紫夜 / 深炭黑 — five surfaces dark enough to carry
 * white text in either theme and never brighter than the chrome around them.
 * Declared here as names so the colour itself stays in the stylesheet.
 */
export const CLOUD_AUDIO_THEMES = ['indigo', 'jade', 'azure', 'violet', 'charcoal']

/**
 * Pick one audio theme for a row.
 *
 * Deterministic on the row id, so a card keeps its wash across renders, pages and
 * category switches instead of flickering as the grid reflows.
 * @param {string} id
 * @returns {string} one of `CLOUD_AUDIO_THEMES`
 */
export function cloudAudioTheme(id) {
  const seed = String(id ?? '')
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619) >>> 0
  }
  return CLOUD_AUDIO_THEMES[hash % CLOUD_AUDIO_THEMES.length]
}

/**
 * Append a page to the loaded rows, dropping ids already present.
 *
 * Paging can race with a category switch, so a duplicate row must never produce
 * a duplicate React key or a doubled card.
 * @param {any[]} existing
 * @param {any[]} incoming
 */
export function appendUniqueAssets(existing, incoming) {
  const seen = new Set(existing.map((row) => row.id))
  const out = existing.slice()
  for (const row of incoming) {
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

/**
 * Human label for a row's media type, resolved through the locale dictionary.
 * @param {{ t: (key: string) => string, mediaType: string }} input
 */
export function mediaLabelOf({ t, mediaType }) {
  const key = `cloud.media.${mediaType}`
  const value = t(key)
  return value === key ? t('cloud.media.other') : value
}
