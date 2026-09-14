import { useCallback, useEffect, useState } from 'react'
import { emptyBrandStrategy, isDigitalProduct, normalizeBrandStrategy } from '../brand-strategy.js'

/* ------------------------------------------------------------------ 指纹常量 */

/** 字段之间的分隔符：不可打印，绝不出现在用户输入里。 */
const FINGERPRINT_FIELD_SEP = '\u0001'
/** 字段组之间的分隔符。 */
const FINGERPRINT_PART_SEP = '\u0002'

/**
 * 显式排除在指纹之外的键。它们是纯 UI 暂存状态，不落库，因此不构成「未保存修改」：
 * - `tagDraft`：分类输入框里还没回车提交的草稿；
 * - `strategyOpen`：战略面板的展开态，展开/收起不改变将要写入的数据；
 * - `strategyTouched`：一点「展开」就置真的交互标记，纳入会造成「看一眼就变脏」；
 * - `asDigital` / `busy`：派生值与请求态，与业务数据无关。
 */
export const FINGERPRINT_EXCLUDED_KEYS = Object.freeze([
  'tagDraft',
  'strategyOpen',
  'strategyTouched',
  'asDigital',
  'busy',
])

/* ------------------------------------------------------------------ 基础工具 */

export function draftFrom(product) {
  try {
    const raw = product && product.brand_strategy
    const next = normalizeBrandStrategy(raw)
    return next ? structuredCloneSafe(next) : emptyBrandStrategy()
  } catch {
    return emptyBrandStrategy()
  }
}

export function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value))
}

export function str(val) {
  return val ? String(val) : ''
}

export function getInitialKind(product) {
  return (product && product.kind === 'digital') ? 'digital' : 'physical'
}

export function getInitialCategories(product) {
  const cats = product && product.categories
  return Array.isArray(cats) ? [...cats] : []
}

export function getInitialMedia(product) {
  const list = product && product.media
  return Array.isArray(list) ? list.map((row) => ({ ...row })) : []
}

export function extractProductSnapshot(product) {
  if (!product) return null
  const isDigital = isDigitalProduct(product)
  return {
    name: str(product.name),
    kind: getInitialKind(product),
    selling: str(product.selling_points),
    audience: str(product.target_audience),
    brand: str(product.brand),
    features: str(product.features),
    price: str(product.price),
    sku: str(product.sku),
    promotion: str(product.promotion),
    link: str(product.link),
    categories: getInitialCategories(product),
    media: getInitialMedia(product),
    coverId: product.cover_media_id || null,
    asDigital: isDigital,
    strategy: draftFrom(product),
    // 与 `useStrategyState` 的起手态一致：数字产品一打开就是「可写」的，
    // 否则已存战略会在基线里丢一半，打开表单立刻显示为脏。
    strategyTouched: isDigital,
  }
}

/**
 * 空白表单快照（新建态基线）。字段域与 `extractProductSnapshot` 完全一致，
 * 因此两者可以用同一个指纹函数折叠成可比对的字符串。
 *
 * `kind` 决定基线属于哪一半字段域：数字基线自带展开的战略与 `strategyTouched`，
 * 与 `extractProductSnapshot` 对数字产品的起手态一致，因此「新建数字产品页一打开
 * 就是脏的」不会发生。
 *
 * @param {'physical' | 'digital'} [kind]
 */
export function emptyProductSnapshot(kind = 'physical') {
  const target = kind === 'digital' ? 'digital' : 'physical'
  const asDigital = target === 'digital'
  return {
    name: '',
    kind: target,
    selling: '',
    audience: '',
    brand: '',
    features: '',
    price: '',
    sku: '',
    promotion: '',
    link: '',
    categories: [],
    media: [],
    coverId: null,
    asDigital,
    strategy: emptyBrandStrategy(),
    strategyTouched: asDigital,
  }
}

/**
 * 任何产品（含 `null` 的新建态）都能得到一个可指纹化的快照。
 * @param {object | null | undefined} product
 * @param {'physical' | 'digital'} [kind] 新建态使用；编辑态以产品自身形态为准
 */
export function formSnapshotOf(product, kind = 'physical') {
  return extractProductSnapshot(product) ?? emptyProductSnapshot(kind)
}

/* ------------------------------------------------------------------ 指纹（纯函数） */

/**
 * 稳定序列化：递归、键名排序、数组保序、`undefined` 丢弃。
 * 相同语义的对象永远得到同一个字符串，与键的书写顺序无关。
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const record = /** @type {Record<string, unknown>} */ (value)
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/**
 * 战略归一化失败时退化为 `null`，与 `buildPayload` 的容错口径一致：
 * 非法战略不会被误判成一次真实改动。
 * @param {unknown} strategy
 */
function safeStrategy(strategy) {
  try {
    return normalizeBrandStrategy(strategy)
  } catch {
    return null
  }
}

/**
 * 单条媒体的 canonical 片段：id 优先，路径与文件名兜底。
 * @param {{ id?: string, real_path?: string, original_name?: string } | null | undefined} row
 */
function mediaPrintOf(row) {
  if (!row || typeof row !== 'object') return ''
  return `${str(row.id)}|${str(row.real_path)}|${str(row.original_name)}`
}

/**
 * 表单指纹：把「会被写入产品的字段」折叠成一个稳定字符串。
 *
 * 输入源既可以是编辑态初始快照（`extractProductSnapshot` 的输出），也可以是
 * 表单实时 state —— 两者字段域相同，因此同一函数可同时产出基线与当前值。
 *
 * 字段域的取舍与 `buildPayload` 严格对齐：
 * - 10 个文本字段中，`price` / `sku` / `promotion` 只在实体商品下参与（数字产品的
 *   payload 不写这三个键，纳入会造成假脏）；
 * - 战略只在数字产品下参与，且只按「归一化后的值」参与：未触碰时与空战略同形，
 *   所以「点开战略面板看一眼再收起」不是改动（`strategyOpen` 不参与，`strategyTouched`
 *   只在值非空时改变结果）；
 * - 分类、媒体、封面落库且数组保序（切换封面会重排媒体，属真实改动）。
 *
 * @param {Record<string, unknown> | null | undefined} source
 * @returns {string}
 */
export function computeProductFingerprint(source) {
  const s = source && typeof source === 'object' ? source : {}
  const kind = s.kind === 'digital' ? 'digital' : 'physical'
  const categories = Array.isArray(s.categories) ? s.categories : []
  const media = Array.isArray(s.media) ? s.media : []

  const parts = [
    `name=${str(s.name).trim()}`,
    `kind=${kind}`,
    `link=${str(s.link)}`,
    `selling=${str(s.selling)}`,
    `audience=${str(s.audience)}`,
    `brand=${str(s.brand)}`,
    `features=${str(s.features)}`,
    `categories=${categories.join(FINGERPRINT_FIELD_SEP)}`,
    `media=${media.map(mediaPrintOf).join(FINGERPRINT_FIELD_SEP)}`,
    `cover=${str(s.coverId)}`,
  ]

  if (kind === 'physical') {
    parts.push(`price=${str(s.price)}`, `sku=${str(s.sku)}`, `promotion=${str(s.promotion)}`)
  } else {
    // 未触碰的战略按「空」参与折叠：空战略归一为 null，与 untouched 打印相同，
    // 于是「展开面板」不产生假脏，而真正改到战略值时立刻变脏。
    const touched = s.strategyTouched === true
    parts.push(`strategy=${stableStringify(touched ? safeStrategy(s.strategy) : null)}`)
  }

  return parts.join(FINGERPRINT_PART_SEP)
}

/** 语义化别名：从表单 state 取指纹。 */
export function getFormFingerprint(state) {
  return computeProductFingerprint(state)
}

/** 旧名别名，便于调用方按任一名字引用同一实现。 */
export const formFingerprint = computeProductFingerprint

/**
 * 脏判定：当前指纹与基线指纹不一致即为脏。
 * @param {string} currentPrint
 * @param {string} baselinePrint
 */
export function isFingerprintDirty(currentPrint, baselinePrint) {
  return currentPrint !== baselinePrint
}

/* ------------------------------------------------------------------ 合并与装配 */

export function mergeMediaPaths(current, paths) {
  const seen = new Set(current.map((file) => file.real_path))
  const extra = []
  for (const path of paths) {
    if (seen.has(path)) continue
    seen.add(path)
    const original_name = path.split('/').pop() || path
    extra.push({ real_path: path, original_name })
  }
  return extra.length === 0 ? current : [...current, ...extra]
}

export function appendCategoryTag(current, rawTag) {
  const tag = rawTag.trim()
  if (!tag || current.length >= 5) return current
  const exists = current.some((item) => item.toLowerCase() === tag.toLowerCase())
  return exists ? current : [...current, tag]
}

/**
 * Import draft → form patch. Parsed fields are cleaned to strings; empty values
 * stay empty so an import never wipes what the user already typed.
 * @param {Record<string, unknown> | null | undefined} data
 */
export function importedPatchOf(data) {
  const source = data && typeof data === 'object' ? data : {}
  /** @param {string} key */
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '')
  const categories = Array.isArray(source.categories)
    ? source.categories
      .filter((row) => typeof row === 'string')
      .map((row) => row.trim())
      .filter((row) => row !== '')
    : []
  return {
    name: text('name'),
    selling: text('selling_points'),
    audience: text('target_audience'),
    brand: text('brand'),
    features: text('features'),
    price: text('price'),
    sku: text('sku'),
    promotion: text('promotion'),
    link: text('link'),
    categories,
  }
}

/**
 * The product kind an import reports. Only a digital answer carries one; a
 * physical answer leaves the switch where the user put it.
 * @param {Record<string, unknown> | null | undefined} data
 * @returns {'digital' | null}
 */
export function importedKindOf(data) {
  if (!data || typeof data !== 'object') return null
  return data.kind === 'digital' ? 'digital' : null
}

/**
 * The six-module strategy an import carried, normalized for the form. An absent
 * or unusable payload answers null so the form keeps what the user typed.
 * @param {Record<string, unknown> | null | undefined} data
 * @returns {ReturnType<typeof normalizeBrandStrategy>}
 */
export function importedStrategyOf(data) {
  if (!data || typeof data !== 'object') return null
  try {
    return normalizeBrandStrategy(data.brand_strategy)
  } catch {
    return null
  }
}

/**
 * The media rows an import carried. Only absolute-path rows with a usable shape
 * survive; anything else is dropped rather than rendered as a broken row.
 *
 * @param {Record<string, unknown> | null | undefined} data
 * @returns {Array<{ id?: string, real_path: string, original_name: string }>}
 */
export function importedMediaOf(data) {
  if (!data || typeof data !== 'object') return []
  const list = data.media
  if (!Array.isArray(list)) return []
  const out = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const realPath = typeof row.real_path === 'string' ? row.real_path.trim() : ''
    if (!realPath) continue
    const id = typeof row.id === 'string' && row.id ? row.id : null
    const name = typeof row.original_name === 'string' && row.original_name
      ? row.original_name
      : (realPath.split('/').pop() || realPath)
    out.push(id ? { id, real_path: realPath, original_name: name } : { real_path: realPath, original_name: name })
  }
  return out
}

/**
 * The media id an import nominated as the cover, or null.
 *
 * @param {Record<string, unknown> | null | undefined} data
 * @returns {string | null}
 */
export function importedCoverIdOf(data) {
  if (!data || typeof data !== 'object') return null
  const id = data.cover_media_id
  return typeof id === 'string' && id ? id : null
}

/**
 * Append imported media to the list the user already has, de-duplicated by id
 * first and by path second. Files the user dragged in are never dropped, and an
 * import never reorders them.
 *
 * @param {Array<object> | null | undefined} current
 * @param {Array<object> | null | undefined} incoming
 * @returns {Array<object>}
 */
export function mergeImportedMedia(current, incoming) {
  const list = Array.isArray(current) ? current : []
  const extra = Array.isArray(incoming) ? incoming : []
  if (extra.length === 0) return list
  const ids = new Set(list.map((file) => file?.id).filter(Boolean))
  const paths = new Set(list.map((file) => file?.real_path).filter(Boolean))
  const appended = []
  for (const file of extra) {
    if (!file || !file.real_path) continue
    if (file.id && ids.has(file.id)) continue
    if (paths.has(file.real_path)) continue
    if (file.id) ids.add(file.id)
    paths.add(file.real_path)
    appended.push(file)
  }
  return appended.length === 0 ? list : [...list, ...appended]
}

/**
 * Apply the media half of an import: merge, then take the cover only when it is
 * still free and actually reachable in the merged list.
 *
 * @param {{ media?: Array<object>, coverId?: string | null, setMedia?: Function, setCoverId?: Function }} mediaState
 * @param {Record<string, unknown> | null | undefined} data
 */
function applyImportedMedia(mediaState, data) {
  const incoming = importedMediaOf(data)
  if (incoming.length === 0) return
  const merged = mergeImportedMedia(mediaState.media, incoming)
  if (typeof mediaState.setMedia === 'function') mediaState.setMedia(merged)
  // 实物导入的商品图没有单独的封面字段：第一张入库图就是封面。数字导入带
  // `cover_media_id`（桌面首屏），优先用它。
  const wanted = importedCoverIdOf(data) ?? (incoming.find((file) => file.id)?.id ?? null)
  if (!wanted) return
  // "Take it if free": a cover the user picked by hand always wins.
  if (mediaState.coverId) return
  // Reachability guard — same rule the library applies when it writes a cover.
  if (!merged.some((file) => file.id === wanted)) return
  if (typeof mediaState.setCoverId === 'function') mediaState.setCoverId(wanted)
}

export function buildPayload(params) {
  const { name, kind, link, categories, media, coverId, physical, digital } = params
  const body = {
    name: name.trim(),
    kind,
    link,
    categories,
    media: media.map((row) => ({
      id: row.id,
      real_path: row.real_path,
      original_name: row.original_name,
    })),
    cover_media_id: coverId,
  }
  if (physical) {
    // `selling` / `audience` are the form's own names; the library reads
    // `selling_points` / `target_audience`, so they are renamed on the wire.
    const { selling, audience, brand, features, price, sku, promotion } = physical
    Object.assign(body, {
      selling_points: selling,
      target_audience: audience,
      brand,
      features,
    })
    // Price / SKU / promotion are physical-only fields.
    if (kind === 'physical') Object.assign(body, { price, sku, promotion })
  }
  if (kind === 'digital' && digital && digital.strategyTouched) {
    try {
      body.brand_strategy = normalizeBrandStrategy(digital.strategy)
    } catch {
      body.brand_strategy = null
    }
  }
  return body
}

export function useMediaAndTags(initial) {
  const [categories, setCategories] = useState(() => getInitialCategories(initial))
  const [media, setMedia] = useState(() => getInitialMedia(initial))
  const [tagDraft, setTagDraft] = useState('')
  const [coverId, setCoverId] = useState(initial ? (initial.cover_media_id || null) : null)

  const handleAddTag = () => {
    setCategories((current) => appendCategoryTag(current, tagDraft))
    setTagDraft('')
  }
  const handleRemoveTag = (tag) => {
    setCategories((current) => current.filter((item) => item !== tag))
  }
  const handleAddPaths = (paths) => {
    const next = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p !== '') : []
    if (next.length === 0) return
    setMedia((current) => mergeMediaPaths(current, next))
  }
  const handleSetCover = (file, index) => {
    setCoverId(file.id || null)
    if (file.id) return
    setMedia((current) => {
      const next = [...current]
      const [picked] = next.splice(index, 1)
      next.unshift(picked)
      return next
    })
  }
  const handleRemoveMedia = (file, index) => {
    setMedia((current) => current.filter((_, i) => i !== index))
    if (file.id && coverId === file.id) setCoverId(null)
  }

  return {
    categories,
    media,
    tagDraft,
    coverId,
    setCategories,
    setMedia,
    setTagDraft,
    setCoverId,
    handleAddTag,
    handleRemoveTag,
    handleAddPaths,
    handleSetCover,
    handleRemoveMedia,
  }
}

/**
 * 战略面板的状态。`pinnedKind` 是二级页锚定的形态：数字新建页一打开就该是展开
 * 且可写的（否则已存战略会在基线里丢一半，打开表单立刻显示为脏）。
 *
 * @param {object | null} initial
 * @param {'physical' | 'digital' | undefined} [pinnedKind]
 */
export function useStrategyState(initial, pinnedKind) {
  const digitalAtOpen = pinnedKind ? pinnedKind === 'digital' : isDigitalProduct(initial)
  const [strategyOpen, setStrategyOpen] = useState(digitalAtOpen)
  const [strategyTouched, setStrategyTouched] = useState(digitalAtOpen)
  const [strategy, setStrategy] = useState(() => draftFrom(initial))

  const openStrategy = () => {
    setStrategyOpen(true)
    setStrategyTouched(true)
  }
  const patchStrategy = (mutator) => {
    setStrategyTouched(true)
    setStrategy((current) => {
      const next = structuredCloneSafe(current)
      mutator(next)
      return next
    })
  }

  return {
    strategyOpen,
    strategyTouched,
    strategy,
    setStrategyOpen,
    setStrategyTouched,
    setStrategy,
    openStrategy,
    patchStrategy,
  }
}

/**
 * 基础字段。`pinnedKind` 存在时形态只读：二级页在进入的那一刻就定好了形态，
 * 表单内部（包括导入回填）不得再改写它 —— 这是防止两类字段混写的最后一道闸。
 *
 * @param {object | null} initial
 * @param {'physical' | 'digital' | undefined} [pinnedKind]
 */
export function useProductBaseFields(initial, pinnedKind) {
  const [name, setName] = useState(initial ? str(initial.name) : '')
  const [kind, setKindState] = useState(() => pinnedKind ?? getInitialKind(initial))
  const [selling, setSelling] = useState(initial ? str(initial.selling_points) : '')
  const [audience, setAudience] = useState(initial ? str(initial.target_audience) : '')
  const [brand, setBrand] = useState(initial ? str(initial.brand) : '')
  const [features, setFeatures] = useState(initial ? str(initial.features) : '')
  const [price, setPrice] = useState(initial ? str(initial.price) : '')
  const [sku, setSku] = useState(initial ? str(initial.sku) : '')
  const [promotion, setPromotion] = useState(initial ? str(initial.promotion) : '')
  const [link, setLink] = useState(initial ? str(initial.link) : '')

  const setKind = (value) => {
    if (pinnedKind) return
    setKindState(value)
  }

  const resetBaseFields = (s) => {
    setName(s.name)
    setKindState(pinnedKind ?? s.kind)
    setSelling(s.selling)
    setAudience(s.audience)
    setBrand(s.brand)
    setFeatures(s.features)
    setPrice(s.price)
    setSku(s.sku)
    setPromotion(s.promotion)
    setLink(s.link)
  }

  return {
    fields: { name, kind, selling, audience, brand, features, price, sku, promotion, link },
    setters: { setName, setKind, setSelling, setAudience, setBrand, setFeatures, setPrice, setSku, setPromotion, setLink },
    resetBaseFields,
  }
}

export function bundleFormReturn(base, mediaState, strategyState, busy) {
  const canSubmit = base.fields.name.trim() !== '' && !busy
  const payload = () => buildPayload({
    name: base.fields.name,
    kind: base.fields.kind,
    link: base.fields.link,
    categories: mediaState.categories,
    media: mediaState.media,
    coverId: mediaState.coverId,
    physical: {
      selling: base.fields.selling,
      audience: base.fields.audience,
      brand: base.fields.brand,
      features: base.fields.features,
      price: base.fields.price,
      sku: base.fields.sku,
      promotion: base.fields.promotion,
    },
    digital: {
      strategy: strategyState.strategy,
      strategyTouched: strategyState.strategyTouched,
    },
  })

  return {
    state: {
      ...base.fields,
      tagDraft: mediaState.tagDraft,
      categories: mediaState.categories,
      media: mediaState.media,
      coverId: mediaState.coverId,
      strategyOpen: strategyState.strategyOpen,
      strategyTouched: strategyState.strategyTouched,
      strategy: strategyState.strategy,
    },
    setters: {
      ...base.setters,
      setTagDraft: mediaState.setTagDraft,
      setStrategyOpen: strategyState.setStrategyOpen,
    },
    actions: {
      /**
       * Fill every parsed field at once; tags merge into the existing list. A
       * digital answer unfolds the six brand-strategy modules, so the panel —
       * filled when the analysis answered, empty when it did not — is visible
       * on arrival.
       *
       * Imported media append to the media list, and the first imported row
       * becomes the cover only when the user has not picked one already:
       * product images for a physical listing, the desktop first screen for a
       * digital one.
       */
      applyImportedData: (data) => {
        const patch = importedPatchOf(data)
        if (patch.name) base.setters.setName(patch.name)
        if (patch.selling) base.setters.setSelling(patch.selling)
        if (patch.audience) base.setters.setAudience(patch.audience)
        if (patch.brand) base.setters.setBrand(patch.brand)
        if (patch.features) base.setters.setFeatures(patch.features)
        if (patch.price) base.setters.setPrice(patch.price)
        if (patch.sku) base.setters.setSku(patch.sku)
        if (patch.promotion) base.setters.setPromotion(patch.promotion)
        if (patch.link) base.setters.setLink(patch.link)
        if (patch.categories.length > 0) {
          mediaState.setCategories((current) => patch.categories.reduce(
            (list, tag) => appendCategoryTag(list, tag),
            current,
          ))
        }
        applyImportedMedia(mediaState, data)
        const strategy = importedStrategyOf(data)
        if (importedKindOf(data) === 'digital' || strategy) {
          base.setters.setKind('digital')
          strategyState.setStrategyOpen(true)
          strategyState.setStrategyTouched(true)
        }
        if (strategy) strategyState.setStrategy(strategy)
      },
      openStrategy: strategyState.openStrategy,
      patchStrategy: strategyState.patchStrategy,
      handleAddTag: mediaState.handleAddTag,
      handleRemoveTag: mediaState.handleRemoveTag,
      handleAddPaths: mediaState.handleAddPaths,
      handleSetCover: mediaState.handleSetCover,
      handleRemoveMedia: mediaState.handleRemoveMedia,
    },
    canSubmit,
    payload,
  }
}

/**
 * 表单状态 hook：在既有字段域之上补一层「脏数据指纹」。
 *
 * 基线与当前值由同一个纯函数产生，因此：
 * 1. 打开表单不会立刻变脏（复位后的 state 必然折叠回基线指纹）；
 * 2. 改回原值会恢复为「未修改」；
 * 3. 列表轮询只写产品列表、不写表单，不会抹掉用户输入。
 *
 * @param {object | null} initial 编辑态产品；新建态传 null
 * @param {boolean} busy 保存中
 * @param {'physical' | 'digital'} [kind] 二级页锚定的形态；缺省时按产品自身形态推断
 */
export function useProductFormState(initial, busy, kind) {
  const pinnedKind = kind === 'digital' || kind === 'physical' ? kind : undefined
  const base = useProductBaseFields(initial, pinnedKind)
  const mediaState = useMediaAndTags(initial)
  const strategyState = useStrategyState(initial, pinnedKind)

  const baselineKey = `${String(initial?.id ?? 'new')}:${String(initial?.updated_at ?? '')}`
  const [baselinePrint, setBaselinePrint] = useState(
    () => computeProductFingerprint(formSnapshotOf(initial, pinnedKind)),
  )

  /**
   * 按快照复位表单并把基线重锚到该快照。三条路径共用：首次挂载、
   * 切换到另一个产品、以及调用方主动 `resetInitial`。
   * @param {object | null | undefined} data
   */
  const applySnapshot = useCallback((data) => {
    const snapshot = formSnapshotOf(data, pinnedKind)
    base.resetBaseFields(snapshot)
    mediaState.setCategories(snapshot.categories)
    mediaState.setMedia(snapshot.media)
    mediaState.setCoverId(snapshot.coverId)
    strategyState.setStrategyOpen(snapshot.asDigital)
    strategyState.setStrategyTouched(snapshot.asDigital)
    strategyState.setStrategy(snapshot.strategy)
    setBaselinePrint(computeProductFingerprint(snapshot))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters 与 resetBaseFields 跨渲染稳定
  }, [])

  useEffect(() => {
    applySnapshot(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed reset
  }, [baselineKey, applySnapshot])

  const bundle = bundleFormReturn(base, mediaState, strategyState, busy)
  const currentFingerprint = computeProductFingerprint(bundle.state)

  return {
    ...bundle,
    /** 当前表单指纹（渲染期快照）。 */
    fingerprint: () => currentFingerprint,
    currentFingerprint,
    baselineFingerprint: baselinePrint,
    isDirty: isFingerprintDirty(currentFingerprint, baselinePrint),
    /** 用新数据复位表单并重锚基线。 */
    resetInitial: applySnapshot,
  }
}
