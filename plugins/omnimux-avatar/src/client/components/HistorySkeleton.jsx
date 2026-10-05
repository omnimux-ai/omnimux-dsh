// 历史骨架：首屏还没有任何数据可画时的占位。
//
// 来源：OmniMux/web/src/features/influencer/components/history-skeleton.tsx（只读真源），行为 1:1。
//
// 9:16 是设定板的生成尺寸，占位块与成品卡占同样大小——数据到达时列表不跳动。
// 容器复用 FeedGrid 的两套类名（同一处定义），骨架与真实网格否则会在切换时跳列。

import { GRID_CLASSES, TIMELINE_CLASSES } from './FeedGrid.jsx'

/** 设定板画幅。 */
const CARD_RATIO = '9 / 16'

/**
 * @param {{
 *   count?: number,
 *   viewMode?: import('../lib/types.js').InfluencerViewMode,
 *   t: (key: string) => string,
 * }} props
 */
export function HistorySkeleton({ count = 3, viewMode, t }) {
  const isGrid = viewMode === 'grid'

  return (
    <div
      role='status'
      aria-label={t('正在加载历史…')}
      className={isGrid ? GRID_CLASSES : TIMELINE_CLASSES}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className='omx-avatar-card'
          style={{ aspectRatio: CARD_RATIO }} /* exempt-ui02: 9:16 占位画幅，与成品卡一致 */
        >
          <span className='omx-avatar-shimmer' aria-hidden='true' />
        </div>
      ))}
    </div>
  )
}
