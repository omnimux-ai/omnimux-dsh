/**
 * 项目库列表页（workbench tab on dsh-better-sidebar）。
 * 顶栏 chrome 遵循 sidebar-extra-entries.md 一级页规范（12px 20px 12px）。
 * 控件消费 dsh-ui-kit；颜色 100% --dsw-alias-* token。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  IconEditOutline16,
  IconPlusOutline16,
  IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, ConfirmModal, Divider, FilterBar, IconButton, PageHeader, SearchField, Tabs } from 'dsh-ui-kit'
import { listProjects, renameProject, deleteProject, bindProjectSession } from '../api.js'
import { injectWorkflowStyles } from '../styles.js'
import { NewLocalProjectDialog } from './NewLocalProjectDialog.jsx'
import { createProjectSession, dismissProductStage, runNewProject } from './newProject.js'
import { activateProjectCanvas } from './projectCanvas.js'

export const WORKFLOW_LIBRARY_TAB_ID = 'omnimux-workflow:library'

function errText(result, t) {
  const code = String(result?.body?.error ?? '')
  if (code === 'no-workspace') return t('projects.noWorkspace')
  return String(result?.body?.message || result?.body?.error || result?.status || t('projects.genericError'))
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   stage?: { getSnapshot: () => boolean, subscribe: Function, set: Function },
 *   store?: { reduce?: Function, getSnapshot?: Function },
 *   visible?: boolean,
 *   sessions?: { create: Function, open: Function },
 *   workspaces?: object,
 *   layout?: { closeDetails?: () => void },
 *   betterSidebar?: object,
 * }} props
 */
export function ProjectLibraryPage(props) {
  const { t, stage, store, visible = true, sessions, workspaces, layout, betterSidebar } = props
  useEffect(() => { injectWorkflowStyles() }, [])

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const [projects, setProjects] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  /** Placeholder library scope tab. Only `local` is wired today. */
  const [libraryTab, setLibraryTab] = useState('local')

  const reload = useCallback(async () => {
    try {
      const res = await listProjects()
      if (res.ok && Array.isArray(res.body?.projects)) {
        setProjects(res.body.projects)
        setError('')
      } else if (!res.ok) {
        setError(errText(res, t))
      }
    } catch (e) {
      setError(String(e?.message || e || t('projects.genericError')))
    }
  }, [t])

  useEffect(() => {
    if (visible) void reload()
  }, [visible, reload])

  const filtered = projects.filter((p) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
  })

  const handleOpenProject = async (project) => {
    dismissProductStage()
    let sessionId = project.sessionId
    if (!sessionId && sessions && typeof sessions.create === 'function') {
      try {
        const created = await createProjectSession(sessions, workspaces, project.title)
        sessionId = created?.id
        if (sessionId) {
          void bindProjectSession(project.id, sessionId)
        }
      } catch (e) {
        console.error('[omnimux-workflow] failed to create project session', e)
      }
    }
    if (sessionId && sessions && typeof sessions.open === 'function') {
      try { sessions.open(sessionId) } catch {}
    }
    await activateProjectCanvas(project.id, {
      layout,
      betterSidebar,
      title: project.title,
      sessionId,
    })
  }

  const handleDialogSubmit = async ({ title, projectRoot }) => {
    setBusy(true)
    setError('')
    try {
      const created = await runNewProject({
        sessions,
        workspaces,
        layout,
        betterSidebar,
        stage,
        t,
      }, { title, projectRoot })
      if (!created?.ok) {
        setError(created?.error || t('projects.genericError'))
        return
      }
      setDialogOpen(false)
      void reload()
    } finally {
      setBusy(false)
    }
  }

  const handleRename = async (project) => {
    const next = window.prompt(t('projects.renamePrompt'), project.title || '')
    if (next === null || next.trim() === '' || next.trim() === project.title) return
    setBusy(true)
    try {
      const res = await renameProject(project.id, next.trim())
      if (res.ok) void reload()
      else setError(errText(res, t))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    setBusy(true)
    try {
      const res = await deleteProject(id)
      if (res.ok) void reload()
      else setError(errText(res, t))
    } finally {
      setBusy(false)
    }
  }

  const handleClose = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(WORKFLOW_LIBRARY_TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  return (
    <div
      role="region"
      aria-label={t('projects.title')}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-workflow-library-page"
      data-visible={visible ? 'true' : 'false'}
      style={{
        display: visible ? 'flex' : 'none',
        position: 'relative',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PageHeader
        title={t('workflow.pageTitle') || 'ComfyUI 工作流'}
        subtitle={t('workflow.pageSubtitle') || '支持本地部署，可手动运行，也可由 Agent 调用'}
        onRefresh={() => { void reload() }}
        refreshing={busy}
        refreshTitle={t('projects.refresh')}
        onClose={handleClose}
        closeTitle={t('projects.close')}
      />
      <div className="omnimux-workflow-library-action-row">
        <Button
          variant="primary"
          leadingIcon={<IconPlusOutline16 />}
          onClick={() => { setDialogOpen(true) }}
        >
          {t('workflow.action.new') || '导入/新建工作流'}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (typeof window !== 'undefined' && window.open) {
              window.open('https://github.com/comfyanonymous/ComfyUI', '_blank')
            }
          }}
        >
          {t('workflow.action.explore') || '📖 探索开源'}
        </Button>
      </div>
      <Divider />
      <FilterBar
        className="omnimux-workflow-library-filter"
        filters={
          <Tabs
            variant="underline"
            items={[
              { id: 'featured', label: t('workflow.tab.featured') || '精选工作流' },
              { id: 'local', label: t('workflow.tab.my') || t('projects.localTab') || '我的工作流' },
            ]}
            activeId={libraryTab}
            onChange={setLibraryTab}
          />
        }
        search={(
          <SearchField
            value={query}
            placeholder={t('projects.searchPlaceholder')}
            onChange={setQuery}
            onClear={() => { setQuery('') }}
          />
        )}
      />
      {error ? <div className="omnimux-workflow-library-error">{error}</div> : null}
      <div className="omnimux-workflow-library-body">
        {libraryTab === 'featured' ? (
          <div className="omnimux-workflow-library-empty">
            <div className="omnimux-workflow-library-empty-title">{t('workflow.featured.title')}</div>
            <div className="omnimux-workflow-library-empty-sub">{t('workflow.featured.subtitle')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="omnimux-workflow-library-empty">
            <div className="omnimux-workflow-library-empty-title">{t('projects.emptyTitle')}</div>
            <div className="omnimux-workflow-library-empty-sub">{t('projects.emptySubtitle')}</div>
            <Button
              variant="primary"
              leadingIcon={<IconPlusOutline16 />}
              onClick={() => { setDialogOpen(true) }}
            >
              {t('projects.newButton')}
            </Button>
          </div>
        ) : (
          <div className="omnimux-workflow-grid">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="omnimux-workflow-card"
                onClick={() => { void handleOpenProject(project) }}
              >
                <div className="omnimux-workflow-card-head">
                  <div className="omnimux-workflow-card-title">{project.title}</div>
                  <div className="omnimux-workflow-card-meta">
                    {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : ''}
                  </div>
                </div>
                {project.description ? (
                  <div className="omnimux-workflow-card-desc">{project.description}</div>
                ) : null}
                <div className="omnimux-workflow-card-actions" onClick={(e) => { e.stopPropagation() }}>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    title={t('projects.rename')}
                    aria-label={t('projects.rename')}
                    onClick={() => { void handleRename(project) }}
                  >
                    <IconEditOutline16 size={14} />
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    title={t('projects.delete')}
                    aria-label={t('projects.delete')}
                    onClick={() => { setPendingDelete(project) }}
                  >
                    <IconTrashOutline16 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {dialogOpen ? (
        <NewLocalProjectDialog
          t={t}
          busy={busy}
          error={error}
          onCancel={() => { if (!busy) setDialogOpen(false) }}
          onSubmit={(payload) => { void handleDialogSubmit(payload) }}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmModal
          open
          onClose={() => { setPendingDelete(null) }}
          title={t('projects.delete')}
          message={t('projects.deleteConfirm').replace('{title}', pendingDelete.title)}
          confirmLabel={t('projects.delete')}
          cancelLabel={t('projects.dialog.cancel')}
          confirmVariant="danger"
          onConfirm={() => { void confirmDelete() }}
        />
      ) : null}
    </div>
  )
}
