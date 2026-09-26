import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { measureInlineComposerDemand, releaseInlineComposerGeometry } from '../composer-compact.js'

/**
 * 精准探测当前会话工作台（栏目页面）的视口几何范围。
 * 突破 closest 无法跨越兄弟节点的局限，支持侧边栏折叠/展开与多栏响应式。
 *
 * @param {Element | null} card 输入框卡片元素
 * @param {Element | null} band 输入框原位槽位宿主
 * @returns {{ left: number, width: number, right: number } | null}
 */
export function resolveConversationColumn(card, band) {
  const doc = card?.ownerDocument || band?.ownerDocument || (typeof document !== 'undefined' ? document : null)
  const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null)
  if (!doc || !win) return null

  // 当前关联宿主上下文（card / band 所在的主机或工作区根节点）
  const contextHost = card?.closest?.('[data-omnimux-starter-host], [data-phase]') ||
    band?.closest?.('[data-omnimux-starter-host], [data-phase]') || null

  const isContextMatch = (el) => {
    if (!el) return false
    if (card && (el === card || el.contains?.(card) || card.contains?.(el))) return true
    if (band && (el === band || el.contains?.(band) || band.contains?.(el))) return true
    if (contextHost && (el === contextHost || el.contains?.(contextHost) || contextHost.contains?.(el))) return true
    return false
  }

  // Level 1: 优先探测权威的会话工作台主容器
  // 覆盖原生会话表面、会话滚动容器、宿主内置滚动体以及三栏架构下的中间列 centerCol
  const surfaceSelectors = [
    '.dshDesktopConversationSurface',
    '[data-conversation-scroll]',
    '[class*="centerCol"]',
    '.dshDesktopFrame > [class*="conversation"]',
    '[data-omnimux-starter-host] [class*="scrollBody"]',
    '[class*="scrollBody"]',
  ]

  const seen = new Set()
  const candidates = []

  for (const selector of surfaceSelectors) {
    const elements = doc.querySelectorAll?.(selector) || []
    for (const el of elements) {
      if (!el || seen.has(el)) continue
      seen.add(el)
      const rect = el.getBoundingClientRect?.()
      // 必须具有真实渲染尺寸，过滤掉 width <= 0 或 height === 0 的隐藏/脱落候选节点
      const isZeroDimension = !rect || rect.width <= 0 || rect.height === 0
      if (!isZeroDimension) {
        candidates.push({
          el,
          rect,
          matchesContext: isContextMatch(el),
        })
      }
    }
  }

  // 优先选择包含当前 card / band / host 上下文的活动会话区域；若无包含则回退至首个具有布局的真实可见候选节点
  const bestCandidate = candidates.find((c) => c.matchesContext) || candidates[0]
  if (bestCandidate) {
    const { rect } = bestCandidate
    return {
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      right: Math.round(rect.right ?? (rect.left + rect.width)),
    }
  }

  // Level 2: 侧边栏宽度推导兜底（当容器正在重绘或选择器未命中时）
  let sidebarWidth = 0
  const isLeftCollapsed = Boolean(
    doc.documentElement?.hasAttribute?.('data-omnimux-left-collapsed') ||
    doc.body?.hasAttribute?.('data-omnimux-left-collapsed') ||
    doc.documentElement?.getAttribute?.('data-sidebar-collapsed') === 'true' ||
    doc.body?.getAttribute?.('data-sidebar-collapsed') === 'true'
  )

  if (!isLeftCollapsed && win.getComputedStyle) {
    const rootStyle = win.getComputedStyle(doc.documentElement)
    const parsedWidth = parseFloat(rootStyle.getPropertyValue?.('--omnimux-sidebar-width'))
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) {
      sidebarWidth = parsedWidth
    } else {
      // 检查真实侧边栏元素尺寸，过滤隐藏或无布局侧边栏
      const sidebars = doc.querySelectorAll?.('.dshDesktopSidebar, [data-sidebar], aside') || []
      const visibleSidebar = Array.from(sidebars).find((el) => {
        const r = el?.getBoundingClientRect?.()
        return r && r.width > 0 && r.height > 0 && r.left >= 0
      })
      const sideRect = visibleSidebar?.getBoundingClientRect?.()
      if (sideRect && sideRect.width > 0 && sideRect.left >= 0) {
        sidebarWidth = sideRect.width
      } else {
        // 桌面端默认侧边栏展开宽度 280px
        sidebarWidth = 280
      }
    }
  }

  const winWidth = win.innerWidth || doc.documentElement?.clientWidth || 0
  if (winWidth > 0) {
    const colLeft = Math.max(0, Math.round(sidebarWidth))
    const colWidth = Math.max(0, Math.round(winWidth - colLeft))
    return {
      left: colLeft,
      width: colWidth,
      right: colLeft + colWidth,
    }
  }

  // Level 3: 最终安全退化保底
  const fallbackRect = band?.getBoundingClientRect?.() || card?.getBoundingClientRect?.()
  if (fallbackRect && fallbackRect.width > 0 && fallbackRect.height > 0) {
    const colLeft = Math.max(0, Math.round(fallbackRect.left))
    const colWidth = Math.max(0, Math.round(fallbackRect.width))
    return {
      left: colLeft,
      width: colWidth,
      right: colLeft + colWidth,
    }
  }

  return null
}

/**
 * 计算吸底输入框的宽度与水平居中坐标。
 * 契约：严格以「会话栏目页面」内部水平居中，并对齐原生 952px 上限（方案 A）。
 */
export function dockGeometry(card, band) {
  // 1. 获取会话工作台栏目页面的真实几何范围
  const column = resolveConversationColumn(card, band)
  if (!column || column.width <= 0) return null

  // 2. 栏目内部可用宽度计算（两侧各预留 12px 呼吸缓冲）
  const available = Math.max(0, column.width - 24)
  if (!available) return null

  // 3. 读取原生配置的卡片最大宽度（优先读 computedStyle CSS 变量，兜底 DOCK_MAX_WIDTH = 952px）
  let nativeMaxWidth = DOCK_MAX_WIDTH
  const win = card?.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null)
  if (win?.getComputedStyle && card) {
    const rootStyle = win.getComputedStyle(card)
    const parsedMax = parseFloat(rootStyle.getPropertyValue?.('--dsh-composer-card-max-width'))
    if (Number.isFinite(parsedMax) && parsedMax > 0) {
      nativeMaxWidth = parsedMax
    }
  }

  // 4. 方案 A 核心计算：宽度上限完全对齐原生 nativeMaxWidth，自适应 available
  const demandWidth = measureInlineComposerDemand(card)
  const baseTargetWidth = Math.min(available, nativeMaxWidth)
  const width = Math.min(available, Math.max(baseTargetWidth, demandWidth))

  // 5. 【核心纠偏公式】：在栏目页面内部绝对居中！
  // 栏目真实左边界 + (栏目总空间 - 输入框宽度) / 2
  const left = column.left + (column.width - width) / 2

  return {
    width: Math.round(width),
    left: Math.round(left),
  }
}

/** 宿主上标记「原生输入框已停靠到会话视口底部」。 */
export const DOCK_OPEN_ATTR = 'data-omnimux-dock-open'

/** 停靠后输入框距会话视口底边的距离（px）。 */
export const DOCK_BOTTOM = 20

/** 原生输入框在 Hero 中的舒适打字宽度，与宿主 `[data-composer-card]` 的 952px 原生上限一致。 */
export const DOCK_MAX_WIDTH = 952

/** 承载 Hero 的滚动容器；页面「有没有滑到最顶部」以此为准。 */
export const SCROLLER_SELECTOR = '[class*="scrollBody"]'

/** 真正回到页面最顶部 fallback 阈值（px）。 */
export const READ_TOP_MAX = 10

/** 已经滑离页面顶部 fallback 阈值（px）。 */
export const DOCK_LEAVE_MAX = 20

/**
 * 动态测量顶部输入框槽位高度，并计算露头（reveal）与离开（leave）滚动阈值。
 *
 * 几何语义：
 * - revealThreshold: 顶部槽位底边缘开始露入视口。
 *   当 scrollTop <= revealThreshold 时，顶部输入框槽位已经进入视口可见范围，立即切换回 inline。
 * - leaveThreshold: 顶部输入框完全滚出视口顶部，并包含 30px 安全迟滞死区。
 *   当 scrollTop > leaveThreshold 时才判定为离开顶部不可见，触发吸底。
 *
 * @param {Element | null} root 宿主根容器
 * @param {Element | null} scroller 滚动容器
 * @returns {{ revealThreshold: number, leaveThreshold: number, measuredHeight: number, offsetTop: number }}
 */
export function getComposerScrollThresholds(root, scroller) {
  const card = root?.querySelector?.('[data-composer-card]') || null
  if (!card) {
    return { revealThreshold: READ_TOP_MAX, leaveThreshold: DOCK_LEAVE_MAX, measuredHeight: 0, offsetTop: 0 }
  }
  const band = card.parentElement || card
  const cardHeight = card.getBoundingClientRect?.().height || 0
  const bandHeight = band.getBoundingClientRect?.().height || 0
  const styleMinHeight = parseFloat(band.style?.minHeight || '0') || 0
  const measuredHeight = Math.max(bandHeight, cardHeight, styleMinHeight) || 160

  let offsetTop = Number(band.offsetTop ?? 0)
  const offsetParent = band.offsetParent
  if (
    scroller
    && offsetParent
    && scroller !== offsetParent
    && typeof scroller.getBoundingClientRect === 'function'
    && typeof band.getBoundingClientRect === 'function'
  ) {
    const bandRect = band.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    if (Number.isFinite(bandRect?.top) && Number.isFinite(scrollerRect?.top)) {
      const relativeOffset = bandRect.top - scrollerRect.top + (Number(scroller.scrollTop) || 0)
      if (Number.isFinite(relativeOffset)) offsetTop = Math.max(0, relativeOffset)
    }
  }

  const revealThreshold = Math.max(0, offsetTop + measuredHeight)
  const leaveThreshold = revealThreshold + 30
  return { revealThreshold, leaveThreshold, measuredHeight, offsetTop }
}

export const ICON_CHEVRON_DOWN = React.createElement(
  'svg',
  {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  },
  React.createElement('path', { d: 'm6 9 6 6 6-6' })
)

/** rAF 在无布局环境（JSDOM / SSR）可能不存在，退化成宏任务即可。 */
export const scheduleFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (fn) => setTimeout(fn, 0)
export const cancelFrame = typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame
  : (id) => clearTimeout(id)

/**
 * 读取页面真实的滚动位置：宿主用 `scrollBody` 容器滚动，整页滚动则是 window / documentElement。
 * 取三者最大值——只要其中任何一个真的滚动过，用户就不在页面最顶部。
 *
 * @param {Element | null} scroller 滚动容器（可能不存在）
 * @returns {number} 已滚动的像素数；无布局信息时为 0
 */
export function readPageScrollTop(scroller) {
  const scrollerTop = Number(scroller?.scrollTop)
  const windowTop = Number(window?.scrollY ?? window?.pageYOffset)
  const documentTop = Number(document?.documentElement?.scrollTop)
  return [scrollerTop, windowTop, documentTop]
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0)
}

function isSameItem(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const aId = a.id || a.skill || a.slug || a.template?.id || a.item?.id || a.item?.skill
  const bId = b.id || b.skill || b.slug || b.template?.id || b.item?.id || b.item?.skill
  if (aId && bId && aId === bId) return true
  return false
}

/**
 * 首页会话输入框吸底定位控制器 Hook
 *
 * 核心业务契约：
 * 1. 默认在顶部（Inline）：页面初始或处于顶部可见范围时在原生 Hero 处；
 * 2. 向下滚动自动迁移到底部（Docked）：顶部输入框完全滚出视口（不可见）时自动吸底；
 * 3. 向上滚动自动归位到顶部（Inline）：顶部原位重新进入视口（可见）时自动归还原位；
 * 4. 功能按钮触发一键吸底：点击使用、复刻、对标或快捷入口，输入框在底部就位并聚焦；
 * 5. 零抖动保障：滚动触发切态绝不执行 380ms 物理位移动画，原位恒定占位，切断几何死循环。
 */
export function useComposerDocking({ hostRef, onUndock } = {}) {
  const [dockedItem, setDockedItem] = useState(null)
  const [placement, setPlacement] = useState('inline')
  const dockHostRef = useRef(null)
  const pendingApplyRef = useRef(null)
  const savedScrollRef = useRef(null)
  const primedFlipRef = useRef(null)
  const pinnedRef = useRef(false)
  const isScrollTransitionRef = useRef(false)
  const isIntentDrivenRef = useRef(false)
  const isCollapsedRef = useRef(false)
  const isJumpingRef = useRef(false)
  const jumpingTimerRef = useRef(null)

  const undock = useCallback(() => {
    if (jumpingTimerRef.current) clearTimeout(jumpingTimerRef.current)
    setDockedItem(null)
    setPlacement('inline')
    pendingApplyRef.current = null
    savedScrollRef.current = null
    primedFlipRef.current = null
    pinnedRef.current = false
    isScrollTransitionRef.current = false
    isIntentDrivenRef.current = false
    isCollapsedRef.current = true
    isJumpingRef.current = false
    onUndock?.()
  }, [onUndock])

  const dock = useCallback((item, onDockedOrOptions) => {
    if (!item) return false
    const options = typeof onDockedOrOptions === 'object' && onDockedOrOptions !== null ? onDockedOrOptions : {}
    const onDocked = typeof onDockedOrOptions === 'function' ? onDockedOrOptions : options.onDocked
    const force = options.force === true

    isIntentDrivenRef.current = true
    isCollapsedRef.current = false
    // 再次点击同一张卡片：作为反悔动作解除吸底（强制吸底时不执行反悔）
    if (!pinnedRef.current && !force && dockedItem && isSameItem(dockedItem, item)) {
      undock()
      return false
    }
    isScrollTransitionRef.current = false

    const root = hostRef?.current?.closest?.('[data-omnimux-starter-host]') ||
      hostRef?.current?.closest?.('[data-phase]') ||
      hostRef?.current
    const scroller = root?.querySelector?.(SCROLLER_SELECTOR) || null
    const currentScrollTop = readPageScrollTop(scroller)
    savedScrollRef.current = currentScrollTop

    const { revealThreshold, leaveThreshold } = getComposerScrollThresholds(root, scroller)
    // 顶部优先原则：当前顶部输入框可见且未显式指定 force 时才留在顶部原位
    const isTopVisible = !force && currentScrollTop <= revealThreshold && !pinnedRef.current

    if (isTopVisible) {
      setPlacement('inline')
      setDockedItem(item)

      if (root) {
        root.removeAttribute(DOCK_OPEN_ATTR)
        const band = root.querySelector?.('[data-composer-card]')?.parentElement || root
        if (band) band.style.minHeight = ''
        const card = root.querySelector?.('[data-composer-card]')
        if (card) {
          card.style.transform = ''
          card.style.transition = ''
          card.style.opacity = ''
        }
      }

      if (typeof onDocked === 'function') {
        onDocked()
      }
      return true
    }

    pendingApplyRef.current = typeof onDocked === 'function' ? onDocked : null

    // 只有当顶部输入框已滚出视口不可见时，才在底部固定停靠
    if (root) {
      const card = root.querySelector?.('[data-composer-card]')
      const band = card?.parentElement || root
      const from = card?.getBoundingClientRect?.()
      const fromBand = band?.getBoundingClientRect?.()
      releaseInlineComposerGeometry(card)
      const geometry = dockGeometry(card, band)
      if (geometry) {
        const { width, left } = geometry
        root.style.setProperty('--omnimux-dock-left', `${Math.round(left)}px`)
        root.style.setProperty('--omnimux-dock-width', `${Math.round(width)}px`)
        root.style.setProperty('--omnimux-dock-bottom', `${DOCK_BOTTOM}px`)
      }
      const reserved = Math.round(fromBand?.height || from?.height || 0)
      if (band && reserved > 0) band.style.minHeight = `${reserved}px`
      root.setAttribute(DOCK_OPEN_ATTR, '')

      // 仅在主动按钮点击时准备 FLIP 视觉过渡补偿
      if (card && from && from.width > 0 && from.height > 0) {
        const to = card.getBoundingClientRect?.()
        if (to && to.width > 0 && to.height > 0) {
          const dx = Math.round(from.left - to.left)
          const dy = Math.round(from.top - to.top)
          if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
            card.style.transition = 'none'
            card.style.transform = `translate(${dx}px, ${dy}px)`
            card.style.opacity = '0.92'
            primedFlipRef.current = card
          }
        }
      }
    }

    setPlacement('docked')
    setDockedItem(item)
    return true
  }, [dockedItem, undock, hostRef])

  const pin = useCallback((item) => {
    const previous = pinnedRef.current
    pinnedRef.current = true
    const ok = dock(item)
    if (!ok) pinnedRef.current = previous
    return ok
  }, [dock])

  // 1. 吸底几何适配、占位高度防塌陷与过渡处理
  useLayoutEffect(() => {
    const root = hostRef?.current?.closest?.('[data-omnimux-starter-host]') ||
      hostRef?.current?.closest?.('[data-phase]') ||
      hostRef?.current
    if (!root) {
      if (pendingApplyRef.current) {
        const applyFn = pendingApplyRef.current
        pendingApplyRef.current = null
        applyFn()
      }
      return undefined
    }
    if (!root.isConnected && pinnedRef.current) return undefined
    dockHostRef.current = root

    const card = root.querySelector?.('[data-composer-card]')
    const band = card?.parentElement || root

    const writeGeometry = () => {
      releaseInlineComposerGeometry(card)
      const geometry = dockGeometry(card, band)
      if (!geometry) return
      const { width, left } = geometry
      root.style.setProperty('--omnimux-dock-left', `${Math.round(left)}px`)
      root.style.setProperty('--omnimux-dock-width', `${Math.round(width)}px`)
      root.style.setProperty('--omnimux-dock-bottom', `${DOCK_BOTTOM}px`)
      const height = card?.getBoundingClientRect?.().height
      if (height) root.style.setProperty('--omnimux-dock-card-height', `${Math.round(height)}px`)
    }

    const from = card?.getBoundingClientRect?.()
    const fromBand = band?.getBoundingClientRect?.()

    // 核心状态：若状态为 docked 或全屏 pin
    const shouldDock = Boolean((dockedItem && placement === 'docked') || placement === 'docked' || pinnedRef.current)
    const currentlyDocked = root.hasAttribute(DOCK_OPEN_ATTR)

    if (shouldDock) {
      writeGeometry()
      const reserved = Math.round(fromBand?.height || from?.height || 0)
      if (band && reserved > 0) band.style.minHeight = `${reserved}px`
      root.setAttribute(DOCK_OPEN_ATTR, '')

      // 视口滚动条防抽动保护：仅在主动点击交付那一帧防抖，交付后立即清空，绝不干扰后续自然滚动
      const scroller = root.querySelector?.(SCROLLER_SELECTOR) || null
      if (pendingApplyRef.current) {
        const targetScroll = savedScrollRef.current
        const applyFn = pendingApplyRef.current
        pendingApplyRef.current = null
        savedScrollRef.current = null

        if (targetScroll != null) {
          const currentScroll = readPageScrollTop(scroller)
          if (Math.abs(currentScroll - targetScroll) > 0.5) {
            if (scroller) scroller.scrollTop = targetScroll
            if (typeof window !== 'undefined' && (window.scrollY || window.pageYOffset)) {
              window.scrollTo(window.scrollX || 0, targetScroll)
            }
          }
        }

        applyFn()

        // 注入后再次核验锁定，消除外部 setDraft/focus 触发的意外抽动
        if (targetScroll != null) {
          const currentAfter = readPageScrollTop(scroller)
          if (Math.abs(currentAfter - targetScroll) > 0.5) {
            if (scroller) scroller.scrollTop = targetScroll
            if (typeof window !== 'undefined' && (window.scrollY || window.pageYOffset)) {
              window.scrollTo(window.scrollX || 0, targetScroll)
            }
          }
        }
      } else {
        // 自然滚动触发的吸底，绝不篡改用户的滚动条位置！
        savedScrollRef.current = null
      }
    } else {
      if (band) band.style.minHeight = ''
      root.removeAttribute(DOCK_OPEN_ATTR)
    }

    // FLIP 释放：仅在按钮点击的主动吸底时执行动画，滚动过程中绝不执行全屏位移！
    let primedAnimCancel = null
    if (primedFlipRef.current && !isScrollTransitionRef.current) {
      const primedCard = primedFlipRef.current
      primedFlipRef.current = null
      const raf = scheduleFrame(() => {
        primedCard.style.transition = 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms ease-out'
        primedCard.style.transform = ''
        primedCard.style.opacity = ''
      })
      const timer = setTimeout(() => {
        primedCard.style.transition = ''
        primedCard.style.transform = ''
        primedCard.style.opacity = ''
      }, 420)
      primedAnimCancel = () => {
        cancelFrame(raf)
        clearTimeout(timer)
        primedCard.style.transition = ''
        primedCard.style.transform = ''
        primedCard.style.opacity = ''
      }
    } else if (primedFlipRef.current) {
      const primedCard = primedFlipRef.current
      primedFlipRef.current = null
      primedCard.style.transition = ''
      primedCard.style.transform = ''
      primedCard.style.opacity = ''
    }

    let cancelAnim = null
    if (!isScrollTransitionRef.current && currentlyDocked !== shouldDock && card && from && from.width > 0 && from.height > 0) {
      const to = card.getBoundingClientRect?.()
      if (to && to.width > 0 && to.height > 0) {
        const dx = Math.round(from.left - to.left)
        const dy = Math.round(from.top - to.top)
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
          card.style.transition = 'none'
          card.style.transform = `translate(${dx}px, ${dy}px)`
          card.style.opacity = '0.92'
          const raf = scheduleFrame(() => {
            card.style.transition = 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms ease-out'
            card.style.transform = ''
            card.style.opacity = ''
          })
          const timer = setTimeout(() => {
            if (card) {
              card.style.transition = ''
              card.style.transform = ''
              card.style.opacity = ''
            }
          }, 420)
          cancelAnim = () => {
            cancelFrame(raf)
            clearTimeout(timer)
            if (card) {
              card.style.transition = ''
              card.style.transform = ''
              card.style.opacity = ''
            }
          }
        }
      }
    }

    const observer = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(writeGeometry)
      : null
    observer?.observe(root)
    if (card) observer?.observe(card)
    const toolbar = card?.querySelector?.(':scope > [class*="row"]:has(> [class*="tools"])')
    const contentObserver = typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(writeGeometry) : null
    if (toolbar) contentObserver?.observe(toolbar, { childList: true, characterData: true, subtree: true })

    const doc = root.ownerDocument || document
    const collapseObserver = typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(writeGeometry) : null
    if (doc?.documentElement) {
      collapseObserver?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-omnimux-left-collapsed', 'data-sidebar-collapsed'] })
    }
    if (doc?.body) {
      collapseObserver?.observe(doc.body, { attributes: true, attributeFilter: ['data-omnimux-left-collapsed', 'data-sidebar-collapsed'] })
    }

    const onTransitionEnd = (event) => {
      const prop = event?.propertyName
      const isGeometryProperty = (
        prop === 'width' ||
        prop === 'transform' ||
        prop === 'max-width' ||
        prop === 'min-width' ||
        prop === 'left' ||
        prop === 'right' ||
        prop === 'flex-basis'
      )
      const transitionTarget = event?.target
      const isSidebarOrHostTarget = Boolean(
        transitionTarget?.closest?.('.dshDesktopSidebar, [data-sidebar], aside, [class*="sidebar"]')
      )
      const isNode = Boolean(transitionTarget && typeof transitionTarget.nodeType === 'number')
      const relatedTransitionTarget = Boolean(
        isSidebarOrHostTarget ||
        transitionTarget?.closest?.('.dshDesktopFrame, [data-omnimux-starter-host]') ||
        (isNode && root.contains?.(transitionTarget))
      )
      if (relatedTransitionTarget && (isGeometryProperty || isSidebarOrHostTarget)) {
        writeGeometry()
      }
    }

    window.addEventListener('resize', writeGeometry)
    window.addEventListener('transitionend', onTransitionEnd)
    return () => {
      primedAnimCancel?.()
      cancelAnim?.()
      observer?.disconnect()
      contentObserver?.disconnect()
      collapseObserver?.disconnect()
      window.removeEventListener('resize', writeGeometry)
      window.removeEventListener('transitionend', onTransitionEnd)
    }
  }, [dockedItem, placement, hostRef])

  // 2. 页面滚动判定：顶部输入框不可见时自动迁移到底部，重新可见时归位到顶部
  useEffect(() => {
    const root = dockHostRef.current || hostRef?.current?.closest?.('[data-omnimux-starter-host]') || hostRef?.current
    if (!root) return undefined
    const scroller = root?.querySelector?.(SCROLLER_SELECTOR) || null
    let frame = 0
    const initialThresholds = getComposerScrollThresholds(root, scroller)
    let leftTop = readPageScrollTop(scroller) > initialThresholds.leaveThreshold

    const evaluate = () => {
      frame = 0
      if (pinnedRef.current || isJumpingRef.current) return

      const { revealThreshold, leaveThreshold } = getComposerScrollThresholds(root, scroller)
      const scrollTop = readPageScrollTop(scroller)

      // 处于主动收起态 (COLLAPSED)：上下滚动严格静默，唯有滑回到最顶部时才自然复位
      if (isCollapsedRef.current) {
        if (scrollTop <= revealThreshold) {
          isCollapsedRef.current = false
          leftTop = false
          setPlacement('inline')
        }
        return
      }

      // 未显式触发输入框（纯向下滚动浏览）：
      // 绝对不自动吸底！保持 inline 随页面自然滚出视口，底部保持纯净开阔
      if (!isIntentDrivenRef.current) {
        if (scrollTop <= revealThreshold) {
          leftTop = false
          setPlacement('inline')
        }
        return
      }

      if (scrollTop > leaveThreshold) leftTop = true

      setPlacement((prev) => {
        // 向上滚动至顶部原位露头可见（<= revealThreshold），且此前确实曾滑离过顶部 → 归还原位
        if (scrollTop <= revealThreshold && leftTop) {
          isScrollTransitionRef.current = true
          leftTop = false
          isIntentDrivenRef.current = false
          return 'inline'
        }
        // 向下滚动完全滑离顶部不可见（> leaveThreshold）且存在显式意图 → 自动吸底
        if (scrollTop > leaveThreshold) {
          isScrollTransitionRef.current = true
          return 'docked'
        }
        // 迟滞保护区（revealThreshold 与 leaveThreshold 之间）：维持上一状态，绝不横跳
        return prev
      })
    }

    const onDockIntent = (event) => {
      const item = event?.detail?.item || { id: 'jump_dock_active' }
      const force = event?.detail?.force !== false
      isIntentDrivenRef.current = true
      isCollapsedRef.current = false
      isJumpingRef.current = true
      dock(item, { force })
      if (jumpingTimerRef.current) clearTimeout(jumpingTimerRef.current)
      jumpingTimerRef.current = setTimeout(() => {
        isJumpingRef.current = false
        jumpingTimerRef.current = null
      }, 150)
    }

    const onScroll = () => {
      if (frame) return
      frame = scheduleFrame(evaluate)
    }

    const onResize = () => {
      if (frame) return
      frame = scheduleFrame(evaluate)
    }

    const targets = [scroller, window].filter(Boolean)
    for (const target of targets) target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('omnimux:composer:dock-intent', onDockIntent)
    return () => {
      if (frame) cancelFrame(frame)
      if (jumpingTimerRef.current) clearTimeout(jumpingTimerRef.current)
      for (const target of targets) target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('omnimux:composer:dock-intent', onDockIntent)
    }
  }, [hostRef, dockedItem])

  // 3. 卸载或会话切换时清理宿主样式与标记
  useEffect(() => () => {
    const root = dockHostRef.current
    if (!root) return
    root.removeAttribute(DOCK_OPEN_ATTR)
    root.style.removeProperty('--omnimux-dock-left')
    root.style.removeProperty('--omnimux-dock-width')
    root.style.removeProperty('--omnimux-dock-bottom')
    root.style.removeProperty('--omnimux-dock-card-height')
    const band = root.querySelector?.('[data-composer-card]')?.parentElement
    if (band) band.style.minHeight = ''
    const card = root.querySelector?.('[data-composer-card]')
    if (card) {
      card.style.transform = ''
      card.style.transition = ''
      card.style.opacity = ''
    }
  }, [])

  return {
    dockedItem,
    placement,
    dock,
    pin,
    undock,
    isDocked: Boolean((dockedItem && placement === 'docked') || placement === 'docked' || pinnedRef.current),
  }
}
