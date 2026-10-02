import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createStageStore } from './createStageStore.ts'
import { createSidebarEntry } from './createSidebarEntry.ts'

const here = dirname(fileURLToPath(import.meta.url))

describe('StageStore state machine', () => {
  it('creates an idempotent store with open/close methods and no toggle', () => {
    let claimed = ''
    let released = ''
    const fakeStage = {
      claim: (id) => { claimed = id },
      release: (id) => { released = id },
      readBox: () => ({ top: 10, left: 20, width: 800, height: 600 }),
    }

    const store = createStageStore('test-stage', () => fakeStage)

    assert.equal(store.getSnapshot(), false)
    assert.equal(typeof store.open, 'function')
    assert.equal(typeof store.close, 'function')
    assert.equal(typeof store.toggle, 'undefined', 'toggle is intentionally absent to prevent toggle bugs')

    let notified = 0
    const unsub = store.subscribe(() => { notified++ })

    // 1st open
    store.open()
    assert.equal(store.getSnapshot(), true)
    assert.equal(claimed, 'test-stage')
    assert.equal(notified, 1)

    // 2nd open (idempotent no-op: does not re-emit or re-claim)
    store.open()
    assert.equal(store.getSnapshot(), true)
    assert.equal(notified, 1, 'idempotent call must not re-notify')

    // close
    store.close()
    assert.equal(store.getSnapshot(), false)
    assert.equal(released, 'test-stage')
    assert.equal(notified, 2)

    // 2nd close (idempotent no-op)
    store.close()
    assert.equal(store.getSnapshot(), false)
    assert.equal(notified, 2)

    unsub()
  })

  it('provides readBox reading from stage host or fallback', () => {
    const fakeStage = {
      readBox: () => ({ top: 12, left: 34, width: 567, height: 890 }),
    }
    const store = createStageStore('test-stage', () => fakeStage)
    assert.deepEqual(store.readBox(), { top: 12, left: 34, width: 567, height: 890 })
  })
})

describe('createSidebarEntry contract', () => {
  it('implements idempotent click and standard 32px contract', () => {
    const src = readFileSync(join(here, 'createSidebarEntry.ts'), 'utf8')
    assert.ok(src.includes('stageStore.open()'), 'sidebar click must call stageStore.open(), not toggle')
    assert.ok(!src.includes('stageStore.toggle'), 'must not have toggle')
    assert.match(src, /height:\s*32px/, 'must follow 32px height baseline')
    assert.ok(src.includes('--dsw-font-s-14'), 'must use dsw font 14px token')
  })

  it('declares access, requireAuth and authReason options in types', () => {
    const src = readFileSync(join(here, 'createSidebarEntry.ts'), 'utf8')
    assert.match(src, /access\?: PluginAccess/)
    assert.match(src, /requireAuth\?: boolean/)
    assert.match(src, /authReason\?: string \| \(\(\) => string\)/)
    assert.match(src, /__omnimuxAuth/)
    assert.match(src, /ensureLogin/)
  })

  it('handles offline access: clicks open stage directly without auth prompt', () => {
    let opened = false
    const fakeStageStore = {
      open: () => { opened = true },
      getSnapshot: () => false,
      subscribe: () => () => {},
    }

    let authCalled = false
    const origWindow = globalThis.window
    const fakeWindow = {
      __omnimuxAuth: {
        ensureLogin: () => { authCalled = true },
      },
      __omnimuxSidebar: {
        register: () => () => {},
      },
    }

    const listeners = {}
    const fakeEntry = {
      setAttribute: () => {},
      removeAttribute: () => {},
      classList: { add: () => {}, remove: () => {} },
      querySelector: () => ({ textContent: '' }),
      addEventListener: (evt, fn) => { listeners[evt] = fn },
      dataset: {},
    }
    const origDoc = globalThis.document
    globalThis.document = {
      createElement: () => fakeEntry,
    }
    globalThis.window = fakeWindow

    try {
      const cleanup = createSidebarEntry({
        id: 'offline-entry',
        rank: 5,
        label: '离线入口',
        access: 'offline',
        iconSvg: '<svg></svg>',
        stageStore: fakeStageStore,
      })

      assert.equal(typeof listeners.click, 'function')
      listeners.click()
      assert.equal(authCalled, false, 'offline access must not invoke ensureLogin on click')
      assert.equal(opened, true, 'offline access opens stageStore directly')

      cleanup()
    } finally {
      globalThis.window = origWindow
      globalThis.document = origDoc
    }
  })

  it('handles cloud access: always visible when unauthenticated and click requires explicit auth', () => {
    let opened = false
    const fakeStageStore = {
      open: () => { opened = true },
      getSnapshot: () => false,
      subscribe: () => () => {},
    }

    let authCalledWith = null

    const origWindow = globalThis.window
    const fakeWindow = {
      __omnimuxAuth: {
        isLoggedIn: () => false,
        ensureLogin: (opts) => {
          authCalledWith = opts
          opts.onSuccess?.()
        },
      },
      __omnimuxSidebar: {
        register: () => () => {},
      },
    }

    const attrs = {}
    const classList = new Set()
    const listeners = {}
    const fakeEntry = {
      setAttribute: (k, v) => { attrs[k] = v },
      removeAttribute: (k) => { delete attrs[k] },
      classList: {
        add: (c) => { classList.add(c) },
        remove: (c) => { classList.delete(c) },
        contains: (c) => classList.has(c),
      },
      querySelector: () => ({ textContent: '' }),
      addEventListener: (evt, fn) => { listeners[evt] = fn },
      dataset: {},
    }
    const origDoc = globalThis.document
    globalThis.document = {
      createElement: () => fakeEntry,
    }
    globalThis.window = fakeWindow

    try {
      // 1. Unauthenticated -> entry is always visible (no data-hidden, no hidden class)
      const cleanup = createSidebarEntry({
        id: 'cloud-analytics-entry',
        rank: 10,
        label: '数据分析',
        access: 'cloud',
        iconSvg: '<svg></svg>',
        stageStore: fakeStageStore,
      })

      assert.equal(attrs['data-hidden'], undefined, 'cloud entry must remain visible when unauthenticated')
      assert.ok(!classList.has('omnimux-sidebar-nav-entry-hidden'), 'must not have hidden class')

      // 2. Click -> ensureLogin is called with kind: 'explicit'
      assert.equal(typeof listeners.click, 'function')
      listeners.click()
      assert.ok(authCalledWith !== null, 'ensureLogin must be called on click')
      assert.equal(authCalledWith.kind, 'explicit', 'ensureLogin must be called with kind: explicit')
      assert.equal(opened, true, 'onSuccess opens stageStore')

      cleanup()
    } finally {
      globalThis.window = origWindow
      globalThis.document = origDoc
    }
  })

  it('does not treat auth-gate phase closed as logged in and cloud entry remains visible', () => {
    const origWindow = globalThis.window
    const origDoc = globalThis.document
    const attrs = {}
    const classList = new Set()
    const fakeEntry = {
      setAttribute: (k, v) => { attrs[k] = v },
      removeAttribute: (k) => { delete attrs[k] },
      classList: {
        add: (c) => { classList.add(c) },
        remove: (c) => { classList.delete(c) },
        contains: (c) => classList.has(c),
      },
      querySelector: () => ({ textContent: '' }),
      addEventListener: () => {},
      dataset: {},
    }
    globalThis.document = { createElement: () => fakeEntry }
    globalThis.window = {
      __omnimuxAuth: {
        getSnapshot: () => ({ phase: 'closed' }),
        peekCache: () => null,
      },
      __omnimuxSidebar: { register: () => () => {} },
    }
    try {
      const cleanup = createSidebarEntry({
        id: 'cloud-closed-phase',
        rank: 10,
        label: '云端入口',
        access: 'cloud',
        iconSvg: '<svg></svg>',
        stageStore: { open() {}, getSnapshot: () => false, subscribe: () => () => {} },
      })
      assert.equal(attrs['data-hidden'], undefined, 'cloud entry is always visible')
      assert.ok(!classList.has('omnimux-sidebar-nav-entry-hidden'))
      cleanup()
    } finally {
      globalThis.window = origWindow
      globalThis.document = origDoc
    }
  })

  it('cancel explicit auth does not open stage', () => {
    let opened = false
    const fakeStageStore = {
      open: () => { opened = true },
      getSnapshot: () => false,
      subscribe: () => () => {},
    }

    let authCalledWith = null

    const origWindow = globalThis.window
    const fakeWindow = {
      __omnimuxAuth: {
        isLoggedIn: () => false,
        ensureLogin: (opts) => {
          authCalledWith = opts
          // Simulating cancel: onSuccess is NOT called
        },
      },
      __omnimuxSidebar: {
        register: () => () => {},
      },
    }

    const listeners = {}
    const fakeEntry = {
      setAttribute: () => {},
      removeAttribute: () => {},
      classList: { add: () => {}, remove: () => {} },
      querySelector: () => ({ textContent: '' }),
      addEventListener: (evt, fn) => { listeners[evt] = fn },
      dataset: {},
    }
    const origDoc = globalThis.document
    globalThis.document = {
      createElement: () => fakeEntry,
    }
    globalThis.window = fakeWindow

    try {
      const cleanup = createSidebarEntry({
        id: 'cloud-cancel-entry',
        rank: 10,
        label: '云端入口',
        access: 'cloud',
        iconSvg: '<svg></svg>',
        stageStore: fakeStageStore,
      })

      listeners.click()
      assert.ok(authCalledWith !== null)
      assert.equal(authCalledWith.kind, 'explicit')
      assert.equal(opened, false, 'stage must not open when explicit login is not successful')

      cleanup()
    } finally {
      globalThis.window = origWindow
      globalThis.document = origDoc
    }
  })
})

describe('StageContainer & StageHeader/PageHeader components', () => {
  it('exports StageContainer with --stage-* variables and keepalive display:none', () => {
    const src = readFileSync(join(here, 'StageContainer.tsx'), 'utf8')
    assert.match(src, /useSyncExternalStore/)
    assert.match(src, /--stage-top/)
    assert.match(src, /--stage-left/)
    assert.match(src, /--stage-width/)
    assert.match(src, /--stage-height/)
    assert.match(src, /data-visible/)
  })

  it('exports PageHeader with standard title, subtitle, refresh, close, and 20px typography', () => {
    const src = readFileSync(join(here, 'PageHeader.tsx'), 'utf8')
    assert.match(src, /IconRefreshOutline16/)
    assert.match(src, /IconCloseOutline16/)
    assert.match(src, /refreshing/)
    assert.match(src, /onRefresh/)
    assert.match(src, /onClose/)
    assert.match(src, /breadcrumb/)
    assert.match(src, /tabs/)

    const css = readFileSync(join(here, 'PageHeader.module.css'), 'utf8')
    assert.match(css, /font-size:\s*20px/, 'PageHeader title must be 20px')
    assert.match(css, /line-height:\s*28px/, 'PageHeader line-height must be 28px')
    assert.match(css, /font-weight:\s*600/, 'PageHeader font-weight must be 600')
    assert.match(css, /-webkit-app-region:\s*no-drag/, 'PageHeader must have no-drag')
  })

  it('StageHeader forwards to PageHeader for backward compatibility', () => {
    const src = readFileSync(join(here, 'StageHeader.tsx'), 'utf8')
    assert.match(src, /PageHeader/, 'StageHeader must forward to PageHeader')
  })
})
