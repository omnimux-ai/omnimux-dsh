// 多视角徽标：贴在主图内侧左下角的 1:1 方格，承载派生设定板自身的状态。
//
// 来源：OmniMux/web/src/features/influencer/components/multi-view-badge.tsx（只读真源），行为 1:1。
//
// 与真源的差异（本仓硬门禁强制）：
// 1. 真源用 `!` 字符充当失败图标；本仓禁止字符图标，改为内联矢量 SVG。
// 2. 无真实百分比时不显示数字（真源会显示 0%），只留状态词，避免假进度。
// 3. 文案改中文源串，英文原文由 locales.js 作为 en 词条承载。

import { useState } from 'react'

/** 各状态的可访问名，同时作为 title。 */
const LABELS = {
  ready: '查看多视角',
  failed: '多视角生成失败',
  generating: '正在生成多视角设定板…',
}

/** 失败图标：矢量警示三角，不是 `!` 字符。 */
function AlertIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='20'
      height='20'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M12 4.5l8.5 15h-17z' />
      <path d='M12 10.5v4' />
      <path d='M12 17.4v.1' />
    </svg>
  )
}

/**
 * @param {{
 *   state: import('../lib/multiview.js').MultiViewState,
 *   progress: number,
 *   thumbnail: string | null,
 *   onOpen: () => void,
 *   t: (key: string) => string,
 * }} props
 */
export function MultiViewBadge(props) {
  const { state, progress, thumbnail, onOpen, t } = props
  const [loaded, setLoaded] = useState(false)

  if (state === 'absent') return null

  const label = t(LABELS[state])
  // 只有真的拿到百分比才显示数字：0 视为「未知」，否则会造出一个假的进度。
  const hasRealProgress = typeof progress === 'number' && Number.isFinite(progress) && progress > 0

  return (
    <button /* exempt-ui01: 卡片内浮层徽标按钮，外观由 omx-avatar-mv-tile 类族独占 */
      type='button'
      aria-label={label}
      title={label}
      className={`omx-avatar-mv-tile omx-avatar-mv-tile--${state}`}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      {state === 'ready' && thumbnail ? (
        <img
          src={thumbnail}
          alt=''
          loading='lazy'
          decoding='async'
          className={loaded ? 'omx-avatar-card-img is-loaded' : 'omx-avatar-card-img'}
          onLoad={() => setLoaded(true)}
        />
      ) : null}

      {state === 'generating' ? (
        <>
          <span
            className='omx-avatar-mv-ring'
            style={{ '--avatar-mv-progress': `${hasRealProgress ? progress : 0}%` }}
            aria-hidden='true'
          />
          <span className='omx-avatar-mv-pct'>
            {hasRealProgress ? `${progress}%` : t('生成中')}
          </span>
        </>
      ) : null}

      {state === 'failed' ? (
        <span className='omx-avatar-mv-fail'>
          <AlertIcon />
        </span>
      ) : null}
    </button>
  )
}
