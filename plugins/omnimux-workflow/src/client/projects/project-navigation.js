/**
 * ProjectNavigationService — one entry point for every project/canvas open.
 *
 * Workspace is the anchor: project.path -> WorkspaceView -> one live session
 * in that workspace -> official uiWorkspace.openSession -> canvas tab.
 * No project.sessionId and no ungrouped session creation are allowed here.
 */
import { updateProjectPage } from '../api.js'
import { normalizeWorkspacePath } from './cwd.js'
import { activateProjectCanvas, focusSessionForCanvas } from './projectCanvas.js'

function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  return normalizeWorkspacePath(a) === normalizeWorkspacePath(b)
}

function readCurrentSessionId(sessions, getSidebarRight) {
  try {
    const mounted = getSidebarRight?.()?.mounted?.getSnapshot?.()
    if (typeof mounted === 'string' && mounted) return mounted
  } catch (error) { console.debug('[omnimux-workflow] mounted session unavailable', error) }
  try {
    const current = sessions?.list?.getSnapshot?.()?.current
    return typeof current === 'string' && current ? current : null
  } catch {
    return null
  }
}

function readArchivedIds(sessions) {
  try {
    return sessions?.list?.getSnapshot?.()?.archivedSessionIds ?? []
  } catch {
    return []
  }
}

function readSessionList(sessions) {
  try {
    const snapshot = sessions?.list?.getSnapshot?.()
    return {
      byId: snapshot?.byId ?? {},
      archived: new Set(readArchivedIds(sessions)),
    }
  } catch {
    return { byId: {}, archived: new Set() }
  }
}

function findWorkspaceByPath(workspaces, path) {
  try {
    const items = workspaces?.list?.getSnapshot?.()?.items ?? []
    return items.find((item) => samePath(item?.path, path)) ?? null
  } catch {
    return null
  }
}

function pickPage(project, pageId) {
  if (!project || !Array.isArray(project.pages)) return null
  if (pageId) {
    const exact = project.pages.find((page) => page?.id === pageId)
    if (exact) return exact
  }
  const active = project.pages.find((page) => page?.id === project.activePageId)
  return active ?? project.pages[0] ?? null
}

function sessionBelongsToWorkspace(sessionId, workspace, sessions, archive) {
  if (!sessionId || archive.has(sessionId)) return false
  let row
  try {
    row = sessions?.list?.getSnapshot?.()?.byId?.[sessionId]
  } catch {
    return false
  }
  if (!row) return false
  if (row.cwd && !samePath(row.cwd, workspace.path)) return false
  if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(sessionId)) return true
  return samePath(row.cwd, workspace.path)
}

function orderedWorkspaceSessions(workspace, sessions) {
  const { byId, archived } = readSessionList(sessions)
  const ids = Array.isArray(workspace?.sessionIds) ? workspace.sessionIds : []
  const live = ids
    .filter((id) => id && !archived.has(id) && byId[id])
    .sort((a, b) => (byId[b]?.updatedAt ?? 0) - (byId[a]?.updatedAt ?? 0))
  // Prefer a session that actually has a conversation over a fresh blank slot.
  const nonBlank = live.filter((id) => byId[id]?.blank !== true)
  return nonBlank.length > 0 ? nonBlank : live
}

export function createProjectNavigation({
  sessions,
  workspaces,
  layout,
  betterSidebar,
  getSessionNavigation,
  getSidebarRight,
  t,
  presence,
  activateCanvas = activateProjectCanvas,
} = {}) {
  const resolveWorkspace = async (project) => {
    const path = typeof project?.path === 'string' ? project.path.trim() : ''
    if (!path) return { ok: false, error: 'missing-project-path' }
    const existing = findWorkspaceByPath(workspaces, path)
    if (existing) return { ok: true, workspace: existing }
    if (!workspaces || typeof workspaces.create !== 'function') {
      return { ok: false, error: 'no-workspace-service' }
    }
    let failure = null
    let created = null
    try {
      created = await workspaces.create({ path })
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (failure) return { ok: false, error: failure }
    const createdId = created?.workspaceId !== undefined && created?.workspaceId !== null
      ? String(created.workspaceId)
      : null
    const resolved = findWorkspaceByPath(workspaces, path)
    const workspace = resolved ?? {
      workspaceId: createdId,
      path,
      title: project?.title ?? null,
      sessionIds: [],
    }
    if (!workspace.workspaceId) return { ok: false, error: 'workspace-create-failed' }
    return { ok: true, workspace }
  }

  const pickSession = async (workspace) => {
    const current = readCurrentSessionId(sessions, getSidebarRight)
    const { archived } = readSessionList(sessions)
    if (sessionBelongsToWorkspace(current, workspace, sessions, archived)) return { ok: true, sessionId: current }
    const ordered = orderedWorkspaceSessions(workspace, sessions)
    if (ordered[0]) return { ok: true, sessionId: ordered[0] }
    if (!sessions || typeof sessions.create !== 'function') return { ok: false, error: 'no-session-service' }
    let failure = null
    let sessionId = null
    try {
      sessionId = await sessions.create({ workspaceId: workspace.workspaceId })
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (failure) return { ok: false, error: failure }
    if (typeof sessionId !== 'string' || !sessionId) return { ok: false, error: 'session-create-failed' }
    return { ok: true, sessionId }
  }

  const openProject = async (project, options = {}) => {
    const resolved = await resolveWorkspace(project)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const targetPage = pickPage(project, options.pageId)
    if (options.pageId && project?.id) {
      const updated = await updateProjectPage(project.id, options.pageId, { active: true })
      if (!updated?.ok) return { ok: false, error: updated?.body?.message || updated?.body?.error || 'page-activate-failed' }
    }
    const picked = await pickSession(resolved.workspace)
    if (!picked.ok) return { ok: false, error: picked.error }
    const opened = await activateCanvas(
      { layout, betterSidebar, t, sessions, getSessionNavigation, getSidebarRight },
      {
        sessionId: picked.sessionId,
        cwd: resolved.workspace.path,
        projectId: project?.id,
        pageId: targetPage?.id,
        title: targetPage?.title || project?.title,
        canvasWorkspaceId: targetPage?.canvasWorkspaceId,
        focusGroupId: options.focusGroupId,
      },
    )
    if (opened) presence?.markVisible?.(resolved.workspace.path)
    return {
      ok: Boolean(opened),
      sessionId: picked.sessionId,
      workspace: resolved.workspace,
      page: targetPage,
    }
  }

  const openPage = (project, page, options = {}) => openProject(project, { ...options, pageId: page?.id })

  /**
   * Switch the main conversation to the project workspace without opening the
   * canvas. Useful for the project library's detail view.
   */
  const focusWorkspace = async (project) => {
    const resolved = await resolveWorkspace(project)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const picked = await pickSession(resolved.workspace)
    if (!picked.ok) return { ok: false, error: picked.error }
    const focused = focusSessionForCanvas(
      { sessions, getSessionNavigation },
      picked.sessionId,
      betterSidebar,
    )
    if (!focused) return { ok: false, error: 'session-navigation-unavailable' }
    return { ok: true, sessionId: picked.sessionId, workspace: resolved.workspace }
  }

  return { resolveWorkspace, pickSession, openProject, openPage, focusWorkspace }
}
