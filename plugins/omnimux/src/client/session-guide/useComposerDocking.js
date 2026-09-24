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

/** 真正回到页面最顶部：滚动位置不超过这个值，才允许把输入框还原回原位（px）。已由动态 revealThreshold 升级感知，保留导出做兼容 fallback。 */
export const READ_TOP_MAX = 10

/** 已经滑离页面顶部：超过这个值必须吸底；与上面的阈值拉开成迟滞区，边界上不来回横跳（px）。已由动态 leaveThreshold 升级感知，保留导出做兼容 fallback。 */
export const DOCK_LEAVE_MAX = 20

/**
 * 动态测量顶部输入框槽位高度，并计算露头（reveal）与离开（leave）滚动阈值。
 *
 * 临界几何语义：
 * - revealThreshold: 顶部槽位底边缘刚好触及视口顶端（开始露头/进入视口）。
 *   当 scrollTop <= revealThreshold 时，输入框槽位已经进入视口可见范围，立即切换回 inline。
 * - leaveThreshold: 顶部输入框完全滚出视口顶部，并保留 20px 迟滞防抖安全区。
 *   当 scrollTop > leaveThreshold 时才判定为已离开顶部，触发吸底。
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
  if (scroller && typeof scroller.getBoundingClientRect === 'function' && typeof band.getBoundingClientRect === 'function') {
    if (scroller !== band.offsetParent) {
      const bandRect = band.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      if (Number.isFinite(bandRect?.top) && Number.isFinite(scrollerRect?.top)) {
        const relativeOffset = bandRect.top - scrollerRect.top + (Number(scroller.scrollTop) || 0)
        if (Number.isFinite(relativeOffset)) {
          offsetTop = Math.max(0, relativeOffset)
        }
      }
    }
  }

  const revealThreshold = Math.max(0, offsetTop + measuredHeight)
  const leaveThreshold = revealThreshold + 20
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
 * 取三者最大值——只要其中任何一个真的滚动过，用户就不在页面最顶部，
 * 输入框就该留在底部，而不是被一次空读数顶回页首。
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
 * 首页引导会话输入框吸底控制器 Hook
 *
 * 当用户在首页选用技能（点击「使用」）或复刻模板/爆款视频（点击「复刻」）时：
 * 1. 点击同一帧同步把停靠态写入真实界面（吸底先手），抢在附件挂载提醒等
 *    强制滚动定位之前——输入框已是视口底部 fixed 形态时，滚动定位天然失效；
 * 2. 原生输入框通过 FLIP 动画平滑固定停靠在视口底部；
 * 3. 原 Hero 槽位由占位高度（min-height）撑住，防止页面布局坍塌；
 * 4. 输入框右上方渲染收起气泡按钮（.omnimux-trending-undock），点击解除吸底；
 * 5. 滚动迟滞联动：向下浏览保持吸底，向上滑回最顶部（<=10px）自动切回原位；
 * 6. 再次点击同一张卡片触发反悔，解除吸底。
 */
export function useComposerDocking({ hostRef, onUndock } = {}) {
  const [dockedItem, setDockedItem] = useState(null)
  const [placement, setPlacement] = useState('inline')
  const dockHostRef = useRef(null)
  const pendingApplyRef = useRef(null)
  const savedScrollRef = useRef(null)
  const primedFlipRef = useRef(null)
  const pinnedRef = useRef(false)
  const thresholdsRef = useRef(null)

  const undock = useCallback(() => {
    setDockedItem(null)
    setPlacement('inline')
    pendingApplyRef.current = null
    savedScrollRef.current = null
    primedFlipRef.current = null
    pinnedRef.current = false
    onUndock?.()
  }, [onUndock])

  const dock = useCallback((item, onDocked) => {
    if (!item) return false
    // 再次点击同一张卡片：作为反悔动作解除吸底。整页选素材期间不走这条。
    if (!pinnedRef.current && dockedItem && isSameItem(dockedItem, item)) {
      undock()
      return false
    }
    const root = hostRef?.current?.closest?.('[data-omnimux-starter-host]') ||
      hostRef?.current?.closest?.('[data-phase]') ||
      hostRef?.current
    const scroller = root?.querySelector?.(SCROLLER_SELECTOR) || null
    // 记录用户触发点击当帧的绝对真实滚动位置（必须先于任何 DOM 变更）
    savedScrollRef.current = readPageScrollTop(scroller)
    pendingApplyRef.current = typeof onDocked === 'function' ? onDocked : null
    thresholdsRef.current = getComposerScrollThresholds(root, scroller)

    // 吸底先手：同一帧同步写入停靠 DOM，不等渲染周期。
    // 附件挂载提醒的 scrollIntoView 等强制滚动定位晚于本帧执行时，
    // 输入框已是视口底部 fixed 形态，滚动定位落在它身上即天然失效（元素已在视口内）。
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

      // FLIP 反向补偿：输入框物理上已 fixed 到底部，视觉上先钉在原位，
      // 渲染周期到达后由布局效果释放过渡，平滑滑到底部。
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

  // 1. 吸底几何适配、占位高度防塌陷与 FLIP 位移动画
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
    // 整页选素材铺满后，会话列尺寸会变。那一拍如果还没读到宿主，
    // 不能把已经贴底的输入框清掉，否则它会回到上半截被整页盖住。
    if (!root.isConnected && pinnedRef.current) return undefined
    dockHostRef.current = root
    const scroller = root.querySelector?.(SCROLLER_SELECTOR) || null
    thresholdsRef.current = getComposerScrollThresholds(root, scroller)

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
      const currentScroller = root.querySelector?.(SCROLLER_SELECTOR) || null
      thresholdsRef.current = getComposerScrollThresholds(root, currentScroller)
    }

    const from = card?.getBoundingClientRect?.()
    const fromBand = band?.getBoundingClientRect?.()

    const shouldDock = Boolean(dockedItem && (placement === 'docked' || pinnedRef.current))
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

        // 注入后再次核验锁定，彻底消除外部 setDraft/focus 触发的意外滚顶
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

    // 吸底先手的 FLIP 释放：dock() 同帧已做反向补偿把输入框视觉钉在原位，
    // 此处排程播放过渡，让它平滑滑入底部停靠位。
    let primedAnimCancel = null
    if (primedFlipRef.current) {
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
    }

    let cancelAnim = null
    if (currentlyDocked !== shouldDock && card && from && from.width > 0 && from.height > 0) {
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

    if (!dockedItem) {
      return () => {
        primedAnimCancel?.()
        cancelAnim?.()
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

  // 2. 页面滚动迟滞判定：槽位露头立即切回原位，完全滑离顶部后恢复吸底
  useEffect(() => {
    if (!dockedItem) return undefined
    const root = dockHostRef.current
    const scroller = root?.querySelector?.(SCROLLER_SELECTOR) || null
    let frame = 0
    const initialThresholds = thresholdsRef.current || getComposerScrollThresholds(root, scroller)
    thresholdsRef.current = initialThresholds
    let leftTop = readPageScrollTop(scroller) > initialThresholds.leaveThreshold

    const evaluate = () => {
      frame = 0
      const scrollTop = readPageScrollTop(scroller)
      const { revealThreshold, leaveThreshold } = thresholdsRef.current || initialThresholds
      if (scrollTop > leaveThreshold) leftTop = true
      setPlacement((prev) => {
        if (pinnedRef.current) return 'docked'
        if (scrollTop <= revealThreshold && leftTop) return 'inline'
        if (scrollTop > leaveThreshold) return 'docked'
        return prev
      })
    }

    const onScroll = () => {
      if (frame) return
      frame = scheduleFrame(evaluate)
    }

    const onResize = () => {
      thresholdsRef.current = getComposerScrollThresholds(root, scroller)
      if (frame) return
      frame = scheduleFrame(evaluate)
    }

    const targets = [scroller, window].filter(Boolean)
    for (const target of targets) target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      if (frame) cancelFrame(frame)
      for (const target of targets) target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [dockedItem])

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
    isDocked: Boolean(dockedItem && placement === 'docked'),
  }
}
