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
    this.sessionScopes = new Map()
  }
  getOrCreate(scope) {
    const key = scopeKey(scope)
    if (key === null) return null
    if (!this.stores.has(key)) {
      this.stores.set(key, new StudioStore(key, this.adapterFactory()))
      if (!this.sessionScopes.has(scope.sessionId)) this.sessionScopes.set(scope.sessionId, new Set())
      this.sessionScopes.get(scope.sessionId).add(key)
    }
    return this.stores.get(key)
  }
  releaseView(key) { this.stores.get(key)?.setVisible(false) }
  /** Resolve public session-only closes only when the registered identity is unique. */
  closeScope(scope) {
    if (typeof scope?.sessionId !== 'string' || !scope.sessionId.trim()) return false
    if (scope.cwd !== undefined) {
      const key = scopeKey(scope)
      return key !== null && this.disposeScope(key)
    }
    const keys = this.sessionScopes.get(scope.sessionId)
    if (!keys || keys.size !== 1) return false
    const [key] = keys
    if (scope.repoRoot !== undefined && (scope.repoRoot ?? null) !== JSON.parse(key)[1]) return false
    return this.disposeScope(key)
  }
  disposeScope(key) {
    const store = this.stores.get(key)
    if (!store) return false
    const sessionId = JSON.parse(key)[2]
    const keys = this.sessionScopes.get(sessionId)
    this.stores.delete(key)
    keys.delete(key)
    if (!keys.size) this.sessionScopes.delete(sessionId)
    store.dispose()
    return true
  }
  disposeAll() {
    const stores = [...this.stores.values()]
    this.stores.clear()
    this.sessionScopes.clear()
    for (const store of stores) store.dispose()
  }
}
