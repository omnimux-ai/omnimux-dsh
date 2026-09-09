import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { captureStageContracts, selectStages } from '../../../scripts/live-stage-contracts.mjs'
import { assertStageState } from '../../../scripts/live-stage-probe.mjs'

const require = createRequire(import.meta.url)
const root = new URL('../../../', import.meta.url).pathname

test('QA2 existing eight production Stage contracts retain strict sidebar validation', async () => {
  const targets = await captureStageContracts(root)
  assert.deepEqual(targets.map(target => target.stage), selectStages('all'))
  assert.equal(targets.length, 8)
  for (const target of targets) {
    assert.notEqual(target.adapter, 'community-tab')
    const state = { hasState: true, sessionId: 'qa', contextSessionId: 'qa', entryCount: 1,
      panelOpen: true, active: true, activeTab: target.tabId, openedTabs: [target.tabId],
      selected: [target.selector], contentCount: 1, contentLength: 30, loadingOnly: false, visibleErrors: 0 }
    assertStageState(state, target, 'qa')
    for (const patch of [{ entryCount: 0 }, { entryCount: 2 }, { selected: [] }, { selected: [target.selector, target.selector] },
      { sessionId: 'other' }, { contextSessionId: 'other' }, { hasState: false }, { panelOpen: false },
      { active: false }, { contentCount: 0 }, { loadingOnly: true }, { visibleErrors: 1 }]) {
      assert.throws(() => assertStageState({ ...state, ...patch }, target, 'qa'))
    }
  }
})

test('QA2 public closeTab session-only callback clears closed Studio scope, preserving other sessions', async () => {
  const bundled = await build({ entryPoints: [new URL('../src/client/index.js', import.meta.url).pathname], bundle: true,
    format: 'cjs', target: 'es2022', loader: { '.css': 'text', '.js': 'jsx', '.jsx': 'jsx' },
    external: ['react', 'react-dom', 'react-dom/*', '@deepseek-ai/*'], write: false })
  const dom = new JSDOM('<head></head><body></body>')
  const effects = []
  let tab
  try {
    const module = { exports: {} }
    vm.runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, require, document: dom.window.document,
      crypto, URL, structuredClone, AbortController, setTimeout, clearTimeout, console })
    module.exports.apply({ inject(_names, callback) { callback({
      effect(factory) { effects.push(factory()) },
      locale: { register() { return () => {} }, bind: () => key => key },
      betterSidebar: { registerTab(value) { tab = value; return () => {} } },
    }) } })
    const registry = tab.component({}).props.registry
    const closed = registry.getOrCreate({ cwd: '/a', sessionId: 'closed' })
    const other = registry.getOrCreate({ cwd: '/b', sessionId: 'other' })
    tab.onClose(tab, { sessionId: 'closed' })
    assert.equal(closed.disposed, true, 'public workbench closeTab passes sessionId only; closed draft must be cleared')
    assert.equal(other.disposed, false)
  } finally {
    for (const dispose of effects.reverse()) dispose()
    dom.window.close()
  }
})
