/**
 * 右侧工作台容器：单一列表主视图 + 可展开的右侧详情栏（Master-Detail）。
 *
 * 状态归属单一——`selectedId` / `query` / `statusFilter` / `draft` / `draftAnchor` 五个状态
 * 只在这里持有；左栏与右栏都是 props 驱动的纯展示件。
 *
 * 并排 / 覆层两种形态**完全由 CSS 容器查询判定**（`.dsh-st-md-root` 上的 `container-type`），
 * 这里不量宽度、不用 `matchMedia` / `ResizeObserver`：选中态下右栏与遮罩始终在 React 树中，
 * 跨断点只换容器 class，因此详情栏不会重挂载，编辑态与滚动位置都不丢。
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from './controls.jsx'
import { CreateModal } from './create-modal.jsx'
import { DeleteConfirmation } from './delete-confirmation.jsx'
import { AutomationFormError, buildCreateInput, formFromAutomation } from './helpers.js'
import { applyComposerDraft } from './prefill-chat.js'
import { isTransportError } from './runtime.js'
import {
  automationDraftKey,
  automationToggleMutation,
  countMasterTasks,
  filterMasterTasks,
  masterRowViewModels,
  runHistoryRows,
  sortMasterTasks,
} from './schedule-model.js'
import { TaskDetailPanel } from './TaskDetailPanel.jsx'
import { TaskMasterList } from './TaskMasterList.jsx'

/** 运行历史默认展示条数，超出由「查看全部 N 条」展开（同一栏内滚动，不弹层）。 */
const HISTORY_LIMIT = 5

/**
 * 未保存修改的二次确认：与删除确认同一套弹窗外壳与词条风格，只换文案。
 *
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {() => void} props.onCancel
 * @param {() => void} props.onConfirm
 */
function DiscardConfirmation({ t, onCancel, onConfirm }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])
  return (
    <div className="dsh-st-mask" onMouseDown={event => event.stopPropagation()}>
      <section
        className="dsh-st-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dsh-st-discard-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <h2 id="dsh-st-discard-title">{t('detail.discard')}</h2>
        <p>{t('detail.discardHint')}</p>
        <div className="dsh-st-modal-actions">
          <Button className="dsh-st-btn" autoFocus onClick={onCancel}>{t('detail.keepEditing')}</Button>
          <Button className="dsh-st-btn dsh-st-btn--danger" onClick={onConfirm}>{t('detail.discardConfirm')}</Button>
        </div>
      </section>
    </div>
  )
}

/**
 * @param {object} props
 * @param {(key: string, params?: Record<string, unknown>) => string} props.t
 * @param {(key: string, params?: Record<string, unknown>) => string} props.permissionT
 * @param {(key: string, params?: Record<string, unknown>) => string} props.modelT
 * @param {import('./runtime.js').AutomationRuntime} props.runtime
 * @param {(sessionId: string) => void} [props.openSession]
 * @param {boolean} [props.visible]
 */
export function AutomationWorkbench({
  t,
  permissionT,
  modelT,
  runtime,
  openSession,
  visible,
}) {
  const state = useSyncExternalStore(runtime.source.subscribe, runtime.source.getSnapshot, runtime.source.getSnapshot)
  const snapshot = state.snapshot
  const automations = snapshot?.automations ?? []
  const runs = snapshot?.runs ?? []
  const workspaces = snapshot?.workspaces ?? []
  const models = snapshot?.models ?? []
  const permissions = snapshot?.permissions ?? []
  const defaultPermission = snapshot?.defaultPermission ?? ''

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState()
  const [draft, setDraft] = useState()
  const [draftAnchor, setDraftAnchor] = useState()
  const [savedKey, setSavedKey] = useState()
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState()
  const [discard, setDiscard] = useState()
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState()
  const [error, setError] = useState()
  /** 已请求过「标记已读」的 run id，防止轮询回来的同一条未读反复触发写操作。 */
  const markedRuns = useRef(new Set())

  const isActive = visible !== false
  useEffect(() => {
    runtime.setActive(isActive)
  }, [isActive, runtime])

  const now = useMemo(() => new Date(snapshot?.serverNow ?? Date.now()), [snapshot?.serverNow])
  const sorted = useMemo(() => sortMasterTasks(automations), [automations])
  const counts = useMemo(() => countMasterTasks(automations), [automations])
  const filtered = useMemo(
    () => filterMasterTasks(sorted, query, statusFilter),
    [sorted, query, statusFilter],
  )
  const runningIds = useMemo(
    () => new Set(runs.filter(run => run.status === 'running' || run.status === 'queued').map(run => run.automationId)),
    [runs],
  )
  const rows = useMemo(
    () => masterRowViewModels(filtered, t, runningIds),
    [filtered, t, runningIds],
  )

  const selected = useMemo(
    () => automations.find(item => item.id === selectedId),
    [automations, selectedId],
  )
  const baseline = useMemo(
    () => (selected === undefined
      ? undefined
      : formFromAutomation(selected, workspaces, snapshot?.defaultModel ?? null, selected.permission)),
    [selected, workspaces, snapshot?.defaultModel],
  )
  // 锚点 = id + revision：revision 变才说明服务端真的换了版本。
  const baselineKey = selected === undefined ? undefined : `${selected.id}:${selected.revision}`

  // 非破坏式同步：只在锚点变化时把草稿重锚到服务端值。用户正在编辑时 revision 不变，
  // 因此轮询回来的快照不会把输入抹掉。
  useEffect(() => {
    if (baselineKey === undefined) {
      setDraft(undefined)
      setDraftAnchor(undefined)
      return
    }
    if (draftAnchor === baselineKey) return
    setDraft(baseline)
    setDraftAnchor(baselineKey)
  }, [baselineKey, baseline, draftAnchor])

  // 服务端版本一变，此前记录的「已保存」标记就失效——新快照本身就是新基线。
  useEffect(() => {
    setSavedKey(undefined)
  }, [baselineKey])

  // 选中项被删除：右栏自动收起，焦点交回列表。
  useEffect(() => {
    if (selectedId === undefined || snapshot === undefined) return
    if (automations.some(item => item.id === selectedId)) return
    setSelectedId(undefined)
  }, [automations, selectedId, snapshot])

  // 展开详情即把该任务的未读执行记录标记为已读（继承既有语义，不新增 RPC）。
  useEffect(() => {
    if (selectedId === undefined) return
    for (const run of runs) {
      if (run.automationId !== selectedId || run.unread !== true) continue
      if (markedRuns.current.has(run.id)) continue
      markedRuns.current.add(run.id)
      void runtime.markRunRead(run.id).catch((caught) => {
        console.warn('[omnimux-automation] 标记已读失败', caught)
      })
    }
  }, [runs, runtime, selectedId])

  const draftKey = draft === undefined ? undefined : automationDraftKey(draft)
  const cleanKey = baseline === undefined ? undefined : automationDraftKey(baseline)
  const dirty = draftKey !== undefined && cleanKey !== undefined && draftKey !== cleanKey && draftKey !== savedKey

  /**
   * 统一的写操作包装：表单错误 / 传输错误 / 未知错误都收敛到顶部错误条。
   * `targetId` 只用于把「忙碌」精确标到某一行，不参与任何写语义。
   */
  const runAction = async (action, targetId) => {
    setBusy(true)
    setBusyId(targetId)
    setError(undefined)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof AutomationFormError
        ? t(caught.key)
        : isTransportError(caught) ? t('error.offline')
          : caught instanceof Error ? caught.message : t('error.action'))
    } finally {
      setBusy(false)
      setBusyId(undefined)
    }
  }

  const openDetail = (automationId) => {
    if (automationId === selectedId) return
    if (dirty) {
      setDiscard({ kind: 'switch', id: automationId })
      return
    }
    setSelectedId(automationId)
  }

  const closeDetail = () => {
    if (dirty) {
      setDiscard({ kind: 'close' })
      return
    }
    setSelectedId(undefined)
  }

  // Esc：干净就关闭，脏就二次确认；弹窗/确认框在场时不抢键盘。
  useEffect(() => {
    if (selectedId === undefined) return
    if (creating || deleteTarget !== undefined || discard !== undefined) return
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (dirty) setDiscard({ kind: 'close' })
      else setSelectedId(undefined)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [creating, deleteTarget, discard, dirty, selectedId])

  const saveDraft = () => {
    if (draft === undefined || selected === undefined) return
    const key = automationDraftKey(draft)
    void runAction(async () => {
      const input = buildCreateInput(draft, workspaces, models, new Date(), { allowPastOnce: true })
      await runtime.updateAutomation(selected.id, input)
      setSavedKey(key)
    })
  }

  const resetDraft = () => {
    setDraft(baseline)
    setSavedKey(undefined)
  }

  const toggleTask = (automationId) => {
    const task = automations.find(item => item.id === automationId)
    if (task === undefined) return
    void runAction(() => runtime.mutateAutomation(automationId, automationToggleMutation(task.status)), automationId)
  }

  const runTask = (automationId) => {
    void runAction(() => runtime.runNow(automationId), automationId)
  }

  /** 删除入口只拿到 id，二次确认需要任务对象（标题与名称）。 */
  const requestDelete = (automationId) => {
    const task = automations.find(item => item.id === automationId)
    if (task !== undefined) setDeleteTarget(task)
  }

  const applyDiscard = () => {
    const action = discard
    setDiscard(undefined)
    if (action === undefined) return
    if (action.kind === 'switch') setSelectedId(action.id)
    else setSelectedId(undefined)
  }

  /** 把定时任务引导语填进底座主对话输入框；输入框不在页面上时静默返回。 */
  const applyPrefillToChat = () => applyComposerDraft(t('chat.prompt')).catch((caught) => {
    console.warn('[omnimux-automation] 填充主对话草稿失败', caught)
    return false
  })

  const canCreate = defaultPermission !== '' && permissions.length > 0
  const canRun = permissions.length > 0
  const loading = state.phase === 'idle' || (state.phase === 'loading' && snapshot === undefined)
  const history = useMemo(
    () => (selected === undefined ? [] : runHistoryRows(selected, runs, workspaces, t, now)),
    [selected, runs, workspaces, t, now],
  )

  return (
    <div className="dsh-st-wb">
      {error !== undefined && <p className="dsh-st-error dsh-st-md-error">{error}</p>}

      {loading && <p className="dsh-st-muted">{t('loading')}</p>}
      {state.phase === 'error' && snapshot === undefined && (
        <div className="dsh-st-empty">
          <h3>{t('error.title')}</h3>
          <p>{state.error}</p>
          <Button className="dsh-st-btn dsh-st-btn--primary" onClick={() => { void runtime.refresh().catch(() => undefined) }}>
            {t('error.retry')}
          </Button>
        </div>
      )}

      {snapshot !== undefined && (
        <div className="dsh-st-md-root">
          <div className={`dsh-st-md${selected !== undefined ? ' is-open' : ''}`}>
            <TaskMasterList
              t={t}
              rows={rows}
              counts={counts}
              query={query}
              statusFilter={statusFilter}
              {...(selectedId === undefined ? {} : { selectedId })}
              {...(busyId === undefined ? {} : { busyId })}
              canCreate={canCreate}
              onCreate={() => setCreating(true)}
              onChatCreate={() => { void applyPrefillToChat() }}
              onRefresh={() => { void runtime.refresh().catch(() => undefined) }}
              onQueryChange={setQuery}
              onStatusFilterChange={setStatusFilter}
              onClearFilter={() => { setQuery(''); setStatusFilter('all') }}
              onSelect={openDetail}
              onRunNow={runTask}
              onEdit={openDetail}
              onToggle={toggleTask}
              onDelete={requestDelete}
            />
            {selected !== undefined && (
              <>
                <Button
                  className="dsh-st-md-scrim"
                  aria-label={t('detail.close')}
                  onClick={closeDetail}
                />
                <section
                  className="dsh-st-md-detail"
                  role="region"
                  aria-label={t('detail.title')}
                >
                  <TaskDetailPanel
                    key={selected.id}
                    t={t}
                    modelT={modelT}
                    item={selected}
                    draft={draft}
                    dirty={dirty}
                    busy={busy}
                    {...(error === undefined ? {} : { error })}
                    history={history}
                    historyTotal={history.length}
                    historyLimit={HISTORY_LIMIT}
                    workspaces={workspaces}
                    models={models}
                    modelFailures={snapshot.modelFailures ?? []}
                    permissions={permissions}
                    canRun={canRun}
                    onFieldChange={patch => setDraft(current => ({ ...current, ...patch }))}
                    onSave={saveDraft}
                    onReset={resetDraft}
                    onClose={closeDetail}
                    onRunNow={runTask}
                    onEdit={openDetail}
                    onToggle={toggleTask}
                    onDelete={requestDelete}
                    {...(openSession === undefined ? {} : { onOpenSession: openSession })}
                  />
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {creating && (
        <CreateModal
          key="create"
          t={t}
          permissionT={permissionT}
          modelT={modelT}
          busy={busy}
          workspaces={workspaces}
          models={models}
          modelFailures={snapshot?.modelFailures ?? []}
          defaultModel={snapshot?.defaultModel ?? null}
          skills={snapshot?.skills ?? []}
          permissions={permissions}
          defaultPermission={defaultPermission}
          editing={false}
          onClose={() => setCreating(false)}
          onSubmit={async (form) => {
            const input = buildCreateInput(form, workspaces, models, new Date(), { allowPastOnce: false })
            await runAction(async () => {
              await runtime.createAutomation(input)
              setCreating(false)
            })
          }}
        />
      )}

      <DeleteConfirmation
        target={deleteTarget}
        t={t}
        busy={busy}
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={() => {
          const target = deleteTarget
          if (target === undefined) return
          void runAction(async () => {
            await runtime.mutateAutomation(target.id, 'delete')
            setDeleteTarget(undefined)
          })
        }}
      />

      {discard !== undefined && (
        <DiscardConfirmation
          t={t}
          onCancel={() => setDiscard(undefined)}
          onConfirm={applyDiscard}
        />
      )}
    </div>
  )
}
