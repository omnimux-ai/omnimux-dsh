import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { measureInlineComposerDemand, releaseInlineComposerGeometry } from '../composer-compact.js'

function dockGeometry(card, band) {
  const rect = band?.getBoundingClientRect?.()
  if (!rect || rect.width <= 0) return null
  const column = card?.closest?.('[data-conversation-scroll], [class*="centerCol"]')?.getBoundingClientRect?.() || rect
  const leftEdge = Math.max(rect.left + 12, column.left)
  const rightEdge = Math.min(rect.left + rect.width - 12, column.right ?? column.left + column.width)
  const available = Math.max(0, rightEdge - leftEdge)
  if (!available) return null
  const width = Math.min(available, Math.max(DOCK_MAX_WIDTH, measureInlineComposerDemand(card)))
  return { width, left: leftEdge + (available - width) / 2 }
}

/** 宿主上标记「原生输入框已停靠到会话视口底部」。 */
export const DOCK_OPEN_ATTR = 'data-omnimux-dock-open'

/** 停靠后输入框距会话视口底边的距离（px）。 */
export const DOCK_BOTTOM = 20

/** 原生输入框在 Hero 中的舒适打字宽度，与宿主 `[data-composer-card]` 的 780px 上限一致。 */
export const DOCK_MAX_WIDTH = 780

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
  const band = card?.parentElement || root || null
  const cardHeight = card?.getBoundingClientRect?.().height || 0
  const bandHeight = band?.getBoundingClientRect?.().height || 0
  const styleMinHeight = parseFloat(band?.style?.minHeight || '0') || 0
  const measuredHeight = Math.max(bandHeight, cardHeight, styleMinHeight) || 160
  const offsetTop = Number(band?.offsetTop ?? 0)
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

  const undock = useCallback(() => {
    setDockedItem(null)
    setPlacement('inline')
    pendingApplyRef.current = null
    savedScrollRef.current = null
    primedFlipRef.current = null
    pinnedRef.current = false
    isScrollTransitionRef.current = false
    onUndock?.()
  }, [onUndock])

  const dock = useCallback((item, onDocked) => {
    if (!item) return false
    // 再次点击同一张卡片：作为反悔动作解除吸底
    if (!pinnedRef.current && dockedItem && isSameItem(dockedItem, item)) {
      undock()
      return false
    }
    isScrollTransitionRef.current = false

    const root = hostRef?.current?.closest?.('[data-omnimux-starter-host]') ||
      hostRef?.current?.closest?.('[data-phase]') ||
      hostRef?.current
    const scroller = root?.querySelector?.(SCROLLER_SELECTOR) || null
    // 记录用户触发点击当帧的绝对真实滚动位置
    savedScrollRef.current = readPageScrollTop(scroller)
    pendingApplyRef.current = typeof onDocked === 'function' ? onDocked : null

    // 吸底先手：同一帧同步写入停靠 DOM，抢在外部滚动定位之前
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

      // 视口滚动条锁定：防止脱离文档流瞬间视口发生位移
      const scroller = root.querySelector?.(SCROLLER_SELECTOR) || null
      if (savedScrollRef.current != null) {
        const currentScroll = readPageScrollTop(scroller)
        if (Math.abs(currentScroll - savedScrollRef.current) > 0.5) {
          if (scroller) scroller.scrollTop = savedScrollRef.current
          if (typeof window !== 'undefined' && (window.scrollY || window.pageYOffset)) {
            window.scrollTo(window.scrollX || 0, savedScrollRef.current)
          }
        }
      }

      // 意图延迟交付：输入框物理上已经在底部 fixed 就位后，才执行草稿注入与聚焦
      if (pendingApplyRef.current) {
        const applyFn = pendingApplyRef.current
        pendingApplyRef.current = null
        applyFn()

        // 注入后再次核验锁定，消除外部 setDraft/focus 触发的意外滚顶
        if (savedScrollRef.current != null) {
          const currentAfter = readPageScrollTop(scroller)
          if (Math.abs(currentAfter - savedScrollRef.current) > 0.5) {
            if (scroller) scroller.scrollTop = savedScrollRef.current
            if (typeof window !== 'undefined' && (window.scrollY || window.pageYOffset)) {
              window.scrollTo(window.scrollX || 0, savedScrollRef.current)
            }
          }
        }
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
    window.addEventListener('resize', writeGeometry)
    return () => {
      primedAnimCancel?.()
      cancelAnim?.()
      observer?.disconnect()
      contentObserver?.disconnect()
      window.removeEventListener('resize', writeGeometry)
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
      if (pinnedRef.current) return

      const { revealThreshold, leaveThreshold } = getComposerScrollThresholds(root, scroller)
      const scrollTop = readPageScrollTop(scroller)

      if (scrollTop > leaveThreshold) leftTop = true

      setPlacement((prev) => {
        // 向上滚动至顶部原位露头可见（<= revealThreshold），且此前确实曾滑离过顶部 → 归还原位
        if (scrollTop <= revealThreshold && leftTop) {
          isScrollTransitionRef.current = true
          leftTop = false
          return 'inline'
        }
        // 向下滚动完全滑离顶部不可见（> leaveThreshold）→ 自动吸底
        if (scrollTop > leaveThreshold) {
          isScrollTransitionRef.current = true
          return 'docked'
        }
        // 迟滞保护区（revealThreshold 与 leaveThreshold 之间）：维持上一状态，绝不横跳
        return prev
      })
    }

    const onScroll = () => {
      if (frame) return
      frame = scheduleFrame(evaluate)
    }

    const targets = [scroller, window].filter(Boolean)
    for (const target of targets) target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelFrame(frame)
      for (const target of targets) target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
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
