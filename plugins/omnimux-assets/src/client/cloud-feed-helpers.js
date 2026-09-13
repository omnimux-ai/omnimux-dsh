/**
 * Pure helpers for the cloud assets feed: page-list arithmetic, scope naming,
 * and row-shape normalization. Kept free of React and `fetch` so the paging
 * contract can be tested directly.
 */

/** Rows per page. Mirrors `PAGE_SIZE` in the catalog build script. */
export const CLOUD_PAGE_SIZE = 24

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

/**
 * Sub-category tabs for a category, always led by the "all" pseudo-entry.
 *
 * Only the audio category is required to expose a second level, but the helper
 * is generic: any category whose manifest entry carries sub-categories gets the
 * switcher, so the UI never has to special-case an id.
 * @param {any} manifest
 * @param {string} category
 */
export function subCategoryTabs(manifest, category) {
  const entry = findCategory(manifest, category)
  const subs = Array.isArray(entry?.sub_categories)
    ? entry.sub_categories.filter((row) => row && Number(row.total) > 0)
    : []
  if (subs.length === 0) return { items: [], hasSecondLevel: false }
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
  }
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
