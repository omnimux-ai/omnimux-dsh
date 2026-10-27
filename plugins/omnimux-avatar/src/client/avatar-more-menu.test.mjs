// 官方「更多」菜单注册点（#3811）：入口收敛的唯一渲染面。
//
// 只验纯逻辑与注册契约，不渲染 React 树——真实渲染由任务工作树的真机旅程覆盖。
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

// Node 不能直接加载 .jsx，沿用本包既有做法：先用 esbuild 打包成 CJS 再 require。
// React 保持 external，与生产树共用同一个 React 实例。
const require = createRequire(import.meta.url)
const built = await build({
  entryPoints: [fileURLToPath(new URL('./avatar-more-menu.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', outfile: 'avatar-more-menu.cjs',
  jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/*'],
})
// 用 createRequire 指向本测试文件所在包，让 CJS 产物能解析到 react/jsx-runtime。
const mod = new Module('avatar-more-menu-under-test')
mod.filename = fileURLToPath(new URL('./avatar-more-menu.cjs', import.meta.url))
mod.paths = Module._nodeModulePaths(fileURLToPath(new URL('.', import.meta.url)))
mod.require = require
mod._compile(built.outputFiles[0].text, mod.filename)
const {
  AVATAR_MORE_MENU_ID,
  AVATAR_MORE_MENU_ORDER,
  AVATAR_MORE_MENU_SLOT,
  createAvatarMoreMenuContent,
  installAvatarMoreMenu,
} = mod.exports

const DummyMenuItemButton = (props) => props

function makeCtx() {
  const registered = []
  const injected = []
  return {
    registered,
    injected,
    ctx: {
      slots: {
        inject(name, callback) {
          injected.push(name)
          callback()
        },
        register(meta, Content) {
          registered.push({ meta, Content })
          return () => {}
        },
      },
    },
  }
}

describe('「更多」菜单注册契约', () => {
  it('seat / id / order 与探索入口同档但不抢位', () => {
    assert.equal(AVATAR_MORE_MENU_SLOT, 'sidebar.panellist.actions')
    assert.equal(AVATAR_MORE_MENU_ID, 'omnimux-avatar')
    // 探索入口是 100；本插件排在它之后，避免同 order 时顺序不确定。
    assert.ok(AVATAR_MORE_MENU_ORDER > 100, `order 应大于探索入口的 100，实际 ${AVATAR_MORE_MENU_ORDER}`)
  })

  it('注册到官方 seat，并把内容组件一起交出', () => {
    const { ctx, registered, injected } = makeCtx()
    const ok = installAvatarMoreMenu(ctx, {
      MenuItemButton: DummyMenuItemButton,
      title: () => 'AI网红工作室',
      iconSvg: '<svg></svg>',
      open: () => {},
    })
    assert.equal(ok, true, '有 slots 与行原语时必须完成注册')
    assert.deepEqual(injected, [AVATAR_MORE_MENU_SLOT], '只注册到官方「更多」菜单 seat')
    assert.equal(registered.length, 1)
    assert.equal(registered[0].meta.id, AVATAR_MORE_MENU_ID)
    assert.equal(registered[0].meta.order, AVATAR_MORE_MENU_ORDER)
    assert.equal(typeof registered[0].Content, 'function', '必须交出可渲染的内容组件')
  })

  it('没有行原语时不注册：宁可不出现，也不注册渲染即崩的空壳', () => {
    const { ctx, registered } = makeCtx()
    assert.equal(installAvatarMoreMenu(ctx, { title: () => 'x', iconSvg: '', open: () => {} }), false)
    assert.equal(registered.length, 0)
  })

  it('老宿主没有 slots 服务时不抛错，交给调用方回退', () => {
    assert.equal(installAvatarMoreMenu({}, { MenuItemButton: DummyMenuItemButton, title: () => 'x', iconSvg: '', open: () => {} }), false)
    assert.equal(installAvatarMoreMenu(undefined, { MenuItemButton: DummyMenuItemButton, title: () => 'x', iconSvg: '', open: () => {} }), false)
  })

  it('被 memo / forwardRef 包裹的行原语照常接受', () => {
    const memoized = { $$typeof: Symbol.for('react.memo'), type: DummyMenuItemButton }
    const { ctx } = makeCtx()
    assert.equal(installAvatarMoreMenu(ctx, { MenuItemButton: memoized, title: () => 'x', iconSvg: '', open: () => {} }), true)
  })
})

describe('「更多」菜单项行为', () => {
  it('点击先关菜单再打开工作台，且只打开一次', () => {
    const calls = []
    const Content = createAvatarMoreMenuContent({
      MenuItemButton: DummyMenuItemButton,
      title: () => 'AI网红工作室',
      iconSvg: '<svg></svg>',
      open: () => calls.push('open'),
    })
    // 直接调用内容组件拿到元素树，再取行的 onSelect —— 不依赖 React 渲染器。
    const tree = Content({ onDismiss: () => calls.push('dismiss') })
    tree.props.onSelect()
    assert.deepEqual(calls, ['dismiss', 'open'], '必须先关菜单再打开，顺序不能反')
  })

  it('没有 onDismiss 时也能打开（菜单 owner 可能不传）', () => {
    const calls = []
    const Content = createAvatarMoreMenuContent({
      MenuItemButton: DummyMenuItemButton,
      title: () => 'AI网红工作室',
      iconSvg: '',
      open: () => calls.push('open'),
    })
    Content({}).props.onSelect()
    assert.deepEqual(calls, ['open'])
  })

  it('文案与图标都来自调用方真源，不在这里写第二份', () => {
    const Content = createAvatarMoreMenuContent({
      MenuItemButton: DummyMenuItemButton,
      title: () => 'AI网红工作室',
      iconSvg: '<svg id="probe"></svg>',
      open: () => {},
    })
    const tree = Content({})
    assert.equal(tree.props.children, 'AI网红工作室')
    assert.ok(tree.props.icon.props.dangerouslySetInnerHTML.__html.includes('probe'), '图标应原样透传')
    assert.equal(tree.props.icon.props['aria-hidden'], 'true', '图标是装饰性的')
  })
})
