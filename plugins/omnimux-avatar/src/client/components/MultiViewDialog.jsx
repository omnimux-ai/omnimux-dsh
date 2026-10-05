// 多视角弹窗：放大看派生设定板，并在同一处重新生成 / 删除 / 下载。
//
// 来源：OmniMux/web/src/features/influencer/components/multi-view-dialog.tsx（只读真源），行为 1:1。
//
// 与真源的差异（本仓硬门禁强制）：
// 1. 真源依赖 @/components/dialog 与 ui/button；插件客户端只允许依赖 react，
//    模态外壳复用 PresetPreviewDialog 导出的 DialogFrame（Escape / 遮罩 / 焦点陷阱同一份实现）。
// 2. 下载链接再校验一次绝对 URL：相对地址只在本浏览器会话里有效，交给别人必然取不到图。
// 3. 文案改中文源串，英文原文由 locales.js 作为 en 词条承载。

import { taskAbsoluteImageUrl, taskImageUrl } from '../lib/history.js'
import { multiViewProgress, multiViewState } from '../lib/multiview.js'
import { DialogFrame } from './PresetPreviewDialog.jsx'

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   task: import('../lib/types.js').TaskRecord | null,
 *   regenerating: boolean,
 *   onRegenerate: () => void,
 *   onDelete: () => void,
 *   t: (key: string) => string,
 * }} props
 */
export function MultiViewDialog(props) {
  const { open, onOpenChange, task, regenerating, onRegenerate, onDelete, t } = props

  if (!open) return null

  const state = multiViewState(task)
  const preview = task ? taskImageUrl(task) : null
  const absolute = task ? taskAbsoluteImageUrl(task) : null
  // 绝对地址才配当下载目标；相对地址只是本会话可用的展示地址。
  const download = absolute && /^https?:\/\//i.test(absolute) ? absolute : null

  return (
    <DialogFrame
      title={t('多视角')}
      onClose={() => onOpenChange(false)}
      t={t}
      footer={
        <div className='omx-avatar-mv-actions'>
          <div className='omx-avatar-mv-actions-left'>
            <button /* exempt-ui01: 次级动作，外观由 omx-avatar-abtn 类独占 */
              type='button'
              className='omx-avatar-abtn'
              disabled={regenerating}
              onClick={onRegenerate}
            >
              {t('重新生成')}
            </button>
            <button /* exempt-ui01: 破坏性动作，外观由 omx-avatar-abtn 类独占 */
              type='button'
              className='omx-avatar-abtn is-danger'
              onClick={onDelete}
            >
              {t('删除')}
            </button>
          </div>

          {download ? (
            <a
              className='omx-avatar-abtn'
              href={download}
              download
              target='_blank'
              rel='noreferrer'
            >
              {t('下载')}
            </a>
          ) : null}
        </div>
      }
    >
      {state === 'ready' && preview ? (
        <img src={preview} alt={t('多视角')} className='omx-avatar-mv-image' />
      ) : null}

      {state === 'generating' ? (
        <div className='omx-avatar-mv-panel'>
          <span className='omx-avatar-shimmer' aria-hidden='true' />
          <span className='omx-avatar-status is-generating'>{t('生成中')}</span>
          <div className='omx-avatar-progress'>
            <i style={{ width: `${multiViewProgress(task)}%` }} /* exempt-ui02: 宽度只能来自真实进度 */ />
          </div>
        </div>
      ) : null}

      {state === 'failed' ? (
        <div className='omx-avatar-mv-panel'>
          <p className='omx-avatar-fail'>{task?.fail_reason || t('生成失败')}</p>
        </div>
      ) : null}

      {state === 'absent' ? (
        <div className='omx-avatar-mv-empty'>{t('这里还没有内容')}</div>
      ) : null}
    </DialogFrame>
  )
}
