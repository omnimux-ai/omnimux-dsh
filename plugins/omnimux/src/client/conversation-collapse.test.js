import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  CONVERSATION_COLLAPSED_ATTR,
  CONVERSATION_COLLAPSE_CSS,
  CONVERSATION_COLLAPSE_STYLE_ID,
  applyConversationCollapsedAttr,
  getConversationCollapsed,
  hydrateConversationCollapsed,
  resetConversationCollapseForTests,
  setConversationCollapsed,
} from './conversation-collapse.js'

const previousWindow = globalThis.window
const previousDocument = globalThis.document

afterEach(() => {
  resetConversationCollapseForTests()
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

function setupDoc() {
  const attrs = new Map()
  const headChildren = []
  const html = {
    setAttribute(k, v) { attrs.set(k, String(v)) },
    removeAttribute(k) { attrs.delete(k) },
    hasAttribute(k) { return attrs.has(k) },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null },
  }
  const head = {
    append(node) { headChildren.push(node) },
  }
  const doc = {
    head,
    documentElement: html,
    defaultView: globalThis,
    getElementById(id) {
      return headChildren.find((n) => n.id === id) || null
    },
    createElement(tag) {
      const node = {
        tagName: tag.toUpperCase(),
        id: '',
        textContent: '',
      }
      return node
    },
  }
  globalThis.document = doc
  globalThis.window = {
    document: doc,
    localStorage: {
      store: new Map(),
      getItem(k) { return this.store.has(k) ? this.store.get(k) : null },
      setItem(k, v) { this.store.set(k, String(v)) },
    },
    HTMLStyleElement: function HTMLStyleElement() {},
  }
  return doc
}

test('setConversationCollapsed writes html attr and injects CSS', () => {
  const doc = setupDoc()
  setConversationCollapsed(true, { persist: false, doc, sessionId: 's1' })
  assert.equal(doc.documentElement.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true)
  const style = doc.getElementById(CONVERSATION_COLLAPSE_STYLE_ID)
  assert.ok(style)
  assert.match(style.textContent, /centerCol/)
  assert.match(CONVERSATION_COLLAPSE_CSS, /data-omnimux-conversation-collapsed/)
  // 会话栏收起时右栏面板必须铺满容器，否则面板右侧对齐会在其左侧留下等宽黑空。
  // 断言必须限定到「左栏可见」这一支：左栏收起支同样含 left:0，跨分支匹配会漏掉本回归（#1718）。
  const panelFillRule = CONVERSATION_COLLAPSE_CSS.match(
    /html\[data-omnimux-conversation-collapsed\]:not\(\[data-omnimux-left-collapsed\]\)\s+\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*\{([^}]*)\}/
  )
  assert.ok(panelFillRule, '缺少「会话收起 + 左栏可见」时的右栏面板铺满规则')
  assert.match(panelFillRule[1], /left:\s*0\s*!important/, '面板左端必须贴住容器左端')
  assert.doesNotMatch(
    panelFillRule[1],
    /left:\s*var\(--omnimux-sidebar-width/,
    '不得再按视口偏移左侧导航宽度（面板定位祖先是右栏容器）'
  )
  assert.match(panelFillRule[1], /width:\s*auto\s*!important/, '面板宽度必须由容器两侧撑满')
  const railCollapsedRule = CONVERSATION_COLLAPSE_CSS.match(
    /html\[data-omnimux-conversation-collapsed\]\[data-omnimux-left-collapsed\]\s+\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*\{([^}]*)\}/
  )
  assert.ok(railCollapsedRule, '缺少「左栏收起」时的右栏面板规则')
  assert.match(railCollapsedRule[1], /width:\s*100vw\s*!important/, '左栏收起时面板占满视口宽度')

  setConversationCollapsed(false, { persist: false, doc, sessionId: 's1' })
  assert.equal(doc.documentElement.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false)
})

test('hydrateConversationCollapsed restores from localStorage', () => {
  const doc = setupDoc()
  globalThis.window.localStorage.setItem('omnimux-conversation-collapsed:v1:sess-a', '1')
  const collapsed = hydrateConversationCollapsed('sess-a', doc)
  assert.equal(collapsed, true)
  assert.equal(getConversationCollapsed({ sessionId: 'sess-a', doc }), true)
  assert.equal(doc.documentElement.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true)
})

test('applyConversationCollapsedAttr is idempotent on style tag', () => {
  const doc = setupDoc()
  applyConversationCollapsedAttr(true, doc)
  applyConversationCollapsedAttr(true, doc)
  const styles = []
  // only one style id
  assert.ok(doc.getElementById(CONVERSATION_COLLAPSE_STYLE_ID))
  assert.equal(styles.length, 0)
})
