/**
 * WorkspaceContextStore — the only client-side truth for «which workspace /
 * project / active page is this conversation looking at».
 *
 * It derives everything from official DSH state:
 *   current session -> session.cwd -> workspaces.list path match -> project by path.
 * No tab.meta, no pickedBySession, no localStorage canvas id participates.
 */
import { useSyncExternalStore } from 'react'
import { findProjectByRoot } from '../api.js'
import { normalizeWorkspacePath } from './cwd.js'

const EMPTY = Object.freeze({
  status: 'loading',
  sessionId: null,
  workspaceId: null,
  workspacePath: null,
  workspaceTitle: null,
  project: null,
  activePage: null,
  error: null,
})

function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  return normalizeWorkspacePath(a) === normalizeWorkspacePath(b)
}

function readSessionId(sessions, sidebarRight) {
  try {
    const mounted = sidebarRight?.mounted?.getSnapshot?.()
    if (typeof mounted === 'string' && mounted) return mounted
  } catch (error) { console.debug('[omnimux-workflow] mounted session unavailable', error) }
  try {
    const current = sessions?.list?.getSnapshot?.()?.current
    return typeof current === 'string' && current ? current : null
  } catch {
    return null
  }
}

function readSessionRow(sessions, sessionId) {
  try {
    return sessions?.list?.getSnapshot?.()?.byId?.[sessionId] ?? null
  } catch {
    return null
  }
}

function readWorkspace(workspaces, cwd) {
  try {
    const items = workspaces?.list?.getSnapshot?.()?.items ?? []
    return items.find((item) => samePath(item?.path, cwd)) ?? null
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

export function createWorkspaceContextStore({
  sessions,
  workspaces,
  getSidebarRight,
  fetchProject = findProjectByRoot,
} = {}) {
  let snapshot = EMPTY
  let disposed = false
  let requestId = 0
  const listeners = new Set()

  const emit = (next) => {
    if (disposed) return
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) {
      try { listener() } catch (error) { console.debug('[omnimux-workflow] workspace context listener failed', error) }
    }
  }

  const refresh = async () => {
    const current = ++requestId
    const sessionId = readSessionId(sessions, getSidebarRight?.())
    if (!sessionId) {
      emit({ ...EMPTY, status: 'no-session' })
      return snapshot
    }
    const row = readSessionRow(sessions, sessionId)
    const workspacePath = typeof row?.cwd === 'string' && row.cwd ? row.cwd : null
    if (!workspacePath) {
      emit({ ...EMPTY, status: 'no-workspace', sessionId })
      return snapshot
    }
    const workspace = readWorkspace(workspaces, workspacePath)
    if (!workspace) {
      emit({ ...EMPTY, status: 'no-workspace', sessionId, workspacePath })
      return snapshot
    }
    const workspaceId = workspace.workspaceId !== undefined && workspace.workspaceId !== null
      ? String(workspace.workspaceId)
      : null
    // Show the workspace immediately; project lookup is async.
    emit({
      status: 'loading-project',
      sessionId,
      workspaceId,
      workspacePath: workspace.path ?? workspacePath,
      workspaceTitle: workspace.title ?? null,
      project: null,
      activePage: null,
      error: null,
    })
    let project = null
    try {
      const result = await fetchProject(workspacePath)
      if (result?.ok) project = result.body?.project ?? null
      else if (result?.status !== 404 && result?.body?.error !== 'not-found') {
        emit({ ...snapshot, status: 'error', error: result?.body?.message || result?.body?.error || 'project lookup failed' })
        return snapshot
      }
    } catch (error) {
      if (current === requestId) {
        emit({ ...snapshot, status: 'error', error: error instanceof Error ? error.message : String(error) })
      }
      return snapshot
    }
    if (disposed || current !== requestId) return snapshot
    const activePage = pickPage(project)
    emit({
      status: project ? 'ready' : 'workspace-no-project',
      sessionId,
      workspaceId,
      workspacePath: workspace.path ?? workspacePath,
      workspaceTitle: workspace.title ?? null,
      project,
      activePage,
      error: null,
    })
    return snapshot
  }

  const unsubscribers = []
  const subscribeOfficial = (store, listener) => {
    try {
      if (store && typeof store.subscribe === 'function') {
        unsubscribers.push(store.subscribe(listener))
      }
    } catch (error) { console.debug('[omnimux-workflow] optional host subscription unavailable', error) }
  }
  subscribeOfficial(sessions?.list, refresh)
  subscribeOfficial(workspaces?.list, refresh)
  subscribeOfficial(getSidebarRight?.()?.mounted, refresh)
  void refresh()

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh,
    dispose() {
      disposed = true
      requestId += 1
      for (const stop of unsubscribers) {
        try { stop?.() } catch (error) { console.debug('[omnimux-workflow] workspace context unsubscribe failed', error) }
      }
      unsubscribers.length = 0
      listeners.clear()
    },
  }
}

export function useWorkspaceContext(store) {
  return useSyncExternalStore(
    (listener) => store?.subscribe?.(listener) ?? (() => {}),
    () => store?.getSnapshot?.() ?? EMPTY,
    () => store?.getSnapshot?.() ?? EMPTY,
  )
}

export function resolveWorkspaceContextPage(project, pageId) {
  return pickPage(project, pageId)
}
