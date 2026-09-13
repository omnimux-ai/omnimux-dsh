import { CalendarIcon } from './icons.jsx'
import { Button } from './controls.jsx'

/** 工作台的两个视图。 */
export const SCHEDULE_VIEWS = ['runs', 'overview']

/**
 * 常驻胶囊分段开关：执行记录 ⇄ 任务总览。
 * 只替换内容区，不重挂载容器与弹窗宿主。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {'runs' | 'overview'} props.view
 * @param {(view: 'runs' | 'overview') => void} props.onChange
 */
export function ScheduleViewSwitch({ t, view, onChange }) {
  return (
    <div className="dsh-st-rail-views" role="tablist" aria-label={t('sidebar.views')}>
      <Button
        role="tab"
        aria-selected={view === 'runs'}
        className={view === 'runs' ? 'is-on' : undefined}
        onClick={() => onChange('runs')}
      >{t('tabs.runs')}</Button>
      <Button
        role="tab"
        aria-selected={view === 'overview'}
        className={view === 'overview' ? 'is-on' : undefined}
        onClick={() => onChange('overview')}
      >{t('sidebar.viewOverview')}</Button>
    </div>
  )
}

/**
 * 任务总览空态：一句引导加一个建任务入口，不造占位假数据。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {() => void} props.onCreate
 * @param {boolean} [props.disabled]
 */
export function OverviewEmptyState({ t, onCreate, disabled = false }) {
  return (
    <div className="dsh-st-empty">
      <h3>{t('sidebar.viewOverview')}</h3>
      <p>{t('overview.empty')}</p>
      <Button className="dsh-st-btn dsh-st-btn--primary" disabled={disabled} onClick={onCreate}>
        <CalendarIcon width={16} height={16} />
        {t('action.create')}
      </Button>
    </div>
  )
}
