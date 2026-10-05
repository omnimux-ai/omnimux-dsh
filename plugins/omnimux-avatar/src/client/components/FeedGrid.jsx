// 历史画廊：网格 / 时间线两种浏览方式，含首屏骨架、空态与分页尾部。
//
// 来源：OmniMux/web/src/features/influencer/components/feed-grid.tsx（只读真源），行为 1:1。
//
// 与真源的差异（本仓硬门禁强制）：
// 1. 真源的网格类里有 `md:grid-cols-2`，在 md 断点反而比 sm 少一列——这是缺陷不是特性，
//    这里去掉该断点，让列数随视口单调递增。
// 2. 真源用 cn() 合并类名；插件端不需要该工具，直接三元拼接。
// 3. 文案改中文源串，英文原文由 locales.js 作为 en 词条承载。

import { useEffect, useMemo, useRef } from 'react'

import { taskKey } from '../lib/multiview.js'
import { HistorySkeleton } from './HistorySkeleton.jsx'
import { TaskCard } from './TaskCard.jsx'

/** 下一页在折叠线下方多远开始预取。 */
export const LOAD_MORE_MARGIN = '240px 0px'

/**
 * 网格类名。源工作台用 Tailwind 工具类（`grid w-full grid-cols-2 gap-3.5 py-4 sm:grid-cols-3
 * md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`），但本插件不带 Tailwind，
 * 那些字符串在本仓是**惰性**的（历史画廊会塌成一列）。这里改用插件自己的类，列数规则由
 * styles.js 的 `.omx-avatar-feed-grid` 承担，断点语义与源一致；并保留源里 `md` 断点比
 * `sm` 少列的缺陷修正（md 不得回退到 2 列）。
 */
export const GRID_CLASSES = 'omx-avatar-feed-grid'

/** 时间线类名：窄栏单列，卡片各自收缩到自己的画幅（列宽上限由 CSS 承担）。 */
export const TIMELINE_CLASSES = 'omx-avatar-feed-timeline'

/**
 * 任务在界面里的稳定标识。
 *
 * 画廊层的 `taskKey` 认上游控制器的 snake_case（`task_id` / `id`），而本插件自己的
 * 服务端回的是 camelCase 的 `taskId`；两种拼法先补齐再取键，避免不同任务并成同一个键。
 * 三种编号都没有时返回空串：无法标识的记录不参与去重，也不做兜底合并。
 *
 * @param {import('../lib/types.js').TaskRecord|null|undefined} task
 * @returns {string}
 */
export function taskIdentity(task) {
  if (!task) return ''
  if (task.task_id || task.id) return taskKey(task)
  if (task.taskId === undefined || task.taskId === null || task.taskId === '') return ''
  return taskKey({ ...task, task_id: String(task.taskId) })
}

/** 有唯一编号才参与去重；连编号都没有的记录按原样保留，不做兜底合并。 */
function dedupeKey(task) {
  const key = taskIdentity(task)
  return key === '' ? null : key
}

/**
 * @param {{
 *   tasks: import('../lib/types.js').TaskRecord[],
 *   pending: import('../lib/types.js').TaskRecord | null,
 *   viewMode?: import('../lib/types.js').InfluencerViewMode,
 *   childByParent?: Map<string, import('../lib/types.js').TaskRecord>,
 *   isInitialLoading: boolean,
 *   hasMore: boolean,
 *   isFetchingMore: boolean,
 *   loadMoreFailed: boolean,
 *   onLoadMore: () => void,
 *   onView: (task: import('../lib/types.js').TaskRecord) => void,
 *   onRetry: (task: import('../lib/types.js').TaskRecord) => void,
 *   onSync?: (task: import('../lib/types.js').TaskRecord) => void,
 *   syncingKey?: string,
 *   onOpenMultiView?: (parent: import('../lib/types.js').TaskRecord, child: import('../lib/types.js').TaskRecord) => void,
 *   t: (key: string) => string,
 * }} props
 */
export function FeedGrid(props) {
  const {
    tasks,
    pending,
    viewMode,
    childByParent,
    isInitialLoading,
    hasMore,
    isFetchingMore,
    loadMoreFailed,
    onLoadMore,
    onView,
    onRetry,
    onSync,
    syncingKey,
    onOpenMultiView,
    t,
  } = props

  const sentinelRef = useRef(null)
  const isGrid = viewMode === 'grid'

  // 严格按任务唯一编号去重；刚提交的 pending 永远排在最前，它还没进历史列表。
  const items = useMemo(() => {
    const list = []
    const seen = new Set()
    if (pending) {
      const key = dedupeKey(pending)
      if (key) seen.add(key)
      list.push(pending)
    }
    for (const task of Array.isArray(tasks) ? tasks : []) {
      const key = dedupeKey(task)
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      list.push(task)
    }
    return list
  }, [pending, tasks])

  // 没有 IntersectionObserver 的环境（宿主内嵌渲染、老浏览器）退回手动「加载更多」。
  const canAutoLoad =
    typeof IntersectionObserver !== 'undefined' && typeof window !== 'undefined'

  useEffect(() => {
    if (!hasMore || !canAutoLoad) return undefined
    const node = sentinelRef.current
    if (!node) return undefined
    // 每次进入视口只触发一次：连续回调会在同一页上叠出多个重复请求。
    let armed = true
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            armed = true
            continue
          }
          if (!armed) continue
          armed = false
          onLoadMore()
        }
      },
      { rootMargin: LOAD_MORE_MARGIN }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [canAutoLoad, hasMore, onLoadMore])

  if (!items.length && isInitialLoading) {
    return <HistorySkeleton viewMode={viewMode} t={t} />
  }

  if (!items.length) {
    return (
      <div className='omx-avatar-empty'>
        <p className='omx-avatar-empty-title'>{t('这里还没有内容')}</p>
        <p className='omx-avatar-empty-desc'>{t('在左侧选好设定后点生成，或点随机来一个形象')}</p>
      </div>
    )
  }

  return (
    <div className={isGrid ? GRID_CLASSES : TIMELINE_CLASSES}>
      {items.map((task) => (
        <TaskCard
          key={taskIdentity(task)}
          task={task}
          viewMode={viewMode}
          child={childByParent?.get(taskKey(task)) ?? null}
          syncing={Boolean(syncingKey) && syncingKey === taskIdentity(task)}
          onView={onView}
          onRetry={onRetry}
          onSync={onSync}
          onOpenMultiView={onOpenMultiView}
          t={t}
        />
      ))}

      {/* 分页尾部：网格模式下横跨所有列 */}
      <div className='omx-avatar-feed-foot'>
        {hasMore ? <div ref={sentinelRef} className='omx-avatar-feed-sentinel' aria-hidden='true' /> : null}

        {isFetchingMore ? (
          <div role='status' aria-label={t('正在加载更多…')} className='omx-avatar-feed-more'>
            <span className='omx-avatar-shimmer' aria-hidden='true' />
          </div>
        ) : null}

        {loadMoreFailed ? (
          <button /* exempt-ui01: 分页失败重试，外观由 omx-avatar-abtn 类独占 */
            type='button'
            className='omx-avatar-abtn'
            onClick={onLoadMore}
          >
            {t('加载历史失败')}
          </button>
        ) : null}

        {/* 没有 IntersectionObserver 的环境同样要有继续往下看的路 */}
        {hasMore && !canAutoLoad && !isFetchingMore ? (
          <button /* exempt-ui01: 手动分页，外观由 omx-avatar-abtn 类独占 */
            type='button'
            className='omx-avatar-abtn'
            onClick={onLoadMore}
          >
            {t('加载更多')}
          </button>
        ) : null}

        {!hasMore ? <div className='omx-avatar-feed-end'>{t('没有更多记录了')}</div> : null}
      </div>
    </div>
  )
}
