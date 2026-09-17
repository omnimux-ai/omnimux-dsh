/**
 * 瀑布流容器：按列数把卡片分进纵向列。
 *
 * 列数仍写在 data-columns 上（沿用列数收敛的契约），样式表把容器做成横向 flex，
 * 每一列再纵向堆卡片。骨架与真实网格共用这一套，否则数据到达时列数会跳。
 */
import { useMemo } from 'react'
import { coverRatioOf, distributeColumns } from './masonry.js'

/**
 * @param {{
 *   gridRef?: (node: HTMLElement | null) => void,
 *   columns: number,
 *   items: any[],
 *   getRatio?: (item: any) => number,
 *   renderItem: (item: any, index: number) => any,
 *   className?: string,
 *   [key: string]: any,
 * }} props
 */
export function MasonryGrid(props) {
  const {
    gridRef,
    columns,
    items,
    getRatio = coverRatioOf,
    renderItem,
    className = 'omnimux-assets-grid',
    ...rest
  } = props
  const buckets = useMemo(
    () => distributeColumns(items, columns, getRatio),
    [items, columns, getRatio],
  )
  return (
    <div ref={gridRef} className={className} data-columns={columns} {...rest}>
      {buckets.map((column, index) => (
        <div className="omnimux-assets-masonry-col" key={index} data-col={index}>
          {column.map(renderItem)}
        </div>
      ))}
    </div>
  )
}
