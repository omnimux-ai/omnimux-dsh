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
 * @param {{ enabled?: boolean }} [options]
 */
export function useCloudManifest(options = {}) {
  const { enabled = true } = options
  const [manifest, setManifest] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!force && loadedRef.current) return
    setLoading(true)
    try {
      const result = await cloudManifest({ force })
      if (!result.ok) {
        setError(String(result.body?.message ?? result.body?.error ?? 'manifest unavailable'))
        return
      }
      loadedRef.current = true
      setError('')
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
