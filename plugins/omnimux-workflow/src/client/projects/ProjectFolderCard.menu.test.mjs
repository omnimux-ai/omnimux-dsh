import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const React = require('react')
const here = dirname(fileURLToPath(import.meta.url))

/**
 * 组件库 Button 的真实 DOM 契约副本（只读对齐 dsh-ui-kit/src/button/Button.tsx）：
 * leadingIcon → <span class="slot">，children → <span class="label">。
 * 菜单项图标一旦被塞进 children，就会落进 .label，在宿主 Tailwind preflight
 * （svg{display:block}）下强制断行——本测试锁死这条契约。
 */
const SEAM = `
const React = require('react');
const Button = ({ leadingIcon, trailingIcon, variant, className, children, ...rest }) => React.createElement('button', {
  ...rest,
  type: 'button',
  className: ['button', variant, className].filter(Boolean).join(' '),
},
  leadingIcon != null ? React.createElement('span', { className: 'slot', 'aria-hidden': 'true' }, leadingIcon) : null,
  (children != null && children !== '') ? React.createElement('span', { className: 'label' }, children) : null,
  trailingIcon != null ? React.createElement('span', { className: 'slot', 'aria-hidden': 'true' }, trailingIcon) : null);
const IconButton = ({ children, ...rest }) => React.createElement('button', { ...rest, type: 'button', className: 'iconButton' }, children);
const icon = (name) => () => React.createElement('svg', { viewBox: '0 0 16 16', 'data-icon': name });
exports.Button = Button;
exports.IconButton = IconButton;
exports.IconEditOutline16 = icon('edit');
exports.IconTrashOutline16 = icon('trash');
`

async function loadComponent() {
  const result = await build({
    entryPoints: [resolve(here, 'ProjectFolderCard.jsx')], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'render-seams',
      setup(builder) {
        builder.onResolve({ filter: /^(dsh-ui-kit|@deepseek-ai\/dsh-client-ui-primitives)$/ }, () => ({ path: 'seam', namespace: 'seam' }))
        builder.onLoad({ filter: /.*/, namespace: 'seam' }, () => ({ contents: SEAM }))
        builder.onResolve({ filter: /ProjectCover\.jsx$/ }, () => ({ path: 'cover', namespace: 'cover' }))
        builder.onLoad({ filter: /.*/, namespace: 'cover' }, () => ({ contents: `const React=require('react');exports.ProjectCover=({renderFrame})=>renderFrame(React.createElement('i',{'data-cover-probe':'one'}),null);` }))
      },
    }],
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports)
  return mod.exports.ProjectFolderCard
}

async function mountCard() {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true })
  for (const [name, value] of [['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator]]) {
    Object.defineProperty(global, name, { value, writable: true, configurable: true })
  }
  if (!dom.window.PointerEvent) dom.window.PointerEvent = dom.window.MouseEvent
  global.PointerEvent = dom.window.PointerEvent
  global.IS_REACT_ACT_ENVIRONMENT = true

  const reactDomClient = require('react-dom/client')
  const { act } = require('react')
  const ProjectFolderCard = await loadComponent()

  const container = document.getElementById('root')
  const root = reactDomClient.createRoot(container)
  const t = (key) => key
  await act(async () => {
    root.render(React.createElement(ProjectFolderCard, {
      project: { id: 'p1', title: '演示项目', updatedAt: 1735689600000, cover: { kind: 'empty' } },
      onOpen() {}, onRename() {}, onDelete() {}, t,
    }))
  })
  return { dom, act, container, root }
}

const key = (act, el, k) => act(async () => {
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
})

test('more-menu items use the leadingIcon slot contract, never children/.label', async () => {
  const { dom, act, container, root } = await mountCard()
  try {
    await act(async () => container.querySelector('[aria-haspopup="menu"]').click())

    const menu = container.querySelector('[role="menu"]')
    assert.ok(menu, '菜单未展开')
    const items = [...menu.querySelectorAll('[role="menuitem"]')]
    assert.equal(items.length, 2)

    for (const item of items) {
      const slot = item.querySelector('.slot')
      const label = item.querySelector('.label')
      assert.ok(slot, '菜单项缺少组件库图标槽 .slot')
      assert.ok(label, '菜单项缺少组件库文案槽 .label')
      assert.equal(slot.querySelectorAll('svg').length, 1, '图标必须落在 .slot 内')
      assert.equal(label.querySelectorAll('svg').length, 0, '图标不得落在 .label 内（会被宿主 svg{display:block} 断行）')
      assert.equal(slot.getAttribute('aria-hidden'), 'true')
    }
    assert.deepEqual(items.map(i => i.querySelector('.label').textContent), ['projects.rename', 'projects.delete'])
    assert.equal(items[1].getAttribute('data-danger'), 'true', '解散项目必须标记 data-danger="true"')
    assert.ok(items[1].classList.contains('omnimux-folder-menu-item--danger'), '解散项目必须包含危险类名')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('more-menu keyboard path: initial focus, arrows, Home/End, Escape refocus, Tab close, outside click', async () => {
  const { dom, act, container, root } = await mountCard()
  try {
    const trigger = container.querySelector('[aria-haspopup="menu"]')
    await act(async () => trigger.click())
    const menu = container.querySelector('[role="menu"]')
    const items = () => [...menu.querySelectorAll('[role="menuitem"]')]
    const active = () => document.activeElement

    assert.equal(active(), items()[0], '打开后焦点应落在第一个菜单项')

    await key(act, active(), 'ArrowDown')
    assert.equal(active(), items()[1])
    await key(act, active(), 'ArrowDown')
    assert.equal(active(), items()[0], 'ArrowDown 应循环回到首项')
    await key(act, active(), 'ArrowUp')
    assert.equal(active(), items()[1], 'ArrowUp 应循环到末项')
    await key(act, active(), 'Home')
    assert.equal(active(), items()[0])
    await key(act, active(), 'End')
    assert.equal(active(), items()[1])

    await key(act, active(), 'Escape')
    assert.equal(container.querySelector('[role="menu"]'), null, 'Escape 应关闭菜单')
    assert.equal(active(), trigger, 'Escape 应把焦点回移到「更多操作」')
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')

    await act(async () => trigger.click())
    assert.ok(container.querySelector('[role="menu"]'))
    await key(act, container.querySelector('[role="menu"]'), 'Tab')
    assert.equal(container.querySelector('[role="menu"]'), null, 'Tab 应关闭菜单')

    await act(async () => trigger.click())
    assert.ok(container.querySelector('[role="menu"]'))
    await act(async () => document.body.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true })))
    assert.equal(container.querySelector('[role="menu"]'), null, '点击外部应关闭菜单')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('more-menu panel geometry follows the design tokens and cannot collapse to content width', () => {
  const source = readFileSync(resolve(here, 'folderStyles.js'), 'utf8')
  const panel = /\.omnimux-folder-menu \{([^}]*)\}/.exec(source)
  const item = /\.omnimux-folder-menu \[role=menuitem\] \{([^}]*)\}/.exec(source)
  assert.ok(panel, '缺少 .omnimux-folder-menu 面板规则')
  assert.ok(item, '缺少 .omnimux-folder-menu [role=menuitem] 规则')
  const p = panel[1]
  const i = item[1]
  assert.match(p, /min-width:\s*148px/, '面板必须有显式最小宽度，不能再被内容挤到 88px')
  assert.match(p, /border-radius:\s*10px/)
  assert.match(p, /padding:\s*4px/)
  assert.match(p, /display:\s*flex/)
  assert.match(p, /flex-direction:\s*column/)
  assert.match(i, /width:\s*100%/, '菜单项必须撑满面板宽度')
  assert.match(i, /gap:\s*8px/, '图标与文字的水平间距走既定令牌值')
  assert.match(i, /justify-content:\s*flex-start/)
  for (const rule of [p, i]) {
    assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b/, '菜单样式不得出现裸色硬编码')
    assert.doesNotMatch(rule, /rgba?\(/, '菜单样式不得出现裸色硬编码')
  }
  assert.match(p, /var\(--dsw-alias-bg-overlay\)/, '面板底色必须走官方设计令牌')
  assert.match(p, /var\(--dsw-alias-border-l2\)/, '面板描边必须走官方设计令牌')
  assert.match(p, /var\(--dsw-alias-bg-mask-1\)/, '面板阴影必须走官方设计令牌')
  assert.match(p, /backdrop-filter:\s*blur\(16px\)/, '面板必须声明 16px 毛玻璃滤镜')
  assert.match(i, /border-radius:\s*6px/, '子项圆角必须严格满足内切几何 10px - 4px = 6px')
  assert.match(i, /height:\s*32px/, '子项高度必须遵循 32px 控件基准高')
  assert.match(source, /omnimux-folder-menu-item--danger/, '必须包含危险项样式规则')
  assert.match(source, /var\(--dsw-alias-state-error-primary\)/, '危险项必须使用官方错误语义状态色')
})
