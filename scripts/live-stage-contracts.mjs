import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

// Only published sidebar surfaces belong to `all`; canvas, clip, and forms have no
// independent visible sidebar row. Selectors identify content, not page chrome.
export const STAGE_CONTENT = Object.freeze({
  accounts: '.omnimux-accounts-stage-body',
  workflow: '.omnimux-workflow-library-body',
  assets: '.omnimux-assets-body',
  products: '.omnimux-products-body',
  inspiration: '.omnimux-inspiration-stage-body',
  publish: '.omnimux-publish-viewport',
  analytics: '.omnimux-analytics-stage-body',
  market: '.sh-plaza-body',
})

export const STAGE_STATUS = Object.freeze({
  analytics: {
    loading: '.omnimux-analytics-empty[data-code="loading"]',
    error: '.omnimux-analytics-empty[data-code="fetch_failed"], .omnimux-analytics-banner[data-code="network_error"]',
  },
  inspiration: { loading: '.omnimux-inspiration-skeleton' },
  market: { status: '.sh-mkt-status:not(.left)' },
})

export function selectStages(stage) {
  assert.ok(stage === 'all' || stage === 'studio' || Object.hasOwn(STAGE_CONTENT, stage), `Unknown stage: ${stage}`)
  return stage === 'all' ? Object.keys(STAGE_CONTENT) : [stage]
}

/** Execute the production client entry against controlled Host and kit seats.
 * No retired stage-store wrapper participates in this check.
 */
export async function captureStageContract(root, stage) {
  const plugin = `omnimux-${stage}`
  const hubRequire = createRequire(join(root, 'plugins/omnimux/package.json'))
  const require = createRequire(join(root, 'plugins', plugin, 'package.json'))
  const { build } = hubRequire('esbuild')
  const { JSDOM } = hubRequire('jsdom')
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div data-slot="root">
      <aside data-pane="sidebar">
        <button type="button" role="treeitem" aria-selected="false">QA session</button>
      </aside>
      <main data-slot="conversation"></main>
      <aside data-sidebar-right-panel="push"></aside>
    </div>
  </body></html>`, {
    url: 'http://127.0.0.1:45120/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const win = dom.window
  const sessionRow = win.document.querySelector('[role="treeitem"]')
  const conversation = win.document.querySelector('[data-slot="conversation"]')
  conversation.getBoundingClientRect = () => ({
    x: 280, y: 0, left: 280, top: 0, right: 700, bottom: 800, width: 420, height: 800,
  })
  const entries = []
  const slots = []
  const tabs = new Map()
  const disposers = []
  const stateListeners = new Set()
  const states = new Map()
  let sessionId = 'qa-session-a'
  const blank = () => ({ panelOpen: false, width: 640, activePane: 'main', splits: { kind: 'leaf', id: 'main', tabs: [] } })
  const state = () => {
    if (!states.has(sessionId)) states.set(sessionId, blank())
    return states.get(sessionId)
  }
  const emit = () => { for (const listener of stateListeners) listener() }
  const store = {
    getSnapshot: () => ({ sessionId, state: state() }),
    reduce(fn) { states.set(sessionId, fn(state())); emit() },
    subscribe(listener) { stateListeners.add(listener); return () => stateListeners.delete(listener) },
  }
  const sidebar = {
    getSnapshot: () => ({ sessionId, state: state() }),
    subscribeState: store.subscribe,
    registerTab(tab) { tabs.set(tab.id, tab); return () => tabs.delete(tab.id) },
    getTab: (id) => tabs.get(id),
    openTab(tab) {
      store.reduce((s) => ({ ...s, panelOpen: true, splits: {
        ...s.splits, active: tab.id,
        tabs: [...s.splits.tabs.filter((t) => t.id !== tab.id), tab],
      } }))
    },
    closeTab(id) {
      store.reduce((s) => {
        const remaining = s.splits.tabs.filter((tab) => tab.id !== id)
        return { ...s, splits: { ...s.splits, tabs: remaining, active: remaining.at(-1)?.id } }
      })
    },
  }
  const sidebarRight = {
    isExpanded: () => state().panelOpen === true,
    active: () => {
      const kind = state().splits.active
      return kind ? { kind } : null
    },
  }
  const ctx = {
    betterSidebar: sidebar,
    sidebarRight,
    sessions: { list: { getSnapshot: () => ({ current: sessionId }), subscribe: store.subscribe } },
    workspaces: { list: { getSnapshot: () => ({ workspaces: [] }), subscribe: () => () => {} } },
    layout: { closeDetails() {}, openDetails() {} },
    locale: { register: () => () => {}, bind: () => (key) => key, subscribe: () => () => {}, getSnapshot: () => 'en' },
    slots: {
      inject(_name, fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
      register(options, component) { slots.push({ options, component }); return () => {} },
    },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
    inject(_names, fn) { return fn(ctx) },
  }
  const sidebarRows = []
  win.__omnimuxSidebar = { register(row) {
    const record = { ...row, element: row.create() }
    sidebarRows.push(record)
    win.document.body.append(record.element)
    return () => { sidebarRows.splice(sidebarRows.indexOf(record), 1); record.element.remove() }
  } }
  const react = require('react')
  const marketReact = { ...react, useState: (value) => [value, () => {}], useEffect() {}, useLayoutEffect() {} }
  win.require = (name) => name === 'react' && stage === 'market' ? marketReact : name === 'dsh-ui-kit'
    ? { createSidebarEntry(options) { entries.push(options); return () => {} } }
    : name === '@deepseek-ai/dsh-client-ui-primitives' ? {} : require(name)
  const compile = async (entry) => (await build({
    absWorkingDir: root, entryPoints: [entry], bundle: true, packages: 'external',
    platform: 'browser', format: 'cjs', jsx: 'automatic', write: false, logLevel: 'silent',
    ...(stage === 'studio' ? { loader: { '.css': 'text', '.js': 'jsx' } } : {}),
  })).outputFiles[0].text
  const evaluate = (code) => {
    win.module = { exports: {} }
    win.eval(code)
    return win.module.exports
  }
  try {
    const wb = evaluate(await compile('plugins/omnimux/src/client/workbench.js'))
    const api = wb.installWorkbenchGlobal(win)
    api.bind(ctx)
    api.attachStore(store, { sessionId })
    disposers.push(wb.installSidebarActivation({ document: win.document }))
    const settle = async () => {
      for (let i = 0; i < 12; i++) await Promise.resolve()
      api.syncActivation()
      for (let i = 0; i < 4; i++) await Promise.resolve()
    }
    const setSessionSelected = async (selected) => {
      sessionRow.setAttribute('aria-selected', selected ? 'true' : 'false')
      await settle()
    }
    if (stage === 'market') {
      execFileSync(process.execPath, ['scripts/concat-client.mjs'], { cwd: join(root, 'plugins', plugin), stdio: 'pipe' })
      let client
      win.__ModuleLoader__ = { load: ({ factory }) => { client = factory(win.require) } }
      win.eval(readFileSync(join(root, 'plugins', plugin, 'lib/client.js'), 'utf8'))
      client.apply(ctx)
      // Capture the production coordinator registration and click its real DOM
      // entry. PR #785 places this sole row between projects (4) and publish (4.2).
      assert.equal(slots.filter((slot) => slot.options.name === 'sidebar.footer.action').length, 0, 'Market must not retain a footer action')
      assert.equal(sidebarRows.length, 1, 'Market must register one sidebar row')
      const { id, rank, element: action } = sidebarRows[0]
      assert.equal(id, 'omnimux-market-entry')
      assert.equal(rank, 4.1, 'Market must sit directly below projects and above publish')
      assert.equal(action.tagName, 'BUTTON')
      const datasetKey = 'data-omnimux-market-entry'
      assert.ok(action.hasAttribute(datasetKey), 'Market is missing its sidebar marker')
      assert.equal(win.document.querySelectorAll(`[${datasetKey}]`).length, 1)
      const lifecycle = JSON.parse(readFileSync(join(root, 'plugins/omnimux/src/plugin-lifecycle.json'), 'utf8'))
      assert.equal(Object.hasOwn(lifecycle, plugin), false, 'Market must remain available in formal releases')
      action.click()
      await settle()
      const tabId = state().splits.active
      assert.equal(tabId, 'omnimux-market:plaza')
      assert.ok(tabs.has(tabId) && api.isActive(tabId), 'Market action must activate its registered Tab')
      assert.equal(sidebarRight.isExpanded(), true, 'Market must expand the official right panel')
      assert.equal(sidebarRight.active()?.kind, tabId, 'Market must be the official current right Tab')
      assert.equal(api.getFocus(), 'split', 'Market sidebar navigation must keep the conversation visible')
      assert.equal(tabs.get(tabId).single, true)
      assert.equal(tabs.get(tabId).hidden, false)
      assert.equal(action.dataset.active, 'true')
      assert.ok(!win.document.documentElement.dataset.dshProductStage, 'Market must not claim an overlay')
      await setSessionSelected(true)
      assert.equal(api.getRailVerdict().winner, 'session', 'Selected conversation must own the single activation slot')
      assert.equal(api.isActive(tabId), false, 'Market row must yield to the selected conversation')
      assert.notEqual(action.dataset.active, 'true')
      assert.equal(sidebarRight.active()?.kind, tabId, 'Session precedence must not close the current right Tab')
      await setSessionSelected(false)
      assert.ok(api.isActive(tabId), 'Market row must recover when the conversation releases the activation slot')
      assert.equal(action.dataset.active, 'true')
      action.click()
      await settle()
      assert.equal(state().splits.tabs.filter((tab) => tab.id === tabId).length, 1, 'Market must not duplicate its Tab')
      api.closePanel()
      await settle()
      assert.equal(api.isActive(tabId), false)
      assert.equal(sidebarRight.isExpanded(), false)
      assert.notEqual(action.dataset.active, 'true')
      action.click()
      await settle()
      assert.ok(api.isActive(tabId), 'Market must reopen its collapsed panel')
      assert.equal(api.getFocus(), 'split', 'Market reopen must preserve split focus')
      sessionId = 'qa-session-b'
      emit()
      await settle()
      assert.equal(api.isActive(tabId), false, 'Market must not leak across sessions')
      assert.equal(sidebarRight.active(), null, 'Market Tab must be absent from session B')
      sessionId = 'qa-session-a'
      emit()
      await settle()
      assert.ok(api.isActive(tabId), 'Market must restore session A')
      assert.equal(sidebarRight.active()?.kind, tabId, 'Market must restore the official current Tab in session A')
      for (const dispose of disposers.splice(0).reverse()) dispose()
      assert.equal(sidebarRows.length, 0, 'Market must dispose its coordinator registration')
      assert.equal(win.document.querySelectorAll(`[${datasetKey}]`).length, 0)
      assert.equal(tabs.has(tabId), false, 'Market must dispose its registered Tab')
      const i18n = readFileSync(join(root, 'plugins', plugin, 'src/client/i18n.js'), 'utf8')
      const allowedStatusTexts = evaluate(`module.exports = (() => {
        const React = require('react'); ${i18n}
        return [ZH, EN].flatMap(dict => [dict['mkt.empty'], dict['search.empty'], dict['expert.empty']]);
      })()`)
      assert.ok(allowedStatusTexts.length === 6 && allowedStatusTexts.every((text) => typeof text === 'string' && text.trim()), 'Market empty-state translations are missing')
      return {
        stage, plugin, selector: `[${datasetKey}]`, tabId, content: STAGE_CONTENT[stage],
        ...STAGE_STATUS[stage], allowedStatusTexts, adapter: 'sidebar-coordinator', rank,
        defaultFocus: 'split', activationModel: 'official-right-tab-with-session-precedence',
      }
    }
    const hostStyles = [...win.document.head.querySelectorAll('style')]
    const client = evaluate(await compile(`plugins/${plugin}/src/client/index.js`))
    client.apply(ctx)
    if (stage === 'studio') {
      const tabId = 'omnimux-studio:workspace'
      const tab = tabs.get(tabId)
      assert.ok(tab && tab.single === true && tab.hidden === false && typeof tab.component === 'function', 'Studio must register its visible single community Tab')
      assert.equal(entries.length, 0, 'Studio must not manufacture a sidebar Stage')
      await api.open({ tabId, title: tab.title() })
      await settle()
      assert.ok(api.isActive(tabId), 'Studio must open through the public workbench')
      api.closePanel()
      await settle()
      assert.equal(api.isActive(tabId), false)
      await api.open({ tabId, title: tab.title() })
      await settle()
      assert.ok(api.isActive(tabId), 'Studio must restore through the public workbench')
      assert.equal(state().splits.tabs.filter(item => item.id === tabId).length, 1)
      for (const dispose of disposers.splice(0).reverse()) dispose()
      assert.equal(tabs.has(tabId), false, 'Studio Tab disposer must unregister')
      assert.equal(win.document.querySelectorAll('#omnimux-studio-styles').length, 0, 'Studio must release its stylesheet')
      assert.ok(hostStyles.every(style => style.isConnected), 'Studio must preserve Host styles')
      return { stage, plugin, tabId, content: '[data-omnimux-studio].studio-root', adapter: 'community-tab' }
    }
    assert.equal(entries.length, 1, `${plugin}: expected one actual kit sidebar entry`)
    const { stageStore: adapter, datasetKey } = entries[0]
    assert.match(datasetKey, /^data-[\w-]+-entry$/)
    for (const method of ['getSnapshot', 'subscribe', 'open', 'close', 'set', 'readBox']) {
      assert.equal(typeof adapter?.[method], 'function', `${plugin}: missing ${method}`)
    }
    assert.equal(adapter.getSnapshot(), false)
    let notifications = 0
    const unsubscribe = adapter.subscribe(() => notifications++)
    assert.equal(typeof unsubscribe, 'function', `${plugin}: subscribe must return disposer`)
    adapter.open()
    await settle()
    assert.equal(adapter.getSnapshot(), true, `${plugin}: open must activate the registered Tab`)
    assert.equal(api.getFocus(), 'split', `${plugin}: sidebar navigation must keep the conversation visible`)
    const tabId = state().splits.active
    assert.ok(tabs.has(tabId), `${plugin}: opened an unregistered Tab ${tabId}`)
    assert.equal(sidebarRight.isExpanded(), true, `${plugin}: official right panel must be expanded`)
    assert.equal(sidebarRight.active()?.kind, tabId, `${plugin}: official right panel must expose the current Tab`)
    assert.ok(notifications > 0, `${plugin}: subscription did not observe open`)
    assert.ok(!win.document.documentElement.dataset.dshProductStage, 'sidebar must not claim an overlay')
    await setSessionSelected(true)
    assert.equal(api.getRailVerdict().winner, 'session', `${plugin}: selected conversation must own the single activation slot`)
    assert.equal(adapter.getSnapshot(), false, `${plugin}: sidebar row must yield to the selected conversation`)
    assert.equal(sidebarRight.active()?.kind, tabId, `${plugin}: session precedence must not close the current right Tab`)
    assert.equal(state().splits.tabs.filter((tab) => tab.id === tabId).length, 1, `${plugin}: session precedence must not duplicate its Tab`)
    await setSessionSelected(false)
    assert.equal(adapter.getSnapshot(), true, `${plugin}: sidebar row must recover when the conversation releases the activation slot`)
    api.closePanel()
    await settle()
    assert.equal(adapter.getSnapshot(), false)
    assert.equal(sidebarRight.isExpanded(), false, `${plugin}: close must collapse the official right panel`)
    adapter.open()
    await settle()
    assert.equal(adapter.getSnapshot(), true, `${plugin}: explicit open must restore a collapsed panel`)
    assert.equal(api.getFocus(), 'split', `${plugin}: sidebar reopen must restore split focus`)
    api.setFocus('split')
    adapter.open()
    await settle()
    assert.equal(api.getFocus(), 'split', `${plugin}: sidebar navigation must preserve a split preference`)
    api.setFocus('split')
    api.closePanel()
    await settle()
    adapter.open()
    await settle()
    assert.equal(api.getFocus(), 'split', `${plugin}: sidebar reopen must preserve a split preference`)
    assert.equal(state().splits.tabs.filter((tab) => tab.id === tabId).length, 1, `${plugin}: sidebar navigation must not duplicate its Tab`)
    for (const mode of ['split', 'gui']) {
      api.setFocus(mode)
      if (mode === 'split') {
        const defaultWidth = state().width
        store.reduce((s) => ({ ...s, width: 480 }))
        assert.equal(state().width, 480, `${plugin}: custom split width must be legal`)
        assert.notEqual(state().width, defaultWidth, `${plugin}: split restoration must test a non-default width`)
      }
      const width = state().width
      api.closePanel()
      await settle()
      assert.equal(api.getFocus(), 'chat')
      api.detachStore(store)
      api.attachStore(store)
      assert.equal(state().panelOpen, false, `${plugin}: attaching a closed session must not reopen it`)
      // Ordinary opens restore the current tab's remembered split/gui preference.
      assert.equal(await api.open({ tabId }), true, `${plugin}: ordinary reopen must succeed`)
      await settle()
      assert.equal(api.getFocus(), mode, `${plugin}: reopen must preserve ${mode} preference`)
      assert.equal(state().width, width, `${plugin}: reopen must preserve ${mode} width`)
    }
    const box = adapter.readBox()
    for (const key of ['top', 'left', 'width', 'height']) assert.ok(Number.isFinite(box[key]), `${plugin}: invalid readBox.${key}`)
    api.setFocus('split')
    adapter.set(false)
    await settle()
    assert.equal(adapter.getSnapshot(), false)
    adapter.set(true)
    await settle()
    assert.equal(adapter.getSnapshot(), true)
    assert.equal(api.getFocus(), 'split', `${plugin}: sidebar set(true) must preserve split focus`)
    assert.ok(!win.document.documentElement.dataset.dshProductStage, 'sidebar reopen must not claim an overlay')
    sessionId = 'qa-session-b'
    emit()
    await settle()
    assert.equal(adapter.getSnapshot(), false, `${plugin}: active Tab leaked across sessions`)
    assert.equal(sidebarRight.active(), null, `${plugin}: official current Tab leaked across sessions`)
    assert.equal(api.getUiContext().sessionId, sessionId)
    assert.equal(api.getUiContext().surface.openedTabs.length, 0, `${plugin}: viewport leaked across sessions`)
    sessionId = 'qa-session-a'
    emit()
    await settle()
    assert.equal(adapter.getSnapshot(), true, `${plugin}: failed to restore session A`)
    assert.equal(sidebarRight.active()?.kind, tabId, `${plugin}: failed to restore the official current Tab in session A`)
    unsubscribe()
    const afterUnsubscribe = notifications
    adapter.close()
    await settle()
    assert.equal(adapter.getSnapshot(), false)
    assert.equal(notifications, afterUnsubscribe, `${plugin}: listener survived unsubscribe`)
    return {
      stage, plugin, selector: `[${datasetKey}]`, tabId, content: STAGE_CONTENT[stage],
      ...STAGE_STATUS[stage], adapter: 'six-methods-and-disposer', defaultFocus: 'split',
      activationModel: 'official-right-tab-with-session-precedence',
    }
  } finally {
    for (const dispose of disposers.reverse()) dispose()
    win.close()
  }
}

export async function captureStageContracts(root, stages = Object.keys(STAGE_CONTENT)) {
  assert.ok(stages.length > 0, 'Zero stage targets')
  const targets = []
  for (const stage of stages) targets.push(await captureStageContract(root, stage))
  return targets
}
