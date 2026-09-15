/**
 * Loads the cloud assets manifest — the totals, category table, and
 * sub-category table the cloud tab renders its navigation from.
 *
 * The manifest is small and fetched once per mount; per-category pages are the
 * `useCloudAssetsFeed` hook's job.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { cloudManifest } from './api.js'

/**
 * 清单的模块级缓存。
 *
 * 组件内的 `loadedRef` 只挡得住同一个实例的重复加载；页签切走再切回来是重新挂载，
 * 没有这一层就每次都要再拉一遍。清单是纯字典数据、只读、体量小，跨挂载复用是安全的。
 * @type {{ value: any } | null}
 */
let manifestCache = null

/** 清空清单缓存（测试与显式刷新用）。 */
export function clearCloudManifestCache() {
  manifestCache = null
}

/**
 * @param {{ enabled?: boolean }} [options]
 */
export function useCloudManifest(options = {}) {
  const { enabled = true } = options
  const [manifest, setManifest] = useState(/** @type {any} */ (manifestCache?.value ?? null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!force && loadedRef.current) return
    // 缓存命中直接落状态，不发请求、也不再进加载态。
    if (!force && manifestCache !== null) {
      loadedRef.current = true
      setError('')
      setManifest(manifestCache.value)
      return
    }
    setLoading(true)
    try {
      const result = await cloudManifest({ force })
      if (!result.ok) {
        setError(String(result.body?.message ?? result.body?.error ?? 'manifest unavailable'))
        return
      }
      loadedRef.current = true
      setError('')
      manifestCache = { value: result.body }
      setManifest(result.body)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  return { manifest, loading, error, reload: load }
}
