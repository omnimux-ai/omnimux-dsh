/**
 * 右栏（Detail）：状态条 + 名称与指令 + 分组「详情」 + 分组「频率」 + 底部运行历史 + 吸底行动栏。
 *
 * 纯受控：草稿经 props 进出，本组件不持有任何业务状态，也不自己发起写操作。
 * 校验与提交产物 100% 复用 `helpers.js` 的 `formFromAutomation` / `buildCreateInput`，
 * 这里只负责把控件值上抛成 patch。
 */

import { useState } from 'react'
import { Button } from './controls.jsx'
import { permissionLabel } from './permissions.js'
import { CloseOutlineIcon, PlayIcon, ShieldIcon } from './icons.jsx'
import { MenuHostProvider, MenuPopup, MenuRow, MenuSelect, useMenuState } from './menu.jsx'
import { TimeSelect } from './create-modal.jsx'
import { TaskMenu } from './TaskMasterList.jsx'
import { automationStateOf } from './schedule-model.js'

/** 与 `automationScheduleSchema` 判别联合一一对应的七种周期，不新增周期类型。 */
const KINDS = ['once', 'interval', 'hourly', 'daily', 'weekly', 'monthly', 'custom']
/** 未取到模型推理档位时的兜底档位；`none` 在提交时落为 null。 */
const EFFORTS = ['none', 'low', 'medium', 'high']
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const MINUTES = Array.from({ length: 60 }, (_value, index) => String(index).padStart(2, '0'))

/** 「展开全部」的折叠阈值：超过它就收起，而不是让指令把详情栏顶穿。 */
const PROMPT_CLAMP_LINES = 6

/**
 * 详情栏下拉：完全基于 `menu.jsx` 的浮层原语，**禁止原生 `<select>`**。
 *
 * 可搜索与降级提示行（模型组的 `modelFailures`）都在这里统一承载，
 * 项目 / 模型 / 周期三类下拉共用同一个控件。
 *
 * @param {object} props
 * @param {string} props.label 无障碍名称与占位文案
 * @param {string} props.value
 * @param {{ value: string, label: string }[]} props.options
 * @param {string} [props.searchPlaceholder] 给定时启用搜索框
 * @param {import('react').ReactNode} [props.warning] 浮层顶部的降级提示行
 * @param {string} [props.emptyLabel]
 * @param {(value: string) => void} props.onSelect
 */
function DetailSelect({ label, value, options, searchPlaceholder, warning, emptyLabel, onSelect }) {
  const menu = useMenuState()
  const [keyword, setKeyword] = useState('')
  const searchable = searchPlaceholder !== undefined
  const current = options.find(option => option.value === value)
  const needle = keyword.trim().toLowerCase()
  const visible = needle === ''
    ? options
    : options.filter(option => option.label.toLowerCase().includes(needle))

  return (
    <div className={`dsh-st-md-select${menu.open ? ' is-open' : ''}`} ref={menu.root}>
      <Button
        className="dsh-st-md-select-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={() => {
          setKeyword('')
          menu.setOpen(open => !open)
        }}
      >
        <span className="dsh-st-md-select-value">{current?.label ?? label}</span>
        <span className="dsh-st-md-select-chevron" aria-hidden="true" />
      </Button>
      <MenuPopup
        open={menu.open}
        anchor={menu.root}
        menuRef={menu.menu}
        className="dsh-st-select-menu dsh-st-md-select-menu"
        ariaLabel={label}
      >
        {searchable && (
          <div className="dsh-st-md-select-search">
            <input
              className="dsh-st-md-select-input"
              value={keyword}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={event => setKeyword(event.target.value)}
            />
          </div>
        )}
        {warning}
        {visible.map(option => (
          <MenuRow
            key={option.value}
            label={option.label}
            active={option.value === value}
            onClick={() => {
              menu.setOpen(false)
              onSelect(option.value)
            }}
          />
        ))}
        {visible.length === 0 && <div className="dsh-st-select-empty">{emptyLabel ?? label}</div>}
      </MenuPopup>
    </div>
  )
}

/** 详情分组的一行：左标签 + 右控件 + 可选灰字提示。 */
function FieldRow({ label, hint, children }) {
  return (
    <div className="dsh-st-md-field">
      <span className="dsh-st-md-field-label">{label}</span>
      <div className="dsh-st-md-field-body">
        {children}
        {hint !== undefined && <p className="dsh-st-md-field-hint">{hint}</p>}
      </div>
    </div>
  )
}

/**
 * 底部「运行历史记录」：默认最近 N 条，可展开全部；没有会话 id 的行不可点（灰态）。
 */
function DetailHistory({ t, rows, total, limit, canRun, onOpenSession, onRunNow }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, limit)
  return (
    <section className="dsh-st-md-block">
      <h3 className="dsh-st-md-block-title">
        <span>{t('history.title')}</span>
        <span className="dsh-st-md-block-count">{total}</span>
      </h3>
      {rows.length === 0
        ? (
          <div className="dsh-st-md-history-empty">
            <p>{t('history.empty')}</p>
            <Button className="dsh-st-btn" disabled={!canRun} onClick={() => onRunNow?.()}>
              <PlayIcon width={14} height={14} />
              {t('card.runNow')}
            </Button>
          </div>
        )
        : (
          <>
            <div className="dsh-st-md-history-list">
              {visible.map(row => (
                <Button
                  key={row.id}
                  className={`dsh-st-md-history-row is-${row.status}${row.sessionId === null ? ' is-static' : ''}`}
                  title={row.absoluteStamp}
                  disabled={row.sessionId === null}
                  onClick={() => { if (row.sessionId !== null) onOpenSession?.(row.sessionId) }}
                >
                  <span className="dsh-st-md-history-dot" aria-hidden="true" />
                  <span className="dsh-st-md-history-copy">
                    <span className="dsh-st-md-history-title">{row.title}</span>
                    <span className="dsh-st-md-history-meta">
                      {row.workspaceTitle}
                      <span className="dsh-st-md-history-sep" aria-hidden="true">·</span>
                      {t(`run.trigger.${row.trigger}`)}
                    </span>
                  </span>
                  <span className="dsh-st-md-history-time">{row.relativeTime}</span>
                  {row.unread === true && <span className="dsh-st-md-history-unread" title={t('runs.unread')} />}
                </Button>
              ))}
            </div>
            {total > limit && (
              <Button
                className="dsh-st-md-link"
                aria-expanded={expanded}
                onClick={() => setExpanded(value => !value)}
              >
                {expanded ? t('history.collapse') : t('history.expand', { count: total })}
              </Button>
            )}
          </>
        )}
    </section>
  )
}

/**
 * 右栏主体。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {(key: string, params?: Record<string, unknown>) => string} props.modelT
 * @param {import('./protocol.js').AutomationViewModel} props.item 选中的任务（服务端值）
 * @param {Record<string, any>} props.draft 草稿（受控）
 * @param {boolean} props.dirty
 * @param {boolean} [props.busy]
 * @param {string} [props.error]
 * @param {readonly import('./schedule-model.js').RunHistoryRowViewModel[]} [props.history]
 * @param {number} [props.historyTotal]
 * @param {number} [props.historyLimit]
 * @param {readonly { id: string, title?: string, path?: string }[]} [props.workspaces]
 * @param {readonly { provider: string, model: string, label?: string, reasoning?: any }[]} [props.models]
 * @param {readonly { provider: string, providerLabel: string, message: string }[]} [props.modelFailures]
 * @param {readonly { value: string, name: string }[]} [props.permissions]
 * @param {boolean} [props.canRun]
 * @param {(patch: Record<string, unknown>) => void} props.onFieldChange
 * @param {() => void} props.onSave
 * @param {() => void} props.onReset
 * @param {() => void} props.onClose
 * @param {(automationId: string) => void} [props.onRunNow]
 * @param {(automationId: string) => void} [props.onEdit]
 * @param {(automationId: string) => void} [props.onToggle]
 * @param {(automationId: string) => void} [props.onDelete]
 * @param {(sessionId: string) => void} [props.onOpenSession]
 */
export function TaskDetailPanel({
  t,
  modelT,
  item,
  draft,
  dirty,
  busy = false,
  error,
  history = [],
  historyTotal = 0,
  historyLimit = 5,
  workspaces = [],
  models = [],
  modelFailures = [],
  permissions = [],
  canRun = false,
  onFieldChange,
  onSave,
  onReset,
  onClose,
  onRunNow,
  onEdit,
  onToggle,
  onDelete,
  onOpenSession,
}) {
  const [promptEditing, setPromptEditing] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [menuHost, setMenuHost] = useState(null)

  // 草稿由容器在选中后经 effect 装载，装载前这一帧不渲染内容区，避免受控输入闪空值。
  if (draft === undefined) return null

  const state = automationStateOf(item)
  const promptText = String(draft.prompt ?? '')
  const promptLong = promptText.split('\n').length > PROMPT_CLAMP_LINES || promptText.length > 280
  const update = patch => onFieldChange?.(patch)

  const selectedModel = models.find(entry => `${entry.provider}::${entry.model}` === draft.modelKey)
  const effortOptions = selectedModel?.reasoning?.efforts?.length > 0
    ? [{ value: 'none', label: t('form.effort.none') }, ...selectedModel.reasoning.efforts.map(entry => ({ value: entry.id, label: entry.name }))]
    : EFFORTS.map(value => ({ value, label: t(`form.effort.${value}`) }))
  const timePart = String(draft.time ?? '09:00').slice(0, 5)
  const onceDate = String(draft.onceAt ?? '').slice(0, 10)
  const onceTime = String(draft.onceAt ?? '').slice(11, 16) || '09:00'
  const workspaceOptions = workspaces.map(workspace => ({ value: workspace.id, label: workspace.title ?? workspace.id }))
  const modelOptions = [
    { value: 'default', label: t('detail.defaultModel') },
    ...models.map(entry => ({ value: `${entry.provider}::${entry.model}`, label: entry.label ?? entry.model })),
  ]
  const kindOptions = KINDS.map(kind => ({ value: kind, label: t(`form.${kind}`) }))
  const permissionOptions = permissions.map(option => ({ value: option.value, label: permissionLabel(option, t) }))

  return (
    <MenuHostProvider host={menuHost}>
      <div className="dsh-st-md-detail-inner">
        <header className="dsh-st-md-detail-head">
          <span className={`dsh-st-md-status is-${state}`}>{t(`filter.${state}`)}</span>
          <div className="dsh-st-md-detail-head-actions">
            <TaskMenu
              t={t}
              task={item}
              busy={busy}
              className="is-detail"
              onRunNow={onRunNow}
              onEdit={onEdit}
              onToggle={onToggle}
              onDelete={onDelete}
            />
            <Button
              className="dsh-st-icon"
              aria-label={t('detail.close')}
              onClick={() => onClose?.()}
            ><CloseOutlineIcon width={14} height={14} /></Button>
          </div>
        </header>

        <div className="dsh-st-md-detail-body">
          {error !== undefined && <p className="dsh-st-error">{error}</p>}

          <label className="dsh-st-md-title-field">
            <span className="dsh-st-md-title-label">{t('form.name')}</span>
            <input
              className="dsh-st-md-title-input"
              value={draft.name ?? ''}
              placeholder={t('form.namePlaceholder')}
              onChange={event => update({ name: event.target.value })}
            />
          </label>

          <section className="dsh-st-md-block">
            <h3 className="dsh-st-md-block-title"><span>{t('form.prompt')}</span></h3>
            {promptEditing
              ? (
                <textarea
                  className="dsh-st-md-prompt-input"
                  value={promptText}
                  placeholder={t('form.promptPlaceholder')}
                  onChange={event => update({ prompt: event.target.value })}
                  onBlur={() => setPromptEditing(false)}
                />
              )
              : (
                <div
                  className={`dsh-st-md-prompt${promptLong && !promptExpanded ? ' is-clamped' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPromptEditing(true)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setPromptEditing(true)
                  }}
                >{promptText}</div>
              )}
            {promptLong && !promptEditing && (
              <Button
                className="dsh-st-md-link"
                aria-expanded={promptExpanded}
                onClick={() => setPromptExpanded(value => !value)}
              >{promptExpanded ? t('detail.promptCollapse') : t('detail.promptExpand')}</Button>
            )}
          </section>

          <section className="dsh-st-md-block">
            <h3 className="dsh-st-md-block-title"><span>{t('detail.detailGroup')}</span></h3>
            <FieldRow label={t('detail.runtime')} hint={t('detail.runtimeHint')}>
              <span className="dsh-st-md-static">{t('detail.runtimeValue')}</span>
            </FieldRow>
            <FieldRow label={t('form.workspace')}>
              <DetailSelect
                label={t('form.workspace')}
                value={draft.workspaceId ?? ''}
                options={workspaceOptions}
                emptyLabel={t('form.error.workspace')}
                onSelect={value => update({ workspaceId: value })}
              />
            </FieldRow>
            <FieldRow label={t('form.model')}>
              <DetailSelect
                label={t('form.model')}
                value={draft.modelKey ?? 'default'}
                options={modelOptions}
                searchPlaceholder={t('detail.modelSearch')}
                emptyLabel={modelT('empty.models')}
                warning={modelFailures.map(failure => (
                  <div key={failure.provider} className="dsh-st-md-select-warning">
                    {modelT('warning.groupLoad', { name: failure.providerLabel, message: failure.message })}
                  </div>
                ))}
                onSelect={value => update({ modelKey: value })}
              />
            </FieldRow>
            <FieldRow label={t('form.effort')}>
              <div className="dsh-st-md-segments" role="group" aria-label={t('form.effort')}>
                {effortOptions.map(option => (
                  <Button
                    key={option.value}
                    className={`dsh-st-md-segment${draft.reasoningEffort === option.value ? ' is-on' : ''}`}
                    aria-pressed={draft.reasoningEffort === option.value}
                    onClick={() => update({ reasoningEffort: option.value })}
                  >{option.label}</Button>
                ))}
              </div>
            </FieldRow>
            <FieldRow label={t('form.permission')}>
              <DetailSelect
                label={t('form.permission')}
                value={draft.permission ?? ''}
                options={permissionOptions}
                emptyLabel={t('form.permission')}
                onSelect={value => update({ permission: value })}
              />
            </FieldRow>
          </section>

          <section className="dsh-st-md-block">
            <h3 className="dsh-st-md-block-title"><span>{t('detail.scheduleGroup')}</span></h3>
            <FieldRow label={t('form.planTime')}>
              <DetailSelect
                label={t('form.planTime')}
                value={draft.scheduleKind ?? 'daily'}
                options={kindOptions}
                onSelect={value => update({ scheduleKind: value })}
              />
            </FieldRow>
            <FieldRow label={t('form.runAt')}>
              <div className="dsh-st-md-inline">
                {draft.scheduleKind === 'once' && (
                  <>
                    <input
                      className="dsh-st-md-input"
                      type="date"
                      value={onceDate}
                      aria-label={t('form.runAt')}
                      onChange={event => update({ onceAt: `${event.target.value}T${onceTime}` })}
                    />
                    <TimeSelect value={onceTime} onChange={value => update({ onceAt: `${onceDate}T${value}` })} />
                  </>
                )}
                {draft.scheduleKind === 'interval' && (
                  <>
                    <input
                      className="dsh-st-md-input is-narrow"
                      type="number"
                      min={1}
                      value={draft.everyMinutes ?? '60'}
                      aria-label={t('form.interval')}
                      onChange={event => update({ everyMinutes: event.target.value })}
                    />
                    <span className="dsh-st-md-suffix">{t('form.minutes')}</span>
                  </>
                )}
                {draft.scheduleKind === 'hourly' && (
                  <>
                    <MenuSelect
                      value={String(draft.hourlyMinute ?? '00')}
                      options={MINUTES.map(minute => ({ value: minute, label: `:${minute}` }))}
                      onChange={value => update({ hourlyMinute: value })}
                    />
                    <span className="dsh-st-md-suffix">{t('form.hourly')}</span>
                  </>
                )}
                {(draft.scheduleKind === 'daily' || draft.scheduleKind === 'weekly') && (
                  <TimeSelect value={timePart} onChange={value => update({ time: value })} />
                )}
                {draft.scheduleKind === 'monthly' && (
                  <>
                    <MenuSelect
                      value={String(draft.monthDay ?? '1')}
                      options={Array.from({ length: 31 }, (_value, index) => {
                        const day = String(index + 1)
                        return { value: day, label: t('form.monthDay', { day }) }
                      })}
                      onChange={value => update({ monthDay: value })}
                    />
                    <TimeSelect value={timePart} onChange={value => update({ time: value })} />
                  </>
                )}
                {draft.scheduleKind === 'custom' && (
                  <>
                    <input
                      className="dsh-st-md-input is-narrow"
                      type="number"
                      min={1}
                      value={draft.customDays ?? '2'}
                      aria-label={t('form.custom')}
                      onChange={event => update({ customDays: event.target.value })}
                    />
                    <span className="dsh-st-md-suffix">{t('form.daysShort')}</span>
                    <TimeSelect value={timePart} onChange={value => update({ time: value })} />
                  </>
                )}
              </div>
            </FieldRow>
            {draft.scheduleKind === 'weekly' && (
              <FieldRow label={t('form.days')}>
                <div className="dsh-st-md-weekdays">
                  {WEEKDAYS.map(day => {
                    const on = (draft.weekdays ?? []).includes(day)
                    return (
                      <Button
                        key={day}
                        className={`dsh-st-md-weekday${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => update({
                          weekdays: on
                            ? draft.weekdays.filter(value => value !== day)
                            : [...(draft.weekdays ?? []), day],
                        })}
                      >{t(`day.${day}`)}</Button>
                    )
                  })}
                </div>
              </FieldRow>
            )}
            <FieldRow label={t('form.timeZone')}>
              <input
                className="dsh-st-md-input"
                value={draft.timeZone ?? ''}
                aria-label={t('form.timeZone')}
                onChange={event => update({ timeZone: event.target.value })}
              />
            </FieldRow>
            <Button
              className="dsh-st-md-advanced"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen(value => !value)}
            >{t('detail.advanced')}</Button>
            {advancedOpen && (
              <FieldRow label={t('form.maxConcurrentRuns')} hint={t('form.maxConcurrentRunsHint')}>
                <input
                  className="dsh-st-md-input is-narrow"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.maxConcurrentRuns ?? '1'}
                  onChange={event => update({ maxConcurrentRuns: event.target.value })}
                />
              </FieldRow>
            )}
          </section>

          <DetailHistory
            t={t}
            rows={history}
            total={historyTotal}
            limit={historyLimit}
            canRun={canRun}
            onOpenSession={onOpenSession}
            onRunNow={() => onRunNow?.(item.id)}
          />

          <div className="dsh-st-md-detail-tip">
            <ShieldIcon width={14} height={14} />
            <span>{t('form.subtitle')}</span>
          </div>
        </div>

        <footer className="dsh-st-md-foot">
          <span className={`dsh-st-md-dirty${dirty ? ' is-on' : ''}`}>{dirty ? t('detail.unsaved') : ''}</span>
          <div className="dsh-st-md-foot-actions">
            <Button className="dsh-st-btn" disabled={!dirty || busy} onClick={() => onReset?.()}>
              {t('form.cancel')}
            </Button>
            <Button className="dsh-st-btn dsh-st-btn--primary" disabled={!dirty || busy} onClick={() => onSave?.()}>
              {busy ? t('detail.saving') : t('detail.save')}
            </Button>
          </div>
        </footer>
      </div>
      <div className="dsh-st-flyout-root" ref={setMenuHost} />
    </MenuHostProvider>
  )
}
