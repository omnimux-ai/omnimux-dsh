/**
 * better-sidebar canvas tab: the workspace-scoped canvas projection.
 *
 * The tab no longer owns a canvas target. WorkspaceContextStore derives the
 * target from the active session's workspace + project + active page; this
 * component only renders it. The old per-session canvas caches and the
 * session-binding side-effect route are intentionally not consulted.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from 'dsh-ui-kit'
import { workspacePathToCanvasId } from '../../shared/sessionWorkspaceId.ts'
import { CanvasBridge, CanvasLoadingState } from '../CanvasBridge.jsx'
import { injectWorkflowStyles } from '../styles.js'
import { NewLocalProjectDialog } from './NewLocalProjectDialog.jsx'
import { runNewProject } from './newProject.js'
import { applyProjectCanvasRatio, CANVAS_TAB_ID, getBetterSidebar } from './projectCanvas.js'
import { resolveWorkspaceContextPage, useWorkspaceContext } from './workspace-context.js'

/** Stable page id for UI Context Envelope (Agent workspace targeting). */
export const CANVAS_PAGE_ID = 'workflow-canvas'

function safeGetService(target, prop) {
  if (!target || typeof target !== 'object') return undefined
  try {
    return target[prop]
  } catch {
    return undefined
  }
}

/**
 * @param {{
 *   ctx: { locale?: { subscribe: Function, getLocale: Function }, betterSidebar?: object },
 *   t: (key: string) => string,
 *   visible: boolean,
 *   store?: { reduce?: Function, getSnapshot?: Function, getPrefs?: Function },
 *   scope?: { sessionId?: string, pageId?: string },
 *   tab?: { id?: string, meta?: { focusGroupId?: unknown, pageId?: unknown } },
 *   sessions?: object,
 *   workspaces?: object,
 *   layout?: object,
 *   betterSidebar?: object,
 *   getSessionNavigation?: () => ({ openSession?: (id: string) => void } | undefined),
 *   workspaceContext?: object,
 * }} props
 */
export function CanvasTab({
  ctx,
  t,
  visible,
  store,
  scope,
  tab,
  sessions: propSessions,
  workspaces: propWorkspaces,
  layout: propLayout,
  betterSidebar: propBetterSidebar,
  getSessionNavigation,
  workspaceContext,
  presence,
}) {
  useEffect(() => { injectWorkflowStyles() }, [])
  const locale = ctx?.locale
  const activeLocale = useSyncExternalStore(
    locale ? (onStoreChange) => locale.subscribe(onStoreChange) : () => () => {},
    () => (locale ? locale.getLocale().active : 'zh'),
  )
  const sessionId = scope?.sessionId
  const context = useWorkspaceContext(workspaceContext)
  const contextForThisSession = context.sessionId === sessionId ? context : null
  const project = contextForThisSession?.project ?? null
  const metaPageId = typeof tab?.meta?.pageId === 'string' ? tab.meta.pageId : undefined
  const pageId = metaPageId || (typeof scope?.pageId === 'string' ? scope.pageId : undefined)
  const activePage = project ? resolveWorkspaceContextPage(project, pageId) : null
  const scratchWorkspaceId = !project && contextForThisSession?.workspacePath
    ? workspacePathToCanvasId(contextForThisSession.workspacePath)
    : undefined
  const targetWorkspaceId = activePage?.canvasWorkspaceId || scratchWorkspaceId
  const hasSession = typeof sessionId === 'string' && sessionId !== ''
  const contextReady = !workspaceContext || contextForThisSession !== null
  const isUnprojected = Boolean(
    hasSession
    && contextReady
    && contextForThisSession
    && (contextForThisSession.status === 'workspace-no-project' || contextForThisSession.status === 'no-workspace'),
  )
  const isLoading = !contextReady || (contextForThisSession?.status === 'loading-project' && !project)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [autoPromptedSession, setAutoPromptedSession] = useState(null)

  useEffect(() => {
    if (visible && isUnprojected && autoPromptedSession !== sessionId) {
      setAutoPromptedSession(sessionId)
      setProjectDialogOpen(true)
    }
  }, [visible, isUnprojected, autoPromptedSession, sessionId])

  const focusGroupId = typeof tab?.meta?.focusGroupId === 'string' ? tab.meta.focusGroupId : undefined

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  // Contribute session-bound canvas workspaceId into the UI Context Envelope.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.registerContextContributor !== 'function') return undefined
    if (!targetWorkspaceId) return undefined
    const unsub = api.registerContextContributor(CANVAS_TAB_ID, () => ({
      view: {
        kind: 'canvas',
        pageId: CANVAS_PAGE_ID,
        extra: { workspaceId: targetWorkspaceId },
      },
      selection: [],
    }))
    return () => {
      if (typeof unsub === 'function') unsub()
      else api.unregisterContextContributor?.(CANVAS_TAB_ID)
    }
  }, [targetWorkspaceId])

  useEffect(() => {
    if (!visible || !sessionId) return undefined
    let cancelled = false
    let timer = 0
    let attempts = 0
    const tick = (force = false) => {
      if (cancelled) return
      if (typeof document !== 'undefined' && (document.body?.hasAttribute('data-dsh-sidebar-dragging') || document.querySelector?.('[data-dragging]'))) {
        return
      }
      const activeSidebar = propBetterSidebar || getBetterSidebar(ctx)
      const result = applyProjectCanvasRatio(activeSidebar, sessionId, store, {}, force)
      if (result === undefined && attempts < 80) {
        attempts += 1
        timer = window.setTimeout(() => tick(force), 50)
      }
    }
    tick()

    let sidebarObserver = null
    let lastSidebarWidth = null
    try {
      const sidebarEl = typeof document !== 'undefined'
        ? document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
        : null
      if (sidebarEl && typeof ResizeObserver === 'function') {
        sidebarObserver = new ResizeObserver(() => {
          if (cancelled) return
          if (typeof document !== 'undefined' && (document.body?.hasAttribute('data-dsh-sidebar-dragging') || document.querySelector?.('[data-dragging]'))) {
            return
          }
          const w = Math.round(sidebarEl.getBoundingClientRect().width)
          if (lastSidebarWidth !== null && Math.abs(w - lastSidebarWidth) < 2) return
          lastSidebarWidth = w
          tick(false)
        })
        sidebarObserver.observe(sidebarEl)
      }
    } catch {
      // ignore optional observer failures
    }

    const onResize = () => {
      if (!cancelled) tick(false)
    }
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      sidebarObserver?.disconnect?.()
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize)
    }
  }, [visible, sessionId, store, ctx, propBetterSidebar])

  const onClose = useCallback(() => {}, [])

  return (
    <div
      data-omnimux-canvas-tab=""
      className="omnimux-workflow-canvas-tab"
      data-visible={visible ? 'true' : 'false'}
    >
      <div className="omnimux-workflow-canvas-body">
        {isUnprojected ? (
          <div className="omnimux-workflow-canvas-unprojected">
            {createError ? <div className="omnimux-workflow-library-error">{createError}</div> : null}
            <div className="omnimux-workflow-unprojected-title">
              {(() => {
                const val = t('canvas.unprojectedTitle')
                return !val || val === 'canvas.unprojectedTitle' ? '当前工作区尚未创建项目' : val
              })()}
            </div>
            <div className="omnimux-workflow-unprojected-sub">
              {(() => {
                const val = t('canvas.unprojectedSub')
                return !val || val === 'canvas.unprojectedSub' ? '在一个工作区开启创作画布，需要先创建项目档案并生成初始创作页。' : val
              })()}
            </div>
            <Button variant="primary" onClick={() => { setProjectDialogOpen(true) }}>
              {t('projects.newButton') || '新建项目'}
            </Button>
          </div>
        ) : targetWorkspaceId && !isLoading ? (
          <CanvasBridge
            onClose={onClose}
            t={t}
            locale={activeLocale}
            workspaceId={targetWorkspaceId}
            focusGroupId={focusGroupId}
            onActivePageChange={() => { void workspaceContext?.refresh?.() }}
          />
        ) : (
          <CanvasLoadingState t={t} />
        )}
      </div>

      {projectDialogOpen ? (
        <NewLocalProjectDialog
          t={t}
          busy={busy}
          error={createError}
          initialPath={contextForThisSession?.workspacePath || ''}
          initialTitle=""
          onCancel={() => { if (!busy) setProjectDialogOpen(false) }}
          onSubmit={async (payload) => {
            setBusy(true)
            setCreateError('')
            try {
              const effectiveSessions = propSessions
                || safeGetService(ctx, 'sessions')
                || (typeof window !== 'undefined' ? window.__omnimuxWorkflow?.sessions || window.__omnimuxSessions : undefined)
              const effectiveWorkspaces = propWorkspaces
                || safeGetService(ctx, 'workspaces')
                || (typeof window !== 'undefined' ? window.__omnimuxWorkflow?.workspaces || window.__omnimuxWorkspaces : undefined)
              const effectiveLayout = propLayout
                || safeGetService(ctx, 'layout')
                || (typeof window !== 'undefined' ? window.__omnimuxWorkflow?.layout : undefined)
              const effectiveSidebar = propBetterSidebar || getBetterSidebar(ctx)
              const res = await runNewProject(
                {
                  sessions: effectiveSessions,
                  workspaces: effectiveWorkspaces,
                  layout: effectiveLayout,
                  betterSidebar: effectiveSidebar,
                  cordis: ctx,
                  getSessionNavigation,
                  t,
                },
                payload,
              )
              if (!res?.ok) {
                setCreateError(res?.error || t('projects.genericError') || '创建失败')
                return res
              }
              setProjectDialogOpen(false)
              if (res.canvasOpened === false) {
                setCreateError(t('projects.canvasNotOpened') || '项目已创建，但创作画布未能打开，请重试。')
              }
              presence?.markVisible?.(res.project?.path || contextForThisSession?.workspacePath)
              await workspaceContext?.refresh?.()
              return res
            } catch (err) {
              setCreateError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}
