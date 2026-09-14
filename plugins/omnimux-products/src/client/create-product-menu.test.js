/**
 * `CreateProductMenu` 的悬停分流契约（AC-101 ~ AC-104）。
 *
 * 这个组件没有 DOM 渲染器可用，所以行为用例把它真的跑起来：esbuild 打包生产
 * 组件，用一个最小 React（useState/useRef/useEffect/useCallback）和一台虚拟时钟
 * 驱动，防抖窗口是「推进多少毫秒」而不是「等多久」。这样 150ms / 200ms 这两个
 * 阈值是被验证的，而不是被抄进断言的。
 */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./CreateProductMenu.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'],
  logLevel: 'silent',
})

const bundleText = bundle.outputFiles[0].text

/** 同一份 bundle 在一个空上下文里跑一次，只为了拿到它导出的常量。 */
function exportsOf() {
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return { useState: () => [null, () => {}], useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (fn) => fn }
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
      if (name === 'dsh-ui-kit') return { Button: 'Button' }
      throw new Error(`unexpected dependency ${name}`)
    },
  }
  runInNewContext(bundleText, context)
  return context.module.exports
}

const { CREATE_KINDS, CLOSE_DELAY_MS, OPEN_DELAY_MS } = exportsOf()

/** 虚拟时钟：`advance(ms)` 只跑到期的那几个回调。 */
function createClock() {
  let now = 0
  let seq = 0
  const pending = new Map()
  return {
    api: {
      setTimeout(fn, ms) {
        seq += 1
        pending.set(seq, { fn, at: now + Math.max(0, Number(ms) || 0) })
        return seq
      },
      clearTimeout(id) { pending.delete(id) },
    },
    advance(ms) {
      now += ms
      const due = [...pending.entries()].filter(([, row]) => row.at <= now).sort((a, b) => a[1].at - b[1].at)
      for (const [id, row] of due) {
        pending.delete(id)
        row.fn()
      }
    },
    pendingCount: () => pending.size,
  }
}

/**
 * 最小 React：状态写在 hook 槽里，`render()` 手动重跑组件（与 stage 测试同一手法），
 * 但 `useEffect` / `useCallback` 尊重依赖数组 —— 组件里那两个悬停计时器的清理全靠
 * 这一点，依赖被忽略的话测出来的就不是生产行为。
 */
function mount() {
  const clock = createClock()
  const stateSlots = []
  const callbackSlots = []
  const effectSlots = []
  const listeners = new Map()
  let index = 0
  let mounted = false
  let queue = []

  const sameDeps = (a, b) => Boolean(a) && Boolean(b)
    && a.length === b.length
    && a.every((dep, i) => Object.is(dep, b[i]))

  const react = {
    useState(initial) {
      const slot = index++
      if (!mounted) stateSlots[slot] = typeof initial === 'function' ? initial() : initial
      return [stateSlots[slot], (next) => {
        stateSlots[slot] = typeof next === 'function' ? next(stateSlots[slot]) : next
      }]
    },
    useRef(initial) {
      const slot = index++
      if (!mounted) stateSlots[slot] = { current: initial }
      return stateSlots[slot]
    },
    useCallback(fn, deps) {
      const slot = index++
      const prev = callbackSlots[slot]
      if (prev && sameDeps(prev.deps, deps)) return prev.fn
      callbackSlots[slot] = { fn, deps }
      return fn
    },
    useEffect(effect, deps) {
      const slot = index++
      const prev = effectSlots[slot]
      if (!prev || !sameDeps(prev.deps, deps)) queue.push({ slot, effect, deps })
    },
  }

  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') {
        return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      }
      if (name === 'dsh-ui-kit') return { Button: 'Button' }
      throw new Error(`unexpected dependency ${name}`)
    },
    setTimeout: clock.api.setTimeout,
    clearTimeout: clock.api.clearTimeout,
    document: {
      addEventListener(type, fn) { listeners.set(type, fn) },
      removeEventListener(type) { listeners.delete(type) },
    },
  }
  runInNewContext(bundleText, context)
  const { CreateProductMenu } = context.module.exports

  const t = (key) => key
  const picked = []
  /** 宿主侧副本：vm 里造出来的数组与本进程的 `Array` 不是同一个原型。 */
  const hostList = (value) => Array.from(value)

  const render = () => {
    index = 0
    queue = []
    const tree = CreateProductMenu({ t, onSelect: (kind) => { picked.push(kind) } })
    for (const row of queue) {
      const prev = effectSlots[row.slot]
      if (prev?.cleanup) prev.cleanup()
      const cleanup = row.effect()
      effectSlots[row.slot] = { deps: row.deps, cleanup: typeof cleanup === 'function' ? cleanup : null }
    }
    return tree
  }

  let tree = render()
  mounted = true

  return {
    clock,
    picked,
    listeners,
    render: () => { tree = render(); return tree },
    root: () => tree,
    trigger: () => tree.props.children[0],
    card: () => tree.props.children[1],
    items: () => hostList(tree.props.children[1].props.children),
    /** 让 `contains()` 认得「点在容器内部」。 */
    setRootContains: (targets) => {
      const ref = stateSlots.find((slot) => slot && typeof slot === 'object' && 'current' in slot)
      if (ref) ref.current = { contains: (node) => targets.includes(node) }
    },
    unmount: () => { for (const row of effectSlots) row?.cleanup?.() },
  }
}

const itemLabels = (tree) => Array.from(tree.props.children[1].props.children).map((row) => row.props['data-kind'])

/** 收集一棵元素树里所有字符串叶子，用来断言文案真的渲染出来了。 */
function textsOf(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const row of node) textsOf(row, out)
    return out
  }
  if (typeof node === 'object' && node.props) textsOf(node.props.children, out)
  return out
}

describe('products client · create split menu', () => {
  it('starts closed and shows a vector-iconed primary trigger', () => {
    const harness = mount()
    const trigger = harness.trigger()
    assert.equal(harness.root().props.className, 'omnimux-products-create-menu')
    assert.equal(harness.root().props['data-open'], 'false')
    assert.equal(trigger.props.variant, 'primary')
    assert.equal(trigger.props.children, 'add.button')
    assert.equal(trigger.props['aria-haspopup'], 'menu')
    assert.equal(trigger.props['aria-expanded'], 'false')
    assert.ok(trigger.props.leadingIcon, 'the plus icon is part of the trigger')
    assert.ok(trigger.props.trailingIcon, 'the chevron is part of the trigger')
    assert.equal(harness.render().props.children[1], null, 'no layer before the pointer arrives')
  })

  it(`opens only after ${OPEN_DELAY_MS}ms of hover`, () => {
    const harness = mount()
    harness.root().props.onMouseEnter()
    harness.clock.advance(OPEN_DELAY_MS - 1)
    assert.equal(harness.render().props['data-open'], 'false', 'a passing pointer must not open it')
    harness.clock.advance(1)
    const open = harness.render()
    assert.equal(open.props['data-open'], 'true')
    assert.equal(open.props.children[1].props.role, 'menu')
    assert.equal(open.props.children[0].props['aria-expanded'], 'true')
  })

  it(`closes ${CLOSE_DELAY_MS}ms after leaving, and moving into the card cancels the close`, () => {
    const harness = mount()
    harness.root().props.onMouseEnter()
    harness.clock.advance(OPEN_DELAY_MS)
    harness.render()

    harness.root().props.onMouseLeave()
    harness.clock.advance(CLOSE_DELAY_MS - 1)
    assert.equal(harness.render().props['data-open'], 'true', 'the pointer still has grace to reach the card')
    harness.clock.advance(1)
    assert.equal(harness.render().props['data-open'], 'false')

    // 移出又马上移回：旧的两个计时器都必须被清掉，否则会闪断。
    harness.root().props.onMouseEnter()
    harness.clock.advance(OPEN_DELAY_MS)
    harness.render()
    harness.root().props.onMouseLeave()
    harness.root().props.onMouseEnter()
    harness.clock.advance(CLOSE_DELAY_MS)
    assert.equal(harness.render().props['data-open'], 'true', 'a re-entry cancels the pending close')
  })

  it('a fast hover-through never opens the layer', () => {
    const harness = mount()
    harness.root().props.onMouseEnter()
    harness.clock.advance(Math.floor(OPEN_DELAY_MS / 2))
    harness.root().props.onMouseLeave()
    harness.clock.advance(CLOSE_DELAY_MS + OPEN_DELAY_MS)
    assert.equal(harness.render().props['data-open'], 'false')
  })

  it('opens on Enter/Space and closes on Escape or a click outside', () => {
    const harness = mount()
    const prevent = () => { prevent.calls += 1 }
    prevent.calls = 0
    harness.trigger().props.onKeyDown({ key: 'Enter', preventDefault: prevent })
    assert.equal(harness.render().props['data-open'], 'true')
    assert.equal(prevent.calls, 1, 'Enter must not also submit or scroll')

    // Escape 是文档级入口：它和悬停是两条独立的关闭路径。
    harness.listeners.get('keydown')({ key: 'Escape', preventDefault: prevent })
    assert.equal(harness.render().props['data-open'], 'false')

    harness.trigger().props.onKeyDown({ key: ' ', preventDefault: prevent })
    assert.equal(harness.render().props['data-open'], 'true')

    // 点击容器内部不关，外部才关。
    const inside = { id: 'inside' }
    harness.setRootContains([inside])
    harness.listeners.get('mousedown')({ target: inside })
    assert.equal(harness.render().props['data-open'], 'true')
    harness.listeners.get('mousedown')({ target: { id: 'outside' } })
    assert.equal(harness.render().props['data-open'], 'false')
  })

  it('a closed menu holds no document listeners', () => {
    const harness = mount()
    assert.equal(harness.listeners.size, 0)
    harness.trigger().props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    harness.render()
    assert.equal(harness.listeners.size, 2)
    harness.listeners.get('keydown')({ key: 'Escape', preventDefault: () => {} })
    assert.equal(harness.render().props['data-open'], 'false')
  })

  it('offers exactly the two kinds, each with its own title and description', () => {
    const harness = mount()
    harness.trigger().props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    const card = harness.render().props.children[1]
    assert.equal(card.props['aria-label'], 'add.menu.label')
    assert.deepEqual(itemLabels(harness.root()), ['physical', 'digital'])
    assert.equal(card.props.children.length, CREATE_KINDS.length)

    const [physical, digital] = card.props.children
    assert.ok(textsOf(physical).includes('kind.physical'))
    assert.equal(textsOf(physical).includes('add.menu.physicalDesc'), true)
    assert.ok(textsOf(digital).includes('kind.digital'))
    assert.equal(textsOf(digital).includes('add.menu.digitalDesc'), true)
    assert.equal(physical.props.role, 'menuitem')
    assert.equal(digital.props.role, 'menuitem')
  })

  it('hands the picked kind to the caller and closes itself', () => {
    for (const kind of CREATE_KINDS) {
      const harness = mount()
      harness.trigger().props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
      const items = harness.render().props.children[1].props.children
      items.find((row) => row.props['data-kind'] === kind).props.onClick()
      assert.deepEqual(harness.picked, [kind])
      assert.equal(harness.render().props['data-open'], 'false')
    }
  })

  it('leaves no timer behind when it unmounts mid-hover', () => {
    const harness = mount()
    harness.root().props.onMouseEnter()
    assert.equal(harness.clock.pendingCount(), 1)
    harness.unmount()
    assert.equal(harness.clock.pendingCount(), 0, 'a pending open must not outlive the component')
  })
})
