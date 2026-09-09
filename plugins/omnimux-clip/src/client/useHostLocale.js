import { useSyncExternalStore } from 'react'

const EMPTY_SNAPSHOT = Object.freeze({ active: 'zh', revision: 0 })

let activeHostLocale = null

/** Subscribe to the host-owned preference and dictionary revisions without a second locale store. */
export function useHostLocale(locale) {
  if (locale) {
    activeHostLocale = locale
  }
  const effective = locale || activeHostLocale
  return useSyncExternalStore(
    (notify) => effective?.subscribe?.(notify) ?? (() => {}),
    () => effective?.getSnapshot?.() ?? effective?.getLocale?.() ?? EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT,
  )
}
