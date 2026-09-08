import { useSyncExternalStore } from 'react'

const EMPTY_SNAPSHOT = Object.freeze({ active: 'zh', revision: 0 })

/** Subscribe to the host-owned preference and dictionary revisions without a second locale store. */
export function useHostLocale(locale) {
  return useSyncExternalStore(
    (notify) => locale?.subscribe?.(notify) ?? (() => {}),
    () => locale?.getSnapshot?.() ?? locale?.getLocale?.() ?? EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT,
  )
}
