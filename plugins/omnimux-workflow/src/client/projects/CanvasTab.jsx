/**
 * better-sidebar 画布 tab：宿主 React 18 壳里挂 CanvasBridge（React 19 island）。
 * 第三方 tab 只给 DOM 容器；双 React 树边界仍是 CanvasBridge 的硬规则。
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from 'dsh-ui-kit'
import { resolveEffectiveWorkspaceId, sessionToWorkspaceId } from '../../shared/sessionWorkspaceId.ts'
import { CanvasBridge } from '../CanvasBridge.jsx'
import { fetchSessionProjectBinding } from '../api.js'
import { injectWorkflowStyles } from '../styles.js'
import { NewLocalProjectDialog } from './NewLocalProjectDialog.jsx'
import { runNewProject } from './newProject.js'
import { applyProjectCanvasRatio, CANVAS_TAB_ID, getBetterSidebar, resolveCanvasTargetWorkspaceId } from './projectCanvas.js'

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
 *   scope?: { sessionId?: string },
 *   tab?: { id?: string, meta?: { focusGroupId?: unknown } },
 *   sessions?: object,
 *   workspaces?: object,
 *   layout?: object,
 *   betterSidebar?: object,
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
}) {
  useEffect(() => { injectWorkflowStyles() }, [])
  const locale = ctx?.locale
  const activeLocale = useSyncExternalStore(
    locale ? (onStoreChange) => locale.subscribe(onStoreChange) : () => () => {},
    () => (locale ? locale.getLocale().active : 'zh'),
  )
  const sessionId = scope?.sessionId
  // 「最近选中的创作页」按会话记账：换工作区（=换会话）即失效，画布才会跟着工作区走。
  // 旧实现从 localStorage 直接取全局值，导致切工作区后画布停在别的项目的创作页（Issue #2104）。
  const [pickedBySession, setPickedBySession] = useState(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('omnimux:latest-active-canvas') : null
      // sessionId 未知：只作最低优先级兜底，不参与「本会话」匹配。
      return raw ? { sessionId: null, workspaceId: raw } : null
    } catch {
      return null
    }
  })

  // 比对 tab.meta 与当前会话是否匹配：若存在 canvasSessionId，则必须与当前 sessionId 严格一致；
  // 会话切换时清理并阻断非本会话的 tab.meta 反向渗透。
  const isTabMetaValidForSession = (meta, currentSessionId) => {
    if (!meta?.canvasWorkspaceId) return false
    if (meta.canvasSessionId && currentSessionId && meta.canvasSessionId !== currentSessionId) {
      return false
    }
    return true
  }

  // 记录主动接收到的最新画布工作区 ID（来自 active-canvas-changed 事件或 tab.meta）
  const [activeCanvasWsId, setActiveCanvasWsId] = useState(() => {
    if (isTabMetaValidForSession(tab?.meta, sessionId)) {
      return tab.meta.canvasWorkspaceId
    }
    return scope?.canvasWorkspaceId || null
  })

  useEffect(() => {
    setActiveCanvasWsId(null)
  }, [sessionId])

  useEffect(() => {
    if (isTabMetaValidForSession(tab?.meta, sessionId)) {
      setActiveCanvasWsId(tab.meta.canvasWorkspaceId)
    } else {
      setActiveCanvasWsId(null)
    }
  }, [tab?.meta?.canvasWorkspaceId, tab?.meta?.canvasSessionId, sessionId])

  useEffect(() => {
    const handler = (e) => {
      const eventSessionId = e?.detail?.sessionId
      if (sessionId && eventSessionId !== sessionId) {
        return
      }
      const wsId = e?.detail?.workspaceId
      if (!wsId) return
      setActiveCanvasWsId(wsId)
      setPickedBySession({ sessionId: sessionId ?? null, workspaceId: wsId })
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('omnimux:latest-active-canvas', wsId)
        }
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('omnimux:active-canvas-changed', handler)
      return () => window.removeEventListener('omnimux:active-canvas-changed', handler)
    }
    return undefined
  }, [sessionId])

  // 会话所属项目的当前创作页。宿主按「作品库内工作区始终有项目」解析，缺失即登记；
  // 库外工作区返回 outside-library，此时退回会话散列画布。
  const [sessionBinding, setSessionBinding] = useState(null)
  useEffect(() => {
    if (!sessionId) {
      setSessionBinding(null)
      return undefined
    }
    let cancelled = false
    const refreshBinding = () => {
      fetchSessionProjectBinding(sessionId)
        .then((result) => {
          if (cancelled) return
          const canvasWorkspaceId = result?.body?.project?.canvasWorkspaceId
          setSessionBinding({
            sessionId,
            canvasWorkspaceId: typeof canvasWorkspaceId === 'string' ? canvasWorkspaceId : null,
            project: result?.body?.project ?? null,
            workspaceDir: typeof result?.body?.workspaceDir === 'string' ? result.body.workspaceDir : null,
          })
        })
        .catch(() => {
          if (!cancelled) setSessionBinding({ sessionId, canvasWorkspaceId: null, project: null })
        })
    }

    refreshBinding()

    const onCanvasChanged = (e) => {
      const eventSessionId = e?.detail?.sessionId
      if (sessionId && eventSessionId !== sessionId) {
        return
      }
      if (!cancelled) refreshBinding()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('omnimux:active-canvas-changed', onCanvasChanged)
    }

    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('omnimux:active-canvas-changed', onCanvasChanged)
      }
    }
  }, [sessionId, visible])

  // 优先级：显式 scope（从项目页点某创作页进来）> 本会话内用户选中的创作页 >
  // 本会话所属项目的当前创作页 > 会话散列画布。换工作区时前两项均失效，画布随之切换。
  const validTabWsId = isTabMetaValidForSession(tab?.meta, sessionId)
    ? (sessionId && typeof tab?.meta?.canvasWorkspaceId === 'string' ? tab.meta.canvasWorkspaceId : undefined)
    : undefined
  const explicitWorkspaceId = scope?.canvasWorkspaceId || scope?.workspaceId || activeCanvasWsId || validTabWsId
  const targetWorkspaceId = resolveCanvasTargetWorkspaceId({
    explicitWorkspaceId,
    tab,
    pickedBySession,
    sessionBinding,
    sessionId,
    fallbackWorkspaceId: resolveEffectiveWorkspaceId(sessionId),
  })

  const hasSession = typeof sessionId === 'string' && sessionId !== ''
  const isPickedForSession = Boolean(hasSession && pickedBySession && pickedBySession.sessionId === sessionId && pickedBySession.workspaceId)
  const hasExplicitCanvas = Boolean(
    scope?.canvasWorkspaceId ||
    scope?.workspaceId ||
    activeCanvasWsId ||
    validTabWsId ||
    (sessionId && tab?.meta?.canvasWorkspaceId) ||
    isPickedForSession ||
    sessionBinding?.canvasWorkspaceId
  )
  const isUnprojected = Boolean(sessionId && sessionBinding && sessionBinding.project === null && !hasExplicitCanvas)
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

  // 「项目」页「AI应用」卡片「编辑」的目标工作流组：走 better-sidebar tab.meta
  // （契约字段，随布局持久化，可 live 更新）。画布 tab 是 single:true，
  // 已打开时重复 openTab 不会带上新 meta，必须由 activateProjectCanvas 用
  // updateTab 覆盖；tab 对象换引用后 tabContentCompare 会让本组件重渲。
  const focusGroupId = typeof tab?.meta?.focusGroupId === 'string' ? tab.meta.focusGroupId : undefined

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  // Contribute session-bound canvas workspaceId into the UI Context Envelope so
  // Agents can target the current canvas without workflow_list / ask_user_question.
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
      // Never apply ratio while user is actively dragging divider
      if (typeof document !== 'undefined' && (document.body?.hasAttribute('data-dsh-sidebar-dragging') || document.querySelector?.('[data-dragging]'))) {
        return
      }
      // 没有 tab store.reduce 时 apply 只写盘，返回 undefined，必须继续等。
      const activeSidebar = propBetterSidebar || getBetterSidebar(ctx)
      const result = applyProjectCanvasRatio(activeSidebar, sessionId, store, {}, force)
      if (result === undefined && attempts < 80) {
        attempts += 1
        timer = window.setTimeout(() => tick(force), 50)
      }
    }
    tick()

    // 监听左侧侧边栏宽度变化（折叠/展开）以及窗口 resize
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
      // ignore
    }

    const onResize = () => {
      if (!cancelled) {
        if (typeof document !== 'undefined' && (document.body?.hasAttribute('data-dsh-sidebar-dragging') || document.querySelector?.('[data-dragging]'))) {
          return
        }
        tick(false)
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize)
    }

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      sidebarObserver?.disconnect?.()
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize)
      }
    }
  }, [visible, sessionId, store, ctx, propBetterSidebar])

  // 关闭走面板自己的 × / tab 关闭，不调 layout.closeDetails。
  // 必须稳定引用：CanvasBridge 虽已不再因 onClose 卸岛，但仍走 updateCanvas。
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
            <div className="omnimux-workflow-unprojected-title">
              {(() => {
                const val = t('canvas.unprojectedTitle');
                return !val || val === 'canvas.unprojectedTitle' ? '当前工作区尚未创建项目' : val;
              })()}
            </div>
            <div className="omnimux-workflow-unprojected-sub">
              {(() => {
                const val = t('canvas.unprojectedSub');
                return !val || val === 'canvas.unprojectedSub' ? '在一个工作区开启创作画布，需要先创建项目档案并生成初始创作页。' : val;
              })()}
            </div>
            <Button
              variant="primary"
              onClick={() => { setProjectDialogOpen(true) }}
            >
              {t('projects.newButton') || '新建项目'}
            </Button>
          </div>
        ) : targetWorkspaceId ? (
          <CanvasBridge onClose={onClose} t={t} locale={activeLocale} workspaceId={targetWorkspaceId} focusGroupId={focusGroupId} />
        ) : (
          <div className="omnimux-workflow-canvas-status">
            {t('canvas.loading')}
          </div>
        )}
      </div>

      {projectDialogOpen ? (
        <NewLocalProjectDialog
          t={t}
          busy={busy}
          error={createError}
          initialPath={sessionBinding?.workspaceDir || ''}
          initialTitle=""
          onCancel={() => {
            if (!busy) setProjectDialogOpen(false)
          }}
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
              const effectiveSidebar = propBetterSidebar
                || getBetterSidebar(ctx)

              const res = await runNewProject(
                {
                  sessions: effectiveSessions,
                  workspaces: effectiveWorkspaces,
                  layout: effectiveLayout,
                  betterSidebar: effectiveSidebar,
                  t,
                },
                payload
              )
              if (!res?.ok) {
                setCreateError(res?.error || t('projects.genericError') || '创建失败')
                return res
              }
              setProjectDialogOpen(false)
              if (sessionId) {
                const updated = await fetchSessionProjectBinding(sessionId)
                const canvasWorkspaceId = updated?.body?.project?.canvasWorkspaceId
                setSessionBinding({
                  sessionId,
                  canvasWorkspaceId: typeof canvasWorkspaceId === 'string' ? canvasWorkspaceId : null,
                  project: updated?.body?.project ?? null,
                  workspaceDir: updated?.body?.workspaceDir,
                })
              }
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
