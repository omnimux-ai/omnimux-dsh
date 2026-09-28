import { useCallback, useEffect, useRef, useState } from 'react'
import { columnsForWidth } from './masonry-layout.js'

/**
 * 响应式监听网格容器宽度并动态计算列数
 *
 * 核心设计：
 * 1. 回调 ref 模式：兼容骨架屏与真实内容节点切换时的重新挂载，避免 observer 失效；
 * 2. 宿主安全：无 ResizeObserver（Node 测试/服务端）环境下优雅降级至默认列数；
 * 3. 浅比较更新：仅当计算列数与前值不一致时触发 React 重新渲染。
 *
 * @param {object} [options]
 * @param {number} [options.defaultColumns=3]
 * @param {number} [options.minColWidth=180]
 * @param {number} [options.maxCols=6]
 * @param {number} [options.minCols=2]
 * @param {number} [options.gap=16]
 * @returns {[(node: HTMLElement | null) => void, number]}
 */
export function useFlowColumns(options = {}) {
  const { defaultColumns = 3 } = options
  const [columns, setColumns] = useState(defaultColumns)
  const observerRef = useRef(/** @type {ResizeObserver | null} */ (null))

  const containerRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (!node || typeof ResizeObserver !== 'function') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0
      if (width > 0) {
        const next = columnsForWidth(width, options)
        setColumns((prev) => (prev === next ? prev : next))
      }
    })

    observer.observe(node)
    observerRef.current = observer
  }, [options])

  useEffect(() => () => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
  }, [])

  return [containerRef, columns]
}
