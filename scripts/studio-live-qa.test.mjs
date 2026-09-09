import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { captureStageContract, selectStages } from './live-stage-contracts.mjs'
import { assertStageState } from './live-stage-probe.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
test('Studio is explicit-only and preserves the eight existing Stage targets', async () => {
  assert.deepEqual(selectStages('all'), ['accounts', 'workflow', 'assets', 'products', 'inspiration', 'publish', 'analytics', 'market'])
  assert.deepEqual(selectStages('studio'), ['studio'])
  assert.throws(() => selectStages('studio-typo'), /Unknown stage/)
  const target = await captureStageContract(root, 'studio')
  assert.equal(target.adapter, 'community-tab')
  assert.equal(target.tabId, 'omnimux-studio:workspace')
  assert.equal(target.selector, undefined)
  assert.equal(target.content, '[data-omnimux-studio].studio-root')
})
test('community Tab acceptance still rejects wrong, hidden, duplicate, loading and error content', () => {
  const target = { stage: 'studio', adapter: 'community-tab', tabId: 'omnimux-studio:workspace' }
  const state = { hasState: true, sessionId: 'qa', contextSessionId: 'qa', entryCount: 0, panelOpen: true, active: true, activeTab: target.tabId, openedTabs: [target.tabId], selected: [], contentCount: 1, contentLength: 30, loadingOnly: false, visibleErrors: 0 }
  assertStageState(state, target, 'qa')
  for (const patch of [{ activeTab: 'other' }, { openedTabs: [] }, { openedTabs: [target.tabId, target.tabId] }, { selected: ['[other]'] }, { contentCount: 0 }, { contentCount: 2 }, { contentLength: 0 }, { loadingOnly: true }, { visibleErrors: 1 }, { contextSessionId: 'other' }]) assert.throws(() => assertStageState({ ...state, ...patch }, target, 'qa'))
  assert.throws(() => assertStageState(state, { ...target, adapter: 'six-methods-and-disposer' }, 'qa'), /sidebar entry/)
})
