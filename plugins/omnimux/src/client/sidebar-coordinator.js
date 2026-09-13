/**
 * Single authoritative owner of the sidebar "extra rows" block under 新会话.
 *
 * The four OmniMux plugins used to each mount their own MutationObserver on
 * `document.body` (subtree) plus a second observer on the sidebar root plus a
 * 2s retry interval. Any one row's insertion mutated the sidebar root, which
 * re-fired every other plugin's root observer, which re-placed its row, which
 * mutated the root again — an unbounded cross-plugin re-placement cascade that
 * wedged the renderer on load. (Root cause: the sidebar-row mount was
 * copy-pasted into each plugin instead of shared.)
 *
 * This module is the single owner instead. It installs `window.__omnimuxSidebar`
 * at import time (same global-singleton pattern as `__omnimuxStage`) and owns
 * exactly one sidebar-column subtree observer (body only as a boot fallback),
 * one collapsed-attribute observer and one retry interval. Plugins `register()`
 * a row with a fixed `rank`; on every change the coordinator runs a single
 * idempotent `placeAll()` that walks rows in rank order and re-inserts a row
 * only when it is out of place. Because the walker never mutates an
 * already-correct tree, a placement does not re-trigger its own observer, so
 * there is no feedback loop. Product-stage overlays must never be observed.
 */

import pluginLifecycle from '../plugin-lifecycle.json' with { type: 'json' }
import { triggerClick } from './sidebar-toggle-topbar.js'

const ALPHA_DESCRIPTION = 'Alpha · 内测：开发阶段优先完善非 Alpha 功能；正式版不包含此功能。'
const ALPHA_STYLES = `
.omnimux-sidebar-alpha-badge {
  flex: none; margin-left: auto; padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px; line-height: 16px; font-weight: 400;
  white-space: nowrap;
}
[data-sidebar-collapsed] .omnimux-sidebar-alpha-badge { display: none; }
`

/**
 * Annotate the existing entry without changing its activation or auth handlers.
 * @param {string} id
 * @param {HTMLElement} element
 */
function markAlphaEntry(id, element) {
  const pluginId = id.endsWith('-entry') ? id.slice(0, -6) : id
  if (pluginLifecycle[pluginId]?.stage !== 'alpha') return
  injectStyles(ALPHA_STYLES, 'omnimux-sidebar-alpha-styles')
  element.dataset.releaseStage = 'alpha'
  element.setAttribute('aria-description', ALPHA_DESCRIPTION)
  element.title = ALPHA_DESCRIPTION
  if (element.querySelector('.omnimux-sidebar-alpha-badge')) return
  const badge = document.createElement('span')
  badge.className = 'omnimux-sidebar-alpha-badge'
  badge.textContent = 'Alpha'
  badge.setAttribute('aria-label', 'Alpha · 内测')
  element.append(badge)
}

export const SIDEBAR_GLOBAL_KEY = '__omnimuxSidebar'
export const SIDEBAR_GLOBAL = () => (typeof window !== 'undefined' ? window[SIDEBAR_GLOBAL_KEY] : undefined)

const ROWS = []
const INLINE_ROWS = []
const seen = new Set()

/** Coordinator-owned chrome for the inline row (并排「新建会话」). */
const INLINE_STYLES = `
.omnimux-sidebar-inline-row {
  display: flex; align-items: stretch; gap: 8px;
  margin: 0 2px 8px;
}
.omnimux-sidebar-inline-row > .omnimux-sidebar-inline-btn {
  flex: 1 1 0; min-width: 0;
}
.omnimux-sidebar-inline-row > .omnimux-sidebar-inline-new-session {
  flex: 1 1 0; min-width: 0; margin: 0;
}
/* 收起轨 56px、官方加号 36px。并排第二颗会挤爆，改成一份加号 + 菜单。
   display:contents 把 wrapper 拆掉，好让官方 .collapsed .newSession 当列的直接子。
   但不能把展开时的 flex:1 一起带进竖列 —— 否则加号会吃掉 regionArea 的高度，
   变成截图那种竖条。 */
[data-sidebar-collapsed] .omnimux-sidebar-inline-row {
  display: contents;
}
[data-sidebar-collapsed] .omnimux-sidebar-inline-btn {
  display: none !important;
}
[data-sidebar-collapsed] .omnimux-sidebar-inline-row > .omnimux-sidebar-inline-new-session {
  flex: none;
  align-self: flex-start;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  margin: 0 0 12px;
}
.omnimux-sidebar-new-menu {
  position: fixed; z-index: 400; min-width: 168px; padding: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.28));
  border-radius: 10px;
  /* DSH 没有 bg-elevated/bg-primary；菜单挂 body，必须用现网 layer token。 */
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #232324));
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0,0,0,.16));
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-sidebar-new-menu[hidden] { display: none !important; }
.omnimux-sidebar-new-menu button {
  display: block; width: 100%; box-sizing: border-box;
  margin: 0; padding: 8px 10px; border: 0; border-radius: 8px;
  background: transparent; color: inherit; cursor: pointer;
  font: var(--dsw-font-s-14, 14px/20px system-ui); text-align: left;
}
.omnimux-sidebar-new-menu button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12));
}
`

/** Inner pane/col first; desktop shell wrappers are fallback only. */
function querySidebarColumn() {
  const inner = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (inner instanceof HTMLElement) return inner
  const shell = document.querySelector('.dshDesktopSidebarSurface, .dshDesktopUpstreamSidebar')
  return shell instanceof HTMLElement ? shell : undefined
}

function sidebarRoot() {
  const column = querySidebarColumn()
  if (!(column instanceof HTMLElement)) return undefined
  const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild instanceof HTMLElement ? column.firstElementChild : undefined)
}

function railCollapsed() {
  return Boolean(document.querySelector('[data-sidebar-collapsed]'))
}

function sessionLabel(button) {
  const raw = button?.getAttribute?.('aria-label') || button?.textContent || ''
  const text = String(raw).trim()
  if (/new session/i.test(text)) return 'New Session'
  if (/新对话|新建对话/i.test(text)) return '新对话'
  if (text) return text
  return '新对话'
}

function projectLabel(button) {
  const raw = button?.getAttribute?.('aria-label') || button?.textContent || ''
  const text = String(raw).trim()
  if (/new project/i.test(text)) return 'New Project'
  if (text) return text
  return '新建项目'
}

let skipNextCollapsedClick = false
/** 菜单打开时的 document 监听；必须在所有 close 路径上卸掉，避免泄漏。 */
let menuDocCleanup

function closeNewMenu() {
  menuDocCleanup?.()
  menuDocCleanup = undefined
  document.getElementById('omnimux-sidebar-new-menu')?.remove()
}

/**
 * Place the collapsed new-menu under (preferred) or beside the anchor.
 * Topbar cluster anchors must not use the hidden rail button's rect — that
 * left the menu floating far from the visible control ("分裂").
 * @param {HTMLElement} anchor
 * @returns {{ left: number, top: number }}
 */
export function computeNewMenuPosition(anchor, viewport = typeof window !== 'undefined' ? window : undefined) {
  const rect = anchor.getBoundingClientRect()
  const vw = viewport?.innerWidth ?? 1280
  const vh = viewport?.innerHeight ?? 800
  const menuW = 180
  const menuH = 96
  const gap = 6
  let left = Math.round(rect.left)
  let top = Math.round(rect.bottom + gap)
  // Prefer left-aligned under the anchor; clamp into the viewport.
  if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8)
  if (left < 8) left = 8
  // If not enough room below, flip above the anchor.
  if (top + menuH > vh - 8) {
    top = Math.max(8, Math.round(rect.top - menuH - gap))
  }
  return { left, top }
}

function openNewMenu(anchor, sessionBtn, projectBtn) {
  closeNewMenu()
  const menu = document.createElement('div')
  menu.id = 'omnimux-sidebar-new-menu'
  menu.className = 'omnimux-sidebar-new-menu'
  menu.setAttribute('role', 'menu')
  const sessionItem = document.createElement('button')
  sessionItem.type = 'button'
  sessionItem.setAttribute('role', 'menuitem')
  sessionItem.textContent = sessionLabel(sessionBtn)
  sessionItem.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    closeNewMenu()
    skipNextCollapsedClick = true
    sessionBtn.click()
  })
  const projectItem = document.createElement('button')
  projectItem.type = 'button'
  projectItem.setAttribute('role', 'menuitem')
  projectItem.textContent = projectLabel(projectBtn)
  projectItem.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    closeNewMenu()
    projectBtn.click()
  })
  menu.append(sessionItem, projectItem)
  document.body.append(menu)
  const { left, top } = computeNewMenuPosition(anchor)
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
  const onDoc = (event) => {
    if (menu.contains(event.target) || event.target === anchor) return
    // Also keep open when clicking the topbar new-session control that opened it.
    if (event.target instanceof Element && event.target.closest?.('[data-omnimux-topbar-new-session="1"]') === anchor) return
    closeNewMenu()
  }
  const onKey = (event) => {
    if (event.key !== 'Escape') return
    closeNewMenu()
  }
  document.addEventListener('mousedown', onDoc, true)
  document.addEventListener('keydown', onKey, true)
  menuDocCleanup = () => {
    document.removeEventListener('mousedown', onDoc, true)
    document.removeEventListener('keydown', onKey, true)
  }
}

/**
 * Open the collapsed 「新建会话 / 新建项目」 menu anchored to a visible control
 * (topbar new-session icon or rail plus). Returns false when the rail is
 * expanded or the official triggers are missing.
 * @param {HTMLElement | null | undefined} anchor
 * @returns {boolean}
 */
export function openCollapsedNewMenuAt(anchor) {
  if (!(anchor instanceof HTMLElement)) return false
  if (!railCollapsed()) return false
  const root = sidebarRoot()
  const sessionBtn = root ? newSessionButton(root) : undefined
  const projectBtn = INLINE_ROWS[0]?.element
  if (!(sessionBtn instanceof HTMLElement)) return false
  if (!(projectBtn instanceof HTMLElement)) {
    // No project inline row registered yet — still offer new-session only.
    closeNewMenu()
    const menu = document.createElement('div')
    menu.id = 'omnimux-sidebar-new-menu'
    menu.className = 'omnimux-sidebar-new-menu'
    menu.setAttribute('role', 'menu')
    const sessionItem = document.createElement('button')
    sessionItem.type = 'button'
    sessionItem.setAttribute('role', 'menuitem')
    sessionItem.textContent = sessionLabel(sessionBtn)
    sessionItem.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      closeNewMenu()
      skipNextCollapsedClick = true
      triggerClick(sessionBtn)
    })
    menu.append(sessionItem)
    document.body.append(menu)
    const { left, top } = computeNewMenuPosition(anchor)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    const onDoc = (event) => {
      if (menu.contains(event.target) || event.target === anchor) return
      closeNewMenu()
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      closeNewMenu()
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey, true)
    menuDocCleanup = () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey, true)
    }
    return true
  }
  openNewMenu(anchor, sessionBtn, projectBtn)
  return true
}

function onCollapsedNewSessionClick(event) {
  if (skipNextCollapsedClick) {
    skipNextCollapsedClick = false
    return
  }
  if (!railCollapsed()) return
  const projectBtn = INLINE_ROWS[0]?.element
  if (!(projectBtn instanceof HTMLElement)) return
  event.preventDefault()
  event.stopPropagation()
  const sessionBtn = event.currentTarget
  if (!(sessionBtn instanceof HTMLElement)) return
  openNewMenu(sessionBtn, sessionBtn, projectBtn)
}

function bindCollapsedNewMenu(sessionBtn) {
  if (!(sessionBtn instanceof HTMLElement)) return
  if (sessionBtn.dataset.omnimuxCollapsedMenu === '1') return
  sessionBtn.dataset.omnimuxCollapsedMenu = '1'
  sessionBtn.addEventListener('click', onCollapsedNewSessionClick, true)
}

function isButtonEl(el) {
  return el instanceof HTMLElement && typeof el.click === 'function' && el.tagName === 'BUTTON'
}

const NEW_SESSION_LABEL_RE = /新会话|新建会话|新对话|新建对话|new session|new chat/i

/**
 * Official 新对话 / New Session control. Never the logoRow brand/logo button:
 * a comma-list querySelector hits `*_brand` first in tree order.
 * @param {Element | null | undefined} el
 */
function looksLikeNewSessionButton(el) {
  if (!isButtonEl(el)) return false
  const cls = typeof el.className === 'string' ? el.className : String(el.className ?? '')
  if (/(?:^|\s)[\w-]*_brand(?:\s|$)/.test(cls)) return false
  if (/newSession/i.test(cls)) return true
  const aria = el.getAttribute?.('aria-label') || ''
  const text = `${aria} ${el.textContent || ''}`
  return NEW_SESSION_LABEL_RE.test(text)
}

function newSessionButton(root) {
  const nested = root.querySelector('button[class*="newSession"]')
  if (looksLikeNewSessionButton(nested)) return nested
  for (const child of root.children) {
    if (looksLikeNewSessionButton(child)) return child
  }
  const byAria = root.querySelector(
    'button[aria-label="新建会话"], button[aria-label="New Session"], button[aria-label*="新会话"], button[aria-label*="new session" i], button[aria-label*="新对话"], button[aria-label*="新建对话"], button[aria-label*="New chat" i]',
  )
  if (looksLikeNewSessionButton(byAria)) return byAria
  return [...root.querySelectorAll('button')].find((button) => looksLikeNewSessionButton(button))
}

/** Lift a nested control to the `root` child that owns it so insertBefore stays legal. */
function directChildOf(root, node) {
  if (!(node instanceof HTMLElement) || node === root) return undefined
  let current = node
  while (current.parentElement !== null && current.parentElement !== root) {
    current = current.parentElement
  }
  return current.parentElement === root ? current : undefined
}

/** Optional external family rows (taskboard/atb/ssh) that precede our block. */
function externalAnchor(root) {
  return [...root.children].find(
    (el) => el instanceof HTMLElement && el.matches('[data-dsh-taskboard-entry], [data-dsh-atb-entry], [data-dsh-ssh-entry]'),
  )
}

function injectStyles(styleText, styleId) {
  if (!styleText) return
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = styleText
  document.head.append(style)
}

let waitObserver
let collapsedAttrObserver
let collapsedHost
let retry
/** Node currently observed for extra-row placement. Never stay on document.body once the sidebar column exists. */
let observedRoot
let placeScheduled = false
let placeCount = 0
let placeGeneration = 0

function enqueuePlaceAll() {
  if (placeScheduled) return
  placeScheduled = true
  const generation = placeGeneration
  const enqueue = typeof requestAnimationFrame === 'function'
    ? (fn) => requestAnimationFrame(fn)
    : (fn) => setTimeout(fn, 0)
  enqueue(() => {
    if (generation !== placeGeneration) return
    placeScheduled = false
    runPlaceAll()
  })
}

/**
 * Observe the sidebar column, not document.body. A body+subtree observer
 * re-enters placeAll() for every product-stage mount (unauthenticated
 * sidebar clicks now open stages directly) and wedges the renderer.
 */
function bindWaitObserver() {
  const column = querySidebarColumn()
  const target = column instanceof HTMLElement
    ? column
    : (document.body instanceof HTMLElement ? document.body : undefined)
  if (!(target instanceof HTMLElement)) return
  if (observedRoot === target) return
  observedRoot = target
  waitObserver?.disconnect()
  waitObserver = new MutationObserver(() => {
    enqueuePlaceAll()
    if (observedRoot === document.body && sidebarRoot() !== undefined) {
      bindWaitObserver()
    }
  })
  waitObserver.observe(target, { childList: true, subtree: true })
}

/**
 * 官方 AppFrame 把 `data-sidebar-collapsed` 写在 frame 根节点，不是 `<html>`。
 * 监听必须覆盖真正带该属性的节点。优先绑 sidebar 列祖先里「已经带属性」
 * 的节点，展开时属性不在则绑列的 parent（即 AppFrame）。不要对 html/body
 * 做全树 attributes。
 */
function collapsedHostNode() {
  const column = querySidebarColumn()
  if (column instanceof HTMLElement) {
    const marked = column.closest('[data-sidebar-collapsed]')
    if (marked instanceof HTMLElement) return marked
    if (column.parentElement instanceof HTMLElement) return column.parentElement
    const slot = column.closest('[data-slot="root"]')
    if (slot instanceof HTMLElement) return slot
  }
  const marked = document.querySelector('[data-sidebar-collapsed]')
  if (marked instanceof HTMLElement) return marked
  const slot = document.querySelector('[data-slot="root"]')
  if (slot instanceof HTMLElement) return slot
  return undefined
}

function bindCollapsedAttrObserver() {
  const host = collapsedHostNode()
  if (!(host instanceof HTMLElement)) return
  if (host === collapsedHost) return
  collapsedHost = host
  collapsedAttrObserver?.disconnect()
  collapsedAttrObserver = new MutationObserver(() => { runPlaceAll() })
  // 属性在 host 自身时不需要 subtree。只有 host 是 slot 锚点（属性在子 frame 上）才下探一层。
  const subtree = host.matches('[data-slot="root"]') && !host.hasAttribute('data-sidebar-collapsed')
  collapsedAttrObserver.observe(host, {
    attributes: true,
    attributeFilter: ['data-sidebar-collapsed'],
    subtree,
  })
}

function runPlaceAll() {
  placeCount += 1
  bindWaitObserver()
  bindCollapsedAttrObserver()
  const root = sidebarRoot()
  if (root === undefined) return
  placeBelow(root)
  placeInline(root)
  if (!railCollapsed()) closeNewMenu()
}

/** Below rows：按 rank 排序，落在「新建会话」下方（既有行为）。 */
function placeBelow(root) {
  const sorted = [...ROWS].sort((a, b) => a.rank - b.rank)
  let anchor = directChildOf(root, newSessionButton(root))
  if (anchor === undefined) return
  let slotExternal = true
  for (const row of sorted) {
    // External family rows (taskboard/atb/ssh) slot between the hub block
    // (ranks 1-2) and the vertical block. Rebase the anchor once, before the
    // first vertical row, so our rows land below the external rows.
    if (row.rank >= 3 && slotExternal) {
      const ext = externalAnchor(root)
      if (ext instanceof HTMLElement) anchor = ext
      slotExternal = false
    }
    const el = row.element
    if (el.parentElement === root && el.previousElementSibling === anchor) {
      anchor = el
      continue
    }
    root.insertBefore(el, anchor.nextElementSibling ?? null)
    anchor = el
  }
}

/**
 * Inline rows：与「新建会话」并排。用一个 coordinator 自有的 wrapper 包裹
 * 新建会话按钮 + inline 按钮（不动官方按钮内部 DOM，只调整其容器的 flex 布局）。
 * 幂等：wrapper 已就位时只补齐缺失的 inline 按钮，不重插。
 */
function placeInline(root) {
  if (INLINE_ROWS.length === 0) return
  const session = newSessionButton(root)
  if (session === undefined || session.parentElement === null) return
  let wrapper = root.querySelector('[data-omnimux-inline-row]')
  if (!(wrapper instanceof HTMLElement)) {
    wrapper = document.createElement('div')
    wrapper.dataset.omnimuxInlineRow = ''
    wrapper.className = 'omnimux-sidebar-inline-row'
    session.before(wrapper)
    wrapper.append(session)
  } else if (session.parentElement !== wrapper) {
    wrapper.append(session)
  }
  session.classList.add('omnimux-sidebar-inline-new-session')
  let prev = session
  for (const row of INLINE_ROWS) {
    const el = row.element
    if (el.parentElement === wrapper && el.previousElementSibling === prev) {
      prev = el
      continue
    }
    wrapper.insertBefore(el, prev.nextElementSibling ?? null)
    prev = el
  }
  bindCollapsedNewMenu(session)
}

function createApi() {
  return {
    register(row) {
      const id = row.id
      if (seen.has(id)) return () => {}
      seen.add(id)
      if (row.styles) injectStyles(row.styles, row.styleId)
      const element = row.create()
      markAlphaEntry(id, element)
      // kind:'inline' → 并排「新建会话」；否则 → 下方 rank 行。
      if (row.kind === 'inline') {
        injectStyles(INLINE_STYLES, 'omnimux-sidebar-inline-styles')
        element.classList.add('omnimux-sidebar-inline-btn')
        INLINE_ROWS.push({ id, element })
        runPlaceAll()
        return () => {
          const i = INLINE_ROWS.findIndex((r) => r.id === id)
          if (i >= 0) INLINE_ROWS.splice(i, 1)
          seen.delete(id)
          element.remove()
          runPlaceAll()
        }
      }
      ROWS.push({ id, rank: row.rank, element })
      runPlaceAll()
      return () => {
        const i = ROWS.findIndex((r) => r.id === id)
        if (i >= 0) ROWS.splice(i, 1)
        seen.delete(id)
        element.remove()
        runPlaceAll()
      }
    },
    place: runPlaceAll,
  }
}

function install() {
  const existing = SIDEBAR_GLOBAL()
  if (existing) return existing
  const api = createApi()
  waitObserver?.disconnect()
  collapsedAttrObserver?.disconnect()
  collapsedHost = undefined
  observedRoot = undefined
  placeScheduled = false
  placeCount = 0
  placeGeneration += 1
  bindWaitObserver()
  bindCollapsedAttrObserver()
  retry = setInterval(() => {
    runPlaceAll()
    // 侧栏已挂载 → 收窄到 sidebar 列，后续 DOM 变化交给列级 observer，轮询自毁防泄漏。
    if (sidebarRoot() !== undefined) {
      clearInterval(retry)
      retry = undefined
    }
  }, 2000)
  Object.defineProperty(window, SIDEBAR_GLOBAL_KEY, { value: api, configurable: true })
  return api
}

/** Call at module top level of the hub client (mirrors installStageGlobal). */
export function installSidebarGlobal() {
  install()
}

/** Test-only: node currently observed for extra-row placement. */
export function getSidebarObserverTargetForTests() {
  return observedRoot
}

export function getPlaceCountForTests() {
  return placeCount
}

/**
 * Test-only: drop the singleton so a later case can re-install against a new DOM.
 * Not exposed on the window global.
 */
export function resetSidebarCoordinatorForTests() {
  waitObserver?.disconnect()
  collapsedAttrObserver?.disconnect()
  waitObserver = undefined
  collapsedAttrObserver = undefined
  collapsedHost = undefined
  observedRoot = undefined
  placeScheduled = false
  placeCount = 0
  placeGeneration += 1
  if (retry) {
    clearInterval(retry)
    retry = undefined
  }
  ROWS.length = 0
  INLINE_ROWS.length = 0
  seen.clear()
  closeNewMenu()
  if (typeof window !== 'undefined') {
    try {
      delete window[SIDEBAR_GLOBAL_KEY]
    } catch {
      window[SIDEBAR_GLOBAL_KEY] = undefined
    }
  }
}
