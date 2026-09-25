/**
 * QA 工程师严过关 (Yan) - Issue #2657 侧边栏 E2E 与多模态测试验证及反过度设计审计
 * 严格对照 docs/prd/google-vids-sidebar-entry.prd.md 与 specs/google-vids-sidebar-entry.spec.md
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import {
  mountSidebarEntry,
  createGoogleVidsStageStore,
  GOOGLE_VIDS_TAB_ID,
  ENTRY_SELECTOR,
  GOOGLE_VIDS_SIDEBAR_I18N,
} from '../../plugins/omnimux-video/src/client/sidebar-entry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

// 使用 esbuild 构建 index.js 并 stub 掉 jsx 面板
const tempFile = new URL(`.qa-bundle-${Date.now()}.mjs`, import.meta.url)
await build({
  entryPoints: [resolve(root, 'plugins/omnimux-video/src/client/index.js')],
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

console.log('===============================================================')
console.log(' QA 自动化验收门禁: Google Vids 侧边栏入口与内测标记 (Issue #2657)')
console.log(' 验收负责人: QA 工程师严过关 (Yan)')
console.log('===============================================================\n')

let passCount = 0
let totalChecks = 0

function runCheck(name, fn) {
  totalChecks += 1
  try {
    fn()
    passCount += 1
    console.log(`  ✔ [PASS] ${name}`)
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message)
    throw err
  }
}

// 模拟 DOM 环境
class MockNode {
  constructor(tagName = 'DIV', ns = null) {
    this.tagName = tagName.toUpperCase()
    this.namespaceURI = ns
    this.type = ''
    this.className = ''
    this.title = ''
    this.children = []
    this.attributes = {}
    this.dataset = {}
    this.listeners = {}
    this._textContent = ''
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

  removeAttribute(k) {
    delete this.attributes[k]
  }

  append(...nodes) {
    for (const n of nodes) {
      this.children.push(n)
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

  addEventListener(ev, fn) {
    this.listeners[ev] = fn
  }

  removeEventListener(ev, fn) {
    if (this.listeners[ev] === fn) {
      delete this.listeners[ev]
    }
  }

  click() {
    this.listeners['click']?.()
  }

  remove() {
    this.removed = true
  }

  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1)
      return this._find((el) => el.className && el.className.split(/\s+/).includes(cls))
    }
    if (sel.startsWith('[')) {
      const attr = sel.replace(/[[\]]/g, '')
      return this._find((el) => el.hasAttribute(attr))
    }
    const tag = sel.toUpperCase()
    return this._find((el) => el.tagName === tag)
  }

  _find(pred) {
    for (const c of this.children) {
      if (pred(c)) return c
      const sub = c._find ? c._find(pred) : null
      if (sub) return sub
    }
    return null
  }
}

function initDOM() {
  globalThis.document = {
    createElement(tag) {
      return new MockNode(tag)
    },
    createElementNS(ns, tag) {
      return new MockNode(tag, ns)
    },
  }
}

// -------------------------------------------------------------
// 1. 契约文档与声明审计 (Contract & Specification Audit)
// -------------------------------------------------------------
console.log('【维度一：契约文档与真源审计】')

runCheck('契约审计 1.1: sidebar-extra-entries.md 已登记 Rank 7.5 与内测标记', () => {
  const contractDoc = readFileSync(resolve(root, 'docs/contracts/sidebar-extra-entries.md'), 'utf-8')
  assert.ok(contractDoc.includes('[data-omnimux-google-vids-entry]'), '必须包含选择器登记')
  assert.ok(contractDoc.includes('rank 7.5'), '必须注明 rank 7.5')
  assert.ok(contractDoc.includes('内测版 / Alpha'), '必须注明 内测版 / Alpha')
  assert.ok(contractDoc.includes('omnimux-video:google-vids'), '必须注明 workbench Tab ID')
  assert.ok(contractDoc.includes('access: offline'), '必须注明 access: offline')
  assert.ok(contractDoc.includes('不得 claim'), '必须注明不得 claim product stage')
})

runCheck('契约审计 1.2: PRD 与 Spec 唯一真源齐备性', () => {
  const prd = readFileSync(resolve(root, 'docs/prd/google-vids-sidebar-entry.prd.md'), 'utf-8')
  assert.ok(prd.includes('prd-google-vids-sidebar-entry'))
  assert.ok(prd.includes('许清楚'))

  const spec = readFileSync(resolve(root, 'specs/google-vids-sidebar-entry.spec.md'), 'utf-8')
  assert.ok(spec.includes('spec-google-vids-sidebar-entry'))
})

// -------------------------------------------------------------
// 2. 反过度设计与 UI 极简微文案锁定审计
// -------------------------------------------------------------
console.log('\n【维度二：反过度设计与 SaaS 极简文案审计】')

runCheck('文案审计 2.1: 中英文逐字锁定无越权', () => {
  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.zh['sidebar.google_vids.nav'], 'Google Vids')
  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.zh['sidebar.google_vids.badge'], '内测版')
  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.zh['sidebar.google_vids.tooltip'], 'Google Vids · 内测版')
  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.zh['workbench.google_vids.tab'], 'Google Vids')

  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.en['sidebar.google_vids.nav'], 'Google Vids')
  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.en['sidebar.google_vids.badge'], 'Alpha')
  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.en['sidebar.google_vids.tooltip'], 'Google Vids · Alpha')
  assert.equal(GOOGLE_VIDS_SIDEBAR_I18N.en['workbench.google_vids.tab'], 'Google Vids')
})

runCheck('反过度设计 2.2: 源码全面扫描禁用 Emoji、营销副标题与多重 Badge', () => {
  const sidebarSource = readFileSync(resolve(root, 'plugins/omnimux-video/src/client/sidebar-entry.js'), 'utf-8')
  const localesSource = readFileSync(resolve(root, 'plugins/omnimux-video/src/client/locales.js'), 'utf-8')
  const indexSource = readFileSync(resolve(root, 'plugins/omnimux-video/src/client/index.js'), 'utf-8')

  const combined = sidebarSource + '\n' + localesSource + '\n' + indexSource

  // 严禁装饰性 Emoji
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
  assert.doesNotMatch(localesSource, emojiRegex, '文案字典中绝不允许包含任何 Emoji')

  // 严禁主观营销副词
  const bannedKeywords = ['高画质', '快速出片', '全新上线', '智能生成', '超清', '爆款', '精选']
  for (const kw of bannedKeywords) {
    assert.doesNotMatch(combined, new RegExp(kw), `严禁在代码或文案中出现营销用词: ${kw}`)
  }

  // 严禁拖带括号说明
  assert.doesNotMatch(localesSource, /Google Vids\s*\(.*?\)/, '导航标签严禁拖带括号说明')
})

runCheck('视觉规格 2.3: 样式与几何 Token 审计 (32px, 14x14 图标, 6px 间隙, 8px 圆角, 4px Badge 圆角)', () => {
  const sidebarSource = readFileSync(resolve(root, 'plugins/omnimux-video/src/client/sidebar-entry.js'), 'utf-8')
  assert.ok(sidebarSource.includes('height: 32px;'), '必须严格定义 32px 高度')
  assert.ok(sidebarSource.includes('gap: 6px;'), '必须严格定义 6px 间隙')
  assert.ok(sidebarSource.includes('border-radius: 8px;'), '条目圆角必须为 8px')
  assert.ok(sidebarSource.includes('border-radius: 4px;'), 'Badge 圆角必须为 4px')
  assert.ok(sidebarSource.includes('width: 14px; height: 14px;'), '图标必须定义为 14px x 14px')
  assert.ok(sidebarSource.includes('font-size: 14px; line-height: 20px;'), '文字规范 14px/20px')
  assert.ok(sidebarSource.includes('font-size: 12px; line-height: 16px;'), 'Badge 规范 12px/16px')
  assert.ok(sidebarSource.includes('[data-sidebar-collapsed]'), '必须包含折叠态 CSS 规则')
  assert.ok(sidebarSource.includes('display: none !important;'), '折叠态必须隐藏 label 和 badge')
})

// -------------------------------------------------------------
// 3. E2E 渲染、多模态生命周期与状态机协同
// -------------------------------------------------------------
console.log('\n【维度三：侧边栏 E2E 挂载、多模态与状态机协同】')

runCheck('E2E 3.1: 侧边栏协调器在 Rank 7.5 成功注册与挂载', () => {
  initDOM()
  let registeredRow = null
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
          getSnapshot: () => false,
          subscribe: () => () => {},
          open: () => {},
          close: () => {},
        }
      },
    },
  }

  const unmount = mountSidebarEntry(null, (k) => GOOGLE_VIDS_SIDEBAR_I18N.zh[k] || k, { current: 'zh' })
  assert.ok(registeredRow, '协调器必须收到注册')
  assert.equal(registeredRow.id, 'omnimux-video-google-vids-entry')
  assert.equal(registeredRow.rank, 7.5, '排位必须为 7.5')

  const el = registeredRow.create()
  assert.equal(el.tagName, 'BUTTON')
  assert.ok(el.hasAttribute('data-omnimux-google-vids-entry'))
  assert.equal(el.getAttribute('data-tab-id'), 'omnimux-video:google-vids')

  // 白名单子元素严格只允许 3 个
  assert.equal(el.children.length, 3, '子节点必须且仅有 3 个')
  const [icon, label, badge] = el.children
  assert.ok(icon.className.includes('omnimux-sidebar-nav-entry-icon'))
  assert.ok(label.className.includes('omnimux-sidebar-nav-entry-label'))
  assert.ok(badge.className.includes('omnimux-sidebar-alpha-badge'))

  assert.equal(label.textContent, 'Google Vids')
  assert.equal(badge.textContent, '内测版')
  assert.equal(el.title, 'Google Vids · 内测版')
  assert.equal(el.getAttribute('aria-label'), 'Google Vids · 内测版')

  unmount()
  assert.equal(registeredRow, null, '注销必须从协调器注销')
  assert.equal(el.removed, true, 'DOM 必须被安全移除')
})

runCheck('E2E 3.2: 动态国际化语言切换 (zh -> en)', () => {
  initDOM()
  let registeredRow = null
  let currentLocale = 'zh'
  let subscriber = null

  const localeService = {
    get current() { return currentLocale },
    subscribe(fn) {
      subscriber = fn
      return () => { subscriber = null }
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
          getSnapshot: () => false,
          subscribe: () => () => {},
          open: () => {},
          close: () => {},
        }
      },
    },
  }

  const unmount = mountSidebarEntry(null, (k) => GOOGLE_VIDS_SIDEBAR_I18N[currentLocale][k] || k, localeService)
  const el = registeredRow.create()
  const label = el.children[1]
  const badge = el.children[2]

  assert.equal(label.textContent, 'Google Vids')
  assert.equal(badge.textContent, '内测版')

  // 动态触发切换英文
  currentLocale = 'en'
  subscriber?.()

  assert.equal(label.textContent, 'Google Vids')
  assert.equal(badge.textContent, 'Alpha')
  assert.equal(badge.getAttribute('aria-label'), 'Alpha')
  assert.equal(el.title, 'Google Vids · Alpha')
  assert.equal(el.getAttribute('aria-label'), 'Google Vids · Alpha')

  unmount()
})

runCheck('E2E 3.3: 单激活槽仲裁与排他性', () => {
  initDOM()
  let registeredRow = null
  let activeState = false
  let storeListener = null
  let openTriggered = false

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
    __omnimuxWorkbench: {
      createSidebarStore(opts) {
        assert.equal(opts.tabId, 'omnimux-video:google-vids')
        return {
          getSnapshot: () => activeState,
          subscribe: (fn) => {
            storeListener = fn
            return () => { storeListener = null }
          },
          open: () => { openTriggered = true },
          close: () => { openTriggered = false },
        }
      },
    },
  }

  const unmount = mountSidebarEntry(null, (k) => GOOGLE_VIDS_SIDEBAR_I18N.zh[k] || k, { current: 'zh' })
  const el = registeredRow.create()

  // 初始无激活
  assert.equal(el.dataset.active, undefined)

  // 点击触发 open
  el.click()
  assert.equal(openTriggered, true, '点击必须触发 open()')

  // 接收到工作台激活广播
  activeState = true
  storeListener?.()
  assert.equal(el.dataset.active, 'true', '激活态必须加上 data-active')

  // 会话被选中或打开其他 Tab 时，撤销激活态
  activeState = false
  storeListener?.()
  assert.equal(el.dataset.active, undefined, '失活态必须删除 data-active')

  unmount()
})

runCheck('E2E 3.4: 多模态 Studio Panel 挂载与客户端 apply 生命周期', () => {
  initDOM()
  let registeredTab = null
  let registeredRow = null
  let boundState = null

  globalThis.window = {
    __omnimuxSidebar: {
      register(row) {
        registeredRow = row
        return () => { registeredRow = null }
      },
    },
    __omnimuxWorkbench: {
      bind(patch) {
        boundState = patch
      },
      unbind(patch) {
        boundState = null
      },
      createSidebarStore() {
        return {
          getSnapshot: () => false,
          subscribe: () => () => {},
          open: () => {},
          close: () => {},
        }
      },
    },
  }

  const mockSidebar = {
    registerTab(spec) {
      registeredTab = spec
      return () => { registeredTab = null }
    },
  }

  const effectCleanups = []
  const mockCtx = {
    locale: {
      register: () => {},
      bind: () => (k) => GOOGLE_VIDS_SIDEBAR_I18N.zh[k] || k,
    },
    inject(deps, fn) {
      assert.deepEqual(deps, ['betterSidebar'])
      fn({ betterSidebar: mockSidebar })
      return () => {}
    },
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') effectCleanups.push(cleanup)
      return cleanup
    },
  }

  const dispose = apply(mockCtx)

  // 验证 Tab 挂载
  assert.ok(registeredTab, '必须注册 Google Vids Workbench Tab')
  assert.equal(registeredTab.id, 'omnimux-video:google-vids')
  assert.equal(registeredTab.title(), 'Google Vids')
  assert.equal(registeredTab.component, GoogleVidsTabPanel)
  assert.equal(registeredTab.order, 17.5)

  // 验证侧边栏注入
  assert.ok(registeredRow, '必须注册侧边栏 Entry')
  assert.equal(registeredRow.rank, 7.5)

  // 卸载与资源释放
  dispose()
  for (const c of effectCleanups) c()

  assert.equal(registeredTab, null, 'Tab 必须被完全注销')
  assert.equal(registeredRow, null, '侧边栏条目必须被完全注销')
})

console.log('\n===============================================================')
console.log(` 验收结论: 全部 ${passCount}/${totalChecks} 项自动化检查 PASS!`)
console.log(' QA_SIGN_OFF: PASS | IS_PASS: YES')
console.log('===============================================================\n')
