import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import {
  ENTRY_SELECTOR,
  GOOGLE_VIDS_SIDEBAR_I18N,
  mountSidebarEntry,
} from './sidebar-entry.js'

const tempFile = new URL(`.test-index-${Date.now()}.mjs`, import.meta.url)
await build({
  entryPoints: [fileURLToPath(new URL('./index.js', import.meta.url))],
  outfile: fileURLToPath(tempFile),
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
})
const { apply, GoogleVidsStage } = await import(tempFile.href)
await rm(fileURLToPath(tempFile)).catch(() => {})

const previousWindow = globalThis.window
const previousDocument = globalThis.document
const previousCustomEvent = globalThis.CustomEvent

afterEach(() => {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow

  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument

  if (previousCustomEvent === undefined) delete globalThis.CustomEvent
  else globalThis.CustomEvent = previousCustomEvent
})

class MockElement {
  constructor(tag, namespaceURI = null) {
    this.tagName = tag.toUpperCase()
    this.namespaceURI = namespaceURI
    this.type = ''
    this.className = ''
    this.title = ''
    this.attributes = {}
    this.children = []
    this.dataset = {}
    this.listeners = {}
    this._textContent = ''
    this.innerHTML = ''
  }

  setAttribute(key, value) { this.attributes[key] = String(value) }
  getAttribute(key) { return this.attributes[key] }
  hasAttribute(key) { return key in this.attributes }
  append(...items) { this.children.push(...items) }
  appendChild(child) { this.children.push(child); return child }
  set textContent(value) { this._textContent = value }
  get textContent() { return this._textContent }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1)
      return this._find((el) => el.className && el.className.split(/\s+/).includes(cls))
    }
    if (selector.startsWith('[')) {
      const attr = selector.replace(/[[\]]/g, '')
      return this._find((el) => el.hasAttribute(attr))
    }
    const tag = selector.toUpperCase()
    return this._find((el) => el.tagName === tag)
  }

  _find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child
      const nested = child._find?.(predicate)
      if (nested) return nested
    }
    return null
  }

  addEventListener(event, listener) { this.listeners[event] = listener }
  removeEventListener(event, listener) {
    if (this.listeners[event] === listener) delete this.listeners[event]
  }
  click() { return this.listeners.click?.() }
  remove() { this.removed = true }
}

function setupMockEnvironment(stageId = '') {
  globalThis.document = {
    documentElement: { dataset: stageId ? { dshProductStage: stageId } : {} },
    createElement(tag) { return new MockElement(tag) },
    createElementNS(namespace, tag) { return new MockElement(tag, namespace) },
  }
}

function setupCoordinator() {
  let registeredRow = null
  let unregisterCalls = 0
  globalThis.window = {
    listeners: {},
    addEventListener(event, listener) { this.listeners[event] = listener },
    removeEventListener(event, listener) {
      if (this.listeners[event] === listener) delete this.listeners[event]
    },
    dispatchEvent(event) { this.listeners[event.type]?.(event) },
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { unregisterCalls += 1; registeredRow = null }
      },
    },
  }
  return {
    get row() { return registeredRow },
    get unregisterCalls() { return unregisterCalls },
  }
}

function mountEntry(t, locale = { current: 'zh' }) {
  const coordinator = setupCoordinator()
  const unmount = mountSidebarEntry(t, locale)
  assert.ok(coordinator.row, 'entry must register with the sidebar coordinator')
  return { coordinator, unmount, entry: coordinator.row.create() }
}

test('exports the entry selector and exact approved Chinese and English copy', () => {
  assert.equal(ENTRY_SELECTOR, '[data-omnimux-google-vids-entry]')
  assert.deepEqual(GOOGLE_VIDS_SIDEBAR_I18N.zh, {
    'sidebar.google_vids.nav': 'Google Vids',
    'sidebar.google_vids.badge': '内测版',
    'sidebar.google_vids.tooltip': 'Google Vids · 内测版',
    'workbench.google_vids.tab': 'Google Vids',
  })
  assert.deepEqual(GOOGLE_VIDS_SIDEBAR_I18N.en, {
    'sidebar.google_vids.nav': 'Google Vids',
    'sidebar.google_vids.badge': 'Alpha',
    'sidebar.google_vids.tooltip': 'Google Vids · Alpha',
    'workbench.google_vids.tab': 'Google Vids',
  })
})

test('sidebar row preserves its approved DOM, SVG, styles, and copy without legacy tab markers', () => {
  setupMockEnvironment()
  const { coordinator, entry, unmount } = mountEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N.zh[key] || key)

  assert.equal(coordinator.row.id, 'omnimux-video-google-vids-entry')
  assert.equal(coordinator.row.rank, 7.5)
  assert.equal(coordinator.row.styleId, 'omnimux-video-google-vids-styles')
  assert.match(coordinator.row.styles, /height: 32px/)
  assert.match(coordinator.row.styles, /gap: 6px/)
  assert.match(coordinator.row.styles, /border-radius: 8px/)
  assert.match(coordinator.row.styles, /font-size: 14px; line-height: 20px/)
  assert.match(coordinator.row.styles, /font-size: 12px; line-height: 16px/)
  assert.match(coordinator.row.styles, /\[data-sidebar-collapsed\]/)

  assert.equal(entry.tagName, 'BUTTON')
  assert.ok(entry.hasAttribute('data-omnimux-google-vids-entry'))
  assert.equal(entry.hasAttribute('data-tab-id'), false)
  assert.ok(entry.className.includes('omnimux-sidebar-nav-entry'))
  assert.ok(entry.className.includes('omnimux-google-vids-entry'))
  assert.equal(entry.children.length, 3)
  const [icon, label, badge] = entry.children
  assert.equal(icon.getAttribute('aria-hidden'), 'true')
  const svg = icon.querySelector('svg')
  assert.ok(svg)
  assert.equal(svg.getAttribute('viewBox'), '0 0 16 16')
  assert.equal(svg.getAttribute('width'), '14')
  assert.equal(svg.getAttribute('height'), '14')
  assert.equal(svg.getAttribute('role'), 'presentation')
  assert.equal(svg.children.length, 2)
  assert.equal(label.textContent, 'Google Vids')
  assert.equal(badge.textContent, '内测版')
  assert.equal(badge.getAttribute('aria-label'), '内测版')
  assert.equal(entry.title, 'Google Vids · 内测版')
  assert.equal(entry.getAttribute('aria-label'), 'Google Vids · 内测版')
  assert.doesNotMatch(`${entry.title} ${label.textContent} ${badge.textContent}`, /[💎✨🔥🚀]|高画质|极速|推荐|全新上线/)

  unmount()
  assert.equal(coordinator.unregisterCalls, 1)
  assert.equal(entry.removed, true)
})

test('locale subscriptions update the approved entry copy and detach on unmount', () => {
  setupMockEnvironment()
  let language = 'zh'
  let localeListener = null
  let localeUnsubscribeCalls = 0
  const locale = {
    get current() { return language },
    subscribe(listener) {
      localeListener = listener
      return () => { localeUnsubscribeCalls += 1; localeListener = null }
    },
  }
  const { entry, unmount } = mountEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N[language][key] || key, locale)
  const label = entry.querySelector('.omnimux-sidebar-nav-entry-label')
  const badge = entry.querySelector('.omnimux-sidebar-alpha-badge')
  assert.equal(label.textContent, 'Google Vids')
  assert.equal(badge.textContent, '内测版')

  language = 'en'
  localeListener()
  assert.equal(label.textContent, 'Google Vids')
  assert.equal(badge.textContent, 'Alpha')
  assert.equal(badge.getAttribute('aria-label'), 'Alpha')
  assert.equal(entry.title, 'Google Vids · Alpha')
  assert.equal(entry.getAttribute('aria-label'), 'Google Vids · Alpha')

  unmount()
  assert.equal(localeUnsubscribeCalls, 1)
  assert.equal(localeListener, null)
})

test('sidebar coordinator can become ready after mount and unregisters exactly once on unmount', () => {
  setupMockEnvironment()
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval
  let pendingAttempt = null
  let intervalCleared = false
  globalThis.setInterval = (callback, delay) => {
    assert.equal(delay, 500)
    pendingAttempt = callback
    return 271
  }
  globalThis.clearInterval = (id) => {
    if (id === 271) intervalCleared = true
  }

  try {
    globalThis.window = {}
    const unmount = mountSidebarEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N.zh[key] || key)
    assert.equal(typeof pendingAttempt, 'function')

    let registerCalls = 0
    let unregisterCalls = 0
    window.__omnimuxSidebar = {
      register() {
        registerCalls += 1
        return () => { unregisterCalls += 1 }
      },
    }
    pendingAttempt()
    assert.equal(registerCalls, 1)
    assert.equal(intervalCleared, true, 'successful late registration stops retry interval')

    unmount()
    assert.equal(unregisterCalls, 1)
  } finally {
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
  }
})

test('active state is projected only from the product-stage DOM marker and stage event', () => {
  setupMockEnvironment()
  const { entry, unmount } = mountEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N.zh[key] || key)
  assert.equal(entry.dataset.active, undefined)

  document.documentElement.dataset.dshProductStage = 'omnimux-vids'
  window.dispatchEvent({ type: 'dsh-product-stage' })
  assert.equal(entry.dataset.active, 'true')

  document.documentElement.dataset.dshProductStage = 'another-stage'
  window.dispatchEvent({ type: 'dsh-product-stage' })
  assert.equal(entry.dataset.active, undefined)

  document.documentElement.dataset.dshProductStage = 'omnimux-vids'
  window.dispatchEvent({ type: 'dsh-product-stage' })
  assert.equal(entry.dataset.active, 'true')
  unmount()
  assert.equal(window.listeners['dsh-product-stage'], undefined)
})

test('Issue #3196: pending Clip open claims no stage and claims none after it settles', async () => {
  setupMockEnvironment()
  const { entry, unmount } = mountEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N.zh[key] || key)
  const calls = []
  let resolveOpen
  const openPromise = new Promise((resolve) => { resolveOpen = resolve })
  window.__omnimuxStage = { claim(id) { calls.push(['claim', id]) } }
  window.__omnimuxWorkbench = {
    open(options) { calls.push(['open', options]); return openPromise },
    setFocus(mode) { calls.push(['focus', mode]) },
  }

  let clickSettled = false
  const clickPromise = entry.click().then(() => { clickSettled = true })
  await Promise.resolve()
  assert.equal(clickSettled, false, 'click handler must remain pending until open settles')
  assert.deepEqual(calls, [[
    'open',
    { tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' },
  ]])

  resolveOpen(true)
  await clickPromise
  assert.deepEqual(calls, [
    ['open', { tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' }],
  ], 'opening the editor is the whole contract: no stage is claimed afterwards')
  unmount()
})

test('Issue #2721: false, non-true, synchronous throw, and rejection never claim or set focus', async () => {
  const failures = [
    { name: 'false', open: () => false },
    { name: 'truthy non-true', open: () => 1 },
    { name: 'synchronous throw', open: () => { throw new Error('sync open failure') } },
    { name: 'promise rejection', open: () => Promise.reject(new Error('async open failure')) },
  ]

  for (const failure of failures) {
    setupMockEnvironment()
    const { entry, unmount } = mountEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N.zh[key] || key)
    const calls = []
    window.__omnimuxStage = { claim(id) { calls.push(['claim', id]) } }
    window.__omnimuxWorkbench = {
      open(options) { calls.push(['open', options]); return failure.open() },
      setFocus(mode) { calls.push(['focus', mode]) },
    }

    await entry.click()
    assert.deepEqual(calls, [
      ['open', { tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' }],
    ], `${failure.name} must not claim or independently set focus`)
    unmount()
  }
})

test('Issue #3196: a missing Workbench or open API opens nothing; a missing Stage API still opens the editor', async () => {
  const openCall = ['open', { tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' }]
  for (const scenario of [
    { name: 'missing Workbench', workbench: undefined, stage: { claim() {} }, expected: [] },
    { name: 'missing open API', workbench: { setFocus() {} }, stage: { claim() {} }, expected: [] },
    { name: 'missing Stage', workbench: { open() {} }, stage: undefined, expected: [openCall] },
    { name: 'missing claim API', workbench: { open() {} }, stage: {}, expected: [openCall] },
  ]) {
    setupMockEnvironment()
    const { entry, unmount } = mountEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N.zh[key] || key)
    const calls = []
    window.__omnimuxStage = scenario.stage && {
      ...scenario.stage,
      claim(id) { calls.push(['claim', id]) },
    }
    window.__omnimuxWorkbench = scenario.workbench && {
      ...scenario.workbench,
      ...(scenario.name === 'missing open API' ? {} : {
        open(options) { calls.push(['open', options]); return true },
      }),
      setFocus(mode) { calls.push(['focus', mode]) },
    }
    if (scenario.name === 'missing claim API') delete window.__omnimuxStage.claim

    await entry.click()
    assert.deepEqual(calls, scenario.expected, `${scenario.name} must leave state unchanged`)
    unmount()
  }
})

test('Issue #3196: unmount while Clip open is pending leaves no later stage write behind', async () => {
  setupMockEnvironment()
  const { entry, unmount } = mountEntry((key) => GOOGLE_VIDS_SIDEBAR_I18N.zh[key] || key)
  const calls = []
  let resolveOpen
  window.__omnimuxStage = { claim(id) { calls.push(['claim', id]) } }
  window.__omnimuxWorkbench = {
    open(options) {
      calls.push(['open', options])
      return new Promise((resolve) => { resolveOpen = resolve })
    },
  }

  const clickPromise = entry.click()
  assert.equal(calls.length, 1)
  unmount()
  resolveOpen(true)
  await clickPromise
  assert.deepEqual(calls, [
    ['open', { tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' }],
  ])
})

test('Issue #3196: the client keeps the Clip betterSidebar binding and cleanup without registering a slot', () => {
  setupMockEnvironment()
  globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail } }
  const manifest = JSON.parse(readFileSync(new URL('../../dsh.manifest.json', import.meta.url), 'utf8'))
  const slots = []
  const slotCleanup = () => {}
  const sidebarCleanup = () => {}
  const boundPatches = []
  const unbindings = []
  const injections = []
  let disposeListener = null
  globalThis.window = {}
  const hostWorkbench = {
    bind(patch) { boundPatches.push(patch) },
    unbind(patch) { unbindings.push(patch) },
  }

  const dispose = apply({
    locale: { register() {}, bind: () => (key) => key },
    slots: {
      inject(target, register) { slots.push({ target, register }); return slotCleanup },
      register(descriptor, component) { slots.push({ descriptor, component }); return () => {} },
    },
    inject(dependencies, callback) {
      injections.push(dependencies)
      callback({ betterSidebar: { registerTab() { throw new Error('Vids must not register a tab') } } })
      return sidebarCleanup
    },
    on(event, listener) { if (event === 'dispose') disposeListener = listener },
  })

  assert.equal(typeof GoogleVidsStage, 'function')
  assert.equal(manifest.capabilities.slots, undefined, 'no host slot is declared once the editor hosts the panel')
  assert.ok(injections.some((dep) => dep.includes('betterSidebar')))
  assert.deepEqual(slots, [], 'the client must not register into host slots any more')
  assert.equal(typeof window.__omnimuxWorkbench, 'undefined', 'Workbench binding requires the host API to exist')

  window.__omnimuxWorkbench = hostWorkbench
  const bindCleanup = apply({
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ['betterSidebar'])
      callback({ betterSidebar: { id: 'clip-sidebar' } })
      return () => {}
    },
  })
  assert.deepEqual(boundPatches, [{ betterSidebar: { id: 'clip-sidebar' } }], 'Vids must bind the injected Clip sidebar API')
  bindCleanup()
  assert.deepEqual(unbindings, [{ betterSidebar: null }], 'Workbench API binding must be released on dispose')

  assert.equal(typeof disposeListener, 'function')
  disposeListener()
  dispose()
  assert.equal(typeof sidebarCleanup, 'function')
  assert.equal(typeof slotCleanup, 'function')
})

test('legacy Google Vids Tab registration identifiers and sidebar store are absent from current sources', () => {
  const sidebarSource = readFileSync(new URL('./sidebar-entry.js', import.meta.url), 'utf8')
  const indexSource = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const manifestSource = readFileSync(new URL('../../dsh.manifest.json', import.meta.url), 'utf8')
  assert.doesNotMatch(sidebarSource, /GOOGLE_VIDS_TAB_ID|createGoogleVidsStageStore|data-tab-id/)
  assert.doesNotMatch(indexSource, /GOOGLE_VIDS_TAB_ID|registerGoogleVidsTab|registerTab\s*\(/)
  assert.match(indexSource, /GoogleVidsStudioPanel/)
  assert.doesNotMatch(manifestSource, /"target": "main"/)
  assert.doesNotMatch(indexSource, /ctx\.slots\.inject\('main'/)
  assert.match(indexSource, /mountGeneratePanel/)
  assert.match(indexSource, /ctx\.inject\(\['betterSidebar'\]/)
})
