// 左栏构建器状态：档位、选项、brief、seed、模型与渠道。
//
// 来源：OmniMux/web/src/features/influencer/hooks/use-builder.ts（只读真源），行为 1:1。
// 本文件允许依赖 React（lib/* 不允许）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { filterSelectionForTier, trySelect } from '../lib/taxonomy.js'
import { randomizeSelection } from '../lib/randomize.js'

/**
 * @typedef {object} BuilderState
 * @property {string} tier
 * @property {import('../lib/types.js').Selection} selection
 * @property {string} brief
 * @property {string} seed
 * @property {string} imageUrl
 * @property {string} model
 * @property {string} group
 * @property {number|null} vendorId
 * @property {Set<string>} openGroups
 */

/**
 * @param {import('../lib/types.js').InfluencerTaxonomy|null} taxonomy
 */
export function useBuilder(taxonomy) {
  const [tier, setTier] = useState('total')
  const [selection, setSelection] = useState({})
  const [brief, setBrief] = useState('')
  const [seed, setSeed] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [model, setModel] = useState('')
  const [group, setGroup] = useState('')
  const [vendorId, setVendorId] = useState(null)
  const [openGroups, setOpenGroups] = useState(() => {
    if (taxonomy) return new Set(taxonomy.categories.map((c) => c.id))
    return new Set()
  })
  const initializedGroupsRef = useRef(false)

  // 默认全展开所有分类
  useEffect(() => {
    if (taxonomy && !initializedGroupsRef.current) {
      setOpenGroups(new Set(taxonomy.categories.map((c) => c.id)))
      initializedGroupsRef.current = true
    }
  }, [taxonomy])

  const pick = useCallback(
    (catId, optId) => {
      if (!taxonomy) return null
      const res = trySelect(taxonomy.categories, tier, selection, catId, optId)
      if (res.message) return res.message
      setSelection(res.selection)
      return null
    },
    [taxonomy, tier, selection]
  )

  const switchTier = useCallback(
    (next) => {
      if (!taxonomy) {
        setTier(next)
        return []
      }
      const { selection: filtered, dropped } = filterSelectionForTier(
        taxonomy.categories,
        next,
        selection
      )
      setTier(next)
      setSelection(filtered)
      return dropped
    },
    [taxonomy, selection]
  )

  const randomize = useCallback(() => {
    if (!taxonomy) return {}
    const sel = randomizeSelection(taxonomy, tier)
    setSelection(sel)
    return sel
  }, [taxonomy, tier])

  const reset = useCallback(() => {
    setSelection({})
    setBrief('')
    setSeed('')
    setImageUrl('')
  }, [])

  const toggleGroup = useCallback((catId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }, [])

  const applySheet = useCallback((params) => {
    if (params.tier) setTier(params.tier)
    if (params.selection) setSelection(params.selection)
    setBrief(params.brief ?? '')
    setSeed(params.seed ? String(params.seed) : '')
    setImageUrl(params.image_url ?? '')
    if (params.model) setModel(params.model)
    if (params.group) setGroup(params.group)
  }, [])

  /** @type {BuilderState} */
  const state = useMemo(
    () => ({
      tier,
      selection,
      brief,
      seed,
      imageUrl,
      model,
      group,
      vendorId,
      openGroups,
    }),
    [tier, selection, brief, seed, imageUrl, model, group, vendorId, openGroups]
  )

  return {
    state,
    pick,
    switchTier,
    randomize,
    reset,
    toggleGroup,
    applySheet,
    setBrief,
    setSeed,
    setImageUrl,
    setModel,
    setGroup,
    setVendorId,
  }
}
