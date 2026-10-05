/**
 * 账号监控 v2.1 瀑布流容器（spec §9.3 / V1–V7）。
 *
 * 结构铁律（本票最容易错的地方）：
 *   - 单一扁平列表 + 绝对定位。卡片按「放置前底边最高的列（最短列；等高取
 *     最左）」逐张落位，位置全部来自 `rival-masonry.js` 的 `rivalPlacements`。
 *   - DOM 顺序永远等于传入排序顺序（V4：Tab 与读屏顺序 = 排名）——绝不能
 *     像资产层那样「每列一个 flex 容器」按列渲染，那会让 DOM 变成列优先。
 *   - 明确不用 CSS `columns` / `column-count` / `grid-auto-flow: dense`。
 *
 * 列宽测量：宽度是列数（breakpoint）与列宽（等分）的共同输入，共享的
 * `useFlowColumns` 只回列数不回宽，因此这里用同一套回调 ref + ResizeObserver
 * 自测宽度；列数仍走 `rivalColumnsForWidth`（共享核心的公式，不断点硬编码）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RivalPostCard } from './RivalPostCard.jsx'
import {
  RIVAL_GAP,
  RIVAL_MIN_CARD_HEIGHT,
  RIVAL_MIN_COLS,
  rivalColumnsForWidth,
  rivalPlacements,
} from './rival-masonry.js'

/** Width measured below this is treated as "container not visible yet". */
const WIDTH_FLOOR = 200

/**
 * Measured width of the masonry container. `ResizeObserver` is optional — a
 * host without it (jsdom, SSR) keeps the prop/default width forever, which is
 * exactly what the render tests rely on.
 * @param {number | undefined} fixedWidth
 * @returns {[(node: HTMLElement | null) => void, number]}
 */
function useMeasuredWidth(fixedWidth) {
  const [width, setWidth] = useState(() => (Number(fixedWidth) > 0 ? Number(fixedWidth) : 0))
  const observerRef = useRef(null)

  const ref = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!node) return
    const initial = node.clientWidth
    if (initial > 0) setWidth(initial)
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width ?? 0
      if (next > 0) setWidth(next)
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

  return [ref, width]
}

/**
 * @param {{
 *   cards: Array<Record<string, any>>,
 *   t: (key: string) => string,
 *   onDetail?: (card: Record<string, any>) => void,
 *   onReplicate?: (card: Record<string, any>) => void,
 *   onDeconstruct?: (card: Record<string, any>) => void,
 *   onMarkDone?: (card: Record<string, any>) => void,
 *   busyId?: string | null,
 *   containerWidth?: number,
 * }} props
 */
export function RivalMasonry(props) {
  const {
    cards, t, onDetail, onReplicate, onDeconstruct, onMarkDone, busyId,
    containerWidth,
  } = props

  const [ref, measured] = useMeasuredWidth(containerWidth)
  const width = Number(containerWidth) > 0 ? Number(containerWidth) : measured

  const layout = useMemo(() => {
    const list = Array.isArray(cards) ? cards : []
    if (!width || width < WIDTH_FLOOR || list.length === 0) {
      return { columns: RIVAL_MIN_COLS, columnWidth: 0, placements: new Map(), height: 0 }
    }
    const columns = rivalColumnsForWidth(width)
    const columnWidth = (width - RIVAL_GAP * (columns - 1)) / columns
    const { placements, height } = rivalPlacements(list, columns, columnWidth)
    return { columns, columnWidth, placements, height }
  }, [cards, width])

  const list = Array.isArray(cards) ? cards : []

  return (
    <div
      ref={ref}
      className="omnimux-rival-masonry"
      data-rival-grid="true"
      data-columns={layout.columns}
      data-col-width={layout.columnWidth ? Math.round(layout.columnWidth * 100) / 100 : undefined}
      style={{ '--rival-feed-height': `${Math.max(0, layout.height)}px` }}
    >
      {list.map((card) => {
        const key = String(card?.id ?? '')
        const placement = layout.placements.get(key) || { col: 0, top: 0, height: RIVAL_MIN_CARD_HEIGHT }
        const style = {
          '--rival-card-left': `${placement.col * (layout.columnWidth + RIVAL_GAP)}px`,
          '--rival-card-top': `${placement.top}px`,
          '--rival-card-w': `${layout.columnWidth}px`,
        }
        return (
          <RivalPostCard
            key={key}
            card={card}
            t={t}
            column={placement.col}
            busy={busyId === key}
            onDetail={onDetail}
            onReplicate={onReplicate}
            onDeconstruct={onDeconstruct}
            onMarkDone={onMarkDone}
            style={style}
          />
        )
      })}
    </div>
  )
}
