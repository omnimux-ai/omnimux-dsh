// 任务预览窗：成品媒体 + 生成设定 + 只读的分镜拆解。
//
// 来源：OmniMux/web/src/features/influencer/components/history-preview-dialog.tsx
// 与 lib/history.ts（只读真源）。
//
// 与真源的关键差异（本仓硬边界）：
// 1. 真源曾用 sessionStorage 缓存一份拆解再在预览里重放；本仓不设缓存，只读任务记录里
//    已经落库的 `input.recreate`。预览打开时**不发任何分析请求**，也不重跑拆解。
// 2. 拆解只读：没有重跑拆解的按钮、没有可编辑提示词、也没有说明「能不能复用」的行。
//    拿不到拆解就不渲染这一块，而不是提示用户再分析一次。
// 3. 文案改中文源串，英文原文由 locales.js 作为 en 词条承载。

import { useRef } from 'react'
import { Button } from '../kit.js'
import { taskImageUrl, taskKind } from '../lib/history.js'
import { DialogFrame } from './PresetPreviewDialog.jsx'
import { RecoverableMedia } from './RecoverableMedia.jsx'

/**
 * 读取任务记录里已落库的分镜拆解。
 *
 * 只读、纯函数、绝不触发分析。落库位置以服务端 `motion.submit` 的 input 快照为准：
 * `input.recreate = { prompt, durationSec, shots, hook, analysisJson }`；
 * 另外兼容「有人把 recreate 提到顶层」的写法，两条路径都认。
 *
 * @param {import('../lib/types.js').TaskRecord} task
 * @returns {{ shots: object[], hook: string, durationSec: number|null }|null}
 *   没有拆解时返回 null，调用方据此不渲染这一块。
 */
export function readTaskRecreate(task) {
  let input = task?.input
  if (!input && typeof task?.properties?.input === 'string') {
    try {
      input = JSON.parse(task.properties.input)
    } catch {
      input = null
    }
  }
  if (!input || typeof input !== 'object') return null
  const source = input.recreate ?? input
  const shots = Array.isArray(source?.shots) ? source.shots : []
  // 分镜为空即视为「没有拆解」：占位文案比空列表诚实。
  if (!shots.length) return null
  const duration = Number(source?.durationSec ?? input.duration)
  return {
    shots,
    hook: typeof source?.hook === 'string' ? source.hook : '',
    durationSec: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
  }
}

/** 秒数取一位小数，避免 2.4000000000000004 这类浮点噪声。 */
function seconds(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.round(number * 10) / 10
}

/**
 * 只读分镜列表：每条只显示记录里真实存在的字段，缺字段就不显示那一段。
 *
 * @param {{ shots: object[], hook: string, durationSec: number|null, t: (key: string) => string }} props
 */
function ShotBreakdown({ shots, hook, durationSec, t }) {
  return (
    <section className='omx-avatar-shots' aria-label={t('分镜拆解')}>
      <header className='omx-avatar-shots-head'>
        <h3 className='omx-avatar-shots-title'>{t('分镜拆解')}</h3>
        {durationSec !== null ? (
          <span className='omx-avatar-shots-meta'>
            {t('共 {{n}} 个镜头', { n: shots.length })} · {durationSec}s
          </span>
        ) : (
          <span className='omx-avatar-shots-meta'>{t('共 {{n}} 个镜头', { n: shots.length })}</span>
        )}
      </header>
      {hook ? <p className='omx-avatar-shots-hook'>{hook}</p> : null}
      <ol className='omx-avatar-shot-list'>
        {shots.map((shot, index) => {
          const start = seconds(shot?.start_s)
          const end = seconds(shot?.end_s)
          const id = typeof shot?.shot_id === 'string' && shot.shot_id ? shot.shot_id : `#${index + 1}`
          const size = typeof shot?.shot_size === 'string' ? shot.shot_size : ''
          const job = typeof shot?.narrative_job === 'string' ? shot.narrative_job : ''
          const timing = start !== null && end !== null ? `${start}s–${end}s` : null
          return (
            <li key={`${id}-${index}`} className='omx-avatar-shot'>
              <span className='omx-avatar-shot-id'>{id}</span>
              {timing ? <span className='omx-avatar-shot-time'>{timing}</span> : null}
              {size ? <span className='omx-avatar-shot-tag'>{size}</span> : null}
              {job ? <span className='omx-avatar-shot-job'>{job}</span> : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function TaskPreviewDialog({ task, onClose, onGenerate, onVideo, onDelete, t }) {
  const mediaRef = useRef(null)
  if (!task) return null
  const url = taskImageUrl(task)
  const video = taskKind(task) === 'motion'
  // 只读拆解：只从任务记录取，取不到就不渲染，不发请求也不给重跑拆解的入口。
  const recreate = readTaskRecreate(task)
  return (
    <DialogFrame
      title={video ? '角色视频' : '角色图片'}
      onClose={onClose}
      t={t}
      footer={
        <div className='omx-avatar-mv-actions'>
          <div className='omx-avatar-pane-tools'>
            {onGenerate ? <Button onClick={() => onGenerate(task)}>重新生成</Button> : null}
            {!video && onVideo ? <Button onClick={() => onVideo(task)}>制作视频</Button> : null}
            <Button onClick={() => mediaRef.current?.requestFullscreen?.().catch(() => {})}>全屏预览</Button>
            {onDelete ? <Button onClick={() => onDelete(task)}>删除记录</Button> : null}
          </div>
          {url ? (
            <a className='omx-avatar-abtn' href={url + (url.includes('?') ? '&' : '?') + 'download=1'} download>
              下载
            </a>
          ) : null}
        </div>
      }
    >
      <RecoverableMedia src={url} video={video} mediaRef={mediaRef} alt='角色图片' controls autoPlay playsInline />
      {recreate ? (
        <ShotBreakdown shots={recreate.shots} hook={recreate.hook} durationSec={recreate.durationSec} t={t} />
      ) : null}
    </DialogFrame>
  )
}
