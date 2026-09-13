import { useMemo, useState } from 'react'
import { CalendarIcon, PencilIcon, PlayIcon, TrashIcon } from './icons.jsx'
import { Button } from './controls.jsx'
import {
  OVERVIEW_SORT_DEFAULT_KEY,
  formatRelativeTime,
  formatSchedule,
  formatWithin,
  readSortDefault,
  sortAutomations,
} from './helpers.js'
import { automationToggleMutation, deriveTaskOverviewRows } from './schedule-model.js'
import { SortMenu } from './sort-menu.jsx'
import { OverviewEmptyState } from './ScheduleViewSwitch.jsx'

const SORT_STORAGE = globalThis.window === undefined ? undefined : globalThis.window.localStorage

/**
 * 【任务总览】视图：任务卡片列表。
 *
 * 每张卡片显示任务名称、周期与下次执行时间；右上角开关直接暂停/恢复，
 * 卡片底部给出立即运行、配置（编辑）与删除（二次确认由容器负责）。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {readonly import('./protocol.js').AutomationViewModel[]} props.automations
 * @param {string} [props.serverNow]
 * @param {(automationId: string, mutation: 'pause' | 'resume') => void} [props.onToggle]
 * @param {(automationId: string) => void} [props.onRunNow]
 * @param {(automation: import('./protocol.js').AutomationViewModel) => void} [props.onEdit]
 * @param {(automation: import('./protocol.js').AutomationViewModel) => void} [props.onDelete]
 * @param {() => void} [props.onCreate]
 */
export function ScheduleOverviewView({
  t,
  automations = [],
  serverNow,
  onToggle,
  onRunNow,
  onEdit,
  onDelete,
  onCreate,
}) {
  const [sortKey, setSortKey] = useState(() => readSortDefault(SORT_STORAGE, OVERVIEW_SORT_DEFAULT_KEY)?.key ?? 'planned')
  const [sortDirection, setSortDirection] = useState(() => readSortDefault(SORT_STORAGE, OVERVIEW_SORT_DEFAULT_KEY)?.direction ?? 'asc')
  const [busyIds, setBusyIds] = useState(() => new Set())
  const now = useMemo(() => new Date(serverNow ?? Date.now()), [serverNow])

  const sorted = useMemo(
    () => sortAutomations(automations, sortKey, sortDirection),
    [automations, sortDirection, sortKey],
  )
  const rows = useMemo(() => deriveTaskOverviewRows(sorted), [sorted])
  const scheduleSummaries = useMemo(
    () => new Map(automations.map(item => [item.id, formatSchedule(item.schedule, t)])),
    [automations, t],
  )

  const markBusy = (automationId, busy) => {
    setBusyIds((current) => {
      const next = new Set(current)
      if (busy) next.add(automationId)
      else next.delete(automationId)
      return next
    })
  }

  const toggle = (automationId, mutation) => {
    if (onToggle === undefined || busyIds.has(automationId)) return
    markBusy(automationId, true)
    void Promise.resolve(onToggle(automationId, mutation))
      .catch((error) => { console.warn('[omnimux-automation] 切换任务状态失败', error) })
      .finally(() => { markBusy(automationId, false) })
  }

  const run = (automationId) => {
    if (onRunNow === undefined || busyIds.has(automationId)) return
    markBusy(automationId, true)
    void Promise.resolve(onRunNow(automationId))
      .catch((error) => { console.warn('[omnimux-automation] 立即运行失败', error) })
      .finally(() => { markBusy(automationId, false) })
  }

  if (automations.length === 0) {
    return <OverviewEmptyState t={t} disabled={onCreate === undefined} onCreate={() => onCreate?.()} />
  }

  return (
    <div className="dsh-st-overview" data-view="overview">
      <div className="dsh-st-overview-head">
        <div className="dsh-st-overview-title">
          <strong>{t('sidebar.viewOverview')}</strong>
          <span aria-label={`${rows.length}`}>{rows.length}</span>
        </div>
        <SortMenu
          t={t}
          compact
          iconOnly
          className="dsh-st-overview-sort"
          {...(SORT_STORAGE === undefined ? {} : { storage: SORT_STORAGE })}
          storageKey={OVERVIEW_SORT_DEFAULT_KEY}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSelect={(key, direction) => {
            setSortKey(key)
            setSortDirection(direction)
          }}
        />
      </div>
      {rows.map((row) => {
        const paused = row.status !== 'active'
        const nextRun = row.nextRunAt === undefined
          ? t('stats.noneScheduled')
          : formatWithin(row.nextRunAt, now, t)
        const nextRunCompact = row.nextRunAt === undefined
          ? t('stats.noneScheduled')
          : formatRelativeTime(row.nextRunAt, now, t)
        const nextRunLabel = `${t('stats.next')}: ${nextRun}`
        const toggleLabel = paused ? t('card.resume') : t('card.pause')
        const item = sorted.find(entry => entry.id === row.id)
        const busy = busyIds.has(row.id)
        return (
          <div key={row.id} className={`dsh-st-overview-row${paused ? ' is-paused' : ''}`}>
            <div className="dsh-st-overview-open">
              <span className="dsh-st-overview-copy">
                <span className="dsh-st-overview-name">{row.name}</span>
                <span className="dsh-st-overview-schedule">
                  <CalendarIcon width={14} height={14} />
                  <span>{scheduleSummaries.get(row.id) ?? ''}</span>
                </span>
              </span>
              <span className="dsh-st-overview-next" title={nextRunLabel} aria-label={nextRunLabel}>
                <strong>{nextRunCompact}</strong>
              </span>
            </div>
            <label className="dsh-st-overview-toggle" title={toggleLabel}>
              <input
                type="checkbox"
                role="switch"
                checked={!paused}
                aria-checked={!paused}
                aria-label={`${toggleLabel}: ${row.name}`}
                disabled={busy}
                onChange={() => toggle(row.id, automationToggleMutation(row.status))}
              />
              <span aria-hidden="true" />
            </label>
            <div className="dsh-st-overview-acts">
              <Button
                className="dsh-st-chip-btn"
                disabled={busy || onRunNow === undefined}
                onClick={() => run(row.id)}
              >
                <PlayIcon width={14} height={14} />
                {t('menu.run')}
              </Button>
              <Button
                className="dsh-st-chip-btn"
                disabled={onEdit === undefined || item === undefined}
                onClick={() => { if (item !== undefined) onEdit?.(item) }}
              >
                <PencilIcon width={14} height={14} />
                {t('menu.edit')}
              </Button>
              <Button
                className="dsh-st-chip-btn is-danger"
                disabled={onDelete === undefined || item === undefined}
                onClick={() => { if (item !== undefined) onDelete?.(item) }}
              >
                <TrashIcon width={14} height={14} />
                {t('menu.delete')}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
