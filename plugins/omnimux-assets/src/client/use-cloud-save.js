/**
 * The save-to-local controller for the cloud source tab.
 *
 * One controller per stage rather than one per view. It serves the cloud preview
 * modal, which is now the only place a catalog row can be copied into the local
 * library — the grid cards themselves offer just 加入对话 — so `savedIds` marks
 * the modal's button as 已收藏 and keeps a second copy of the same row out.
 *
 * The save itself is single-flight — a second click while a copy is in progress
 * is dropped rather than racing the same catalog row into the library, and a row
 * already saved is never sent twice.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveCloudAssetToLocal } from './cloud-save.js'
import { errText } from './feed-helpers.js'

/** How long the "saved" notice stays on screen. */
export const CLOUD_NOTICE_MS = 2400

/**
 * @param {{ t: (key: string) => string }} options
 */
export function useCloudSave(options) {
  const { t } = options
  const [savedIds, setSavedIds] = useState(() => new Set())
  const [savingId, setSavingId] = useState('')
  const [notice, setNotice] = useState('')
  const savedRef = useRef(savedIds)
  const inFlightRef = useRef(false)

  useEffect(() => { savedRef.current = savedIds }, [savedIds])

  /**
   * Save one row, reporting whether it landed and why it did not.
   * @param {any} asset
   * @returns {Promise<boolean>}
   */
  const save = useCallback(async (asset) => {
    const id = String(asset?.id ?? '')
    if (id === '' || inFlightRef.current || savedRef.current.has(id)) return false
    inFlightRef.current = true
    setSavingId(id)
    setNotice('')
    try {
      const result = await saveCloudAssetToLocal(asset)
      if (!result.ok) {
        // `save-failed` means the Host answered without a readable reason.
        setNotice(result.error === 'save-failed' ? t('error.generic') : String(result.error))
        return false
      }
      setSavedIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
      setNotice(t('modal.save.notice').replace('{name}', String(asset?.name ?? '')))
      return true
    } catch (caught) {
      setNotice(errText(caught))
      return false
    } finally {
      inFlightRef.current = false
      setSavingId('')
    }
  }, [t])

  useEffect(() => {
    if (notice === '') return undefined
    const timer = setTimeout(() => { setNotice('') }, CLOUD_NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [notice])

  return { savedIds, savingId, notice, save }
}
