/**
 * The 角色 filter bar: the eight professional dimensions a digital human is
 * catalogued on, the labels they are presented under, and the pure helpers the
 * chip row and the feed share.
 *
 * The taxonomy itself lives in the catalog: `manifest.categories[].dimensions`
 * carries each dimension's option list with the number of rows on every option,
 * computed by `scripts/build-cloud-assets-catalog.mjs` from the rows it wrote.
 * This module therefore holds no counts and no option vocabulary — it only knows
 * the dimension order (which the filter's path segment depends on), how a
 * dimension value is labelled, and how a combination of values becomes a scope.
 *
 * Kept free of React and `fetch`, so the scope contract can be tested directly.
 */

/**
 * Dimension ids, in the order the filter bar renders them and the order the
 * builder joins them into a scope key. The two must not drift: a key is built
 * positionally, so reordering one side silently points every chip at another
 * dimension's shards.
 */
export const CHARACTER_DIMENSION_IDS = [
  'gender',
  'age',
  'figure',
  'name',
  'industry',
  'scene',
  'pose',
  'outfit',
]

/**
 * The category whose second level is the filter bar rather than a chip row.
 * Every other category keeps the plain sub-category row.
 */
export const CHARACTER_CATEGORY = 'character'

/** No dimension selected. Shared so an empty filter never allocates. */
export const EMPTY_CHARACTER_FILTERS = Object.freeze(
  Object.fromEntries(CHARACTER_DIMENSION_IDS.map((id) => [id, ''])),
)

/**
 * @typedef {Record<string, string>} CharacterFilters one value per dimension id,
 *   `''` for 全部.
 */

/**
 * The dimension table of a category, or an empty list for one that has none.
 * @param {any} manifest
 * @param {string} category
 */
export function characterDimensionsOf(manifest, category = CHARACTER_CATEGORY) {
  if (category !== CHARACTER_CATEGORY) return []
  const entry = (manifest?.categories ?? []).find((row) => row?.id === category)
  const dimensions = entry?.dimensions
  if (!Array.isArray(dimensions)) return []
  const byId = new Map(dimensions.map((row) => [row?.id, row]))
  // Read back in the canonical order, so a manifest built by a newer revision
  // cannot reorder the bar out from under the scope key.
  return CHARACTER_DIMENSION_IDS
    .map((id) => byId.get(id))
    .filter((row) => row && Array.isArray(row.options) && row.options.length > 0)
}

/**
 * Value slug, second only to the builder's `slugify`: lowercase, runs of
 * anything else collapsed to a single `-`.
 * @param {unknown} value
 */
export function dimensionSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The catalog token list for one combination of dimension values.
 *
 * Mirrors `characterFilterKey` in the build script: dimension order is fixed and
 * only the selected dimensions contribute a token, so 场景=车内出镜 with
 * 姿势=自拍视角 is `['1car', '1selfie']`. The route matches each token against a
 * row's own dimension values, so a token is a filter, never a path.
 * @param {CharacterFilters} filters
 * @returns {string[]}
 */
export function characterFilterTokens(filters) {
  return CHARACTER_DIMENSION_IDS
    .map((id) => String(filters?.[id] ?? ''))
    .filter((value) => value !== '')
    .map((value) => `1${dimensionSlug(value).replace(/-/g, '_')}`)
}

/**
 * The same list as the single `dims` parameter the route reads.
 * @param {CharacterFilters} filters
 */
export function characterFilterKey(filters) {
  return characterFilterTokens(filters).join(',')
}

/**
 * How many dimensions are narrowed. Zero means the plain category scope is
 * shown, which is what keeps an untouched 角色 tab byte-identical to before.
 * @param {CharacterFilters} filters
 */
export function activeDimensionCount(filters) {
  return CHARACTER_DIMENSION_IDS.filter((id) => String(filters?.[id] ?? '') !== '').length
}

/**
 * A fresh all-clear filter set.
 * @returns {CharacterFilters}
 */
export function emptyCharacterFilters() {
  return { ...EMPTY_CHARACTER_FILTERS }
}

/**
 * One chip's label: the selected value when a dimension is narrowed, its own
 * title otherwise.
 * @param {{ t: (key: string) => string, dimension: any, value: string }} input
 */
export function dimensionLabelOf({ t, dimension, value }) {
  const title = t(`dim.${dimension.id}`)
  if (value === '') return title
  return `${title}: ${optionLabelOf({ t, dimension, value })}`
}

/**
 * One option's label, resolved through the dictionary with the catalog's own
 * English label as the fallback so an option added by a newer catalog still
 * reads as words rather than as a key.
 * @param {{ t: (key: string) => string, dimension: any, value: string }} input
 */
export function optionLabelOf({ t, dimension, value }) {
  if (dimension.id === 'name') return value
  const key = `dim.opt.${optionKeyOf(dimension.id, value)}`
  const label = t(key)
  return label === key ? value : label
}

/**
 * The dictionary key for one option value.
 *
 * Values are the catalog's own English labels (`Middle-aged`, `Beauty & Fashion`),
 * and the dictionary is keyed by a short handle, so the mapping is explicit
 * rather than derived: a value the table does not know keeps its catalog label.
 * @param {string} dimensionId
 * @param {string} value
 */
export function optionKeyOf(dimensionId, value) {
  return OPTION_KEYS[dimensionId]?.[value] ?? dimensionSlug(value)
}

/**
 * Option value -> dictionary handle, for every dimension the filter bar shows.
 * One entry per option the catalog can publish; an unknown value falls back to
 * its slug, which is why this table is an optimisation and not a gate.
 */
const OPTION_KEYS = {
  gender: { Female: 'female', Male: 'male' },
  age: { Youth: 'youth', 'Middle-aged': 'middle' },
  figure: { Slim: 'slim', Average: 'average', Curvy: 'curvy' },
  industry: {
    'Marketing & Ads': 'marketing',
    'Beauty & Fashion': 'beauty',
    'Podcast & Media': 'podcast',
    'Gaming & Tech': 'gaming',
    Education: 'education',
    'General Lifestyle': 'lifestyle',
  },
  scene: {
    Car: 'car',
    'Living Room': 'living',
    Bedroom: 'bedroom',
    Outdoor: 'outdoor',
    Bathroom: 'bathroom',
    Office: 'office',
    'Podcast Studio': 'podcast',
    Kitchen: 'kitchen',
    Cafe: 'cafe',
    'Indoor/Studio': 'indoor',
  },
  pose: { Frontal: 'frontal', Sitting: 'sitting', Selfie: 'selfie', Standing: 'standing' },
  outfit: {
    'Casual/Lifestyle': 'casual',
    'Fashion/Chic': 'fashion',
    'Business/Formal': 'business',
    'Holiday/Costume': 'holiday',
  },
}

/**
 * The page count a fetched page reports for its own scope.
 *
 * A filtered view is answered by query, not by a catalog directory, so it has no
 * manifest entry and its size is only knowable from the envelope the Host just
 * served. Before the first page lands the answer is 0, which the feed reads as
 * "not yet known" rather than "empty".
 * @param {any} body
 */
export function pageTotalPages(body) {
  return Math.max(0, Number(body?.totalPages) || 0)
}
