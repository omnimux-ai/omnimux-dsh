// 多选上传批次里的一张「进行中」卡片：一个文件一张，状态只落在卡片自身。
//
// 来源：OmniMux/web/src/features/influencer/components/pending-upload-card.tsx（只读真源）。
//
// 与真源的差异（本仓硬门禁强制）：
// 1. 真源用 lucide-react 图标与 inf-* 类；本仓改为内联矢量 SVG 与 omx-avatar-* 类族，
//    不新增图标依赖，也不复制源素材。
// 2. 真源只有 waiting / uploading / error 三态（批次里没有「已完成」卡片，完成后即换成
//    素材瓦片）；本仓的批次由调用方按发起顺序渲染，完成后仍留在原位，因此多了 done 态。
// 3. 状态文案由 locales.js 承载；卡片不猜状态，也不在面板顶部重复一遍。
//
// 诚实性约束：进度条宽度只来自调用方给的真实百分比。没有真实数字时不画进度条，
// 也不编一个百分比出来（与 TaskCard 同一口径）。

import { Button } from '../kit.js'

/** 归一：真源与调用方都可能给 waiting，排队与上传中对用户是同一件事。 */
function stateOf(status) {
  if (status === 'error') return 'error'
  if (status === 'done') return 'done'
  return 'uploading'
}

/**
 * 上传中：转圈矢量图标。
 * @returns {import('react').ReactElement}
 */
function UploadingIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='16'
      height='16'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      aria-hidden='true'
    >
      <path d='M12 4a8 8 0 1 0 8 8' />
    </svg>
  )
}

/**
 * 已完成：对勾矢量图标，不是 ✓ 字符。
 * @returns {import('react').ReactElement}
 */
function DoneIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='16'
      height='16'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <path d='M5 12.5l4.5 4.5L19 7' />
    </svg>
  )
}

/**
 * 上传失败：警示三角矢量图标。
 * @returns {import('react').ReactElement}
 */
function FailIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='16'
      height='16'
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
 *   fileName: string,
 *   status?: 'uploading'|'waiting'|'done'|'error',
 *   previewUrl?: string,
 *   progress?: number,
 *   errorText?: string,
 *   busy?: boolean,
 *   onRetry?: () => void,
 *   onDismiss?: () => void,
 *   t: (key: string) => string,
 * }} props
 */
export function PendingUploadCard(props) {
  const { fileName, previewUrl, progress, errorText, busy, onRetry, onDismiss, t } = props
  const state = stateOf(props.status)
  // 真实百分比才画进度条：非数字一律当作「没有进度」。
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null
  const name = typeof fileName === 'string' && fileName ? fileName : ''

  return (
    <article className='omx-avatar-pending'>
      <div
        className='omx-avatar-pending-frame'
        data-state={state}
        role='group'
        aria-label={name}
        aria-busy={state === 'uploading'}
      >
        {previewUrl ? (
          <img className='omx-avatar-pending-preview' src={previewUrl} alt='' aria-hidden='true' />
        ) : null}
        <span className='omx-avatar-pending-scrim' aria-hidden='true' />

        <span className='omx-avatar-pending-body'>
          {state === 'error' ? <FailIcon /> : null}
          {state === 'done' ? <DoneIcon /> : null}
          {state === 'uploading' ? <UploadingIcon /> : null}
          <span className='omx-avatar-pending-state'>
            {state === 'error'
              ? t('上传失败')
              : state === 'done'
                ? t('已完成')
                : t('上传中')}
          </span>
          {name ? <span className='omx-avatar-pending-name' title={name}>{name}</span> : null}
          {state === 'error' && errorText ? (
            <span className='omx-avatar-pending-name' title={errorText}>{errorText}</span>
          ) : null}
        </span>

        {state === 'error' ? (
          <span className='omx-avatar-pending-actions'>
            {onRetry ? (
              <Button
                size='xs'
                variant='secondary'
                disabled={Boolean(busy)}
                aria-label={`${t('重试上传')}：${name}`}
                onClick={onRetry}
              >
                {t('重试上传')}
              </Button>
            ) : null}
            {onDismiss ? (
              <Button
                size='xs'
                variant='ghost'
                disabled={Boolean(busy)}
                aria-label={`${t('删除')}：${name}`}
                onClick={onDismiss}
              >
                {t('删除')}
              </Button>
            ) : null}
          </span>
        ) : null}

        {state === 'uploading' && pct !== null ? (
          <span className='omx-avatar-pending-progress'>
            <i style={{ width: `${pct}%` }} /* exempt-ui02: 宽度只能来自真实进度 */ />
          </span>
        ) : null}
      </div>
    </article>
  )
}
