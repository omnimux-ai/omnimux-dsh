import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from './controls.jsx'
import { CreateModal } from './create-modal.jsx'
import { DeleteConfirmation } from './delete-confirmation.jsx'
import { RefreshIcon } from './icons.jsx'
import {
  AutomationFormError,
  buildCreateInput,
  formFromAutomation,
} from './helpers.js'
import { isTransportError } from './runtime.js'
import { groupAutomationRuns } from './schedule-model.js'
import { ScheduleOverviewView } from './ScheduleOverviewView.jsx'
import { ScheduleRunsView } from './ScheduleRunsView.jsx'
import { ScheduleViewSwitch } from './ScheduleViewSwitch.jsx'

/**
 * 右侧工作台容器。
 *
 * 顶部常驻胶囊分段开关，内容区在【执行记录】与【任务总览】之间切换；视图切换只替换内容区，
 * 不重挂载容器与弹窗宿主。`visible` 由社区 Tab 透传，面板收起或 Tab 未激活时停表。
 *
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
  const [view, setView] = useState('runs')
  const [folded, setFolded] = useState({})
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState()
  const [draft, setDraft] = useState()
  const [deleteTarget, setDeleteTarget] = useState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()

  const isActive = visible !== false
  useEffect(() => {
    runtime.setActive(isActive)
  }, [isActive, runtime])

  const snapshot = state.snapshot
  const automations = snapshot?.automations ?? []
  const workspaces = snapshot?.workspaces ?? []
  const models = snapshot?.models ?? []
  const permissions = snapshot?.permissions ?? []
  const defaultPermission = snapshot?.defaultPermission ?? ''
  const groups = useMemo(
    () => (snapshot === undefined ? [] : groupAutomationRuns(automations, snapshot.runs)),
    [automations, snapshot],
  )

  const runAction = async (action) => {
    setBusy(true)
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
    }
  }

  const closeModal = () => {
    setCreating(false)
    setDraft(undefined)
    setEditingId(undefined)
  }

  const openCreate = () => {
    if (defaultPermission === '' || permissions.length === 0) return
    setEditingId(undefined)
    setDraft(undefined)
    setCreating(true)
  }

  const openEdit = (item) => {
    setEditingId(item.id)
    setDraft(formFromAutomation(item, workspaces, snapshot?.defaultModel ?? null, defaultPermission || item.permission))
    setCreating(true)
  }

  const toggleFold = (automationId) => {
    setFolded(current => ({ ...current, [automationId]: !current[automationId] }))
  }

  const markRead = (runId) => {
    void runtime.markRunRead(runId).catch((caught) => {
      console.warn('[omnimux-automation] 标记已处理失败', caught)
    })
  }

  const canCreate = defaultPermission !== '' && permissions.length > 0
  const loading = state.phase === 'idle' || (state.phase === 'loading' && snapshot === undefined)

  return (
    <div className="dsh-st-wb">
      <div className="dsh-st-wb-head">
        <div className="dsh-st-wb-title">
          <strong>{t('nav')}</strong>
          <span className="dsh-st-wb-count" aria-label={`${automations.length}`}>{automations.length}</span>
        </div>
        <div className="dsh-st-wb-actions">
          <Button
            className="dsh-st-btn dsh-st-btn--primary"
            disabled={!canCreate}
            onClick={openCreate}
          >{t('action.create')}</Button>
          <Button
            className="dsh-st-icon"
            aria-label={t('section.refresh')}
            onClick={() => { void runtime.refresh().catch(() => undefined) }}
          ><RefreshIcon width={16} height={16} /></Button>
        </div>
      </div>

      <ScheduleViewSwitch t={t} view={view} onChange={setView} />

      {error !== undefined && <p className="dsh-st-error">{error}</p>}
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
        view === 'runs'
          ? (
            <ScheduleRunsView
              t={t}
              groups={groups}
              folded={folded}
              onToggleFold={toggleFold}
              onMarkRead={markRead}
              {...(openSession === undefined ? {} : { openSession })}
            />
          )
          : (
            <ScheduleOverviewView
              t={t}
              automations={automations}
              serverNow={snapshot.serverNow}
              onCreate={canCreate ? openCreate : undefined}
              onToggle={(automationId, mutation) => runtime.mutateAutomation(automationId, mutation)}
              onRunNow={(automationId) => runtime.runNow(automationId)}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          )
      )}

      {creating && (
        <CreateModal
          key={editingId ?? 'create'}
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
          editing={editingId !== undefined}
          {...(draft === undefined ? {} : { draft })}
          onClose={closeModal}
          onSubmit={async (form) => {
            const input = buildCreateInput(form, workspaces, models, new Date(), {
              allowPastOnce: editingId !== undefined,
            })
            await runAction(async () => {
              if (editingId === undefined) await runtime.createAutomation(input)
              else await runtime.updateAutomation(editingId, input)
              closeModal()
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
    </div>
  )
}
