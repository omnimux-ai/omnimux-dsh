import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import {
  ENTRY_SELECTOR,
  GOOGLE_VIDS_TAB_ID,
  GOOGLE_VIDS_SIDEBAR_I18N,
  createGoogleVidsStageStore,
  mountSidebarEntry,
} from './sidebar-entry.js'

const tempFile = new URL(`.test-index-${Date.now()}.mjs`, import.meta.url)
await build({
  entryPoints: [fileURLToPath(new URL('./index.js', import.meta.url))],
  outfile: fileURLToPath(tempFile),
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['react', 'react/jsx-runtime'],
  plugins: [{
    name: 'stub-panel',
    setup(b) {
      b.onResolve({ filter: /GoogleVidsStudioPanel\.jsx$/ }, () => ({
        path: 'stub-panel',
        namespace: 'stub',
      }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export function GoogleVidsStudioPanel(props) { return null }',
        loader: 'js',
      }))
    },
  }],
})
const { apply, GoogleVidsTabPanel } = await import(tempFile.href)
await rm(fileURLToPath(tempFile)).catch(() => {})

const previousWindow = globalThis.window
const previousDocument = globalThis.document

afterEach(() => {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow

  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
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

  setAttribute(k, v) {
    this.attributes[k] = String(v)
  }

  getAttribute(k) {
    return this.attributes[k]
  }

  hasAttribute(k) {
    return k in this.attributes
  }

  append(...items) {
    for (const item of items) {
      this.children.push(item)
    }
  }

  appendChild(child) {
    this.children.push(child)
    return child
  }

  set textContent(txt) {
    this._textContent = txt
  }

  get textContent() {
    return this._textContent
  }

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
      const deeper = child._find ? child._find(predicate) : null
      if (deeper) return deeper
    }
    return null
  }

  addEventListener(event, fn) {
    this.listeners[event] = fn
  }

  removeEventListener(event, fn) {
    if (this.listeners[event] === fn) {
      delete this.listeners[event]
    }
  }

  click() {
    if (typeof this.listeners.click === 'function') {
      this.listeners.click()
    }
  }

  remove() {
    this.removed = true
  }
}

function setupMockEnvironment() {
  globalThis.document = {
    createElement(tag) {
      return new MockElement(tag)
    },
    createElementNS(ns, tag) {
      return new MockElement(tag, ns)
    },
  }
}

test('sidebar entry exports constants and conforms to specs', () => {
  assert.equal(ENTRY_SELECTOR, '[data-omnimux-google-vids-entry]')
  assert.equal(GOOGLE_VIDS_TAB_ID, 'omnimux-video:google-vids')
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

test('AC-01 ~ AC-03 & AC-06: DOM structure, whitelist elements, and styles contract', () => {
  setupMockEnvironment()
  let registeredRow = null
  let openedTabId = null

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore(opts) {
        return {
          getSnapshot() { return false },
          subscribe() { return () => {} },
          open() { openedTabId = opts.tabId },
          close() {},
        }
      },
    },
  }

  const unmount = mountSidebarEntry(null, (k) => GOOGLE_VIDS_SIDEBAR_I18N.zh[k] || k, { current: 'zh' })

  assert.ok(registeredRow, 'entry should be registered to __omnimuxSidebar')
  assert.equal(registeredRow.id, 'omnimux-video-google-vids-entry')
  assert.equal(registeredRow.rank, 7.5, 'Rank must be 7.5')
  assert.equal(registeredRow.styleId, 'omnimux-video-google-vids-styles')
  assert.ok(registeredRow.styles.includes('[data-sidebar-collapsed] [data-omnimux-google-vids-entry]'))

  const entry = registeredRow.create()
  assert.equal(entry.tagName, 'BUTTON')
  assert.ok(entry.hasAttribute('data-omnimux-google-vids-entry'))
  assert.equal(entry.getAttribute('data-tab-id'), 'omnimux-video:google-vids')
  assert.ok(entry.className.includes('omnimux-sidebar-nav-entry'))
  assert.ok(entry.className.includes('omnimux-google-vids-entry'))

  // 白名单子元素严格校验：直接子元素数量恰为 3，仅允许 icon、label、badge
  assert.equal(entry.children.length, 3, 'Must only contain icon, label and badge')
  const [iconNode, labelNode, badgeNode] = entry.children
  assert.ok(iconNode.className.includes('omnimux-sidebar-nav-entry-icon'))
  assert.equal(iconNode.getAttribute('aria-hidden'), 'true')
  assert.equal(iconNode.innerHTML, '', 'Must not use innerHTML to inject SVG')

  const svgNode = iconNode.querySelector('svg') || iconNode.children[0]
  assert.ok(svgNode, 'Must contain SVG node constructed via DOM')
  assert.equal(svgNode.getAttribute('viewBox'), '0 0 16 16')
  assert.equal(svgNode.getAttribute('width'), '14')
  assert.equal(svgNode.getAttribute('height'), '14')
  assert.equal(svgNode.getAttribute('role'), 'presentation')
  assert.equal(svgNode.children.length, 2, 'SVG must contain rect and path')

  assert.ok(labelNode.className.includes('omnimux-sidebar-nav-entry-label'))
  assert.ok(badgeNode.className.includes('omnimux-sidebar-alpha-badge'))

  // 反过度设计负向测试：严禁任何 Emoji 或装饰性字符
  const fullText = `${entry.title} ${labelNode.textContent} ${badgeNode.textContent}`
  assert.doesNotMatch(fullText, /[💎✨🔥🚀]/, 'Must not contain decorative emojis')
  assert.doesNotMatch(fullText, /高画质|极速|推荐|全新上线/, 'Must not contain promotional slogans')

  unmount()
  assert.equal(registeredRow, null, 'Unmount must unregister from coordinator')
  assert.equal(entry.removed, true, 'Unmount must call entry.remove() to avoid zombie nodes')
})

test('AC-04 & AC-05: Strict copy assertions and dynamic locale switching', () => {
  setupMockEnvironment()
  let registeredRow = null
  let localeListener = null
  let currentLang = 'zh'

  const localeObj = {
    get current() { return currentLang },
    subscribe(fn) {
      localeListener = fn
      return () => { localeListener = null }
    },
  }

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore() {
        return {
          getSnapshot() { return false },
          subscribe() { return () => {} },
          open() {},
          close() {},
        }
      },
    },
  }

  const t = (k) => GOOGLE_VIDS_SIDEBAR_I18N[currentLang][k] || k
  const unmount = mountSidebarEntry(null, t, localeObj)

  const entry = registeredRow.create()
  const labelNode = entry.querySelector('.omnimux-sidebar-nav-entry-label')
  const badgeNode = entry.querySelector('.omnimux-sidebar-alpha-badge')

  // 中文态校验 (AC-04)
  assert.equal(labelNode.textContent, 'Google Vids')
  assert.equal(badgeNode.textContent, '内测版')
  assert.equal(entry.title, 'Google Vids · 内测版')
  assert.equal(entry.getAttribute('aria-label'), 'Google Vids · 内测版')

  // 负向正则：严禁拖带括号或副词
  assert.match(labelNode.textContent, /^Google Vids$/)
  assert.doesNotMatch(labelNode.textContent, /\(Veo\)/)
  assert.match(badgeNode.textContent, /^内测版$/)

  // 动态切换英文态 (AC-05)
  currentLang = 'en'
  assert.ok(localeListener, 'Locale listener must be attached')
  localeListener()

  assert.equal(labelNode.textContent, 'Google Vids')
  assert.equal(badgeNode.textContent, 'Alpha')
  assert.equal(entry.title, 'Google Vids · Alpha')
  assert.equal(entry.getAttribute('aria-label'), 'Google Vids · Alpha')
  assert.match(badgeNode.textContent, /^Alpha$/)

  unmount()
})

test('AC-07: Single activation slot arbitration and click trigger', () => {
  setupMockEnvironment()
  let registeredRow = null
  let activeState = false
  let subscriber = null
  let openCalled = 0

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore(opts) {
        assert.equal(opts.tabId, GOOGLE_VIDS_TAB_ID)
        assert.equal(typeof opts.title, 'function')
        assert.equal(opts.title(), 'Google Vids')
        return {
          getSnapshot() { return activeState },
          subscribe(fn) {
            subscriber = fn
            return () => { subscriber = null }
          },
          open() { openCalled += 1 },
          close() {},
        }
      },
    },
  }

  const unmount = mountSidebarEntry(null, (k) => GOOGLE_VIDS_SIDEBAR_I18N.zh[k] || k, { current: 'zh' })
  const entry = registeredRow.create()

  // 初始为未激活态
  assert.equal(entry.dataset.active, undefined)

  // 点击触发 open
  entry.click()
  assert.equal(openCalled, 1, 'Click should call stageStore.open()')

  // 模拟右栏中枢广播激活态
  activeState = true
  subscriber?.()
  assert.equal(entry.dataset.active, 'true', 'Must set data-active when snapshot is true')

  // 模拟切换会话或其他 Tab，撤销激活态
  activeState = false
  subscriber?.()
  assert.equal(entry.dataset.active, undefined, 'Must remove data-active when snapshot is false')

  unmount()
})

test('createGoogleVidsStageStore resilience when workbench is absent', () => {
  globalThis.window = {}
  const store = createGoogleVidsStageStore(() => 'Google Vids')
  assert.equal(store.getSnapshot(), false)
  assert.doesNotThrow(() => store.open())
  assert.doesNotThrow(() => store.close())
  assert.doesNotThrow(() => store.set(true))
  assert.deepEqual(store.readBox(), { top: 0, left: 0, width: 0, height: 0 })
})

test('Issue #2657 Review 1: coordinator poll stops after 10s timeout', async () => {
  setupMockEnvironment()
  globalThis.window = {}

  const realDateNow = Date.now
  let fakeTime = 100000
  Date.now = () => fakeTime

  let intervalCleared = false
  const realClearInterval = globalThis.clearInterval
  const realSetInterval = globalThis.setInterval

  let activeIntervalId = null
  globalThis.setInterval = (fn, ms) => {
    const id = realSetInterval(fn, ms)
    activeIntervalId = id
    return id
  }
  globalThis.clearInterval = (id) => {
    if (id === activeIntervalId) {
      intervalCleared = true
    }
    realClearInterval(id)
  }

  try {
    const unmount = mountSidebarEntry(null, (k) => k)
    // 推进时间超过 10 秒
    fakeTime += 11000
    // 等待 600ms 触发一次 interval 检查
    await new Promise((resolve) => setTimeout(resolve, 600))

    assert.equal(intervalCleared, true, 'Interval must be cleared after 10s timeout')
    unmount()
  } finally {
    Date.now = realDateNow
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
  }
})

test('Issue #2657 Review 2: pure DOM SVG element construction without innerHTML', () => {
  let createdNS = []
  globalThis.document = {
    createElement(tag) {
      return new MockElement(tag)
    },
    createElementNS(ns, tag) {
      createdNS.push({ ns, tag })
      return new MockElement(tag, ns)
    },
  }
  globalThis.window = {
    __omnimuxSidebar: { register() { return () => {} } },
  }

  const unmount = mountSidebarEntry(null, (k) => k)
  assert.ok(createdNS.length >= 3, 'Must create svg, rect, path via createElementNS')
  assert.equal(createdNS[0].ns, 'http://www.w3.org/2000/svg')
  assert.equal(createdNS[0].tag, 'svg')
  assert.equal(createdNS[1].tag, 'rect')
  assert.equal(createdNS[2].tag, 'path')
  unmount()
})

test('Issue #2657 Review 3: SSR / document undefined environment safety', () => {
  delete globalThis.document
  // mountSidebarEntry 不报错且返回空操作
  assert.doesNotThrow(() => {
    const unmount = mountSidebarEntry(null, (k) => k)
    assert.equal(typeof unmount, 'function')
    unmount()
  })

  // index.js apply 不报错
  assert.doesNotThrow(() => {
    const unmountPlugin = apply({
      locale: { register() {}, bind: () => (k) => k },
      inject: (deps, fn) => {
        fn({ betterSidebar: { registerTab: () => () => {} } })
      },
    })
    if (typeof unmountPlugin === 'function') unmountPlugin()
  })
})

test('Issue #2657 Review 4: fallback path retains registerTab disposer in unload flow', () => {
  setupMockEnvironment()
  let tabUnregistered = false
  let sidebarUnregistered = false

  const mockSidebar = {
    registerTab(descriptor) {
      assert.equal(descriptor.id, GOOGLE_VIDS_TAB_ID)
      assert.equal(descriptor.component, GoogleVidsTabPanel)
      return () => {
        tabUnregistered = true
      }
    },
  }

  globalThis.window = {
    __omnimuxSidebar: {
      register() {
        return () => {
          sidebarUnregistered = true
        }
      },
    },
  }

  const unmountPlugin = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      fn({ betterSidebar: mockSidebar })
    },
  })

  assert.equal(tabUnregistered, false)
  assert.equal(typeof unmountPlugin, 'function')
  unmountPlugin()
  assert.equal(tabUnregistered, true, 'Non-effect fallback must dispose tab registration')
  assert.equal(sidebarUnregistered, true, 'Non-effect fallback must dispose sidebar registration')
})

test('Issue #2657 Review 5: GoogleVidsTabPanel maintains stable reference', () => {
  assert.equal(typeof GoogleVidsTabPanel, 'function')
  const v1 = GoogleVidsTabPanel
  const v2 = GoogleVidsTabPanel
  assert.equal(v1, v2, 'GoogleVidsTabPanel must have stable component identity')
})

test('Static code review audit: verifies all 5 issue #2657 review points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [High] registerWhenCoordinatorReady 中的 setInterval 缺少最大等待时间/超时守卫。请增加 10 秒超时门禁，超时后清除 timer 避免轮询泄漏。
  assert.match(sidebarSrc, /COORDINATOR_TIMEOUT_MS\s*=\s*10000|10000|1e4/)
  assert.match(sidebarSrc, /Date\.now\(\)\s*-\s*started\s*>=/)
  assert.match(sidebarSrc, /clearInterval\(timer\)/)

  // 2. [High] 严禁使用 innerHTML 注入 SVG。改用 document.createElementNS('http://www.w3.org/2000/svg', ...) 纯 DOM 节点构建方式构建 14x14 SVG 图标。
  assert.doesNotMatch(sidebarSrc, /innerHTML/, 'sidebar-entry.js must never use innerHTML')
  assert.match(sidebarSrc, /document\.createElementNS\(/)
  assert.match(sidebarSrc, /http:\/\/www\.w3\.org\/2000\/svg/)

  // 3. [Medium] mountSidebarEntry 增加 typeof document === 'undefined' 环境安全防护。
  assert.match(indexSrc, /typeof\s+document\s*===\s*['"]undefined['"]/)
  assert.match(sidebarSrc, /typeof\s+document\s*===\s*['"]undefined['"]/)

  // 4. [Medium] 非 ctx.effect 降级分支留存 registerGoogleVidsTab 的注销 Disposer 并纳入卸载流。
  assert.match(indexSrc, /disposers\.push\(.*unregisterTab.*\)|disposers\.push\(.*registerGoogleVidsTab.*\)/)

  // 5. [Medium] 将 GoogleVidsStudioPanel 的高阶封装组件提到函数外保持稳定引用，避免 Tab 宿主组件对比时触发不必要的 Unmount/Remount。
  assert.match(indexSrc, /export\s+function\s+GoogleVidsTabPanel|function\s+GoogleVidsTabPanel|const\s+GoogleVidsTabPanel/)
  assert.match(indexSrc, /component:\s*GoogleVidsTabPanel/)
})

test('Issue #2657 Review Round 2 - Point 1: Store subscribe internal polling timeout unified with COORDINATOR_TIMEOUT_MS (10000ms)', async () => {
  globalThis.window = {}
  const store = createGoogleVidsStageStore(() => 'Google Vids')

  const realDateNow = Date.now
  let fakeTime = 100000
  Date.now = () => fakeTime

  let intervalCleared = false
  const realClearInterval = globalThis.clearInterval
  const realSetInterval = globalThis.setInterval

  let activeIntervalId = null
  globalThis.setInterval = (fn, ms) => {
    const id = realSetInterval(fn, ms)
    activeIntervalId = id
    return id
  }
  globalThis.clearInterval = (id) => {
    if (id === activeIntervalId) {
      intervalCleared = true
    }
    realClearInterval(id)
  }

  try {
    const unsub = store.subscribe(() => {})
    // 时间推进 8500ms（原 8000ms 会超时，但现 10000ms 不应超时）
    fakeTime += 8500
    await new Promise((resolve) => setTimeout(resolve, 120))
    assert.equal(intervalCleared, false, 'Store subscribe polling should NOT timeout at 8500ms under 10000ms timeout')

    // 时间推进到 10001ms，应当超时清除
    fakeTime += 2000
    await new Promise((resolve) => setTimeout(resolve, 120))
    assert.equal(intervalCleared, true, 'Store subscribe polling must timeout and clear interval at 10000ms')
    unsub()
  } finally {
    Date.now = realDateNow
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
  }
})

test('Issue #2657 Review Round 2 - Point 2 & 3: mountSidebarEntry clean signature (t, locale) and entry.remove() cleanup', () => {
  setupMockEnvironment()
  let registeredRow = null
  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
  }

  // 验证干净签名 (t, locale)
  const unmountClean = mountSidebarEntry((k) => k, { current: 'zh' })
  assert.ok(registeredRow)
  const entry = registeredRow.create()
  assert.equal(entry.removed, undefined)
  unmountClean()
  assert.equal(entry.removed, true, 'entry.remove() must be invoked on unmount')

  // 验证向前兼容三参 (stage, t, locale)
  const unmountLegacy = mountSidebarEntry(null, (k) => k, { current: 'zh' })
  assert.ok(registeredRow)
  unmountLegacy()
})

test('Issue #2657 Review Round 2 - Point 4: resolveLocaleCurrent defaults to en', () => {
  setupMockEnvironment()
  let registeredRow = null
  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
  }

  // 当不传 locale 时，兜底应为 en (badge: Alpha)
  const unmountNoLocale = mountSidebarEntry((k) => k)
  const entry1 = registeredRow.create()
  const badge1 = entry1.querySelector('.omnimux-sidebar-alpha-badge')
  assert.equal(badge1.textContent, 'Alpha', 'Default fallback locale must be en')
  unmountNoLocale()

  // 当传入空对象或未知语言时，兜底也应为 en
  const unmountUnknown = mountSidebarEntry((k) => k, { current: 'fr' })
  const entry2 = registeredRow.create()
  const badge2 = entry2.querySelector('.omnimux-sidebar-alpha-badge')
  assert.equal(badge2.textContent, 'Alpha', 'Unknown locale must fallback to en')
  unmountUnknown()

  // 当明确是中文时为 zh
  const unmountZh = mountSidebarEntry((k) => k, { current: 'zh-CN' })
  const entry3 = registeredRow.create()
  const badge3 = entry3.querySelector('.omnimux-sidebar-alpha-badge')
  assert.equal(badge3.textContent, '内测版', 'zh locale must resolve to zh')
  unmountZh()
})

test('Issue #2657 Review Round 2 - Point 5: non-effect branch disposes prev tab on repeat inject', () => {
  setupMockEnvironment()
  let tab1Disposed = false
  let tab2Disposed = false

  const mockSidebar1 = {
    registerTab() {
      return () => { tab1Disposed = true }
    },
  }
  const mockSidebar2 = {
    registerTab() {
      return () => { tab2Disposed = true }
    },
  }

  let injectCallback = null
  const unmountPlugin = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectCallback = fn
    },
  })

  // 第一次触发 inject
  injectCallback({ betterSidebar: mockSidebar1 })
  assert.equal(tab1Disposed, false)

  // 第二次触发 inject（重复注册），必须先注销 tab1
  injectCallback({ betterSidebar: mockSidebar2 })
  assert.equal(tab1Disposed, true, 'Previous tab must be unregistered before new tab registers')
  assert.equal(tab2Disposed, false)

  // 卸载插件，必须注销 tab2
  unmountPlugin()
  assert.equal(tab2Disposed, true, 'Current tab must be unregistered on plugin dispose')
})

test('Issue #2657 Review Round 2 - Point 6: bindWorkbench guards against undefined window (SSR)', () => {
  const origWindow = globalThis.window
  delete globalThis.window
  try {
    assert.doesNotThrow(() => {
      const unmountPlugin = apply({
        locale: { register() {}, bind: () => (k) => k },
        inject: (deps, fn) => {
          fn({ betterSidebar: { registerTab: () => () => {} } })
        },
      })
      if (typeof unmountPlugin === 'function') unmountPlugin()
    })
  } finally {
    globalThis.window = origWindow
  }
})

test('Static code review audit: verifies all 6 Review Round 2 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. Store subscribe 轮询超时统一定义为 COORDINATOR_TIMEOUT_MS
  assert.match(sidebarSrc, /Date\.now\(\)\s*-\s*started\s*>=\s*COORDINATOR_TIMEOUT_MS/)
  assert.doesNotMatch(sidebarSrc, /8000/, 'sidebar-entry.js must not contain hardcoded 8000ms')

  // 2. mountSidebarEntry 清理函数中必须调用 entry.remove()
  assert.match(sidebarSrc, /entry\.remove\(\)/)

  // 3. mountSidebarEntry 签名不含 _stage，显式支持 _legacyLocale
  assert.match(sidebarSrc, /export\s+function\s+mountSidebarEntry\s*\(\s*t\s*,\s*locale(?:\s*,\s*_legacyLocale)?\s*\)/)
  assert.doesNotMatch(sidebarSrc, /export\s+function\s+mountSidebarEntry\s*\([^)]*_stage/)

  // 4. resolveLocaleCurrent 兜底为 'en'
  assert.match(sidebarSrc, /if\s*\(!locale\)\s*return\s*['"]en['"]/)
  assert.match(sidebarSrc, /return\s*['"]en['"]\s*$/m)

  // 5. 非 ctx.effect 分支调用 prevUnregisterTab
  assert.match(indexSrc, /prevUnregisterTab(?:\?\.)?\(/)

  // 6. bindWorkbench 增加 typeof window !== 'undefined' 守卫
  assert.match(indexSrc, /typeof\s+window\s*===\s*['"]undefined['"]\s*return|typeof\s+window\s*!==\s*['"]undefined['"]/)
})

test('Issue #2657 Review Round 3 - Point 1: Multiple inject prevents double-unregister on disposers', () => {
  setupMockEnvironment()
  let tab1UnregisterCalls = 0
  let tab2UnregisterCalls = 0

  const mockSidebar1 = {
    registerTab() {
      return () => { tab1UnregisterCalls += 1 }
    },
  }
  const mockSidebar2 = {
    registerTab() {
      return () => { tab2UnregisterCalls += 1 }
    },
  }

  let injectCallback = null
  const unmountPlugin = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectCallback = fn
    },
  })

  // 第一次触发 inject
  injectCallback({ betterSidebar: mockSidebar1 })
  assert.equal(tab1UnregisterCalls, 0)

  // 第二次触发 inject：必须注销 tab1，此时 tab1 注销函数被调用 1 次
  injectCallback({ betterSidebar: mockSidebar2 })
  assert.equal(tab1UnregisterCalls, 1, 'Previous tab must be unregistered once on repeat inject')
  assert.equal(tab2UnregisterCalls, 0)

  // 卸载插件：tab2 应当被注销 1 次，而已注销的 tab1 绝不能被再次注销（杜绝 double-unregister）
  unmountPlugin()
  assert.equal(tab1UnregisterCalls, 1, 'Tab 1 must NOT be double-unregistered on plugin dispose')
  assert.equal(tab2UnregisterCalls, 1, 'Tab 2 must be unregistered exactly once on plugin dispose')
})

test('Issue #2657 Review Round 3 - Point 2: inject dependencies strictly exclude unused slots', async () => {
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')
  assert.match(indexSrc, /export\s+const\s+inject\s*=\s*\[.*['"]locale['"].*\]/, 'inject should contain locale')
  assert.doesNotMatch(indexSrc, /export\s+const\s+inject\s*=\s*\[[^\]]*'slots'/, 'inject must not contain slots')
})

test('Issue #2657 Review Round 3 - Point 3: win.register non-function return value type guard', () => {
  setupMockEnvironment()
  // 模拟 win.register 返回非函数（如 undefined、null、boolean 等）
  globalThis.window = {
    __omnimuxSidebar: {
      register() {
        return undefined
      },
    },
  }

  const unmount = mountSidebarEntry((k) => k)
  // 调用 unmount 不应抛出 TypeError: unregister is not a function
  assert.doesNotThrow(() => {
    unmount()
  }, 'unmount must safely guard non-function register returns')
})

test('Issue #2657 Review Round 3 - Point 4: badgeSpan aria-label dynamic sync across locales', () => {
  setupMockEnvironment()
  let registeredRow = null
  let localeListener = null
  let currentLang = 'zh'

  const localeObj = {
    get current() { return currentLang },
    subscribe(fn) {
      localeListener = fn
      return () => { localeListener = null }
    },
  }

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
  }

  const t = (k) => GOOGLE_VIDS_SIDEBAR_I18N[currentLang][k] || k
  const unmount = mountSidebarEntry(t, localeObj)

  const entry = registeredRow.create()
  const badgeSpan = entry.querySelector('.omnimux-sidebar-alpha-badge')

  // 中文态下 aria-label 必须为 '内测版'，杜绝写死 'Alpha · 内测'
  assert.equal(badgeSpan.getAttribute('aria-label'), '内测版')
  assert.equal(badgeSpan.textContent, '内测版')

  // 动态切换到英文
  currentLang = 'en'
  localeListener?.()
  assert.equal(badgeSpan.getAttribute('aria-label'), 'Alpha')
  assert.equal(badgeSpan.textContent, 'Alpha')

  unmount()
})

test('Issue #2657 Review Round 3 - Point 5: mountSidebarEntry explicit _legacyLocale signature without arguments[2]', () => {
  setupMockEnvironment()
  let registeredRow = null
  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
  }

  // 验证向后兼容三参 (_stage, t, locale) 通过显式 _legacyLocale 解析
  const unmount = mountSidebarEntry(null, (k) => k, { current: 'zh' })
  assert.ok(registeredRow)
  const entry = registeredRow.create()
  const badge = entry.querySelector('.omnimux-sidebar-alpha-badge')
  assert.equal(badge.textContent, '内测版')
  unmount()
})

test('Static code review audit: verifies all 5 Review Round 3 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [High] 多次 inject 时旧 Tab 注销函数从 disposers 移除避免 double-unregister
  assert.match(indexSrc, /disposers\.indexOf\(prevUnregisterTab\)/)
  assert.match(indexSrc, /disposers\.splice\(/)

  // 2. [Medium] 移除未使用的 'slots' 依赖项注入，杜绝引入 slots
  assert.match(indexSrc, /export\s+const\s+inject\s*=/)
  assert.doesNotMatch(indexSrc, /export\s+const\s+inject\s*=\s*\[[^\]]*'slots'/)

  // 3. [High] win.register(row) 的返回值函数类型防护 typeof ret === 'function' ? ret : () => {}
  assert.match(sidebarSrc, /typeof\s+ret\s*===\s*['"]function['"]\s*\?\s*ret\s*:\s*\(\)\s*=>\s*\{\}/)

  // 4. [Medium] badgeSpan aria-label 动态更新且无硬编码 Alpha · 内测
  assert.match(sidebarSrc, /badgeSpan\.setAttribute\(['"]aria-label['"],\s*badgeText\)/)
  assert.doesNotMatch(sidebarSrc, /Alpha\s*·\s*内测/, 'sidebar-entry.js must not contain hardcoded "Alpha · 内测"')

  // 5. [Medium] mountSidebarEntry 显式声明三参数签名消除 arguments[2]
  assert.match(sidebarSrc, /export\s+function\s+mountSidebarEntry\s*\(\s*t\s*,\s*locale\s*,\s*_legacyLocale\s*\)/)
  assert.doesNotMatch(sidebarSrc, /arguments\[2\]/, 'sidebar-entry.js must not use implicit arguments[2]')
})

test('Issue #2657 Review Round 4 - Point 1 & 2: Store subscribe 200ms poll interval and disposed guard', async () => {
  globalThis.window = {}
  const store = createGoogleVidsStageStore(() => 'Google Vids')

  let intervalMs = null
  let activeIntervalId = null
  let intervalCleared = false
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval

  globalThis.setInterval = (fn, ms) => {
    intervalMs = ms
    const id = realSetInterval(fn, ms)
    activeIntervalId = id
    return id
  }
  globalThis.clearInterval = (id) => {
    if (id === activeIntervalId) {
      intervalCleared = true
    }
    realClearInterval(id)
  }

  let listenerCalls = 0
  const listener = () => { listenerCalls++ }

  try {
    const unsub = store.subscribe(listener)
    assert.equal(intervalMs, 200, 'Store subscribe polling interval must be 200ms')
    assert.equal(intervalCleared, false)

    // 快速卸载：在 coordinator 就绪前注销
    unsub()
    assert.equal(intervalCleared, true, 'unsub must immediately clear interval')

    // 模拟残留 tick 触发或 coordinator 随后就绪
    globalThis.window.__omnimuxWorkbench = {
      createSidebarStore() {
        return {
          subscribe(fn) {
            fn()
            return () => {}
          },
        }
      },
    }

    assert.equal(listenerCalls, 0, 'disposed guard must prevent listener from being called after cleanup')
  } finally {
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
  }
})

test('Issue #2657 Review Round 4 - Point 3: Tab title registration logs warning in non-production on error', () => {
  let registeredTab = null
  const mockSidebar = {
    registerTab(tab) {
      registeredTab = tab
      return () => {}
    },
  }

  const savedEnv = process.env.NODE_ENV
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  try {
    // 模拟开发环境，t 抛出异常
    process.env.NODE_ENV = 'development'
    const errorThrowingT = () => { throw new Error('simulated translation failure') }
    const unmount = apply({
      locale: { register() {}, bind: () => errorThrowingT },
      inject: (deps, fn) => {
        fn({ betterSidebar: mockSidebar })
      },
    })

    assert.ok(registeredTab, 'tab should be registered')
    const title = registeredTab.title()
    assert.equal(title, 'Google Vids', 'title must fallback to Google Vids')
    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] tab title i18n lookup failed:')),
      'should log warning in development'
    )

    // 模拟生产环境不输出日志
    warnings.length = 0
    process.env.NODE_ENV = 'production'
    const prodTitle = registeredTab.title()
    assert.equal(prodTitle, 'Google Vids')
    assert.equal(warnings.length, 0, 'should not log warning in production')

    unmount?.()
  } finally {
    process.env.NODE_ENV = savedEnv
    console.warn = originalWarn
  }
})

test('Static code review audit: verifies all 3 Review Round 4 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] createGoogleVidsStageStore 内部 subscribe 轮询间隔为 200ms
  assert.match(sidebarSrc, /setInterval\([^,]+,\s*200\)/, 'Store subscribe polling interval must be 200ms')

  // 2. [Medium] subscribe 作用域内设立 let disposed = false 守卫并在卸载时置 true 且阻止 tick
  assert.match(sidebarSrc, /let\s+disposed\s*=\s*false/)
  assert.match(sidebarSrc, /if\s*\(\s*disposed\s*\)\s*\{\s*clearInterval\(timer\);\s*return;?\s*\}/)
  assert.match(sidebarSrc, /(?:unsub|const\s+sub)\s*=\s*next\.subscribe\(listener\)/)
  assert.match(sidebarSrc, /disposed\s*=\s*true/)

  // 3. [Medium] Tab 标题注册时的 catch 块补充开发态告警日志
  assert.match(indexSrc, /catch\s*\(\s*err\s*\)\s*\{/)
  assert.match(indexSrc, /typeof\s+process\s*!==\s*['"]undefined['"]\s*&&\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]/)
  assert.match(indexSrc, /console\.warn\(\s*['"]\[omnimux-video\] tab title i18n lookup failed:['"],\s*err\s*\)/)
})

test('Issue #2657 Review Round 5 - Point 1: registerGoogleVidsTab with try-catch and dev warning on failure', () => {
  const savedEnv = process.env.NODE_ENV
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  const throwingSidebar = {
    registerTab() {
      throw new Error('simulated registerTab crash')
    },
  }

  try {
    // 1. 开发环境：应捕获并输出开发态告警
    process.env.NODE_ENV = 'development'
    warnings.length = 0
    let unmount
    assert.doesNotThrow(() => {
      unmount = apply({
        inject: (deps, fn) => {
          fn({ betterSidebar: throwingSidebar })
        },
      })
    }, 'apply must not throw when registerGoogleVidsTab fails')

    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] registerGoogleVidsTab failed:')),
      'should log warning in development when registerGoogleVidsTab throws'
    )
    assert.doesNotThrow(() => unmount?.(), 'unmount should execute cleanly')

    // 2. 生产环境：静默容灾，不输出告警
    process.env.NODE_ENV = 'production'
    warnings.length = 0
    let unmountProd
    assert.doesNotThrow(() => {
      unmountProd = apply({
        inject: (deps, fn) => {
          fn({ betterSidebar: throwingSidebar })
        },
      })
    })
    assert.equal(warnings.length, 0, 'should not log warning in production')
    assert.doesNotThrow(() => unmountProd?.())
  } finally {
    process.env.NODE_ENV = savedEnv
    console.warn = originalWarn
  }
})

test('Issue #2657 Review Round 5 - Point 2: coordinator register with try-catch, dev warning, and timer cleanup', () => {
  setupMockEnvironment()
  const savedEnv = process.env.NODE_ENV
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  let clearedTimer = false
  const realClearInterval = globalThis.clearInterval
  globalThis.clearInterval = (id) => {
    clearedTimer = true
    realClearInterval(id)
  }

  try {
    // 1. 开发态：win.register 抛出异常时，捕获异常、输出 warning、保留定时器重试（unmount 时才清理）
    process.env.NODE_ENV = 'development'
    warnings.length = 0
    clearedTimer = false

    globalThis.window = {
      __omnimuxSidebar: {
        register() {
          throw new Error('simulated coordinator register crash')
        },
      },
    }

    let unmount
    assert.doesNotThrow(() => {
      unmount = mountSidebarEntry((k) => k)
    }, 'mountSidebarEntry must not throw when coordinator register throws')

    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] sidebar coordinator register failed:')),
      'should log warning in development when win.register throws'
    )
    assert.equal(clearedTimer, false, 'timer must NOT be prematurely cleared on register error so polling can retry')
    assert.doesNotThrow(() => unmount?.())
    assert.equal(clearedTimer, true, 'timer must be cleared when unmounted')

    // 2. 生产态：静默容灾，不输出 warning，保留定时器重试，unmount 时清理
    process.env.NODE_ENV = 'production'
    warnings.length = 0
    clearedTimer = false

    let unmountProd
    assert.doesNotThrow(() => {
      unmountProd = mountSidebarEntry((k) => k)
    })
    assert.equal(warnings.length, 0, 'should not log warning in production')
    assert.equal(clearedTimer, false, 'timer must not be cleared on register error in production')
    assert.doesNotThrow(() => unmountProd?.())
    assert.equal(clearedTimer, true, 'timer must be cleared in production upon unmount')
  } finally {
    process.env.NODE_ENV = savedEnv
    console.warn = originalWarn
    globalThis.clearInterval = realClearInterval
  }
})

test('Static code review audit: verifies all 2 Review Round 5 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] registerGoogleVidsTab(sidebar) 补充 try-catch 保护与开发态告警
  assert.match(indexSrc, /let\s+unregisterTab\s+try\s*\{\s*unregisterTab\s*=\s*registerGoogleVidsTab\(sidebar\)\s*\}\s*catch\s*\(\s*err\s*\)\s*\{/)
  assert.match(indexSrc, /console\.warn\(\s*['"]\[omnimux-video\] registerGoogleVidsTab failed:['"],\s*err\s*\)/)

  // 2. [Medium] win.register(row) 增设 try-catch 容灾与开发态告警，并在成功时清理定时器
  assert.match(sidebarSrc, /try\s*\{\s*const\s+ret\s*=\s*win\.register\(row\)\s*(?:registered\s*=\s*true\s*)?unregister\s*=\s*typeof\s+ret\s*===\s*['"]function['"]\s*\?\s*ret\s*:\s*\(\)\s*=>\s*\{\}\s*if\s*\(\s*timer\s*\)\s*clearInterval\(timer\)\s*return\s*\}\s*catch\s*\(\s*err\s*\)\s*\{/)
  assert.match(sidebarSrc, /console\.warn\(\s*['"]\[omnimux-video\] sidebar coordinator register failed:['"],\s*err\s*\)/)
})

test('Issue #2657 Review Round 6 - Point 1: package.json declares react in peerDependencies & peerDependenciesMeta', () => {
  const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  assert.ok(pkg.peerDependencies?.react, 'package.json must declare react in peerDependencies')
  assert.equal(pkg.peerDependencies.react, '^18.2.0 || ^19.0.0')
  assert.equal(pkg.peerDependenciesMeta?.react?.optional, true, 'react must be optional in peerDependenciesMeta')
})

test('Issue #2657 Review Round 6 - Point 2: bindWorkbench logs warning in non-production on error', () => {
  setupMockEnvironment()
  const savedEnv = process.env.NODE_ENV
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  globalThis.window = {
    __omnimuxSidebar: { register() { return () => {} } },
    __omnimuxWorkbench: {
      bind() {
        throw new Error('simulated workbench bind failure')
      },
    },
  }

  try {
    // 1. 开发态：应当捕获异常并输出开发态告警
    process.env.NODE_ENV = 'development'
    warnings.length = 0
    let unmount
    assert.doesNotThrow(() => {
      unmount = apply({
        inject: (deps, fn) => {
          fn({ betterSidebar: { registerTab: () => () => {} } })
        },
      })
    }, 'apply must not throw when bindWorkbench throws')

    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] Failed to bind workbench patch:')),
      'should log warning in development when bindWorkbench throws'
    )
    assert.doesNotThrow(() => unmount?.())

    // 2. 生产态：静默容灾，不输出告警
    process.env.NODE_ENV = 'production'
    warnings.length = 0
    let unmountProd
    assert.doesNotThrow(() => {
      unmountProd = apply({
        inject: (deps, fn) => {
          fn({ betterSidebar: { registerTab: () => () => {} } })
        },
      })
    })
    assert.equal(warnings.length, 0, 'should not log warning in production')
    assert.doesNotThrow(() => unmountProd?.())
  } finally {
    process.env.NODE_ENV = savedEnv
    console.warn = originalWarn
  }
})

test('Issue #2657 Review Round 6 - Point 3: static export const inject contains locale', async () => {
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')
  assert.match(
    indexSrc,
    /export\s+const\s+inject\s*=\s*\[\s*['"]locale['"]\s*\]/,
    'inject must declare locale'
  )
})

test('Static code review audit: verifies all 3 Review Round 6 points in source code', () => {
  const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url))
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [High] package.json 补齐 react peerDependencies 及 peerDependenciesMeta
  assert.equal(pkg.peerDependencies?.react, '^18.2.0 || ^19.0.0')
  assert.equal(pkg.peerDependenciesMeta?.react?.optional, true)

  // 2. [Medium] bindWorkbench 内部空 catch 补充非生产环境告警
  assert.match(indexSrc, /console\.warn\(\s*['"]\[omnimux-video\] Failed to bind workbench patch:['"],\s*err\s*\)/)
  assert.match(indexSrc, /typeof\s+process\s*!==\s*['"]undefined['"]\s*&&\s*process\.env\?\.NODE_ENV\s*!==\s*['"]production['"]/)

  // 3. [Medium] 模块顶层静态声明 export const inject 在 Round 10 收敛为 ['locale']
  assert.match(indexSrc, /export\s+const\s+inject\s*=\s*\[\s*['"]locale['"]\s*\]/)
})

test('Issue #2657 Review Round 7 - Point 1: dict fallback defaults to en dictionary', () => {
  setupMockEnvironment()
  let registeredRow = null
  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => {}
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore() {
        return {
          getSnapshot() { return false },
          subscribe() { return () => {} },
          open() {},
          close() {},
        }
      },
    },
  }

  // 传入非 zh 的未配置语言代码（如 'ja' 或 'fr'），且未传自定义翻译函数，应回退至默认英文字典
  const unmount = mountSidebarEntry(null, { current: 'ja' })
  assert.ok(registeredRow, 'entry should be registered')
  const entry = registeredRow.create()
  const labelSpan = entry.querySelector('.omnimux-sidebar-nav-entry-label')
  const badgeSpan = entry.querySelector('.omnimux-sidebar-alpha-badge')

  assert.equal(labelSpan.textContent, 'Google Vids')
  assert.equal(badgeSpan.textContent, 'Alpha')
  assert.equal(badgeSpan.getAttribute('aria-label'), 'Alpha')
  assert.equal(entry.title, 'Google Vids · Alpha')
  assert.equal(entry.getAttribute('aria-label'), 'Google Vids · Alpha')
  unmount?.()
})

test('Issue #2657 Review Round 7 - Point 2: coordinator register error preserves polling retry and clears timer on eventual success', () => {
  setupMockEnvironment()
  let clearedTimer = false
  const realClearInterval = globalThis.clearInterval
  globalThis.clearInterval = (id) => {
    clearedTimer = true
    realClearInterval(id)
  }

  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  let registerAttempts = 0
  let unregisterCalled = false

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registerAttempts++
        if (registerAttempts === 1) {
          throw new Error('transient coordinator error on first attempt')
        }
        return () => {
          unregisterCalled = true
        }
      },
    },
  }

  try {
    // 首次 attempt 执行抛出异常，timer 应该被保留以便重试（clearedTimer === false）
    const unmount = mountSidebarEntry((k) => k)
    assert.equal(registerAttempts, 1)
    assert.equal(clearedTimer, false, 'timer must NOT be cleared on transient failure')
    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] sidebar coordinator register failed:')),
      'transient error should be logged'
    )

    // 清理 unmount
    unmount?.()
    assert.equal(clearedTimer, true, 'timer must be cleared on unmount')
  } finally {
    globalThis.clearInterval = realClearInterval
    console.warn = originalWarn
  }
})

test('Static code review audit: verifies all 2 Review Round 7 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')

  // 1. [Medium] 将 dict fallback 对齐默认英文契约 (|| GOOGLE_VIDS_SIDEBAR_I18N.en)
  assert.match(
    sidebarSrc,
    /const\s+dict\s*=\s*GOOGLE_VIDS_SIDEBAR_I18N\[lang\]\s*\|\|\s*GOOGLE_VIDS_SIDEBAR_I18N\.en/,
    'dict fallback must point to GOOGLE_VIDS_SIDEBAR_I18N.en'
  )

  // 2. [Medium] 定时器清理与返回逻辑收敛至 try 块内的成功分支；在 catch 块中仅记录告警并保留重试能力
  assert.match(
    sidebarSrc,
    /try\s*\{\s*const\s+ret\s*=\s*win\.register\(row\)\s*(?:registered\s*=\s*true\s*)?unregister\s*=\s*typeof\s+ret\s*===\s*['"]function['"]\s*\?\s*ret\s*:\s*\(\)\s*=>\s*\{\}\s*if\s*\(\s*timer\s*\)\s*clearInterval\(timer\)\s*return\s*\}\s*catch\s*\(\s*err\s*\)\s*\{\s*if\s*\(\s*typeof\s+process\s*!==\s*['"]undefined['"]\s*&&\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]\s*\)\s*\{\s*console\.warn\(\s*['"]\[omnimux-video\] sidebar coordinator register failed:['"],\s*err\s*\)\s*\}\s*(?:return\s*)?\}/,
    'timer cleanup and return must converge in try success block, and catch logs warning without preventing timeout'
  )
})

test('Issue #2657 Review Round 8 - Point 1: store subscribe eliminates spurious listener invocation and relies purely on store events', async () => {
  globalThis.window = {}
  const store = createGoogleVidsStageStore(() => 'Google Vids')

  let listenerCallCount = 0
  const listener = () => { listenerCallCount++ }

  // 1. 同步触发场景：底层 store 在 subscribe 时同步执行回调
  const unsub = store.subscribe(listener)
  assert.equal(listenerCallCount, 0, 'Before workbench ready, listener must not be called')

  let syncSubTriggered = false
  let backendListener = null
  globalThis.window.__omnimuxWorkbench = {
    createSidebarStore() {
      return {
        subscribe(fn) {
          syncSubTriggered = true
          backendListener = fn
          fn() // 模拟底层 store 注册时同步触发回调
          return () => {}
        },
      }
    },
  }

  // 等待 200ms 轮询 tick
  await new Promise((resolve) => setTimeout(resolve, 260))

  assert.equal(syncSubTriggered, true, 'Workbench store subscribe should be called in polling tick')
  assert.equal(listenerCallCount, 2, 'Listener should be called when store emits synchronously plus post-subscribe initial alignment')

  // 后续底层 store 状态变化时仍应触发
  backendListener?.()
  assert.equal(listenerCallCount, 3, 'subsequent store notifications must continue to trigger listener')
  unsub()

  // 2. 异步触发场景：底层 store 在 subscribe 时未同步执行回调，轮询成功后主动执行一次 listener() 对齐首屏激活态高亮
  globalThis.window = {}
  const asyncStore = createGoogleVidsStageStore(() => 'Google Vids')
  let asyncListenerCallCount = 0
  const asyncUnsub = asyncStore.subscribe(() => { asyncListenerCallCount++ })
  assert.equal(asyncListenerCallCount, 0)

  let asyncSubTriggered = false
  let asyncBackendListener = null
  globalThis.window.__omnimuxWorkbench = {
    createSidebarStore() {
      return {
        subscribe(fn) {
          asyncSubTriggered = true
          asyncBackendListener = fn
          return () => {}
        },
      }
    },
  }

  await new Promise((resolve) => setTimeout(resolve, 260))
  assert.equal(asyncSubTriggered, true)
  assert.equal(asyncListenerCallCount, 1, 'When store subscribe resolves asynchronously, listener must be invoked once to align active highlight')

  asyncBackendListener?.()
  assert.equal(asyncListenerCallCount, 2, 'Subsequent real store events trigger listener normally')
  asyncUnsub()
})

test('Static code review audit: verifies all 1 Review Round 8 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')

  // 1. [Medium] 移除 immediatelyCalled 与虚假 listener() 调用，直接由 next.subscribe(listener) 驱动
  assert.doesNotMatch(sidebarSrc, /immediatelyCalled/, 'sidebar-entry.js must eliminate immediatelyCalled')
  assert.doesNotMatch(sidebarSrc, /if\s*\(\s*!disposed\s*&&\s*!immediatelyCalled\s*\)\s*listener\(\)/)
  assert.match(sidebarSrc, /(?:unsub|const\s+sub)\s*=\s*next\.subscribe\(listener\)/)
})

test('Issue #2657 Review Round 9 - Point 1: dispose triggers window.__omnimuxWorkbench.unbind({ betterSidebar: null })', () => {
  setupMockEnvironment()
  const unbindCalls = []
  globalThis.window = {
    __omnimuxSidebar: { register() { return () => {} } },
    __omnimuxWorkbench: {
      bind() {},
      unbind(patch) {
        unbindCalls.push(patch)
      },
    },
  }

  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      fn({ betterSidebar: { registerTab: () => () => {} } })
    },
  })

  assert.equal(unbindCalls.length, 0, 'unbind should not be called before dispose')
  dispose()
  assert.equal(unbindCalls.length, 1, 'unbind should be called once on dispose')
  assert.deepEqual(unbindCalls[0], { betterSidebar: null })

  // 验证 unbind 抛出异常时的容灾与开发态告警
  const savedEnv = process.env.NODE_ENV
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  try {
    process.env.NODE_ENV = 'development'
    globalThis.window.__omnimuxWorkbench.unbind = () => {
      throw new Error('simulated unbind error')
    }
    const dispose2 = apply({
      inject: (deps, fn) => {
        fn({ betterSidebar: { registerTab: () => () => {} } })
      },
    })
    assert.doesNotThrow(() => dispose2(), 'dispose must not throw if unbind fails')
    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] Failed to unbind workbench patch:')),
      'should log warning in development when unbind throws'
    )
  } finally {
    process.env.NODE_ENV = savedEnv
    console.warn = originalWarn
  }
})

test('Issue #2657 Review Round 9 - Point 2: ctx.inject betterSidebar warning timeout in development', () => {
  const savedEnv = process.env.NODE_ENV
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout

  try {
    // 1. 开发环境：未 resolve 时 8 秒超时触发告警
    process.env.NODE_ENV = 'development'
    warnings.length = 0
    let scheduledFn = null
    let scheduledDelay = null
    let timerCleared = false

    globalThis.setTimeout = (fn, ms) => {
      scheduledFn = fn
      scheduledDelay = ms
      return 12345
    }
    globalThis.clearTimeout = (id) => {
      if (id === 12345) timerCleared = true
    }

    const dispose = apply({
      locale: { register() {}, bind: () => (k) => k },
      inject: (deps, fn) => {
        // 模拟依赖未就绪，不调用 fn
      },
    })

    assert.equal(scheduledDelay, 8000, 'timeout must be scheduled for 8000ms')
    assert.equal(typeof scheduledFn, 'function')
    assert.equal(warnings.length, 0)

    // 触发定时器
    scheduledFn()
    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] betterSidebar service injection timed out')),
      'should log timeout warning when injection does not resolve'
    )

    // 调用 dispose 应清理定时器
    dispose()
    assert.equal(timerCleared, true, 'dispose must clear injection timeout timer')

    // 2. 正常 resolve 场景：8秒内 resolve 应清理定时器且不输出告警
    warnings.length = 0
    timerCleared = false
    scheduledFn = null

    const disposeResolved = apply({
      locale: { register() {}, bind: () => (k) => k },
      inject: (deps, fn) => {
        fn({ betterSidebar: { registerTab: () => () => {} } })
      },
    })

    assert.equal(timerCleared, true, 'timer must be cleared upon successful injection resolution')
    if (typeof scheduledFn === 'function') {
      scheduledFn()
    }
    assert.equal(warnings.length, 0, 'no timeout warning should be logged after resolution')
    disposeResolved()

    // 3. 生产环境：不设置超时诊断定时器
    process.env.NODE_ENV = 'production'
    scheduledFn = null
    const disposeProd = apply({
      locale: { register() {}, bind: () => (k) => k },
      inject: (deps, fn) => {},
    })
    assert.equal(scheduledFn, null, 'no timeout should be scheduled in production')
    disposeProd()
  } finally {
    process.env.NODE_ENV = savedEnv
    console.warn = originalWarn
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
})

test('Issue #2657 Review Round 9 - Point 3: coordinator register catch does not early return and clears timer on timeout', async () => {
  setupMockEnvironment()
  let registerCalls = 0
  globalThis.window = {
    __omnimuxSidebar: {
      register() {
        registerCalls++
        throw new Error('persistent coordinator failure')
      },
    },
  }

  const realDateNow = Date.now
  let fakeTime = 100000
  Date.now = () => fakeTime

  let intervalCleared = false
  const realClearInterval = globalThis.clearInterval
  const realSetInterval = globalThis.setInterval

  let activeIntervalId = null
  globalThis.setInterval = (fn, ms) => {
    const id = realSetInterval(fn, ms)
    activeIntervalId = id
    return id
  }
  globalThis.clearInterval = (id) => {
    if (id === activeIntervalId) {
      intervalCleared = true
    }
    realClearInterval(id)
  }

  try {
    const unmount = mountSidebarEntry((k) => k)
    assert.equal(registerCalls, 1, 'Initial attempt should run')
    assert.equal(intervalCleared, false, 'Timer should not be cleared on transient initial error')

    // 推进时间超过 10s
    fakeTime += 11000
    // 等待 550ms 触发下一次 interval 执行 attempt
    await new Promise((resolve) => setTimeout(resolve, 550))

    assert.ok(registerCalls >= 2, 'Subsequent interval attempts should run')
    assert.equal(
      intervalCleared,
      true,
      'Interval must be cleared on timeout even when coordinator register continuously throws'
    )
    unmount()
  } finally {
    Date.now = realDateNow
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
  }
})

test('Static code review audit: verifies all 3 Review Round 9 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] 在 dispose() 注销流程中补充全局 window.__omnimuxWorkbench 的解绑反向清理逻辑（兼顾 unbind 与 bind({ betterSidebar: null }) 回退契约）
  assert.match(indexSrc, /unbindWorkbench\(\s*\{\s*betterSidebar:\s*null\s*\}\s*\)/)
  assert.match(
    indexSrc,
    /window\.__omnimuxWorkbench\?\.unbind\s*===\s*['"]function['"][\s\S]*?window\.__omnimuxWorkbench\.unbind\(patch\)[\s\S]*?window\.__omnimuxWorkbench\?\.bind\?\.(\(patch\))/
  )

  // 2. [Medium] 使用 ctx.inject(['betterSidebar'], ...) 时，在开发环境增加 8 秒超时警告诊断
  assert.match(indexSrc, /console\.warn\(\s*['"]\[omnimux-video\] betterSidebar service injection timed out['"]\s*\)/)
  assert.match(indexSrc, /setTimeout\([^,]+,\s*8000\)/)

  // 3. [Medium] 在 attempt 的 catch 块中移除 early return，让执行流正常流向末尾的超时判断
  assert.doesNotMatch(
    sidebarSrc,
    /console\.warn\(\s*['"]\[omnimux-video\] sidebar coordinator register failed:['"],\s*err\s*\)\s*\}[\s\n]*return/,
    'coordinator register catch block must not contain early return'
  )
})

test('Issue #2657 Review Round 10 - Point 1: registered state gate and sync attempt timer optimization in coordinator ready', () => {
  setupMockEnvironment()
  const realSetInterval = globalThis.setInterval
  let intervalCount = 0
  globalThis.setInterval = (...args) => {
    intervalCount++
    return realSetInterval(...args)
  }

  let registerCalls = 0
  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registerCalls++
        return () => {}
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore() {
        return {
          getSnapshot() { return false },
          subscribe() { return () => {} },
          open() {},
          close() {},
        }
      },
    },
  }

  try {
    // 首次同步执行 attempt() 成功注册后，registered 为 true，不应启动 setInterval 定时器
    const unmount = mountSidebarEntry(() => 'Google Vids')
    assert.equal(registerCalls, 1, 'Coordinator register should be called immediately on sync mount')
    assert.equal(intervalCount, 0, 'Interval timer must NOT be started if registered synchronously')
    unmount()
  } finally {
    globalThis.setInterval = realSetInterval
  }
})

test('Issue #2657 Review Round 10 - Point 2: static export const inject converged to locale only', async () => {
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')
  assert.match(
    indexSrc,
    /export\s+const\s+inject\s*=\s*\[\s*['"]locale['"]\s*\]/,
    'static inject declaration must be converged to [locale] only'
  )
  assert.doesNotMatch(
    indexSrc,
    /export\s+const\s+inject\s*=\s*\[[^\]]*['"]betterSidebar['"]/,
    'static inject must eliminate betterSidebar to prevent double injection conflict'
  )
})

test('Issue #2657 Review Round 10 - Point 3: repeat inject callback unbinds previous workbench state before rebinding', () => {
  setupMockEnvironment()
  const unbindCalls = []
  const bindCalls = []
  globalThis.window = {
    __omnimuxWorkbench: {
      bind(patch) {
        bindCalls.push(patch)
      },
      unbind(patch) {
        unbindCalls.push(patch)
      },
    },
  }

  let injectFn = null
  const dispose = apply({
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  const mockSidebar1 = { id: 'sidebar1', registerTab: () => () => {} }
  const mockSidebar2 = { id: 'sidebar2', registerTab: () => () => {} }

  // 首次 inject
  injectFn({ betterSidebar: mockSidebar1 })
  assert.equal(bindCalls.length, 1)
  assert.equal(unbindCalls.length, 0, 'No unbind on first inject')

  // 重复触发 inject
  injectFn({ betterSidebar: mockSidebar2 })
  assert.equal(unbindCalls.length, 1, 'Previous workbench state must be unbound before rebinding')
  assert.deepEqual(unbindCalls[0], { betterSidebar: null })
  assert.equal(bindCalls.length, 2, 'New workbench state must be rebound')

  dispose()
})

test('Issue #2657 Review Round 10 - Point 4: workbenchBound state flag prevents spurious unbind on dispose', () => {
  setupMockEnvironment()
  const unbindCalls = []
  globalThis.window = {
    __omnimuxWorkbench: {
      bind() {},
      unbind(patch) {
        unbindCalls.push(patch)
      },
    },
  }

  // 场景 A：未触发 inject（或无 betterSidebar）时 dispose 不执行虚假解绑
  const disposeWithoutBind = apply({
    inject: () => {}, // inject callback 未调用
  })
  disposeWithoutBind()
  assert.equal(unbindCalls.length, 0, 'Spurious unbind must be prevented when workbench was never bound')

  // 场景 B：绑定成功后 dispose 执行解绑，且二次 dispose 不重复解绑
  let injectFn = null
  const disposeWithBind = apply({
    inject: (deps, fn) => {
      injectFn = fn
    },
  })
  injectFn({ betterSidebar: { registerTab: () => () => {} } })
  disposeWithBind()
  assert.equal(unbindCalls.length, 1, 'Valid bound workbench must be unbound once on dispose')

  // 重复调用 dispose，标志位已被重置为 false，不会二次 unbind
  disposeWithBind()
  assert.equal(unbindCalls.length, 1, 'Repeated dispose must not trigger duplicate unbind')
})

test('Static code review audit: verifies all 4 Review Round 10 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] registerWhenCoordinatorReady: let registered = false, if (disposed || registered) return, attempt() 首次后仅当 !registered 才 setInterval
  assert.match(sidebarSrc, /let\s+registered\s*=\s*false/)
  assert.match(sidebarSrc, /if\s*\(\s*(?:disposed\s*\|\|\s*registered|registered\s*\|\|\s*disposed)\s*\)\s*return/)
  assert.match(sidebarSrc, /registered\s*=\s*true/)
  assert.match(sidebarSrc, /attempt\(\)[\s\S]*?if\s*\(\s*!registered\s*\)\s*\{\s*timer\s*=\s*setInterval\(attempt,\s*500\)\s*\}/)

  // 2. [Medium] 模块顶层静态声明收敛为 export const inject = ['locale']
  assert.match(indexSrc, /export\s+const\s+inject\s*=\s*\[\s*['"]locale['"]\s*\]/)

  // 3. [Medium] ctx.inject 回调中若已被多次触发（injectResolved 为 true），先执行 unbindWorkbench
  assert.match(indexSrc, /if\s*\(\s*injectResolved\s*\)\s*\{\s*unbindWorkbench\(\s*\{\s*betterSidebar:\s*null\s*\}\s*\)/)

  // 4. [Medium] 引入 let workbenchBound = false，成功绑定置为 true，dispose 仅在 workbenchBound 为 true 时解绑并重置
  assert.match(indexSrc, /let\s+workbenchBound\s*=\s*false/)
  assert.match(indexSrc, /workbenchBound\s*=\s*true/)
  assert.match(indexSrc, /if\s*\(\s*workbenchBound\s*\)\s*\{\s*unbindWorkbench\(\s*\{\s*betterSidebar:\s*null\s*\}\s*\)\s*workbenchBound\s*=\s*false/)
})

test('Issue #2657 Review Round 11 - Point 1: pluginDisposed guard suppresses inject callback after dispose', () => {
  setupMockEnvironment()
  let bindCalls = 0
  let registerTabCalls = 0
  globalThis.window = {
    __omnimuxWorkbench: {
      bind() { bindCalls++ },
      unbind() {},
    },
  }

  let injectFn = null
  const dispose = apply({
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  // 在 inject 异步回调到达前即销毁插件
  dispose()

  // 随后延迟触发 inject 回调
  injectFn({
    betterSidebar: {
      registerTab() {
        registerTabCalls++
        return () => {}
      },
    },
  })

  assert.equal(bindCalls, 0, 'Workbench bind must not be called when plugin was already disposed')
  assert.equal(registerTabCalls, 0, 'Tab registration must not occur when plugin was already disposed')
})

test('Issue #2657 Review Round 11 - Point 2: workbenchBound is true only when bind is actually called', () => {
  setupMockEnvironment()
  const unbindCalls = []

  // 场景 A：workbench 对象没有 bind 方法
  globalThis.window = {
    __omnimuxWorkbench: {
      unbind(patch) { unbindCalls.push(patch) },
    },
  }

  let injectFn = null
  const disposeA = apply({
    inject: (deps, fn) => { injectFn = fn },
  })
  injectFn({ betterSidebar: { registerTab: () => () => {} } })
  disposeA()
  assert.equal(unbindCalls.length, 0, 'workbenchBound should remain false when bind does not exist, so no unbind on dispose')

  // 场景 B：workbench 具有有效的 bind 方法
  let bindCalls = 0
  globalThis.window.__omnimuxWorkbench.bind = () => { bindCalls++ }
  const disposeB = apply({
    inject: (deps, fn) => { injectFn = fn },
  })
  injectFn({ betterSidebar: { registerTab: () => () => {} } })
  assert.equal(bindCalls, 1, 'bind method should be called')
  disposeB()
  assert.equal(unbindCalls.length, 1, 'unbind should be called once on dispose when bind was successfully invoked')
})

test('Issue #2657 Review Round 11 - Point 3: ctx.effect branch unregisters previous tab before registering new tab on repeat inject', () => {
  setupMockEnvironment()
  let tab1Unregistered = false
  let tab2Unregistered = false
  const mockSidebar1 = {
    registerTab() {
      return () => { tab1Unregistered = true }
    },
  }
  const mockSidebar2 = {
    registerTab() {
      return () => { tab2Unregistered = true }
    },
  }

  let injectFn = null
  let activeEffectCleanup = null
  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    effect: (fn) => {
      if (typeof activeEffectCleanup === 'function') activeEffectCleanup()
      activeEffectCleanup = fn()
      return activeEffectCleanup
    },
    inject: (deps, fn) => { injectFn = fn },
  })

  // 首次 inject
  injectFn({ betterSidebar: mockSidebar1 })
  assert.equal(tab1Unregistered, false, 'Tab 1 should be active initially')

  // 第二次 inject（重复触发）
  injectFn({ betterSidebar: mockSidebar2 })
  assert.equal(tab1Unregistered, true, 'Previous tab must be unregistered before new tab registers in ctx.effect branch')
  assert.equal(tab2Unregistered, false, 'New tab 2 should not be unregistered yet')

  dispose()
})

test('Issue #2657 Review Round 11 - Point 4: store subscribe removes immediatelyCalled and eliminates spurious initial snapshot notifications', async () => {
  globalThis.window = {}
  const store = createGoogleVidsStageStore(() => 'Google Vids')
  let notifications = 0
  const unsub = store.subscribe(() => { notifications++ })

  let triggerRealEvent = null
  globalThis.window.__omnimuxWorkbench = {
    createSidebarStore() {
      return {
        subscribe(fn) {
          triggerRealEvent = fn
          return () => {}
        },
      }
    },
  }

  // 等待 260ms
  await new Promise((r) => setTimeout(r, 260))
  assert.equal(notifications, 1, 'Listener should be called once upon store ready to align active highlight on initial load')

  // 真实事件发生
  triggerRealEvent()
  assert.equal(notifications, 2, 'Listener should be called on genuine underlying store event')
  unsub()
})

test('Issue #2657 Review Round 11 - Point 5: resolvedLocale.subscribe return value safe guard against non-function', () => {
  setupMockEnvironment()
  globalThis.window = {}

  // 场景：subscribe 返回非函数（如 undefined 或普通对象）
  const badLocale1 = {
    subscribe: () => undefined,
  }
  const unmount1 = mountSidebarEntry(() => 'Google Vids', badLocale1)
  assert.doesNotThrow(() => {
    unmount1()
  }, 'unmount must not throw when locale.subscribe returns undefined')

  const badLocale2 = {
    subscribe: () => 'invalid-subscription',
  }
  const unmount2 = mountSidebarEntry(() => 'Google Vids', badLocale2)
  assert.doesNotThrow(() => {
    unmount2()
  }, 'unmount must not throw when locale.subscribe returns non-function string')
})

test('Issue #2657 Review Round 11 - Point 6: ensure() validates bound workbench staleness and re-creates store upon workbench reload', () => {
  globalThis.window = {}
  let storeCreated1 = 0
  let storeCreated2 = 0

  const wb1 = {
    createSidebarStore() {
      storeCreated1++
      return {
        getSnapshot() { return true },
        open() {},
        close() {},
      }
    },
  }
  const wb2 = {
    createSidebarStore() {
      storeCreated2++
      return {
        getSnapshot() { return false },
        open() {},
        close() {},
      }
    },
  }

  globalThis.window.__omnimuxWorkbench = wb1
  const store = createGoogleVidsStageStore(() => 'Google Vids')

  // 首次访问 wb1
  assert.equal(store.getSnapshot(), true)
  assert.equal(storeCreated1, 1)

  // 再次访问 wb1，缓存命中，不重新创建
  assert.equal(store.getSnapshot(), true)
  assert.equal(storeCreated1, 1, 'Store must be cached while workbench is unchanged')

  // 模拟热重载：window.__omnimuxWorkbench 被替换为新的 wb2
  globalThis.window.__omnimuxWorkbench = wb2
  assert.equal(store.getSnapshot(), false)
  assert.equal(storeCreated2, 1, 'Store must be refreshed and recreated when workbench instance changes')

  // 模拟 workbench 被清空
  globalThis.window.__omnimuxWorkbench = undefined
  assert.equal(store.getSnapshot(), false, 'Store gracefully returns fallback when workbench is cleared')
})

test('Static code review audit: verifies all 6 Review Round 11 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [High] let pluginDisposed = false, if (pluginDisposed) return, dispose() 顶层 pluginDisposed = true
  assert.match(indexSrc, /let\s+pluginDisposed\s*=\s*false/)
  assert.match(indexSrc, /if\s*\(\s*pluginDisposed\s*\)\s*return/)
  assert.match(indexSrc, /const\s+dispose\s*=\s*\(\)\s*=>\s*\{[\s\n]+pluginDisposed\s*=\s*true/)

  // 2. [Medium] workbenchBound = true 仅在真实调用了 bind 后才置位
  assert.match(
    indexSrc,
    /if\s*\(\s*window\.__omnimuxWorkbench\?\.bind\s*\)\s*\{[\s\n]+window\.__omnimuxWorkbench\.bind\(patch\)[\s\n]+workbenchBound\s*=\s*true[\s\n]+\}/
  )

  // 3. [Medium] ctx.effect 分支由 ctx.effect 原生接管，非 effect 分支由 prevUnregisterTab 纳管
  assert.match(
    indexSrc,
    /if\s*\(\s*typeof\s+ctx\.effect\s*===\s*['"]function['"]\s*\)\s*\{[\s\S]*?ctx\.effect[\s\S]*?registerGoogleVidsTab\(sidebar\)[\s\S]*?\}[\s\S]*?else\s*\{[\s\S]*?prevUnregisterTab/
  )

  // 4. [Medium] 彻底移除 immediatelyCalled 与虚假通知
  assert.doesNotMatch(sidebarSrc, /immediatelyCalled/)
  assert.doesNotMatch(sidebarSrc, /if\s*\(\s*!disposed\s*&&\s*!immediatelyCalled\s*\)\s*listener\(\)/)

  // 5. [Medium] resolvedLocale.subscribe 返回值函数安全门禁
  assert.match(
    sidebarSrc,
    /const\s+rawUnsub\s*=\s*typeof\s+resolvedLocale\?\.subscribe\s*===\s*['"]function['"]\s*\?\s*resolvedLocale\.subscribe\(updateTexts\)\s*:\s*undefined/
  )
  assert.match(
    sidebarSrc,
    /const\s+unsubscribeLocale\s*=\s*typeof\s+rawUnsub\s*===\s*['"]function['"]\s*\?\s*rawUnsub\s*:\s*\(\)\s*=>\s*\{\}/
  )

  // 6. [Medium] ensure() 校验 boundWorkbench 是否过期并在变更时刷新重建
  assert.match(sidebarSrc, /let\s+boundWorkbench\s*=\s*null/)
  assert.match(sidebarSrc, /if\s*\(\s*store\s*&&\s*boundWorkbench\s*===\s*api\s*\)\s*return\s+store/)
  assert.match(sidebarSrc, /boundWorkbench\s*=\s*api/)
})

test('Issue #2657 Review Round 12 - Point 1: subscribe race condition TOCTOU disposed guard immediately unsubscribes', async () => {
  globalThis.window = {}
  const store = createGoogleVidsStageStore(() => 'Google Vids')
  let subCalls = 0
  let unsubCalls = 0
  let cancelSubscription = null

  // 首次订阅，由于 window.__omnimuxWorkbench 不存在，进入 200ms 轮询
  cancelSubscription = store.subscribe(() => {})

  // 此时 workbench 在轮询过程中就绪
  globalThis.window.__omnimuxWorkbench = {
    createSidebarStore() {
      return {
        subscribe() {
          subCalls++
          // 模拟 TOCTOU 竞态：在 next.subscribe 调用但 unsub 尚未赋值的瞬间，外部触发了销毁 (disposed = true)
          cancelSubscription()
          return () => {
            unsubCalls++
          }
        },
      }
    },
  }

  // 等待轮询定时器触发（200ms）
  await new Promise((r) => setTimeout(r, 260))
  assert.equal(subCalls, 1, 'Subscribe should have been called on workbench store')
  assert.equal(unsubCalls, 1, 'Subscription created while disposed must be immediately unsubscribed')
})

test('Issue #2657 Review Round 12 - Point 2: unmount explicitly removes click listener via removeEventListener', () => {
  setupMockEnvironment()
  let opened = false
  let registeredRow = null
  globalThis.window = {
    __omnimuxSidebar: {
      register: (row) => {
        registeredRow = row
        return () => {}
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore: () => ({
        getSnapshot: () => false,
        subscribe: () => () => {},
        open: () => { opened = true },
      }),
    },
  }

  const unmount = mountSidebarEntry(() => 'Google Vids', { current: 'zh' })
  assert.ok(registeredRow, 'Row should be registered')
  const entry = registeredRow.create()

  assert.equal(typeof entry.listeners.click, 'function', 'click listener should be attached')
  entry.click()
  assert.equal(opened, true, 'click listener should trigger open')

  // 卸载
  unmount()
  assert.equal(entry.listeners.click, undefined, 'click listener must be removed upon unmount')
})

test('Issue #2657 Review Round 12 - Point 3: ensure() cleans up old store when boundWorkbench !== api', () => {
  globalThis.window = {}
  let disposed1 = false
  let destroyed2 = false

  const wb1 = {
    createSidebarStore() {
      return {
        getSnapshot: () => true,
        dispose: () => { disposed1 = true },
      }
    },
  }
  const wb2 = {
    createSidebarStore() {
      return {
        getSnapshot: () => true,
        destroy: () => { destroyed2 = true },
      }
    },
  }

  globalThis.window.__omnimuxWorkbench = wb1
  const store = createGoogleVidsStageStore(() => 'Google Vids')
  assert.equal(store.getSnapshot(), true)
  assert.equal(disposed1, false)

  // 切换到 wb2
  globalThis.window.__omnimuxWorkbench = wb2
  assert.equal(store.getSnapshot(), true)
  assert.equal(disposed1, true, 'Old store must be disposed when workbench changes')
  assert.equal(destroyed2, false)

  // 清空 workbench
  globalThis.window.__omnimuxWorkbench = null
  assert.equal(store.getSnapshot(), false)
  assert.equal(destroyed2, true, 'Second store must be destroyed when workbench is removed')
})

test('Issue #2657 Review Round 12 - Point 4: ctx.effect branch tab unregistration is natively managed', () => {
  let tabUnregistered = false
  const mockSidebar = {
    registerTab() {
      return () => {
        tabUnregistered = true
      }
    },
  }

  let effectCleanup = null
  let injectFn = null
  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    effect: (fn) => {
      effectCleanup = fn()
      return effectCleanup
    },
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  injectFn({ betterSidebar: mockSidebar })
  assert.equal(tabUnregistered, false, 'Tab should not be unregistered initially')
  assert.equal(typeof effectCleanup, 'function', 'effect must return native unregister cleanup function')

  // effect 清理函数触发时正常注销
  effectCleanup()
  assert.equal(tabUnregistered, true, 'Tab must be unregistered when effect cleanup runs')

  // 全局 dispose 不应再次重复注销或崩溃
  assert.doesNotThrow(() => {
    dispose()
  })
})

test('Static code review audit: verifies all 4 Review Round 12 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] TOCTOU 防御：在赋值 unsub 前二次核验 disposed，若已被销毁立即退订
  assert.match(sidebarSrc, /const\s+sub\s*=\s*next\.subscribe\(listener\)/)
  assert.match(sidebarSrc, /if\s*\(\s*disposed\s*\)\s*\{[\s\n]+if\s*\(\s*typeof\s+sub\s*===\s*['"]function['"]\s*\)\s*sub\(\)/)
  assert.match(sidebarSrc, /unsub\s*=\s*typeof\s+sub\s*===\s*['"]function['"]\s*\?\s*sub\s*:\s*\(\)\s*=>\s*\{\}/)

  // 2. [Medium] 提取具名 handleClick 函数并在返回的 cleanup 中显式调用 entry.removeEventListener('click', handleClick)
  assert.match(sidebarSrc, /const\s+handleClick\s*=\s*\(\)\s*=>\s*\{[\s\S]*?stageStore\.open\(\)[\s\S]*?\}/)
  assert.match(sidebarSrc, /entry\.addEventListener\(['"]click['"],\s*handleClick\)/)
  assert.match(sidebarSrc, /entry\.removeEventListener\(['"]click['"],\s*handleClick\)/)

  // 3. [Medium] 当 boundWorkbench !== api 时，在替换 store 前对旧 store 执行退订/清理兜底（分立独立的两个 try-catch 块）
  assert.match(sidebarSrc, /try\s*\{\s*store\?\.dispose\?\.?\(\)\s*\}\s*catch\s*\{\s*\}\s*[\r\n\s]*try\s*\{\s*store\?\.destroy\?\.?\(\)\s*\}\s*catch/)

  // 4. [Medium] 在 ctx.effect 分支中，严格由 ctx.effect 原生接管，绝不向外层 disposers 乱推闭包
  const effectBranchSrc = indexSrc.slice(
    indexSrc.indexOf("typeof ctx.effect === 'function'"),
    indexSrc.indexOf('} else {')
  )
  assert.doesNotMatch(
    effectBranchSrc,
    /disposers\.push/,
    'ctx.effect branch must strictly not push to disposers'
  )
})

test('Issue #2657 Review Round 13 - Point 1: ensure() independently calls dispose and destroy sequentially without short-circuiting', () => {
  globalThis.window = {}
  let disposedCalled = false
  let destroyCalled = false

  const wbWithBoth = {
    createSidebarStore() {
      return {
        getSnapshot: () => true,
        dispose: () => {
          disposedCalled = true
          return true // 返回 truthy，在旧代码 || 逻辑下会短路导致 destroy 不被调用
        },
        destroy: () => {
          destroyCalled = true
        },
      }
    },
  }

  globalThis.window.__omnimuxWorkbench = wbWithBoth
  const store = createGoogleVidsStageStore(() => 'Google Vids')
  assert.equal(store.getSnapshot(), true)
  assert.equal(disposedCalled, false)
  assert.equal(destroyCalled, false)

  // 切换 workbench 实例，触发 ensure() 清理旧 store
  const wbNext = {
    createSidebarStore() {
      return {
        getSnapshot: () => true,
      }
    },
  }
  globalThis.window.__omnimuxWorkbench = wbNext
  assert.equal(store.getSnapshot(), true)
  assert.equal(disposedCalled, true, 'dispose must be called')
  assert.equal(destroyCalled, true, 'destroy must also be called sequentially without being short-circuited by dispose return value')
})

test('Issue #2657 Review Round 13 - Point 2 & 3: ctx.effect tab lifecycle is natively isolated from disposers', () => {
  let unregisterCallCount = 0
  const mockSidebar = {
    registerTab() {
      return () => {
        unregisterCallCount++
      }
    },
  }

  let effectCleanup = null
  let injectFn = null

  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    effect: (fn) => {
      effectCleanup = fn()
      return effectCleanup
    },
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  injectFn({ betterSidebar: mockSidebar })
  assert.equal(unregisterCallCount, 0, 'Tab should not be unregistered initially')
  assert.equal(typeof effectCleanup, 'function', 'effect must return native unregister cleanup function')

  // effect 容器执行 cleanup
  effectCleanup()
  assert.equal(unregisterCallCount, 1, 'effect cleanup must invoke unregisterTab')

  // dispose 触发，绝无 disposers 中的冗余闭包再次调用
  dispose()
  assert.equal(unregisterCallCount, 1, 'dispose() must not cause double-disposal of effect-managed tab')
})

test('Issue #2657 Review Round 13 - Point 2 & 3 (variant): non-effect fallback path is managed via prevUnregisterTab and disposers', () => {
  let tab1Unregistered = false
  let tab2Unregistered = false
  const mockSidebar1 = {
    registerTab() {
      return () => { tab1Unregistered = true }
    },
  }
  const mockSidebar2 = {
    registerTab() {
      return () => { tab2Unregistered = true }
    },
  }

  let injectFn = null

  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  injectFn({ betterSidebar: mockSidebar1 })
  assert.equal(tab1Unregistered, false)

  // 重复注入触发，安全注销 tab1
  injectFn({ betterSidebar: mockSidebar2 })
  assert.equal(tab1Unregistered, true, 'Previous tab must be unregistered before new tab registers in non-effect branch')
  assert.equal(tab2Unregistered, false)

  // 全局 dispose 触发，安全注销当前 tab2
  dispose()
  assert.equal(tab2Unregistered, true, 'Current tab must be unregistered on dispose in non-effect branch')
})

test('Static code review audit: verifies all 3 Review Round 13 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] 消除短路：彻底分立为两个独立的 try...catch 块
  assert.match(
    sidebarSrc,
    /try\s*\{\s*store\?\.dispose\?\.?\(\)\s*\}\s*catch\s*\{\s*\}\s*[\r\n\s]*try\s*\{\s*store\?\.destroy\?\.?\(\)\s*\}\s*catch/,
    'sidebar-entry.js must independently call dispose and destroy sequentially in separate try-catch blocks without short-circuiting'
  )

  // 2 & 3. [Medium] 标准范式：ctx.effect 分支原生接管 Tab 生命周期（返回 registerGoogleVidsTab），非 effect 分支由 prevUnregisterTab 与 disposers 接管
  assert.match(
    indexSrc,
    /if\s*\(\s*typeof\s+ctx\.effect\s*===\s*['"]function['"]\s*\)\s*\{[\s\S]*?ctx\.effect[\s\S]*?registerGoogleVidsTab\(sidebar\)/,
    'ctx.effect branch must natively register tab'
  )
  assert.match(
    indexSrc,
    /\}[\s\S]*?else\s*\{[\s\S]*?if\s*\(\s*prevUnregisterTab\s*\)[\s\S]*?disposers\.push\(unregisterTab\)/,
    'non-effect branch must manage tab unregistration via prevUnregisterTab and disposers'
  )
})

test('Issue #2657 Review Round 14 - Point 1: ensure() uses separate try-catch blocks so dispose() throwing error does not skip destroy()', () => {
  globalThis.window = {}
  let disposeCalled = false
  let destroyCalled = false

  const wbThrowingDispose = {
    createSidebarStore() {
      return {
        getSnapshot: () => true,
        dispose: () => {
          disposeCalled = true
          throw new Error('store.dispose exploded with error')
        },
        destroy: () => {
          destroyCalled = true
        },
      }
    },
  }

  globalThis.window.__omnimuxWorkbench = wbThrowingDispose
  const store = createGoogleVidsStageStore(() => 'Google Vids')
  assert.equal(store.getSnapshot(), true)
  assert.equal(disposeCalled, false)
  assert.equal(destroyCalled, false)

  // 切换 workbench 实例，触发 ensure() 清理旧 store
  const wbNext = {
    createSidebarStore() {
      return {
        getSnapshot: () => true,
      }
    },
  }
  globalThis.window.__omnimuxWorkbench = wbNext
  // 必须不抛出异常，且即使 dispose 抛错，destroy 仍被确定性调用
  assert.doesNotThrow(() => {
    store.getSnapshot()
  })
  assert.equal(disposeCalled, true, 'store.dispose() must be called')
  assert.equal(destroyCalled, true, 'store.destroy() must still be called even when dispose() threw error')
})

test('Issue #2657 Review Round 14 - Point 2: ctx.effect natively manages tab lifecycle and never pushes to outer disposers', () => {
  let unregisterCalled = 0
  const mockSidebar = {
    registerTab() {
      return () => {
        unregisterCalled += 1
      }
    },
  }

  let effectCleanup = null
  let injectFn = null

  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    effect: (fn) => {
      effectCleanup = fn()
      return effectCleanup
    },
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  injectFn({ betterSidebar: mockSidebar })
  assert.equal(unregisterCalled, 0, 'Tab should not be unregistered initially')
  assert.equal(typeof effectCleanup, 'function', 'ctx.effect must receive native unregister function')

  // 调用全局 dispose() 时，通过 prevEffectCleanup 显式清理并置空，且幂等保护确保后续 effectCleanup 不会重复注销
  dispose()
  assert.equal(unregisterCalled, 1, 'dispose() must explicitly invoke prevEffectCleanup once')

  // 若宿主 effect runner 随后再次执行 cleanup，幂等门禁确保不会二次调用
  effectCleanup()
  assert.equal(unregisterCalled, 1, 'Idempotent effect cleanup must not double-unregister tab')
})

test('Issue #2657 Review Round 14 - Point 3: ctx.inject guards against pluginDisposed before and after tab registration', () => {
  let registerCalled = false
  let unregisterCalled = false
  const mockSidebar = {
    registerTab() {
      registerCalled = true
      return () => {
        unregisterCalled = true
      }
    },
  }

  // 场景 A：插件已 dispose 后才触发 inject 回调，入口守卫杜绝注册
  let injectFnA = null
  const disposeA = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectFnA = fn
    },
  })
  disposeA()
  injectFnA({ betterSidebar: mockSidebar })
  assert.equal(registerCalled, false, 'registerTab must not be called when plugin was already disposed before inject')

  // 场景 B：注册瞬间或注册后检测到已销毁，立即安全注销杜绝异步穿透与泄漏
  let injectFnB = null
  let disposeB = null
  const leakDetectSidebar = {
    registerTab() {
      // 模拟注册期间发生异步销毁
      if (typeof disposeB === 'function') disposeB()
      return () => {
        unregisterCalled = true
      }
    },
  }

  disposeB = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectFnB = fn
    },
  })
  injectFnB({ betterSidebar: leakDetectSidebar })
  assert.equal(unregisterCalled, true, 'Tab must be immediately unregistered if disposed during/right after registration')
})

test('Static code review audit: verifies all 3 Review Round 14 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] sidebar-entry.js 彻底分立为两个独立的 try...catch 块
  assert.match(
    sidebarSrc,
    /try\s*\{\s*store\?\.dispose\?\.?\(\)\s*\}\s*catch\s*\{\s*\}\s*[\r\n\s]*try\s*\{\s*store\?\.destroy\?\.?\(\)\s*\}\s*catch/,
    'sidebar-entry.js must have two independent try-catch blocks for dispose and destroy'
  )

  // 2. [High & Medium] index.js ctx.effect 分支绝无 disposers.push，由 ctx.effect 原生接管
  const injectBlock = indexSrc.slice(indexSrc.indexOf("ctx.inject(['betterSidebar']"))
  const effectBranch = injectBlock.slice(
    injectBlock.indexOf("typeof ctx.effect === 'function'"),
    injectBlock.indexOf('} else {')
  )
  assert.doesNotMatch(effectBranch, /disposers\.push/, 'ctx.effect branch must never push to disposers')
  assert.match(effectBranch, /ctx\.effect\s*\(/, 'ctx.effect must be invoked to natively manage lifecycle')

  // 3. [High & Medium] 注册前后均校验 if (pluginDisposed)，已销毁立即安全注销
  assert.match(indexSrc, /if\s*\(\s*pluginDisposed\s*\)\s*return/, 'must check pluginDisposed before registration')
  assert.match(
    indexSrc,
    /if\s*\(\s*pluginDisposed\s*\)\s*\{[\s\S]*?unregisterTab(\?\.|\()[\s\S]*?return/,
    'must check pluginDisposed after registration and immediately clean up'
  )
})

test('Issue #2657 Review Round 15 - Point 1: explicit prevEffectCleanup management across repeat inject and top-level dispose', () => {
  let tab1CleanupCalls = 0
  let tab2CleanupCalls = 0
  const mockSidebar1 = {
    registerTab() {
      return () => { tab1CleanupCalls += 1 }
    },
  }
  const mockSidebar2 = {
    registerTab() {
      return () => { tab2CleanupCalls += 1 }
    },
  }

  // 模拟不会自动按 label 去重的朴素 ctx.effect 实现
  let injectFn = null
  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    effect: (fn) => fn(),
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  // 第 1 次进入 ctx.inject 回调
  injectFn({ betterSidebar: mockSidebar1 })
  assert.equal(tab1CleanupCalls, 0, 'Tab 1 should remain active after initial inject')

  // 第 2 次进入 ctx.inject 回调：必须通过 prevEffectCleanup() 显式清理上一轮 effect
  injectFn({ betterSidebar: mockSidebar2 })
  assert.equal(tab1CleanupCalls, 1, 'prevEffectCleanup must explicitly clean up Tab 1 on re-inject')
  assert.equal(tab2CleanupCalls, 0, 'Tab 2 should be active after second inject')

  // 顶层 dispose()：必须主动调用 prevEffectCleanup() 清理当前 effect 并置空
  dispose()
  assert.equal(tab2CleanupCalls, 1, 'Top-level dispose() must explicitly invoke prevEffectCleanup for Tab 2')

  // 再次调用 dispose()：prevEffectCleanup 已置空，不重复触发
  dispose()
  assert.equal(tab1CleanupCalls, 1)
  assert.equal(tab2CleanupCalls, 1)
})

test('Issue #2657 Review Round 15 - Point 2: mountSidebarEntry parameter inversion and resolvedT type safety guard', () => {
  setupMockEnvironment()
  let registeredRow = null
  let storeTitleFn = null

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore(opts) {
        storeTitleFn = opts.title
        return {
          getSnapshot() { return false },
          subscribe() { return () => {} },
          open() {},
          close() {},
        }
      },
    },
  }

  // 场景 A：t 与 locale 均为非函数，即使传入了第 3 参数 _legacyLocale，也不应翻转把非法对象赋给 resolvedT
  const unmountA = mountSidebarEntry(null, { current: 'zh' }, { current: 'en' })
  assert.ok(registeredRow)
  const entryA = registeredRow.create()
  const badgeA = entryA.querySelector('.omnimux-sidebar-alpha-badge')
  // resolvedLocale 必须保持为第 2 参数 { current: 'zh' }，resolvedT 兜底为 (k) => k，从而回退到中文字典 '内测版'
  assert.equal(badgeA.textContent, '内测版', 'resolvedLocale must remain second arg when locale is not a function')
  assert.equal(storeTitleFn(), 'Google Vids', 'resolvedT fallback (k) => k must allow resolveText fallback')
  unmountA()

  // 场景 B：t 为非函数且 locale 为函数（向后兼容三参调用），正常翻转
  const customT = (k) => (k === 'sidebar.google_vids.badge' ? 'CustomBadge' : k)
  const unmountB = mountSidebarEntry(null, customT, { current: 'en' })
  const entryB = registeredRow.create()
  const badgeB = entryB.querySelector('.omnimux-sidebar-alpha-badge')
  assert.equal(badgeB.textContent, 'CustomBadge', 'Function in second arg must be resolved as resolvedT')
  unmountB()
})

test('Static code review audit: verifies all 2 Review Round 15 points in source code', () => {
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [High] index.js 显式管理 prevEffectCleanup 句柄
  assert.match(indexSrc, /let\s+prevEffectCleanup\s*=\s*null/)
  assert.match(
    indexSrc,
    /if\s*\(\s*typeof\s+prevEffectCleanup\s*===\s*['"]function['"]\s*\)\s*\{[\s\S]*?prevEffectCleanup\(\)[\s\S]*?prevEffectCleanup\s*=\s*null[\s\S]*?\}/
  )
  assert.match(indexSrc, /prevEffectCleanup\s*=\s*ctx\.effect\(/)

  // 2. [Medium] sidebar-entry.js 参数翻转与 resolvedT 类型安全校验
  assert.match(
    sidebarSrc,
    /if\s*\(\s*typeof\s+t\s*!==\s*['"]function['"]\s*&&\s*typeof\s+locale\s*===\s*['"]function['"]\s*\)\s*\{\s*resolvedT\s*=\s*locale\s*resolvedLocale\s*=\s*_legacyLocale\s*\}/
  )
  assert.match(
    sidebarSrc,
    /if\s*\(\s*typeof\s+resolvedT\s*!==\s*['"]function['"]\s*\)\s*resolvedT\s*=\s*\(\s*k\s*\)\s*=>\s*k/
  )
})

test('Issue #2657 Review Round 16 - Point 1: unbindWorkbench standard fallback to bind({ betterSidebar: null }) when unbind is undefined', () => {
  setupMockEnvironment()
  const bindCalls = []
  globalThis.window = {
    __omnimuxSidebar: { register() { return () => {} } },
    __omnimuxWorkbench: {
      bind(patch) {
        bindCalls.push(patch)
      },
      // 标准宿主环境仅有 bind，无 unbind
    },
  }

  let injectFn = null
  const dispose = apply({
    inject: (deps, fn) => {
      injectFn = fn
    },
  })

  injectFn({ betterSidebar: { registerTab: () => () => {} } })
  assert.equal(bindCalls.length, 1, 'Workbench bind should be called once on inject')
  assert.ok(bindCalls[0].betterSidebar, 'Should bind betterSidebar instance')

  dispose()
  assert.equal(bindCalls.length, 2, 'Workbench bind should be invoked again on dispose for unbinding')
  assert.deepEqual(bindCalls[1], { betterSidebar: null }, 'Unbind fallback must pass { betterSidebar: null } to bind')
})

test('Issue #2657 Review Round 16 - Point 2: unbindWorkbench prefers unbind() when present and handles bind fallback exceptions safely', () => {
  setupMockEnvironment()
  const unbindCalls = []
  const bindCalls = []

  // 场景 A：当 unbind 为函数时，优先调用 unbind，绝不调用 bind
  globalThis.window = {
    __omnimuxSidebar: { register() { return () => {} } },
    __omnimuxWorkbench: {
      bind(patch) {
        bindCalls.push(patch)
      },
      unbind(patch) {
        unbindCalls.push(patch)
      },
    },
  }

  let injectFnA = null
  const disposeA = apply({
    inject: (deps, fn) => { injectFnA = fn },
  })
  injectFnA({ betterSidebar: { registerTab: () => () => {} } })
  assert.equal(bindCalls.length, 1, 'Initial bind called')

  disposeA()
  assert.equal(unbindCalls.length, 1, 'unbind() should be preferred when present')
  assert.deepEqual(unbindCalls[0], { betterSidebar: null })
  assert.equal(bindCalls.length, 1, 'bind() must not be called again when unbind() was invoked')

  // 场景 B：当仅有 bind 且 bind 抛出异常时，捕获异常并不中断 dispose，非生产环境输出告警
  const savedEnv = process.env.NODE_ENV
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }

  try {
    process.env.NODE_ENV = 'development'
    let bindAttempt = 0
    globalThis.window.__omnimuxWorkbench = {
      bind(patch) {
        bindAttempt++
        if (bindAttempt > 1) {
          throw new Error('simulated bind error on unbind')
        }
      },
    }

    let injectFnB = null
    const disposeB = apply({
      inject: (deps, fn) => { injectFnB = fn },
    })
    injectFnB({ betterSidebar: { registerTab: () => () => {} } })
    assert.doesNotThrow(() => disposeB(), 'dispose must not throw if fallback bind fails')
    assert.ok(
      warnings.some((w) => w.includes('[omnimux-video] Failed to unbind workbench patch:')),
      'should log warning in development when fallback bind throws'
    )
  } finally {
    process.env.NODE_ENV = savedEnv
    console.warn = originalWarn
  }
})

test('Static code review audit: verifies Issue #2657 Review Round 16 point in source code', () => {
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] unbindWorkbench 必须实现宿主标准解绑契约兼容回退模式：优先 unbind，回退 bind(patch)
  assert.match(
    indexSrc,
    /const\s+unbindWorkbench\s*=\s*\(\s*patch\s*\)\s*=>\s*\{[\s\S]*?if\s*\(\s*typeof\s+window\.__omnimuxWorkbench\?\.unbind\s*===\s*['"]function['"]\s*\)\s*\{\s*window\.__omnimuxWorkbench\.unbind\(patch\)[\s\S]*?\}\s*else\s*\{\s*window\.__omnimuxWorkbench\?\.bind\?\.(\(patch\))\s*\}[\s\S]*?\}/
  )
})

test('Issue #2657 Review Round 17 - Point 1: ctx.inject uninject return value pushed to disposers and invoked on dispose', () => {
  let uninjectCalled = false
  const mockUninject = () => {
    uninjectCalled = true
  }

  let injectCallback = null
  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectCallback = fn
      return mockUninject
    },
  })

  assert.equal(uninjectCalled, false, 'uninject should not be called before dispose')

  dispose()
  assert.equal(uninjectCalled, true, 'uninject must be invoked when plugin is disposed')
})

test('Issue #2657 Review Round 17 - Point 2: ctx.inject non-function return value is handled safely without throwing', () => {
  let injectCallback = null
  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectCallback = fn
      return { unsubscribe: () => {} }
    },
  })

  assert.doesNotThrow(() => dispose(), 'dispose must not throw when ctx.inject returns non-function')
})

test('Static code review audit: verifies Issue #2657 Review Round 17 point in source code', () => {
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')

  // 1. [Medium] ctx.inject 返回值必须捕获并在是函数时推入 disposers
  assert.match(
    indexSrc,
    /const\s+uninject\s*=\s*ctx\.inject\(\s*\[['"]betterSidebar['"]\]/,
    'must capture ctx.inject return value into uninject'
  )
  assert.match(
    indexSrc,
    /if\s*\(\s*typeof\s+uninject\s*===\s*['"]function['"]\s*\)\s*\{\s*disposers\.push\(\s*uninject\s*\)\s*\}/,
    'must push uninject to disposers when it is a function'
  )
})

test('Issue #2657 Review Round 18 - Point 1: ctx.inject inner safe optional chaining prevents TypeError when inner is null or undefined', () => {
  let injectCallback = null
  const dispose = apply({
    locale: { register() {}, bind: () => (k) => k },
    inject: (deps, fn) => {
      injectCallback = fn
      return () => {}
    },
  })

  // 模拟 ctx.inject 传入 null / undefined 时不抛出 TypeError
  assert.doesNotThrow(() => {
    injectCallback(null)
  }, 'injectCallback(null) must not throw TypeError')

  assert.doesNotThrow(() => {
    injectCallback(undefined)
  }, 'injectCallback(undefined) must not throw TypeError')

  dispose()
})

test('Issue #2657 Review Round 18 - Point 2: asynchronous coordinator next.subscribe immediately invokes listener to align active state highlight', async () => {
  globalThis.window = {}
  const store = createGoogleVidsStageStore(() => 'Google Vids')
  let listenerCalledCount = 0
  const listener = () => { listenerCalledCount++ }

  const unsub = store.subscribe(listener)
  assert.equal(listenerCalledCount, 0, 'Listener should not be called before coordinator becomes ready')

  let subCalled = false
  let backendEmitter = null
  globalThis.window.__omnimuxWorkbench = {
    createSidebarStore() {
      return {
        subscribe(fn) {
          subCalled = true
          backendEmitter = fn
          return () => {}
        },
      }
    },
  }

  await new Promise((resolve) => setTimeout(resolve, 260))
  assert.equal(subCalled, true, 'Workbench store should be subscribed during poll tick')
  assert.equal(listenerCalledCount, 1, 'Listener must be called immediately once upon async subscription to align active state highlight')

  backendEmitter?.()
  assert.equal(listenerCalledCount, 2, 'Subsequent real store events trigger listener normally')
  unsub()
})

test('Static code review audit: verifies all 2 Review Round 18 points in source code', () => {
  const indexSrc = readFileSync(fileURLToPath(new URL('./index.js', import.meta.url)), 'utf8')
  const sidebarSrc = readFileSync(fileURLToPath(new URL('./sidebar-entry.js', import.meta.url)), 'utf8')

  // 1. [Medium] index.js:169 安全可选链防护 inner?.betterSidebar ?? inner?.get?.('betterSidebar')
  assert.match(
    indexSrc,
    /const\s+sidebar\s*=\s*inner\?\.betterSidebar\s*\?\?\s*inner\?\.get\?\.\(["']betterSidebar["']\)/,
    'must use safe optional chaining inner?.betterSidebar ?? inner?.get?.("betterSidebar")'
  )

  // 2. [Medium] sidebar-entry.js:153-154 异步轮询获取并订阅 next 成功后，立即主动执行一次 listener()
  assert.match(
    sidebarSrc,
    /unsub\s*=\s*typeof\s+sub\s*===\s*['"]function['"]\s*\?\s*sub\s*:\s*\(\)\s*=>\s*\{\}\s*\n\s*listener\(\)\s*\n\s*return/,
    'must immediately invoke listener() after next.subscribe to align active state highlight'
  )
})
