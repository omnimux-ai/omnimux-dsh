/**
 * 当前会话右栏状态镜像（rc.3 多会话挂载适配）。
 *
 * 样式层不能再使用 `:has([data-sidebar-right-panel][data-sidebar-right-open])`
 * 判断当前右栏：rc.3 中隐藏旧会话面板仍满足该结构，任何会话的旧面板都会让
 * 当前页面误套三栏/紧凑布局。本模块把「当前会话的右栏状态」镜像到 html 上，
 * CSS 只读镜像属性，不直接扫描所有会话面板。
 */

import { currentRightbarPanel, readCurrentRightbarState } from './current-panel.js'

export const RIGHTBAR_OPEN_ATTR = 'data-omnimux-rightbar-open'
export const RIGHTBAR_FULLSCREEN_ATTR = 'data-omnimux-rightbar-fullscreen'

function setBooleanAttr(root, name, value) {
  if (!root || typeof root.setAttribute !== 'function') return
  if (value) {
    if (root.getAttribute?.(name) !== 'true') root.setAttribute(name, 'true')
  } else if (typeof root.removeAttribute === 'function' && root.hasAttribute?.(name)) {
    root.removeAttribute(name)
  }
}

/**
 * 同步当前会话右栏状态到 html 属性。
 * @param {Document} [doc]
 * @returns {{ panel: Element | null, open: boolean, fullscreen: boolean }}
 */
export function syncRightbarStateMirror(doc = typeof document !== 'undefined' ? document : undefined) {
  const root = doc?.documentElement
  if (!root) return { panel: null, open: false, fullscreen: false }
  const state = readCurrentRightbarState(doc)
  setBooleanAttr(root, RIGHTBAR_OPEN_ATTR, state.open)
  setBooleanAttr(root, RIGHTBAR_FULLSCREEN_ATTR, state.fullscreen)
  return state
}

/**
 * 安装当前会话右栏状态镜像。
 *
 * 只响应右栏面板/展开属性变化、会话包装的 hidden/aria-hidden 变化，以及涉及
 * 面板/会话包装的子树增删；普通节点的插入或隐藏不触发重算。
 * @param {Document} [doc]
 * @returns {() => void}
 */
export function installRightbarStateMirror(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc?.documentElement) return () => {}
  const root = doc.documentElement
  const run = () => syncRightbarStateMirror(doc)
  run()

  const Observer = doc.defaultView?.MutationObserver
    || (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined)
  if (!Observer) return () => {}

  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    const raf = doc.defaultView?.requestAnimationFrame
    if (typeof raf === 'function') raf(() => { scheduled = false; run() })
    else Promise.resolve().then(() => { scheduled = false; run() })
  }

  const observer = new Observer((records) => {
    const relevant = records.some((record) => {
      const name = record.attributeName
      if (name === 'hidden' || name === 'aria-hidden') {
        const target = record.target
        return Boolean(target && typeof target.hasAttribute === 'function'
          && target.hasAttribute('data-sidebar-right-session'))
      }
      if (name === 'data-sidebar-right-panel' || name === 'data-sidebar-right-open') return true
      const nodes = [...(record.addedNodes || []), ...(record.removedNodes || [])]
      return nodes.some((node) => node && node.nodeType === 1
        && (node.matches?.('[data-sidebar-right-panel], [data-sidebar-right-session]')
          || node.querySelector?.('[data-sidebar-right-panel], [data-sidebar-right-session]')))
    })
    if (relevant) schedule()
  })
  observer.observe(root, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['data-sidebar-right-panel', 'data-sidebar-right-open', 'hidden', 'aria-hidden'],
  })
  return () => observer.disconnect()
}

export { currentRightbarPanel }
