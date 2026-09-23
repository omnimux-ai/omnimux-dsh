/**
 * 拖拽权威切换与 #2097 回归（Issue #2608 · T03）。
 *
 * 三条验收口径必须同时成立，缺任何一条都会退化成 #2097 或它的镜像缺陷：
 *
 * 1. **逐帧跟随**：拖拽期存储比例与外壳 authored 几何冲突时，宽度必须仍由 authored 几何决定。
 *    比例一旦进入拖拽写入路径，等价于把「记忆式基准」重新钉回轨道。
 * 2. **逐帧写入**：拖拽期间每一帧都要把新宽度发出去（写入计数 ≥ 帧数 − 1）。少了这一步，
 *    渲染会被上一帧钉住：指针在动、分界线不动。
 * 3. **松手结算**：`pointerup` 后存储比例 = 终态宽度 ÷ 舞台（±0.005），且回到稳态后像素不变
 *    （比例就是刚拖出来的那个数，重算必须是恒等变换）。
 *
 * 夹具刻意不把「测量值」当输入：外壳 authored 内联栅格由测试逐帧改写，正是真实拖拽的形态。
 * 收起态用例（#2097 场景）先同步一次展开态，让「展开态左栏基线」记忆建立起来，再收起拖拽。
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'

import {
  installSidebarToggleTopbar,
  resetConversationRatioAuthorityForTests,
} from './sidebar-toggle-topbar.js'
import {
  installSplitConversationMin,
  uninstallSplitConversationMin,
} from './workbench/split-layout.js'
import { resetWorkbenchHostAdapter, setAttachedStore } from './workbench/host-adapter.js'
import {
  WORKBENCH_FOCUS,
  focusRecordForTab,
  resetWorkbenchFocusMemory,
} from './workbench/focus-state.js'
import {
  readChatRatio,
  resetWorkspaceLayoutStoreForTests,
  writeChatRatio,
} from './workbench/workspace-layout-store.js'

const VIEWPORT_PX = 1920
const RAIL_PX = 280
const STAGE_PX = VIEWPORT_PX - RAIL_PX
const CONVERSATION_VAR = '--omnimux-conversation-width'
/** 结算用例的会话 / 页签标识（三栏态判据按会话+页签取焦点记录）。 */
const SESSION_ID = 'session-ratio-authority'
const TAB_ID = 'omnimux-workflow:canvas'
/** 与外壳 authored 几何冲突的存储比例（用于证明拖拽期比例不参与写入）。 */
const CONFLICTING_RATIO = 0.6
/** 拖拽前外壳 authored 的第三轨（右栏面板宽）。 */
const RIGHTBAR_START_PX = 864

/** @type {{ window: unknown, document: unknown, HTMLElement: unknown, MutationObserver: unknown }} */
const previous = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  MutationObserver: globalThis.MutationObserver,
}
/** @type {Array<() => void>} */
let cleanups = []

/**
 * 造一台可逐帧驱动的外壳夹具。
 *
 * `requestAnimationFrame` 被换成手动队列：观察者回调与几何写入都发生在帧回调里，
 * 手动 flush 才能把「第 N 帧」与「第 N 次写入」一一对上，这是「写入计数 ≥ 帧数 − 1」的前提。
 */
function createHarness() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="dshDesktopFrame" style="grid-template-columns:${RAIL_PX}px minmax(0px, 1fr) ${RIGHTBAR_START_PX}px">
      <aside class="dshDesktopSidebarSurface" style="width: ${RAIL_PX}px"></aside>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface"></aside>
    </div>
    <div class="tabBar_n" data-dsh-better-sidebar><div class="tabList_m"></div></div>
  </body></html>`, { url: 'http://127.0.0.1/' })
  Object.defineProperty(dom.window, 'innerWidth', { value: VIEWPORT_PX, configurable: true })

  /** @type {Array<() => void>} */
  const frameQueue = []
  Object.defineProperty(dom.window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback) => { frameQueue.push(callback); return frameQueue.length },
  })
  Object.defineProperty(dom.window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: () => {},
  })

  const doc = dom.window.document
  globalThis.window = dom.window
  globalThis.document = doc
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.MutationObserver = dom.window.MutationObserver

  return {
    dom,
    doc,
    frame: doc.querySelector('.dshDesktopFrame'),
    /** 执行所有已排队的帧回调（含回调中新排队的）。 */
    flushFrames() {
      while (frameQueue.length > 0) {
        const batch = frameQueue.splice(0, frameQueue.length)
        for (const callback of batch) callback()
      }
    },
    /** 让 MutationObserver 投递（jsdom 在微任务里派发）。 */
    settleObservers: () => new Promise((resolve) => setTimeout(resolve, 0)),
  }
}

/** 外壳 authored 栅格改写一帧：第三轨变化 = 用户把分界线拖动了。 */
async function dragFrame(harness, rightTrackPx) {
  harness.frame.style.gridTemplateColumns = `${RAIL_PX}px minmax(0px, 1fr) ${rightTrackPx}px`
  await harness.settleObservers()
  harness.flushFrames()
}

function publishedConversationWidth(doc) {
  return Number.parseFloat(doc.documentElement.style.getPropertyValue(CONVERSATION_VAR))
}

/** 只统计会话栏变量的真实写入次数（其余变量的写入不参与本组判定）。 */
function countConversationWrites(doc) {
  const root = doc.documentElement
  const original = root.style.setProperty.bind(root.style)
  const counter = { count: 0 }
  root.style.setProperty = (name, value, priority) => {
    if (name === CONVERSATION_VAR) counter.count += 1
    return original(name, value, priority)
  }
  return counter
}

/**
 * 武装「三栏分栏态」：结算与面板宽协调写都只在这一态发生。
 *
 * 中栏收起 / 右栏收起 / gui 单栏态一律不结算、不落盘（H-5），因此结算用例必须先把夹具
 * 摆成真实的三栏态（右侧工作台已挂载 + 该页签焦点为 split），否则验证的是「没有右侧
 * 工作台时也不该落盘」这条反向守卫，而不是本用例要证明的结算语义。
 */
function armThreeColumnState() {
  const state = {
    panelOpen: true,
    width: 800,
    activePane: 'pane-main',
    splits: { kind: 'leaf', id: 'pane-main', tabs: [{ id: TAB_ID }] },
  }
  setAttachedStore({ getSnapshot: () => ({ sessionId: SESSION_ID, state }) })
  focusRecordForTab(SESSION_ID, TAB_ID).mode = WORKBENCH_FOCUS.split
}

beforeEach(() => {
  resetWorkspaceLayoutStoreForTests()
  resetConversationRatioAuthorityForTests()
  resetWorkbenchHostAdapter()
  resetWorkbenchFocusMemory()
})

afterEach(() => {
  for (const cleanup of cleanups) {
    try { cleanup() } catch { /* ignore */ }
  }
  cleanups = []
  resetWorkspaceLayoutStoreForTests()
  resetConversationRatioAuthorityForTests()
  resetWorkbenchHostAdapter()
  resetWorkbenchFocusMemory()
  if (previous.window === undefined) delete globalThis.window
  else globalThis.window = previous.window
  if (previous.document === undefined) delete globalThis.document
  else globalThis.document = previous.document
  if (previous.HTMLElement === undefined) delete globalThis.HTMLElement
  else globalThis.HTMLElement = previous.HTMLElement
  if (previous.MutationObserver === undefined) delete globalThis.MutationObserver
  else globalThis.MutationObserver = previous.MutationObserver
})

describe('T03 拖拽权威切换（防 #2097 复发）', () => {
  it('follows the authored splitter frame by frame and writes on every frame', async () => {
    const harness = createHarness()
    // 存储比例故意设成 0.6（与外壳 authored 的 776/1640 ≈ 0.47 冲突）：
    // 它一旦参与拖拽写入路径，中栏会被推到 984，逐帧跟随当场失真。
    writeChatRatio(CONFLICTING_RATIO, { force: true })
    cleanups.push(installSidebarToggleTopbar(harness.doc))
    harness.flushFrames()

    const counter = countConversationWrites(harness.doc)
    harness.doc.body.setAttribute('data-dsh-sidebar-dragging', '')

    const FRAMES = 12
    const published = []
    const expected = []
    for (let index = 1; index <= FRAMES; index += 1) {
      const rightTrackPx = RIGHTBAR_START_PX - index * 10
      await dragFrame(harness, rightTrackPx)
      published.push(publishedConversationWidth(harness.doc))
      expected.push(VIEWPORT_PX - RAIL_PX - rightTrackPx)
    }

    assert.deepEqual(
      published,
      expected,
      '拖拽期每一帧都必须发布「视口 − 左栏 − 外壳当帧第三轨」，比例不得参与',
    )
    assert.ok(
      counter.count >= FRAMES - 1,
      `拖拽期间每一帧都要写出新宽度：帧数 ${FRAMES}，实际写入 ${counter.count} 次`,
    )
    assert.equal(readChatRatio(), CONFLICTING_RATIO, '拖拽期比例只记录、不写入（写入发生在 pointerup 结算）')
  })

  it('settles the drag into a stored ratio that reproduces the final width (no jump)', async () => {
    const harness = createHarness()
    armThreeColumnState()
    cleanups.push(installSidebarToggleTopbar(harness.doc))
    cleanups.push(installSplitConversationMin(harness.doc))
    harness.flushFrames()

    harness.doc.body.setAttribute('data-dsh-sidebar-dragging', '')
    const FINAL_RIGHT_TRACK_PX = 604
    await dragFrame(harness, FINAL_RIGHT_TRACK_PX)
    const finalChatPx = VIEWPORT_PX - RAIL_PX - FINAL_RIGHT_TRACK_PX
    assert.equal(publishedConversationWidth(harness.doc), finalChatPx)

    // 松手：外壳先摘掉拖拽标记，随后本插件的捕获监听结算。
    harness.doc.body.removeAttribute('data-dsh-sidebar-dragging')
    harness.doc.dispatchEvent(new harness.dom.window.Event('pointerup'))
    await harness.settleObservers()
    harness.flushFrames()
    harness.flushFrames()

    const stored = readChatRatio()
    assert.ok(typeof stored === 'number', 'pointerup 必须立即落盘比例（跳过防抖）')
    assert.ok(
      Math.abs(stored - finalChatPx / STAGE_PX) <= 0.005,
      `存储比例 ${stored} 必须等于终态宽度 ÷ 舞台 ${finalChatPx / STAGE_PX}`,
    )
    assert.equal(
      publishedConversationWidth(harness.doc),
      finalChatPx,
      '回到稳态后像素必须与松手时一致（比例就是刚拖出来的那个数）',
    )
  })

  it('keeps following the splitter while the left rail is collapsed (#2097 scenario)', async () => {
    const harness = createHarness()
    // 与上面同源：存储比例与 authored 几何冲突，收起态拖拽更必须只认 authored。
    writeChatRatio(CONFLICTING_RATIO, { force: true })
    cleanups.push(installSidebarToggleTopbar(harness.doc))
    // 展开态先同步一次：收起态的分母要锁「展开态左栏基线」（280），这是保宽的来源。
    harness.flushFrames()

    harness.doc.documentElement.setAttribute('data-omnimux-left-collapsed', '')
    harness.frame.setAttribute('data-sidebar-collapsed', 'true')
    harness.doc.body.setAttribute('data-dsh-sidebar-dragging', '')

    await dragFrame(harness, RIGHTBAR_START_PX)
    assert.equal(
      publishedConversationWidth(harness.doc),
      VIEWPORT_PX - RIGHTBAR_START_PX - RAIL_PX,
      '收起左栏拖拽：释放的 280px 必须还给中栏，宽度与展开态一致（保宽 INV-1）',
    )

    // 外壳第三轨 864 → 604（拖了 260px）：旧实现在这里把会话栏纹丝不动地吞掉。
    await dragFrame(harness, 604)
    assert.equal(
      publishedConversationWidth(harness.doc),
      VIEWPORT_PX - 604 - RAIL_PX,
      '收起态拖动分界线必须改变会话栏宽度（AC-404 / #2097 回归）',
    )
  })

  it('records the settled ratio from the authored grid, not from its own published value', async () => {
    const harness = createHarness()
    armThreeColumnState()
    cleanups.push(installSidebarToggleTopbar(harness.doc))
    cleanups.push(installSplitConversationMin(harness.doc))
    harness.flushFrames()

    harness.doc.body.setAttribute('data-dsh-sidebar-dragging', '')
    await dragFrame(harness, 604)
    harness.doc.body.removeAttribute('data-dsh-sidebar-dragging')

    // 把本插件写出去的变量改成垃圾值：结算若读自己的写值（自证读数），比例会跟着一起坏掉。
    harness.doc.documentElement.style.setProperty(CONVERSATION_VAR, '1234px')
    harness.doc.dispatchEvent(new harness.dom.window.Event('pointerup'))
    await harness.settleObservers()
    harness.flushFrames()

    assert.ok(
      Math.abs(readChatRatio() - (VIEWPORT_PX - RAIL_PX - 604) / STAGE_PX) <= 0.005,
      '结算只能读外壳 authored 栅格；读自己的写值即 INV-4 禁的自证读数',
    )
  })

  it('does not settle on a pointer release that ends no shell drag (H-5)', async () => {
    const harness = createHarness()
    armThreeColumnState()
    cleanups.push(installSidebarToggleTopbar(harness.doc))
    cleanups.push(installSplitConversationMin(harness.doc))
    harness.flushFrames()

    // 用户只是点了某个按钮：没有任何外壳分隔线拖拽发生过，绝不反推比例、绝不落盘。
    harness.doc.dispatchEvent(new harness.dom.window.Event('pointerup'))
    await harness.settleObservers()
    harness.flushFrames()
    harness.flushFrames()

    assert.equal(readChatRatio(), null, '任意一次指针释放都不得反推并落盘比例（H-5）')
  })

  it('waits for the drag to really end before settling (H-5)', async () => {
    const harness = createHarness()
    armThreeColumnState()
    cleanups.push(installSidebarToggleTopbar(harness.doc))
    cleanups.push(installSplitConversationMin(harness.doc))
    harness.flushFrames()

    harness.doc.body.setAttribute('data-dsh-sidebar-dragging', '')
    await dragFrame(harness, 604)

    // 拖拽仍在进行（标记还在）：此时的指针释放不得结算，也不得消费待结算状态。
    harness.doc.dispatchEvent(new harness.dom.window.Event('pointerup'))
    await harness.settleObservers()
    harness.flushFrames()
    assert.equal(readChatRatio(), null, '拖拽进行中不结算（INV-16 的 settling 前置条件）')

    // 真正的松手：外壳摘掉标记后再释放，必须结算出终态比例。
    harness.doc.body.removeAttribute('data-dsh-sidebar-dragging')
    harness.doc.dispatchEvent(new harness.dom.window.Event('pointerup'))
    await harness.settleObservers()
    harness.flushFrames()
    harness.flushFrames()

    assert.ok(
      Math.abs(readChatRatio() - (VIEWPORT_PX - RAIL_PX - 604) / STAGE_PX) <= 0.005,
      '真实拖拽结束必须结算（AC-7 比例记忆）',
    )
  })

  it('does not settle while the middle column is collapsed (single-column state, H-5)', async () => {
    const harness = createHarness()
    armThreeColumnState()
    cleanups.push(installSidebarToggleTopbar(harness.doc))
    cleanups.push(installSplitConversationMin(harness.doc))
    harness.flushFrames()

    // 中栏收起：中栏列宽被 !important 钉成 0，反推出来的比例不代表任何可见版式。
    harness.doc.documentElement.setAttribute('data-omnimux-conversation-collapsed', '')
    harness.doc.body.setAttribute('data-dsh-sidebar-dragging', '')
    await dragFrame(harness, 604)
    harness.doc.body.removeAttribute('data-dsh-sidebar-dragging')
    harness.doc.dispatchEvent(new harness.dom.window.Event('pointerup'))
    await harness.settleObservers()
    harness.flushFrames()
    harness.flushFrames()

    assert.equal(readChatRatio(), null, '单栏态一律不结算、不落盘（不得覆盖用户既有比例）')
  })
})
