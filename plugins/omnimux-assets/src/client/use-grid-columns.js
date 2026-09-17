/**
 * 网格容器宽度 → 列数。
 *
 * 列数写在容器的 `data-columns` 属性上，瀑布流按该值生成子列，
 * 而不是写进内联样式：UI02 硬门禁禁止内联样式，属性同样精确，且让列数在
 * DOM 上可断言——浏览器验证可以直接读属性，不必解析计算后的样式。
 *
 * 用回调 ref 而不是 `useRef` + `useEffect`：网格容器会随状态在「骨架网格」与
 * 「真实网格」之间切换，是同一个组件的两个不同节点。回调 ref 在节点换人时重新
 * 触发，观察器因此跟着换；只跑一次的 effect 会盯着已经卸载的旧节点，列数从此冻结。
 *
 * 非浏览器环境（Node 单测、宿主渲染）没有 `ResizeObserver`，直接返回默认值，不抛错。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { GRID_MAX_COLUMNS, gridColumnsFor } from './grid-columns.js'

/**
 * @returns {[(node: HTMLElement | null) => void, number]} 网格容器 ref 与当前列数
 */
export function useGridColumns() {
  const [columns, setColumns] = useState(GRID_MAX_COLUMNS)
  const observerRef = useRef(/** @type {ResizeObserver | null} */ (null))

  const ref = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!node || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0
      const next = gridColumnsFor(width)
      setColumns((prev) => (prev === next ? prev : next))
    })
    observer.observe(node)
    observerRef.current = observer
  }, [])

  useEffect(() => () => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
  }, [])

  return [ref, columns]
}
