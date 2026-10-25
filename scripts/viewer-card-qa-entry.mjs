/**
 * @file scripts/viewer-card-qa-entry.mjs
 * @description omnimux-viewer 工具卡片的工作树隔离验收入口（真实浏览器内核）
 *
 * 为什么单独一个入口：工作树 Web 验收的既有 Stage 都是「侧边栏应用页」，靠假宿主
 * 摆出 `window.__omnimuxWorkbench`；而 viewer 的改动面是**工具卡片**——它经
 * `ctx.slots.register('tool.call.toolview', …)` 注册，没有任何页面入口可点。这里
 * 用最小假宿主把插件的客户端半边真跑一遍：真的 `apply()`、真的注册、真的 React
 * 渲染，再由驱动侧读 DOM 断言。
 *
 * 断言目标是 Issue #3715 迁移过的那条路径：rc.3 把「运行中的调用」按 `phase` 分
 * 成 preparing / start，只有 `start` 带原始参数。若迁移写错，卡片头部的路径会消失。
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { apply } from '../plugins/omnimux-viewer/src/client/index.ts'

/** 运行中的 `display_file` 调用：rc.3 的 `StartedToolCall` 形状（`phase: 'start'`）。 */
export const QA_BLOCK = Object.freeze({
  phase: 'start',
  callId: 'qa-viewer-card-1',
  name: 'display_file',
  argsRaw: '{"file_path":"/tmp/qa-viewer-card.mp4"}',
  turn: 1,
  step: 1,
  time: 0,
  subCalls: [],
})

/** 断言用的路径字面量，与 {@link QA_BLOCK} 保持一致。 */
export const QA_EXPECTED_PATH = '/tmp/qa-viewer-card.mp4'

/** 卡片必须注册的工具键（`display_file` 拥有，`read_image` 让位）。 */
export const QA_EXPECTED_KEYS = Object.freeze(['display_file', 'read_image'])

/**
 * 最小假宿主：只提供插件客户端半边真正读到的接缝。
 * `inject` 一律不回调，这样 `mountMediaViewerTab` 这类依赖 hub 侧接缝的挂载
 * 会自然早退，验收范围保持在工具卡片本身。
 */
function makeCtx(registrations) {
  return {
    effect: (fn) => {
      const dispose = fn?.()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    inject: () => () => {},
    get: () => undefined,
    on: () => () => {},
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_key, fn) => { fn?.(); return () => {} },
      register: (options, Component) => {
        registrations.push({ options, Component })
        return () => {}
      },
    },
    sessions: { binding: () => undefined },
  }
}

const state = { ok: false, done: false, error: null, keys: [], text: '', pathShown: false, consoleErrors: [] }
globalThis.__viewerCardQa = state

// React 的渲染错误不会抛到调用点，收进状态里供驱动侧诊断。
globalThis.addEventListener?.('error', (event) => {
  state.consoleErrors.push(String(event?.message || event))
})
const originalConsoleError = console.error
console.error = (...args) => {
  state.consoleErrors.push(args.map((arg) => String(arg)).join(' '))
  originalConsoleError(...args)
}

try {
  const registrations = []
  apply(makeCtx(registrations))
  state.keys = registrations.map((entry) => entry.options.key)

  const owner = registrations.find((entry) => entry.options.key === 'display_file')
  if (owner === undefined) throw new Error('display_file 卡片未注册')

  const container = document.getElementById('card-root')
  if (container === null) throw new Error('缺少 #card-root 容器')

  createRoot(container).render(createElement(owner.Component, {
    toolName: 'display_file',
    block: QA_BLOCK,
    loadAttachment: async () => 'data:image/png;base64,iVBORw0KGgo=',
    t: (key) => key,
  }))

  // 并发渲染是异步提交的：轮询到出现文本或超时为止，超时也置 done，
  // 让驱动侧拿到「渲染了但内容为空」这个可诊断的结果，而不是无限等。
  let attempts = 0
  const settle = () => {
    attempts += 1
    state.text = container.textContent || ''
    state.pathShown = state.text.includes(QA_EXPECTED_PATH)
    state.ok = state.pathShown
    if (state.ok || attempts >= 30) {
      state.done = true
      return
    }
    setTimeout(settle, 100)
  }
  requestAnimationFrame(settle)
} catch (error) {
  state.error = String(error?.message || error)
  state.done = true
}
