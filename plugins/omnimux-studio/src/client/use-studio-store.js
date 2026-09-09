import { createContext, useContext, useSyncExternalStore } from 'react'

export const StudioContext = createContext(null)
export function useStudioApi() {
  const store = useContext(StudioContext)
  if (!store) throw new Error('Studio provider is missing')
  return store
}
export function useStudioStore(selector = state => state) {
  const store = useStudioApi()
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return selector(state)
}
