import { StudioStore } from './studio-store.js'
import { MockAdapter } from './mock-adapter.js'

export function scopeKey(scope) {
  if (typeof scope?.cwd !== 'string' || !scope.cwd.trim() || typeof scope.sessionId !== 'string' || !scope.sessionId.trim()) return null
  return JSON.stringify([scope.cwd, scope.repoRoot ?? null, scope.sessionId])
}
/** Registry belongs to one dependency injection scope, never a module singleton. */
export class ScopeRegistry {
  constructor(adapterFactory = () => new MockAdapter()) {
    this.adapterFactory = adapterFactory
    this.stores = new Map()
  }
  getOrCreate(scope) {
    const key = scopeKey(scope)
    if (key === null) return null
    if (!this.stores.has(key)) this.stores.set(key, new StudioStore(key, this.adapterFactory()))
    return this.stores.get(key)
  }
  releaseView(key) { this.stores.get(key)?.setVisible(false) }
  disposeScope(key) { this.stores.get(key)?.dispose(); this.stores.delete(key) }
  disposeAll() { for (const store of this.stores.values()) store.dispose(); this.stores.clear() }
}
