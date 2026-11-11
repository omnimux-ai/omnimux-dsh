/**
 * CanvasPresenceController — keeps the creative-canvas tab tied to the
 * workspace, not to a single conversation.
 *
 * dsh-better-sidebar still stores tabs per session. This controller materialises
 * the workspace-level canvas into whichever session becomes active, when the
 * workspace has a project and the user has the canvas open for that workspace.
 */
import { findProjectByRoot } from '../api.js'
import { normalizeWorkspacePath } from './cwd.js'
import { activateProjectCanvas } from './projectCanvas.js'

export const CANVAS_TAB_ID = 'omnimux-workflow:canvas'
const VISIBLE_KEY_PREFIX = 'omnimux.canvas.visible.v1:'

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function canvasVisibleForWorkspace(workspacePath) {
  if (typeof workspacePath !== 'string' || !workspacePath) return false
  try {
    return storage()?.getItem(`${VISIBLE_KEY_PREFIX}${workspacePath}`) === 'true'
  } catch {
    return false
  }
}

export function markCanvasVisible(workspacePath) {
  if (typeof workspacePath !== 'string' || !workspacePath) return
  try { storage()?.setItem(`${VISIBLE_KEY_PREFIX}${workspacePath}`, 'true') } catch (error) { console.warn('[omnimux-workflow] canvas visibility persist failed', error) }
}

export function markCanvasHidden(workspacePath) {
  if (typeof workspacePath !== 'string' || !workspacePath) return
  try { storage()?.setItem(`${VISIBLE_KEY_PREFIX}${workspacePath}`, 'false') } catch (error) { console.warn('[omnimux-workflow] canvas visibility persist failed', error) }
}

function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  return normalizeWorkspacePath(a) === normalizeWorkspacePath(b)
}

function currentSessionId(sessions, sidebarRight) {
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
  try { return sessions?.list?.getSnapshot?.()?.byId?.[sessionId] ?? null } catch { return null }
}

function findWorkspaceByPath(workspaces, path) {
  try {
    const items = workspaces?.list?.getSnapshot?.()?.items ?? []
    return items.find((item) => samePath(item?.path, path)) ?? null
  } catch {
    return null
  }
}

function hasCanvasTab(snapshot) {
  const state = snapshot?.state
  if (!state) return false
  const walk = (node) => {
    if (!node || typeof node !== 'object') return false
    if (node.kind === 'leaf') return Array.isArray(node.tabs) && node.tabs.some((tab) => tab?.type === CANVAS_TAB_ID || tab?.id === CANVAS_TAB_ID)
    return Array.isArray(node.children) && node.children.some(walk)
  }
  return walk(state.splits) || walk(state.bottomSplits)
}

export function createCanvasPresence({
  sessions,
  workspaces,
  getSidebarRight,
  getSessionNavigation,
  betterSidebar,
  layout,
  t,
  fetchProject = findProjectByRoot,
  activateCanvas = activateProjectCanvas,
} = {}) {
  let disposed = false
  let opening = false
  let lastEnsuredKey = null
  let timer = 0
  const unsubscribers = []

  const ensureCanvasForCurrentSession = async () => {
    if (disposed || opening) return
    const sessionId = currentSessionId(sessions, getSidebarRight)
    if (!sessionId) return
    const row = readSessionRow(sessions, sessionId)
    const workspacePath = typeof row?.cwd === 'string' ? row.cwd : ''
    if (!workspacePath) return
    const workspace = findWorkspaceByPath(workspaces, workspacePath)
    if (!workspace) return
    if (!canvasVisibleForWorkspace(workspacePath)) return
    const service = betterSidebar
    const snapshot = service?.getSnapshot?.()
    if (snapshot?.sessionId !== sessionId) return
    if (hasCanvasTab(snapshot)) {
      lastEnsuredKey = `${sessionId}\u0000${workspacePath}`
      return
    }
    let project = null
    const result = await fetchProject(workspacePath)
    if (result?.ok) project = result.body?.project ?? null
    if (!project) return
    const pages = Array.isArray(project.pages) ? project.pages : []
    const page = pages.find((item) => item?.id === project.activePageId) ?? pages[0] ?? null
    if (!page?.canvasWorkspaceId) return
    const key = `${sessionId}\u0000${workspacePath}\u0000${page.canvasWorkspaceId}`
    if (lastEnsuredKey === key) return
    opening = true
    try {
      const opened = await activateCanvas(
        { layout, betterSidebar, t, sessions, getSessionNavigation, getSidebarRight },
        {
          sessionId,
          cwd: workspacePath,
          projectId: project.id,
          pageId: page.id,
          title: page.title || project.title,
          canvasWorkspaceId: page.canvasWorkspaceId,
        },
      )
      if (opened) lastEnsuredKey = key
    } catch (error) {
      console.warn('[omnimux-workflow] canvas presence sync failed', error)
    } finally {
      opening = false
    }
  }

  const schedule = () => {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(() => { void ensureCanvasForCurrentSession() }, 80)
  }

  const subscribe = (store) => {
    try {
      if (store && typeof store.subscribe === 'function') unsubscribers.push(store.subscribe(schedule))
    } catch (error) { console.debug('[omnimux-workflow] optional host subscription unavailable', error) }
  }
  subscribe(sessions?.list)
  subscribe(workspaces?.list)
  subscribe(getSidebarRight?.()?.mounted)
  schedule()

  return {
    refresh: ensureCanvasForCurrentSession,
    markVisible(workspacePath) {
      markCanvasVisible(workspacePath)
      lastEnsuredKey = null
      schedule()
    },
    markHidden(workspacePath) {
      markCanvasHidden(workspacePath)
      lastEnsuredKey = null
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      for (const stop of unsubscribers) {
        try { stop?.() } catch (error) { console.debug('[omnimux-workflow] canvas presence unsubscribe failed', error) }
      }
      unsubscribers.length = 0
    },
  }
}
