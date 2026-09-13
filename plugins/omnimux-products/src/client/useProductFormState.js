import { useEffect, useState } from 'react'
import { emptyBrandStrategy, isDigitalProduct, isPlainStrategy, normalizeBrandStrategy } from '../brand-strategy.js'

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
  }
}

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
 * or unusable payload answers null so the dialog keeps what the user typed.
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

export function useStrategyState(initial) {
  const digitalAtOpen = isDigitalProduct(initial)
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
  const handleSelectPhysical = (setKind) => {
    setKind('physical')
    setStrategyOpen(false)
  }
  const handleSelectDigital = (setKind) => {
    setKind('digital')
    const persisted = isPlainStrategy(initial ? initial.brand_strategy : null)
    setStrategyOpen(persisted)
    if (persisted) setStrategyTouched(true)
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
    handleSelectPhysical,
    handleSelectDigital,
  }
}

export function useProductBaseFields(initial) {
  const [name, setName] = useState(initial ? str(initial.name) : '')
  const [kind, setKind] = useState(getInitialKind(initial))
  const [selling, setSelling] = useState(initial ? str(initial.selling_points) : '')
  const [audience, setAudience] = useState(initial ? str(initial.target_audience) : '')
  const [brand, setBrand] = useState(initial ? str(initial.brand) : '')
  const [features, setFeatures] = useState(initial ? str(initial.features) : '')
  const [price, setPrice] = useState(initial ? str(initial.price) : '')
  const [sku, setSku] = useState(initial ? str(initial.sku) : '')
  const [promotion, setPromotion] = useState(initial ? str(initial.promotion) : '')
  const [link, setLink] = useState(initial ? str(initial.link) : '')

  const resetBaseFields = (s) => {
    setName(s.name)
    setKind(s.kind)
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
       * digital answer also switches the kind and unfolds the six brand-strategy
       * modules the analysis filled, so the whole report is visible on arrival.
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
        const strategy = importedStrategyOf(data)
        if (strategy || importedKindOf(data) === 'digital') base.setters.setKind('digital')
        if (strategy) {
          strategyState.setStrategy(strategy)
          strategyState.setStrategyOpen(true)
          strategyState.setStrategyTouched(true)
        }
      },
      openStrategy: strategyState.openStrategy,
      patchStrategy: strategyState.patchStrategy,
      handleSelectPhysical: () => strategyState.handleSelectPhysical(base.setters.setKind),
      handleSelectDigital: () => strategyState.handleSelectDigital(base.setters.setKind),
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

export function useProductFormState(initial, busy) {
  const base = useProductBaseFields(initial)
  const mediaState = useMediaAndTags(initial)
  const strategyState = useStrategyState(initial)

  const initialId = initial ? initial.id : null
  const initialUpdatedAt = initial ? initial.updated_at : null

  useEffect(() => {
    if (!initial) return
    const s = extractProductSnapshot(initial)
    if (!s) return
    base.resetBaseFields(s)
    mediaState.setCategories(s.categories)
    mediaState.setMedia(s.media)
    mediaState.setCoverId(s.coverId)
    strategyState.setStrategyOpen(s.asDigital)
    strategyState.setStrategyTouched(s.asDigital)
    strategyState.setStrategy(s.strategy)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed reset
  }, [initialId, initialUpdatedAt])

  return bundleFormReturn(base, mediaState, strategyState, busy)
}
