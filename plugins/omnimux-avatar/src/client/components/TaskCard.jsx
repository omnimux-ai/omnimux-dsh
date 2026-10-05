// 画廊卡片：一张任务记录在网格/时间线里的全部形态（成品、排队、生成中、失败）。
//
// 来源：OmniMux/web/src/features/influencer/components/task-card.tsx（只读真源），行为 1:1。
//
// 与真源的差异（本仓硬门禁强制）：
// 1. 真源用 Tailwind 的 aspect-[9/16] / line-clamp-3 / inf-* 类；本仓改为 omx-avatar-* 类族，
//    只有画幅比例与进度条宽度这类逐条不同的值才内联（已标注 exempt-ui02）。
// 2. 文案改中文源串，英文原文由 locales.js 作为 en 词条承载。

import { useState } from 'react'

import { taskAspectRatio, taskImageUrl } from '../lib/history.js'
import { multiViewProgress, multiViewState } from '../lib/multiview.js'
import { MultiViewBadge } from './MultiViewBadge.jsx'

/**
 * 状态归一。
 *
 * 上游控制器拼 `SUCCESS` / `FAILURE`，适配层另有一套 `succeeded` / `failed`，
 * 两种拼法都要认；其余一律按生成中处理，不猜「未知即失败」。
 */
function statusOf(task) {
  const upper = String(task?.status ?? '').toUpperCase()
  const lower = String(task?.status ?? '').toLowerCase()
  if (upper === 'SUCCESS' || lower === 'succeeded') return 'done'
  if (upper === 'FAILURE' || lower === 'failed') return 'failed'
  if (upper === 'QUEUED' || upper === 'SUBMITTED' || upper === 'NOT_START') return 'queued'
  return 'generating'
}

/**
 * @param {{
 *   task: import('../lib/types.js').TaskRecord,
 *   viewMode?: import('../lib/types.js').InfluencerViewMode,
 *   child: import('../lib/types.js').TaskRecord | null,
 *   onView: (task: import('../lib/types.js').TaskRecord) => void,
 *   onRetry: (task: import('../lib/types.js').TaskRecord) => void,
 *   onOpenMultiView?: (parent: import('../lib/types.js').TaskRecord, child: import('../lib/types.js').TaskRecord) => void,
 *   t: (key: string) => string,
 * }} props
 */
export function TaskCard(props) {
  const { task, viewMode, child, onView, onRetry, onOpenMultiView, t } = props
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  const isGrid = viewMode === 'grid'
  const state = statusOf(task)
  const image = imageFailed ? null : taskImageUrl(task)
  // 只有拿到成品的卡片才是可点的：排队/失败卡片点了没有去处。
  const clickable = state === 'done' && Boolean(image)
  const progress = Number.parseInt(task?.progress ?? '0', 10) || 0
  const ratio = taskAspectRatio(task)
  const boardState = child ? multiViewState(child) : 'absent'

  const onActivate = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onView(task)
  }

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onView(task) : undefined}
      onKeyDown={clickable ? onActivate : undefined}
      className={clickable ? 'omx-avatar-card is-clickable' : 'omx-avatar-card'}
    >
      {/* 画幅框：网格里统一 9:16，时间线里按任务自带的生成尺寸预留。
          预留尺寸可避免图片到达时把下方画廊顶动；读不到尺寸的记录保持自然高度。 */}
      <div
        className='omx-avatar-card-frame'
        style={isGrid ? { aspectRatio: '9 / 16' } : ratio ? { aspectRatio: ratio } : undefined} /* exempt-ui02: 逐条不同的画幅比例 */
      >
        {state === 'done' ? (
          image ? (
            <img
              src={image}
              alt=''
              loading='lazy'
              decoding='async'
              className={imageLoaded ? 'omx-avatar-card-img is-loaded' : 'omx-avatar-card-img'}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          ) : (
            /* 取不到成品时占住同一个画幅框，而不是把卡片压成一条空白 */
            <div className='omx-avatar-card-empty'>{t('预览不可用')}</div>
          )
        ) : null}

        {state === 'queued' || state === 'generating' ? (
          <>
            <span className='omx-avatar-shimmer' aria-hidden='true' />
            <span className={state === 'queued'
              ? 'omx-avatar-status is-queued'
              : 'omx-avatar-status is-generating'}
            >
              {state === 'queued' ? t('排队中') : t('生成中')}
            </span>
            <div className='omx-avatar-progress'>
              {/* 没有真实百分比时宽度就是 0：宁可不显示，也不编一个数字出来 */}
              <i style={{ width: `${Math.min(progress, 100)}%` }} /* exempt-ui02: 宽度只能来自真实进度 */ />
            </div>
          </>
        ) : null}

        {state === 'failed' ? (
          <div className='omx-avatar-card-fail'>
            <p className='omx-avatar-fail'>{task?.fail_reason || t('生成失败')}</p>
            <button /* exempt-ui01: 失败卡片内的次级动作，外观由 omx-avatar-abtn 类独占 */
              type='button'
              className='omx-avatar-abtn'
              onClick={(event) => {
                event.stopPropagation()
                onRetry(task)
              }}
            >
              {t('重试')}
            </button>
          </div>
        ) : null}

        {/* 多视角缩略格：贴在主图内侧左下角，随派生任务状态变化 */}
        {child && boardState !== 'absent' && onOpenMultiView ? (
          <div className='omx-avatar-mv-slot'>
            <MultiViewBadge
              state={boardState}
              progress={multiViewProgress(child)}
              thumbnail={taskImageUrl(child)}
              onOpen={() => onOpenMultiView(task, child)}
              t={t}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
