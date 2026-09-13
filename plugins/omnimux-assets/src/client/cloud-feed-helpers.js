/**
 * Pure helpers for the cloud assets feed: page-list arithmetic, scope naming,
 * card-kind classification and row-shape normalization. Kept free of React and
 * `fetch` so the paging contract can be tested directly.
 */

/** Rows per page. Mirrors `PAGE_SIZE` in the catalog build script. */
export const CLOUD_PAGE_SIZE = 24

/**
 * The one category that owns a second navigation level.
 *
 * The knowledge, character, scene, prop and style entries carry
 * `sub_categories` in the manifest too, but those are counting buckets, not
 * switchable filters: opening them under a selected 知识包 put 全部声音 next to
 * 脚本提示词 / 知识笔记 / 短剧拆镜. The second level is therefore a fixed rule
 * about the audio tab, not a property any category can opt into.
 */
export const CLOUD_SUBNAV_CATEGORY = 'audio'

/**
 * Scope id for a category (+ optional sub-category).
 * @param {string} category
 * @param {string} [subCategory]
 */
export function cloudScope(category, subCategory = '') {
  return subCategory === '' ? category : `${category}/${subCategory}`
}

/**
 * How many pages a scope has. A scope with no rows still has page 0, so an empty
 * category renders an empty state instead of a broken pager.
 * @param {any} manifest
 * @param {string} category
 * @param {string} [subCategory]
 */
export function pageCountOf(manifest, category, subCategory = '') {
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

/** No second level, shared so a rejected category never allocates one. */
const NO_SECOND_LEVEL = { items: [], hasSecondLevel: false }

/**
 * Sub-category tabs for a category, always led by the "all" pseudo-entry.
 *
 * Only audio has a second level (see `CLOUD_SUBNAV_CATEGORY`); every other
 * category reports `hasSecondLevel: false` whatever its manifest entry carries.
 * Within audio an empty sub-category is still dropped, so a tab never opens onto
 * nothing.
 * @param {any} manifest
 * @param {string} category
 */
export function subCategoryTabs(manifest, category) {
  if (category !== CLOUD_SUBNAV_CATEGORY) return NO_SECOND_LEVEL
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
 * the 知识包 case (脚本提示词, 知识笔记, 短剧拆镜) — and a card that has to learn
 * that from a failed image request paints a grey plate with a meaningless icon in
 * the meantime.
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
 * - `audio` — a playable voice, sound or score: the thumbnail is the waveform
 *   plate that starts and stops the row.
 * - `media` — a picture, or a video whose own first frame stands in for a missing
 *   poster: the thumbnail is the card's face and one line of title sits under it.
 * - `text` — a row with neither. A 知识包 row is a title plus a description and
 *   nothing else, so the card has to be that text rather than a 4:3 placeholder.
 *
 * A voice row with no audio file (the descriptor-only 音色 catalogue) is text as
 * well: there is nothing to play, so a waveform plate would be a dead control.
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
