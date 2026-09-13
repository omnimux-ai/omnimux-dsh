/**
 * 左栏（Master）：页头 + 搜索 + 四状态胶囊 + 任务行列表。
 *
 * 受控组件——搜索词、状态筛选、选中项全部由 `AutomationWorkbench` 持有，
 * 本组件只上抛意图。排序与过滤一律走 `schedule-model.js` 的纯函数，组件内不写第二份。
 */

import { useEffect, useRef } from 'react'
import { Button } from './controls.jsx'
import {
  ChatIcon,
  CheckOutlineIcon,
  ClockIcon,
  CloseOutlineIcon,
  EllipsisIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlayOutlineIcon,
  RefreshIcon,
  SearchOutlineIcon,
  TrashIcon,
} from './icons.jsx'
import { MenuPopup, MenuRow, useMenuState } from './menu.jsx'
import { SplitCreateButton } from './split-create-button.jsx'

/** 状态胶囊的顺序即界面顺序，「全部」永远在最前且默认选中。 */
export const STATUS_FILTERS = ['all', 'active', 'paused', 'finished']

/** 行状态图标：已开启 = 时钟、已暂停 = 播放（提示可恢复）、已完成 = 对勾。 */
function RowStateIcon({ state }) {
  if (state === 'finished') return <CheckOutlineIcon width={20} height={20} />
  if (state === 'paused') return <PlayOutlineIcon width={20} height={20} />
  return <ClockIcon width={20} height={20} />
}

/**
 * 行与详情栏共用的 `...` 菜单项清单——**单一真源**。
 *
 * 两个入口渲染的是同一份项清单，行为不可能漂移；`busy` 期间点击一律吞掉，
 * 避免同一任务并发两次变更。
 *
 * @param {object} input
 * @param {(key: string, params?: Record<string, unknown>) => string} input.t
 * @param {{ id: string, name: string, status: 'active' | 'paused' }} input.task
 * @param {boolean} [input.busy]
 * @param {(automationId: string) => void} [input.onRunNow]
 * @param {(automationId: string) => void} [input.onEdit]
 * @param {(automationId: string) => void} [input.onToggle]
 * @param {(automationId: string) => void} [input.onDelete]
 * @returns {{ key: string, icon: import('react').ReactNode, label: import('react').ReactNode, onSelect: () => void }[]}
 */
export function buildTaskMenuItems({ t, task, busy = false, onRunNow, onEdit, onToggle, onDelete }) {
  const guard = action => () => {
    if (busy) return
    action?.()
  }
  const paused = task.status !== 'active'
  return [
    {
      key: 'run',
      icon: <PlayOutlineIcon width={14} height={14} />,
      label: t('menu.run'),
      onSelect: guard(() => onRunNow?.(task.id)),
    },
    {
      key: 'edit',
      icon: <PencilIcon width={14} height={14} />,
      label: t('menu.edit'),
      onSelect: guard(() => onEdit?.(task.id)),
    },
    {
      key: 'toggle',
      icon: paused ? <PlayIcon width={14} height={14} /> : <PauseIcon width={14} height={14} />,
      label: paused ? t('card.resume') : t('card.pause'),
      onSelect: guard(() => onToggle?.(task.id)),
    },
    {
      key: 'delete',
      icon: <TrashIcon width={14} height={14} />,
      label: <span className="dsh-st-menu-danger">{t('menu.delete')}</span>,
      onSelect: guard(() => onDelete?.(task.id)),
    },
  ]
}

/**
 * `...` 菜单宿主：行内与详情栏顶部共用同一个组件与同一份项清单。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {{ id: string, name: string, status: 'active' | 'paused' }} props.task
 * @param {boolean} [props.busy]
 * @param {number} [props.size]
 * @param {string} [props.className]
 * @param {(automationId: string) => void} [props.onRunNow]
 * @param {(automationId: string) => void} [props.onEdit]
 * @param {(automationId: string) => void} [props.onToggle]
 * @param {(automationId: string) => void} [props.onDelete]
 */
export function TaskMenu({ t, task, busy = false, size = 16, className, onRunNow, onEdit, onToggle, onDelete }) {
  const menu = useMenuState()
  const items = buildTaskMenuItems({ t, task, busy, onRunNow, onEdit, onToggle, onDelete })
  return (
    <div className={`dsh-st-md-more${className === undefined ? '' : ` ${className}`}`} ref={menu.root}>
      <Button
        className="dsh-st-icon dsh-st-md-more-btn"
        aria-label={t('card.more')}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={() => menu.setOpen(value => !value)}
      >
        <EllipsisIcon width={size} height={size} />
      </Button>
      <MenuPopup
        open={menu.open}
        anchor={menu.root}
        menuRef={menu.menu}
        end
        className="dsh-st-select-menu is-end dsh-st-md-more-menu"
        ariaLabel={t('card.more')}
      >
        {items.map(item => (
          <MenuRow
            key={item.key}
            icon={item.icon}
            label={item.label}
            onClick={() => {
              menu.setOpen(false)
              item.onSelect()
            }}
          />
        ))}
      </MenuPopup>
    </div>
  )
}

/**
 * 单行：圆状态图标 + 名称 + 周期摘要 + hover `...`。
 *
 * 整个空白区是一个原生按钮，所以 Enter / Space 展开选中行天然可用（AC-10），
 * 无需额外键盘处理。
 */
function TaskRow({ t, row, selected, busy, rowRef, onSelect, onRunNow, onEdit, onToggle, onDelete }) {
  return (
    <div
      className={`dsh-st-md-row is-${row.state}${selected ? ' is-selected' : ''}${row.running ? ' is-running' : ''}`}
      role="listitem"
      {...(rowRef === undefined ? {} : { ref: rowRef })}
    >
      <Button
        className="dsh-st-md-row-open"
        aria-pressed={selected === true}
        onClick={() => onSelect?.(row.id)}
      >
        <span className="dsh-st-md-row-icon" aria-hidden="true">
          <RowStateIcon state={row.state} />
          {row.running === true && <span className="dsh-st-md-row-pulse" />}
        </span>
        <span className="dsh-st-md-row-copy">
          <span className="dsh-st-md-row-name">{row.name}</span>
          <span className="dsh-st-md-row-schedule">{row.scheduleText}</span>
        </span>
      </Button>
      <TaskMenu
        t={t}
        task={row}
        busy={busy}
        onRunNow={onRunNow}
        onEdit={onEdit}
        onToggle={onToggle}
        onDelete={onDelete}
      />
    </div>
  )
}

/** 一条任务都没有：给创建引导，不造假数据。 */
function NoTasksEmpty({ t, canCreate, onCreate }) {
  return (
    <div className="dsh-st-md-empty">
      <h3>{t('list.title')}</h3>
      <p>{t('overview.empty')}</p>
      <Button className="dsh-st-btn dsh-st-btn--primary" disabled={!canCreate} onClick={() => onCreate?.()}>
        {t('action.create')}
      </Button>
    </div>
  )
}

/** 有任务但被搜索/胶囊筛空：只给「清除筛选」，不出现创建引导。 */
function NoMatchEmpty({ t, onClear }) {
  return (
    <div className="dsh-st-md-empty is-quiet">
      <p>{t('list.noMatch')}</p>
      <Button className="dsh-st-md-link" onClick={() => onClear?.()}>{t('list.clearFilter')}</Button>
    </div>
  )
}

/**
 * 左栏主体。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {readonly import('./schedule-model.js').MasterRowViewModel[]} props.rows 已过滤的行
 * @param {{ all: number, active: number, paused: number, finished: number }} props.counts
 * @param {string} props.query
 * @param {import('./schedule-model.js').StatusFilter} props.statusFilter
 * @param {string} [props.selectedId]
 * @param {string} [props.busyId]
 * @param {boolean} [props.canCreate]
 * @param {() => void} [props.onCreate]
 * @param {() => void} [props.onChatCreate]
 * @param {() => void} [props.onRefresh]
 * @param {(query: string) => void} [props.onQueryChange]
 * @param {(filter: import('./schedule-model.js').StatusFilter) => void} [props.onStatusFilterChange]
 * @param {(automationId: string) => void} [props.onSelect]
 * @param {(automationId: string) => void} [props.onRunNow]
 * @param {(automationId: string) => void} [props.onEdit]
 * @param {(automationId: string) => void} [props.onToggle]
 * @param {(automationId: string) => void} [props.onDelete]
 * @param {() => void} [props.onClearFilter]
 */
export function TaskMasterList({
  t,
  rows = [],
  counts,
  query = '',
  statusFilter = 'all',
  selectedId,
  busyId,
  canCreate = false,
  onCreate,
  onChatCreate,
  onRefresh,
  onQueryChange,
  onStatusFilterChange,
  onSelect,
  onRunNow,
  onEdit,
  onToggle,
  onDelete,
  onClearFilter,
}) {
  const empty = rows.length === 0
  const nothingAtAll = counts === undefined || counts.all === 0
  const selectedRow = useRef(null)

  // 选中行滚入视野：被筛选排除后再切回列表时，也不会出现「选中了一个看不见的行」。
  useEffect(() => {
    if (selectedId === undefined) return
    selectedRow.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedId])
  return (
    <div className="dsh-st-md-pane">
      <header className="dsh-st-md-head">
        <div className="dsh-st-md-heading">
          <h1>{t('list.title')}</h1>
          <p>{t('list.subtitle')}</p>
        </div>
        <div className="dsh-st-md-head-actions">
          <SplitCreateButton
            label={t('action.create')}
            menuLabel={t('action.createMenu')}
            disabled={!canCreate}
            onPrimary={() => onCreate?.()}
            options={[
              {
                label: t('action.chatCreate'),
                icon: <ChatIcon width={14} height={14} />,
                onSelect: () => onChatCreate?.(),
              },
              {
                label: t('action.manualCreate'),
                icon: <PencilIcon width={14} height={14} />,
                onSelect: () => onCreate?.(),
              },
            ]}
          />
          <Button
            className="dsh-st-icon"
            aria-label={t('section.refresh')}
            onClick={() => onRefresh?.()}
          ><RefreshIcon width={16} height={16} /></Button>
        </div>
      </header>

      <div className="dsh-st-md-toolbar">
        <div className="dsh-st-md-search">
          <SearchOutlineIcon width={16} height={16} />
          <input
            className="dsh-st-md-search-input"
            type="text"
            value={query}
            placeholder={t('list.searchPlaceholder')}
            aria-label={t('list.searchPlaceholder')}
            onChange={event => onQueryChange?.(event.target.value)}
          />
          {query !== '' && (
            <Button
              className="dsh-st-md-search-clear"
              aria-label={t('list.clearSearch')}
              onClick={() => onQueryChange?.('')}
            ><CloseOutlineIcon width={12} height={12} /></Button>
          )}
        </div>
      </div>

      <div className="dsh-st-md-capsules" role="tablist" aria-label={t('filter.label')}>
        {STATUS_FILTERS.map(key => (
          <Button
            key={key}
            role="tab"
            aria-selected={statusFilter === key}
            className={`dsh-st-md-capsule${statusFilter === key ? ' is-on' : ''}`}
            onClick={() => onStatusFilterChange?.(key)}
          >
            <span>{t(`filter.${key}`)}</span>
            <span className="dsh-st-md-capsule-count">{counts === undefined ? 0 : counts[key]}</span>
          </Button>
        ))}
      </div>

      <div className="dsh-st-md-list" role="list" aria-label={t('list.title')}>
        {rows.map(row => (
          <TaskRow
            key={row.id}
            t={t}
            row={row}
            selected={row.id === selectedId}
            busy={row.id === busyId}
            {...(row.id === selectedId ? { rowRef: selectedRow } : {})}
            onSelect={onSelect}
            onRunNow={onRunNow}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
        {empty && (nothingAtAll
          ? <NoTasksEmpty t={t} canCreate={canCreate} onCreate={onCreate} />
          : <NoMatchEmpty t={t} onClear={onClearFilter} />)}
      </div>
    </div>
  )
}
