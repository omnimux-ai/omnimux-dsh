import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const { SuiteDetailModal } = req('../../src/client/plaza/SuiteDetailModal.jsx')

const h = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
})

function walkAll(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) walkAll(item, predicate, out)
    return out
  }
  if (typeof node.type === 'function') {
    const rendered = node.type({ ...node.props, children: node.children })
    return walkAll(rendered, predicate, out)
  }
  if (predicate(node)) out.push(node)
  for (const child of node.children || []) walkAll(child, predicate, out)
  return out
}

const withClass = (tree, className) => walkAll(tree, (node) => {
  const cls = node.props && node.props.className
  return typeof cls === 'string' && cls.split(' ').includes(className)
})

test('技能详情弹窗 (Drawer) 统一采用外侧右上方圆形关闭按钮，且移除内侧旧按钮', () => {
  const skillsUiSource = readFileSync(new URL('../../src/client/skills-ui.js', import.meta.url), 'utf8')
  let closed = false
  const onClose = () => { closed = true }

  const ReactMock = {
    useContext: () => (k) => (k === 'action.close' ? '关闭' : k),
    useState: (init) => [init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    createContext: () => ({ Provider: 'Provider' }),
  }
  const context = {
    h,
    React: ReactMock,
    useState: ReactMock.useState,
    useEffect: ReactMock.useEffect,
    useRef: ReactMock.useRef,
    createPortal: (node) => node,
    fallbackPortal: null,
    document: { body: { style: {} } },
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    useTr: () => (k) => (k === 'action.close' ? '关闭' : k),
    lookup: (k) => k,
    catLabel: () => '通用',
    api: async () => ({ ok: true }),
    Button: 'Button',
    Toast: 'Toast',
  }

  const renderDrawer = runInNewContext(`${skillsUiSource}\nDrawer`, context)
  const tree = renderDrawer({
    item: { slug: 'hypit-setup', name: 'Hypit 官方能力接入', summary: '官方能力接入引导' },
    onClose,
  })

  assert.ok(tree, 'Drawer 应当正常渲染')
  assert.equal(tree.type.name, 'Overlay', '外层根节点应为 Overlay')

  // 1. 存在外侧相对定位容器 ws-detail-wrapper
  const wrappers = withClass(tree, 'ws-detail-wrapper')
  assert.equal(wrappers.length, 1, '应有且仅有 1 个 ws-detail-wrapper 容器')

  // 2. 外部关闭按钮
  const externalCloseBtns = withClass(wrappers[0], 'ws-detail-external-close')
  assert.equal(externalCloseBtns.length, 1, 'wrapper 内应有 1 个外侧关闭按钮')
  const closeBtn = externalCloseBtns[0]
  assert.equal(closeBtn.type, 'button')
  assert.ok(closeBtn.props.className.includes('omnimux-modal-close-btn'))
  assert.ok(closeBtn.props.className.includes('is-external'))
  assert.equal(closeBtn.props['aria-label'], '关闭')

  // 3. 点击外部关闭按钮调用 onClose
  closeBtn.props.onClick()
  assert.equal(closed, true, '点击外侧关闭按钮应触发 onClose 回调')

  // 4. 内侧 Header 栏已移除旧关闭按钮
  const headerRows = withClass(tree, 'ws-detail-header-row')
  assert.equal(headerRows.length, 1)
  const headerCloseBtns = withClass(headerRows[0], 'modal-close-btn')
  assert.equal(headerCloseBtns.length, 0, '内侧 Header 中不得残留旧关闭按钮')
})

test('套件详情弹窗 (SuiteDetailModal) 统一采用外侧右上方圆形关闭按钮', () => {
  let closed = false
  const onClose = () => { closed = true }

  const tree = SuiteDetailModal({
    item: {
      id: 'suite-demo',
      name: '演示套件',
      kind: 'suite',
      suite: { skills: [], rules: [], agents: [] },
    },
    h,
    Overlay: ({ children }) => h('div', { className: 'sh-overlay' }, children),
    Button: 'Button',
    useTr: () => (k) => (k === 'action.close' ? '关闭' : k),
    lookup: (k) => k,
    onClose,
    hooks: {
      useState: (init) => [init, () => {}],
      useEffect: () => {},
    },
  })

  // 1. 存在外侧相对定位容器 ws-detail-wrapper
  const wrappers = withClass(tree, 'ws-detail-wrapper')
  assert.equal(wrappers.length, 1, 'SuiteDetailModal 应有 1 个 ws-detail-wrapper 容器')

  // 2. 外部关闭按钮
  const externalCloseBtns = withClass(wrappers[0], 'ws-detail-external-close')
  assert.equal(externalCloseBtns.length, 1, '应有 1 个外悬浮关闭按钮')
  const closeBtn = externalCloseBtns[0]
  assert.ok(closeBtn.props.className.includes('omnimux-modal-close-btn'))
  assert.ok(closeBtn.props.className.includes('is-external'))

  // 3. 点击关闭按钮触发 onClose
  closeBtn.props.onClick()
  assert.equal(closed, true, '点击套件模态外侧关闭按钮应触发 onClose')

  // 4. 内侧 Header 动作栏不残留旧关闭按钮
  const headerActions = withClass(tree, 'ws-detail-header-actions')
  assert.equal(headerActions.length, 1)
  const innerCloseBtns = withClass(headerActions[0], 'modal-close-btn')
  assert.equal(innerCloseBtns.length, 0, 'Header 动作栏内不得残留旧关闭按钮')
})

test('CSS 样式表中包含 ws-detail-wrapper 与 omnimux-modal-close-btn.is-external 响应式规范', () => {
  const cssSource = readFileSync(new URL('../../src/client/css.js', import.meta.url), 'utf8')
  assert.ok(cssSource.includes('.ws-detail-wrapper'), '样式表应包含 .ws-detail-wrapper')
  assert.ok(cssSource.includes('.omnimux-modal-close-btn'), '样式表应包含 .omnimux-modal-close-btn')
  assert.ok(cssSource.includes('.omnimux-modal-close-btn.is-external'), '样式表应包含 .omnimux-modal-close-btn.is-external')
  assert.ok(cssSource.includes('right:-50px'), '宽屏应外浮在右侧 -50px')
  assert.ok(cssSource.includes('@media (max-width:1280px)'), '应包含 max-width:1280px 响应式断点适配')
})
