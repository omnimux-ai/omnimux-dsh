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
 *
 * 架构收敛（Architecture Convergence）：
 * 1. 排除核心常驻项：`omnimux-workflow`（项目）、`omnimux-assets`（资产库）、`omnimux-inspiration`（灵感社区）以及 inline 的新建项目，继续挂载在侧栏；
 * 2. 排除技能专家（`omnimux-market`，在底部 footer）；
 * 3. 其余所有插件（包括所有 Alpha 插件 accounts, publish, analytics, forms, automation 以及垂直插件 video, products, device, clip, social-harvest, apps 等）全部收敛至探索菜单，不再作为独立行渲染在侧边栏；
 * 4. 常驻探索行（rank 3.9，在项目上方），展开态显示图标与“探索”，折叠态显示居中图标；
 * 5. 浮动探索菜单（挂在 document.body，深色半透明圆角面板、细分割线、hover 态、点击激活对应 Workbench Tab 并关闭菜单、点击外部或按 Esc 关闭、防溢出几何定位）；
 * 6. 探索菜单项严格按照产品经理 Spec 白名单（11项：应用、视频剪辑、Google Vids、产品库、发布、账号、手机管理、数据分析、自动化、任务表单、社交采收），带纯矢量 SVG 图标。
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
[data-release-stage="alpha"] { display: none !important; }
`

export function isAlphaEntry(id) {
  const pluginId = id.endsWith('-entry') ? id.slice(0, -6) : id
  return pluginLifecycle[pluginId]?.stage === 'alpha'
}

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
const CONVERGED_ROWS = new Map()
const seen = new Set()

/** 核心常驻侧栏项白名单（除 inline 新建项目与探索行自身外） */
const PINNED_ENTRY_PREFIXES = ['omnimux-workflow', 'omnimux-assets', 'omnimux-inspiration']

export function isPinnedSidebarEntry(id) {
  if (id === 'omnimux-explore-entry') return true
  const pluginId = id.endsWith('-entry') ? id.slice(0, -6) : id
  return PINNED_ENTRY_PREFIXES.includes(pluginId) || PINNED_ENTRY_PREFIXES.includes(id)
}

/**
 * 判断是否应收敛到「探索」菜单，不再作为独立行渲染在侧边栏。
 * 排除核心常驻项（workflow, assets, inspiration, explore）和非 omnimux 夹具；
 * 其余所有 omnimux 功能插件均收敛。
 */
export function isConvergedEntry(id) {
  if (isPinnedSidebarEntry(id)) return false
  const pluginId = id.endsWith('-entry') ? id.slice(0, -6) : id
  if (pluginId === 'omnimux-workflow' || pluginId === 'omnimux-assets' || pluginId === 'omnimux-inspiration' || pluginId === 'omnimux-explore') {
    return false
  }
  if (id.startsWith('omnimux-') || pluginId.startsWith('omnimux-')) {
    return true
  }
  return false
}

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
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
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
  background: var(--dsw-alias-interactive-bg-hover);
}
`

/** 探索行（Rank 3.9）与探索浮动菜单样式，100% 消费官方原生 --dsw-alias-* Token */
const EXPLORE_STYLES = `
.omnimux-explore-entry {
  box-sizing: border-box; display: flex; align-items: center; gap: 6px; position: relative;
  width: calc(100% - 8px); height: 32px; margin: 0 4px 2px; padding: 0 8px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: var(--dsw-font-s-14, inherit); font-size: 14px; line-height: 20px;
  cursor: pointer; text-align: left;
}
.omnimux-explore-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-explore-entry[data-active="true"],
.omnimux-explore-entry[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-active);
}
.omnimux-explore-entry-icon {
  flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center;
}
.omnimux-explore-entry svg {
  display: block; width: 14px; height: 14px;
}
.omnimux-explore-entry-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px;
}
[data-sidebar-collapsed] .omnimux-explore-entry {
  width: 36px; min-width: 36px; height: 36px;
  padding: 0; margin: 0 auto 6px;
  justify-content: center; align-self: center;
}
[data-sidebar-collapsed] .omnimux-explore-entry .omnimux-explore-entry-label {
  display: none !important;
}

.omnimux-explore-menu {
  position: fixed; z-index: 500; min-width: 180px; width: max-content; max-width: 240px;
  box-sizing: border-box; padding: 5px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-elevated);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 10px 28px var(--dsw-alias-bg-mask-1), 0 2px 8px var(--dsw-alias-bg-mask-1);
  color: var(--dsw-alias-label-primary, inherit);
  animation: omnimux-explore-pop 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes omnimux-explore-pop {
  from { opacity: 0; transform: scale(0.96) translateX(-4px); }
  to { opacity: 1; transform: scale(1) translateX(0); }
}
.omnimux-explore-menu[hidden] { display: none !important; }
.omnimux-explore-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 32px;
  box-sizing: border-box; margin: 0 0 1px; padding: 0 10px;
  border: 0; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary, inherit); cursor: pointer;
  font: var(--dsw-font-s-14, 14px/20px system-ui); font-size: 14px; line-height: 20px;
  text-align: left; transition: background 100ms ease;
}
.omnimux-explore-menu-item:last-child { margin-bottom: 0; }
.omnimux-explore-menu-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-explore-menu-item:active {
  background: var(--dsw-alias-interactive-bg-active);
  transform: scale(0.98);
}
.omnimux-explore-menu-item-icon {
  flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-secondary, inherit);
}
.omnimux-explore-menu-item:hover .omnimux-explore-menu-item-icon {
  color: var(--dsw-alias-label-primary, inherit);
}
.omnimux-explore-menu-item-icon svg {
  display: block; width: 14px; height: 14px;
}
.omnimux-explore-menu-item-label {
  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omnimux-explore-menu-divider {
  height: 1px; margin: 4px 6px;
  background: var(--dsw-alias-border-l1);
}
`

/**
 * 探索菜单项白名单（11项，逐字锁定）：
 * 应用、视频剪辑、Google Vids、产品库、发布、账号、手机管理、数据分析、自动化、任务表单、社交采收
 * 统一带纯矢量 SVG 图标，严禁 Emoji，零冗余徽章、零副标题、零同义重复。
 */
export const EXPLORE_MENU_ITEMS = [
  {
    id: 'apps',
    pluginId: 'omnimux-apps',
    entryId: 'omnimux-apps-entry',
    label: '应用',
    tabId: 'omnimux:apps',
    action: (converged) => {
      const el = converged.get('omnimux-apps-entry')?.element
      if (el && typeof el.click === 'function') {
        el.click()
        return true
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('omnimux-app-open', { detail: { id: 'apps' } }))
      }
      return true
    },
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="1.5" y="1.5" width="5" height="5" rx="1"/><rect x="9.5" y="1.5" width="5" height="5" rx="1"/><rect x="1.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></svg>',
  },
  {
    id: 'clip',
    pluginId: 'omnimux-clip',
    entryId: 'omnimux-clip-entry',
    label: '视频剪辑',
    tabId: 'omnimux-clip:studio',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.75"/><path d="M6.4 5.6v4.8L10.6 8 6.4 5.6Z" fill="currentColor" stroke="none"/></svg>',
  },
  {
    id: 'google-vids',
    pluginId: 'omnimux-video',
    entryId: 'omnimux-google-vids-entry',
    label: 'Google Vids',
    tabId: 'omnimux-video:google-vids',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2.5"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor" stroke="none"/></svg>',
    dividerAfter: true,
  },
  {
    id: 'products',
    pluginId: 'omnimux-products',
    entryId: 'omnimux-products-entry',
    label: '产品库',
    tabId: 'omnimux-products:library',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h10l-1 9H4L3 5z"/><path d="M6 5V3.5a2 2 0 0 1 4 0V5"/></svg>',
  },
  {
    id: 'publish',
    pluginId: 'omnimux-publish',
    entryId: 'omnimux-publish-entry',
    label: '发布',
    tabId: 'omnimux-publish:library',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 1.5 7 9M14.5 1.5 10 14.5l-3-4.5-4.5-3 12-5.5z"/></svg>',
  },
  {
    id: 'accounts',
    pluginId: 'omnimux-accounts',
    entryId: 'omnimux-accounts-entry',
    label: '账号',
    tabId: 'omnimux-accounts:library',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5" r="3"/><path d="M2.5 14a5.5 5.5 0 0 1 11 0"/></svg>',
  },
  {
    id: 'device',
    pluginId: 'omnimux-device',
    entryId: 'omnimux-device-entry',
    label: '手机管理',
    tabId: 'omnimux-device:library',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="1.5" width="8" height="13" rx="2"/><circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none"/></svg>',
    dividerAfter: true,
  },
  {
    id: 'analytics',
    pluginId: 'omnimux-analytics',
    entryId: 'omnimux-analytics-entry',
    label: '数据分析',
    tabId: 'omnimux-analytics:library',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 14h12"/><path d="M4 11l3-4 3 2 4-5"/></svg>',
  },
  {
    id: 'automation',
    pluginId: 'omnimux-automation',
    entryId: 'omnimux-automation-entry',
    label: '自动化',
    tabId: 'omnimux-automation:workbench',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
  },
  {
    id: 'forms',
    pluginId: 'omnimux-forms',
    entryId: 'omnimux-forms-entry',
    label: '任务表单',
    tabId: 'omnimux-forms:tasks',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M6 5.5h4M6 8h4M6 10.5h2.5"/></svg>',
  },
  {
    id: 'social-harvest',
    pluginId: 'omnimux-social-harvest',
    entryId: 'omnimux-social-harvest-entry',
    label: '社交采收',
    tabId: 'omnimux-social-harvest:library',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/></svg>',
  },
]

let exploreEntryElement = null
let exploreDocCleanup = null
let currentExploreAnchor = null

function createExploreIcon() {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><polygon points="10.8 5.2 8.8 8.8 5.2 10.8 7.2 7.2" fill="currentColor" stroke="none"/></svg>'
}

/**
 * 确保常驻「探索」行就位（Rank 3.9，在「项目」上方）。
 */
function ensureExploreRow() {
  if (ROWS.some((r) => r.id === 'omnimux-explore-entry')) return
  injectStyles(EXPLORE_STYLES, 'omnimux-sidebar-explore-styles')
  if (!exploreEntryElement) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.id = 'omnimux-explore-entry'
    btn.className = 'omnimux-sidebar-nav-entry omnimux-explore-entry'
    btn.dataset.omnimuxExploreEntry = ''
    btn.setAttribute('aria-label', '探索')
    btn.setAttribute('aria-haspopup', 'menu')
    btn.setAttribute('aria-expanded', 'false')
    btn.innerHTML = `<span class="omnimux-explore-entry-icon">${createExploreIcon()}</span><span class="omnimux-explore-entry-label">探索</span>`
    btn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleExploreMenu(btn)
    })
    exploreEntryElement = btn
  }
  ROWS.push({ id: 'omnimux-explore-entry', rank: 3.9, element: exploreEntryElement })
}

/**
 * 计算探索浮动菜单位置，带视口边界防溢出定位。
 * @param {HTMLElement} anchor
 * @param {{ innerWidth: number, innerHeight: number }} [viewport]
 * @returns {{ left: number, top: number }}
 */
export function computeExploreMenuPosition(anchor, viewport = typeof window !== 'undefined' ? window : undefined) {
  const rect = anchor?.getBoundingClientRect?.() ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  const vw = viewport?.innerWidth ?? 1280
  const vh = viewport?.innerHeight ?? 800
  const menuW = 180
  const menuH = 380
  const gap = 6

  let left = Math.round(rect.right + gap)
  let top = Math.round(rect.top)

  if (left + menuW > vw - 8) {
    left = Math.max(8, Math.round(rect.left - menuW - gap))
  }
  if (left < 8) left = 8

  if (top + menuH > vh - 8) {
    top = Math.max(8, vh - menuH - 8)
  }
  if (top < 8) top = 8

  return { left, top }
}

export function closeExploreMenu() {
  exploreDocCleanup?.()
  exploreDocCleanup = undefined
  if (currentExploreAnchor) {
    currentExploreAnchor.setAttribute('aria-expanded', 'false')
    delete currentExploreAnchor.dataset.active
    currentExploreAnchor = null
  }
  document.getElementById('omnimux-explore-menu')?.remove()
}

/**
 * 激活探索菜单项：
 * 1. 执行 item 特化 action（如有）；
 * 2. 委托调用收敛插件已注册的按钮 click 处理器（保持原有鉴权与逻辑）；
 * 3. 兜底通过 window.__omnimuxWorkbench.open 打开对应的 Workbench Tab；
 * 4. 关闭菜单。
 */
export function activateExploreItem(item) {
  closeExploreMenu()
  if (typeof item.action === 'function') {
    const handled = item.action(CONVERGED_ROWS)
    if (handled !== false) {
      return
    }
  }
  const registered = CONVERGED_ROWS.get(item.entryId)
    ?? CONVERGED_ROWS.get(item.pluginId)
    ?? (item.id === 'google-vids' ? CONVERGED_ROWS.get('omnimux-video-entry') : undefined)
  if (registered?.element && typeof registered.element.click === 'function') {
    registered.element.click()
    return
  }
  if (item.tabId && typeof window !== 'undefined' && window.__omnimuxWorkbench?.open) {
    window.__omnimuxWorkbench.open({ tabId: item.tabId, title: item.label })
  }
}

export function openExploreMenu(anchor) {
  if (!(anchor instanceof HTMLElement)) return false
  closeExploreMenu()
  currentExploreAnchor = anchor
  anchor.setAttribute('aria-expanded', 'true')
  anchor.dataset.active = 'true'

  const menu = document.createElement('div')
  menu.id = 'omnimux-explore-menu'
  menu.className = 'omnimux-explore-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', '探索')

  for (const item of EXPLORE_MENU_ITEMS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'omnimux-explore-menu-item'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.exploreId = item.id
    btn.setAttribute('aria-label', item.label)
    btn.innerHTML = `<span class="omnimux-explore-menu-item-icon">${item.iconSvg}</span><span class="omnimux-explore-menu-item-label">${item.label}</span>`
    btn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      activateExploreItem(item)
    })
    menu.append(btn)
    if (item.dividerAfter) {
      const divider = document.createElement('div')
      divider.className = 'omnimux-explore-menu-divider'
      divider.setAttribute('role', 'separator')
      menu.append(divider)
    }
  }

  document.body.append(menu)
  const { left, top } = computeExploreMenuPosition(anchor)
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`

  const onDoc = (event) => {
    if (menu.contains(event.target) || event.target === anchor || anchor.contains(event.target)) return
    closeExploreMenu()
  }
  const onKey = (event) => {
    if (event.key === 'Escape') closeExploreMenu()
  }

  document.addEventListener('mousedown', onDoc, true)
  document.addEventListener('keydown', onKey, true)
  exploreDocCleanup = () => {
    document.removeEventListener('mousedown', onDoc, true)
    document.removeEventListener('keydown', onKey, true)
  }
  return true
}

export function toggleExploreMenu(anchor) {
  if (document.getElementById('omnimux-explore-menu')) {
    closeExploreMenu()
    return false
  }
  return openExploreMenu(anchor)
}

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
  if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8)
  if (left < 8) left = 8
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
  ensureExploreRow()
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
 * 新建会话按钮 + inline 按钮。
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

      // kind:'inline' → 并排「新建会话」
      if (row.kind === 'inline') {
        if (row.styles) injectStyles(row.styles, row.styleId)
        const element = row.create()
        markAlphaEntry(id, element)
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

      // 排除技能专家 omnimux-market（在底部 footer，不在侧栏 extra rows 挂载）
      if (id === 'omnimux-market-entry' || id === 'omnimux-market-plaza' || id === 'omnimux-market') {
        return () => {
          seen.delete(id)
        }
      }

      // 收敛至探索菜单的插件：包含所有 Alpha 内测插件与垂直插件
      // 不再作为独立行渲染在侧边栏，收敛记录到 CONVERGED_ROWS 便于探索菜单委托激活
      if (isAlphaEntry(id)) {
        if (row.styles) injectStyles(row.styles, row.styleId)
        const element = row.create()
        markAlphaEntry(id, element)
        CONVERGED_ROWS.set(id, { id, row, element })
        return () => {
          CONVERGED_ROWS.delete(id)
          seen.delete(id)
          element.remove()
        }
      }

      if (isConvergedEntry(id)) {
        if (row.styles) injectStyles(row.styles, row.styleId)
        const element = row.create()
        markAlphaEntry(id, element)
        CONVERGED_ROWS.set(id, { id, row, element })
        return () => {
          CONVERGED_ROWS.delete(id)
          seen.delete(id)
          element.remove()
        }
      }

      // 核心常驻项（omnimux-workflow, omnimux-assets, omnimux-inspiration）及普通 below 行
      if (row.styles) injectStyles(row.styles, row.styleId)
      const element = row.create()
      markAlphaEntry(id, element)
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
  return install()
}

/** Test-only: node currently observed for extra-row placement. */
export function getSidebarObserverTargetForTests() {
  return observedRoot
}

export function getPlaceCountForTests() {
  return placeCount
}

export function getExploreEntryForTests() {
  return exploreEntryElement
}

export function getConvergedRowsForTests() {
  return CONVERGED_ROWS
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
  CONVERGED_ROWS.clear()
  seen.clear()
  closeNewMenu()
  closeExploreMenu()
  exploreEntryElement = null
  if (typeof window !== 'undefined') {
    try {
      delete window[SIDEBAR_GLOBAL_KEY]
    } catch {
      window[SIDEBAR_GLOBAL_KEY] = undefined
    }
  }
}
