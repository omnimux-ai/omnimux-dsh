import { useEffect, useState } from 'react'
import { ANALYSIS_STEPS, PROGRESS_CEILING, progressAt, stepAt } from '../lib/recreate.js'

/**
 * 拆解进度：分步文案 + 有界计时进度。
 *
 * 服务端不报进度，所以这里的百分比**只由本地计时推导**，封顶 92%
 * （`progressAt` 保证），绝不写死宽度、绝不假装到 100%。
 * 拆解完成后组件被卸载，剩下的 8% 交给真实的提交与回执。
 *
 * @param {{ startedAt: number }} props `startedAt` 是拆解开始的毫秒时间戳
 */
export function RecreateProgress({ startedAt }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - startedAt))
  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Date.now() - startedAt))
    update()
    const timer = setInterval(update, 400)
    return () => clearInterval(timer)
  }, [startedAt])

  const step = stepAt(elapsed)
  const value = progressAt(elapsed)
  return (
    <section className="omx-avatar-block" aria-busy="true">
      <div className="omx-avatar-block-head">
        <span className="omx-avatar-block-title">正在拆解参考视频</span>
        <span className="omx-avatar-block-meta">{`${value}%`}</span>
      </div>
      <div className="omx-avatar-block-body">
        <ol className="omx-avatar-recreate-steps">
          {ANALYSIS_STEPS.map((row) => {
            const done = ANALYSIS_STEPS.indexOf(row) < ANALYSIS_STEPS.indexOf(step)
            const current = row.id === step.id
            return (
              <li key={row.id} aria-current={current ? 'step' : undefined} data-state={done ? 'done' : current ? 'current' : 'pending'}>
                <span>{row.label}</span>
              </li>
            )
          })}
        </ol>
        <div className="omx-avatar-progress" role="progressbar" aria-valuemin={0} aria-valuemax={PROGRESS_CEILING} aria-valuenow={value} aria-label="拆解进度">
          <i style={{ width: `${value}%` }} /* exempt-ui02: 宽度只能来自有界计时，封顶 92% */ />
        </div>
        <p className="omx-avatar-field-lbl" role="status">{`${step.label}…`}</p>
      </div>
    </section>
  )
}
