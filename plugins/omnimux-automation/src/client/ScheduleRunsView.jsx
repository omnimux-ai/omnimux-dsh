import { ClockIcon } from './icons.jsx'
import { Button } from './controls.jsx'

/**
 * 【执行记录】视图：按任务分组展示历史执行会话。
 *
 * 每行给出状态指示点、执行时间（按该任务时区）、触发类型徽标；点击直达打开会话。
 * 没有记录时只给一句引导，不造占位假数据。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {readonly import('./schedule-model.js').AutomationRunGroup[]} props.groups
 * @param {(sessionId: string) => void} [props.openSession]
 * @param {Record<string, boolean>} [props.folded]
 * @param {(automationId: string) => void} [props.onToggleFold]
 * @param {(runId: string) => void} [props.onMarkRead]
 */
export function ScheduleRunsView({ t, groups = [], openSession, folded = {}, onToggleFold, onMarkRead }) {
  if (groups.length === 0) {
    return (
      <div className="dsh-st-rail-empty">
        <span>{t('runs.empty')}</span>
        <span className="dsh-st-hint">{t('runs.hint')}</span>
      </div>
    )
  }
  return (
    <div className="dsh-st-rail" data-view="runs">
      {groups.map(group => (
        <section key={group.id} className="dsh-st-rail-group">
          <Button
            className="dsh-st-rail-head"
            aria-expanded={folded[group.id] !== true}
            onClick={() => onToggleFold?.(group.id)}
          >
            <span className="dsh-st-rail-folder"><ClockIcon width={16} height={16} /></span>
            <span className="dsh-st-rail-title">{group.name}</span>
            <span className="dsh-st-rail-count">{group.runs.length}</span>
          </Button>
          {folded[group.id] !== true && group.runs.map(run => (
            <div key={run.id} className={`dsh-st-rail-run is-${run.status}`}>
              <Button
                className="dsh-st-rail-session"
                onClick={() => openSession?.(run.sessionId)}
              >
                <span className={`dsh-st-run-dot-cell is-${run.status}`} aria-hidden="true">
                  <span className="dsh-st-run-dot" />
                </span>
                <span className="dsh-st-rail-label">{run.label}</span>
                <span className="dsh-st-chip dsh-st-chip--trigger">{t(`run.trigger.${run.trigger}`)}</span>
                {run.unread === true && <span className="dsh-st-rail-unread" title={t('runs.unread')} />}
              </Button>
              {run.unread === true && onMarkRead !== undefined && (
                <Button
                  className="dsh-st-rail-markread"
                  onClick={() => onMarkRead(run.id)}
                >{t('run.markRead')}</Button>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
