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
  assert.match(
    CONVERSATION_COLLAPSE_CSS,
    /\[data-omnimux-conversation-collapsed\][^{]*\.dshDesktopRightbarSurface\s+\[class\*="_panel"\][^{]*\{[^}]*left:\s*0\s*!important/,
    '收起的会话栏必须让右栏面板左端贴住容器左端'
  )

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
