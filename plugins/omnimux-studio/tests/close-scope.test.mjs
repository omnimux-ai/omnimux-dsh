import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScopeRegistry } from '../src/client/scope-registry.js'

test('session-only close resolves a unique identity and reopening creates a fresh store', () => {
  const registry = new ScopeRegistry()
  const scope = { cwd: '/a', repoRoot: '/repo', sessionId: 'session' }
  const store = registry.getOrCreate(scope)
  assert.equal(registry.closeScope({ sessionId: 'session' }), true)
  assert.equal(store.disposed, true)
  assert.equal(registry.sessionScopes.size, 0)
  assert.equal(registry.closeScope({ sessionId: 'session' }), false)
  assert.notEqual(registry.getOrCreate(scope), store)
  registry.disposeAll()
  assert.equal(registry.sessionScopes.size, 0)
})

test('same session in different cwd is ambiguous; exact close preserves the other workspace', () => {
  const registry = new ScopeRegistry()
  const a = { cwd: '/a', sessionId: 'shared' }
  const b = { cwd: '/b', sessionId: 'shared' }
  const first = registry.getOrCreate(a)
  const second = registry.getOrCreate(b)
  assert.equal(registry.closeScope({ sessionId: 'shared' }), false)
  assert.equal(first.disposed, false)
  assert.equal(second.disposed, false)
  assert.equal(registry.closeScope({ cwd: '/missing', sessionId: 'shared' }), false)
  assert.equal(registry.closeScope(a), true)
  assert.equal(first.disposed, true)
  assert.equal(second.disposed, false)
  assert.equal(registry.closeScope({ sessionId: 'shared' }), true)
  assert.equal(second.disposed, true)
  registry.disposeAll()
})

test('repoRoot identity stays exact and malformed scopes never fall back or create shared stores', () => {
  const registry = new ScopeRegistry()
  const scope = { cwd: '/a', repoRoot: '/repo-a', sessionId: 'session' }
  const first = registry.getOrCreate(scope)
  for (const invalid of [undefined, {}, { sessionId: '' }, { cwd: '/a' },
    { sessionId: 'session', cwd: '' }, { sessionId: 'session', cwd: null },
    { sessionId: 'session', repoRoot: '/wrong' }, { cwd: '/a', sessionId: 'session' }]) {
    assert.equal(registry.closeScope(invalid), false)
    assert.equal(first.disposed, false)
  }
  assert.equal(registry.getOrCreate({ sessionId: 'session' }), null)
  const second = registry.getOrCreate({ ...scope, repoRoot: '/repo-b' })
  assert.equal(registry.closeScope({ sessionId: 'session' }), false)
  assert.equal(registry.closeScope(scope), true)
  assert.equal(second.disposed, false)
  registry.disposeAll()
})

test('identity indexes belong to each registration and are cleared on direct disposal', () => {
  const left = new ScopeRegistry()
  const right = new ScopeRegistry()
  const scope = { cwd: '/a', sessionId: 'shared' }
  const first = left.getOrCreate(scope)
  const second = right.getOrCreate(scope)
  assert.equal(left.closeScope({ sessionId: 'shared' }), true)
  assert.equal(first.disposed, true)
  assert.equal(second.disposed, false)
  assert.equal(right.disposeScope(second.scopeKey), true)
  assert.equal(second.disposed, true)
  assert.equal(right.sessionScopes.size, 0)
  right.disposeAll()
  assert.equal(right.sessionScopes.size, 0)
  assert.equal(right.closeScope({ sessionId: 'shared' }), false)
})
