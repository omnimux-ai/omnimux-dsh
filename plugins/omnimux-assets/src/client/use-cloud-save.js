/**
 * The save-to-local controller for the cloud source tab.
 *
 * One controller per stage rather than one per view: the cloud cards and the
 * preview modal share it, so a row saved from either entry point is marked in
 * both. `savedIds` keeps the second copy of a row out of the library and pins
 * the saved tick on the card.
 *
 * The save is single-flight *per asset id* — a repeat click on the same row
 * while its copy is in progress is dropped rather than racing that row into the
 * library, while a second card's save starts its own request instead of being
 * swallowed. A row already saved is never sent twice, and every failure lands
 * on one notice line that says nothing but `error.saveFailed`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createCloudSaveFlight } from './cloud-save-flight.js'
import { saveCloudAssetToLocal } from './cloud-save.js'

/** How long the "saved" notice stays on screen. */
export const CLOUD_NOTICE_MS = 2400

/**
 * @param {{ t: (key: string) => string }} options
 */
export function useCloudSave(options) {
  const { t } = options
  const [savedIds, setSavedIds] = useState(() => new Set())
  const [savingIds, setSavingIds] = useState(() => new Set())
  const [notice, setNotice] = useState('')
  const flightRef = useRef(/** @type {ReturnType<typeof createCloudSaveFlight> | null} */ (null))
  if (flightRef.current === null) flightRef.current = createCloudSaveFlight()

  /**
   * Save one row, reporting whether it landed and why it did not.
   * @param {any} asset
   * @returns {Promise<boolean>}
   */
  const save = useCallback(async (asset) => {
    const flight = flightRef.current
    const id = String(asset?.id ?? '')
    // A row with no id, a row already in flight and a row already saved are all
    // dropped here: the first has nothing to save, and the other two are visible
    // on the card itself (saving / saved), so the click is explained, not lost.
    if (flight.admit(id) !== 'accept') return false
    setSavingIds(new Set(flight.savingIds))
    setNotice('')
    let ok = false
    try {
      const result = await saveCloudAssetToLocal(asset)
      if (!result.ok) {
        // 宿主 message 是诊断信息，只进控制台：通知条上只允许那一句失败文案。
        console.error('[assets] cloud save failed', result.error)
        setNotice(t('error.saveFailed'))
        return false
      }
      ok = true
      setNotice(t('cloud.save.notice').replace('{name}', String(asset?.name ?? '')))
      return true
    } catch (caught) {
      console.error(caught)
      setNotice(t('error.saveFailed'))
      return false
    } finally {
      flight.settle(id, ok)
      setSavedIds(new Set(flight.savedIds))
      setSavingIds(new Set(flight.savingIds))
    }
  }, [t])

  useEffect(() => {
    if (notice === '') return undefined
    const timer = setTimeout(() => { setNotice('') }, CLOUD_NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [notice])

  return { savedIds, savingIds, notice, save }
}
