/**
 * 新建本地项目副作用（规格 2026-08-23，桌面壳补丁）：
 *   1. POST /api/projects { title } → Host mkdir 默认库 + project.json
 *      （OmniMux.app 的 directoryPicker 是 native，没有 workspaces.createDirectory）
 *   2. workspaces.create({ path: projectRoot })
 *   3. sessions.create({ workspaceId }) 禁止 cwd
 *   4. bind → 关一级页 overlay → 切会话 → activateProjectCanvas 15:85
 *
 * 禁止 connectWorkspace、sessions.create({ cwd })、resolveCurrentCwd 当库作用域。
 */
import {
  bindProjectSession,
  createProject,
} from '../api.js'
import { normalizeWorkspacePath, resolveCurrentCwd, resolveWorkspaceForCwd } from './cwd.js'
import { validateProjectTitle } from './folderName.js'
import { activateProjectCanvas, focusSessionForCanvas } from './projectCanvas.js'

/**
 * 关掉任意一级页 overlay（项目库 / 资产库 / 产品库…）。
 * 只关本插件 stage 不够：html[data-dsh-product-stage] 会藏右侧栏。
 */
export function dismissProductStage(stage) {
  try {
    stage?.set?.(false)
  } catch {
    // ignore
  }
  const html = typeof document !== 'undefined' ? document.documentElement : null
  if (html?.dataset?.dshProductStage) {
    delete html.dataset.dshProductStage
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsh-product-stage', { detail: { id: '' } }))
  }
}

/**
 * 在已有项目根上登记工作区并开会话（打开项目 / 补绑定共用）。
 * 禁止 create({ cwd })、禁止 connectWorkspace。
 *
 * @param {{ create: (opts: { workspaceId: string }) => Promise<string> }} sessions
 * @param {{ create: (input: { path: string }) => Promise<{ workspaceId?: unknown }>, list?: object }} workspaces
 * @param {string} projectRoot
 * @returns {Promise<{ ok: true, cwd: string, workspaceId: string, sessionId: string } | { ok: false, error: string }>}
 */
export async function createProjectSession(sessions, workspaces, projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    return { ok: false, error: 'no-workspace' }
  }
  if (!workspaces || typeof workspaces.create !== 'function') {
    return { ok: false, error: 'no-workspace' }
  }
  const created = await workspaces.create({ path: projectRoot })
  const workspaceId = created?.workspaceId !== undefined && created?.workspaceId !== null
    ? String(created.workspaceId)
    : resolveWorkspaceForCwd(projectRoot, workspaces)
  if (!workspaceId) return { ok: false, error: 'no-workspace' }
  const sessionId = await sessions.create({ workspaceId })
  return { ok: true, cwd: projectRoot, workspaceId, sessionId }
}

function errorText(value) {
  if (!value) return 'create-failed'
  if (typeof value === 'string') return value
  return String(value)
}

function friendlyCreateError(code, t) {
  const raw = errorText(code)
  const text = typeof t === 'function' ? t : () => ''
  if (raw === 'no-workspace') return text('projects.noWorkspace') || '请先选择一个工作区目录。'
  if (raw === 'title-required' || raw === 'title-invalid' || raw === 'title-too-long') {
    return text('projects.genericError') || '操作失败，请重试。'
  }
  if (raw === 'project-exists') {
    return text('projects.existingConfirm') || '当前工作区已有项目，要在该项目新建创作页吗？'
  }
  if (raw === 'project-record-invalid') {
    return text('projects.recordInvalid') || '该目录的项目档案（project.json）无法读取，请修复或删除后重试。'
  }
  const mapped = text('projects.createFailed')
  if (typeof mapped === 'string' && mapped.includes('{error}')) {
    return mapped.replace('{error}', '操作失败，请重试。')
  }
  return text('projects.genericError') || '操作失败，请重试。'
}

function currentSessionId(sessions) {
  try {
    const snap = sessions?.list?.getSnapshot?.()
    const id = snap?.current
    return typeof id === 'string' && id !== '' ? id : ''
  } catch {
    return ''
  }
}

function sameFolder(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.trim() === '' || b.trim() === '') return false
  return normalizeWorkspacePath(a) === normalizeWorkspacePath(b)
}

function activeCanvasId(project) {
  const pages = Array.isArray(project?.pages) ? project.pages : []
  const active = pages.find((page) => page?.id === project?.activePageId) || pages[0]
  return active?.canvasWorkspaceId
    || ''
}

async function openOnSession(ctx, sessionId, cwd, extra = {}) {
  dismissProductStage(ctx.stage)
  // 会话切换由 activateProjectCanvas 统一处理（现行壳 uiWorkspace.openSession，
  // 旧宿主回退 sessions.open）：切换失败时它返回 false，不再假装打开成功。
  revealConversationAfterOpen(sessionId)
  const opened = await activateProjectCanvas(ctx, {
    sessionId,
    cwd,
    focusGroupId: extra.focusGroupId,
    timeoutMs: extra.timeoutMs,
  })
  return opened
}

/**
 * Enter-Conversation Intent（对齐 omnimux-inspiration #552）：
 * 从一级库 gui 模式新建/重置会话后，必须解除中间栏折叠并切 split，
 * 否则 conversation-collapse.css 会把 centerCol 藏成黑屏占位。
 * @param {string | undefined} sessionId
 */
function revealConversationAfterOpen(sessionId) {
  const workbench = typeof globalThis.window !== 'undefined'
    ? globalThis.window.__omnimuxWorkbench
    : undefined
  if (!workbench) return
  try { workbench.setConversationCollapsed?.(false, { sessionId }) } catch { /* ignore */ }
  try { workbench.setFocus?.('split') } catch { /* ignore */ }
}

/**
 * 新建/对齐项目（B2：项目可独立、绑定可选）。
 *
 * 弹窗只负责收集 title + 存放位置（可选）。这里按 `mode` 调 Host 的
 * `ensureProject`：independent = 默认库独立项目；workspace = 对所选目录做
 * S0–S4 对齐（初始化/采纳/修复/重建），不再用「先查再 409」的旧流程。
 *
 * @param {{
 *   sessions: { create: (opts: { workspaceId: string }) => Promise<string> },
 *   workspaces: { create: Function },
 *   layout?: { closeDetails?: () => void },
 *   betterSidebar?: object,
 *   getSessionNavigation?: () => ({ openSession?: (id: string) => void } | undefined),
 *   t: (key: string) => string,
 *   stage?: { set?: (open: boolean) => void },
 * }} ctx
 * @param {{ title: string, mode?: 'independent'|'workspace', workspaceDir?: string, projectRoot?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, action?: string, project?: object, error?: string, canvasOpened?: boolean }>}
 */
export async function runNewProject(ctx, opts = {}) {
  const title = typeof opts.title === 'string' ? opts.title : ''
  const givenDir = typeof opts.workspaceDir === 'string' && opts.workspaceDir.trim() !== ''
    ? opts.workspaceDir.trim()
    : (typeof opts.projectRoot === 'string' && opts.projectRoot.trim() !== '' ? opts.projectRoot.trim() : '')
  const mode = opts.mode === 'workspace' || givenDir !== '' ? 'workspace' : 'independent'
  const validated = validateProjectTitle(title)
  if (!validated.ok) return { ok: false, error: validated.error }

  try {
    const currentCwd = resolveCurrentCwd(ctx.sessions, ctx.workspaces) || ''
    const currentSid = currentSessionId(ctx.sessions)

    const seeded = await createProject(
      validated.title,
      mode === 'workspace' ? { mode, workspaceDir: givenDir } : { mode },
    )
    if (!seeded.ok || !seeded.body?.project) {
      return { ok: false, error: friendlyCreateError(seeded.body?.error || seeded.body?.message || seeded.status, ctx.t) }
    }
    const projectRoot = typeof seeded.body.project.path === 'string' ? seeded.body.project.path : ''
    if (projectRoot === '') return { ok: false, error: 'invalid-project-root' }
    const project = { ...seeded.body.project, path: projectRoot }
    const action = typeof seeded.body.action === 'string' ? seeded.body.action : 'created'

    const staying = sameFolder(projectRoot, currentCwd)
    let sessionId = currentSid
    if (!staying || !sessionId) {
      const session = await createProjectSession(ctx.sessions, ctx.workspaces, projectRoot)
      if (!session.ok) return { ok: false, error: friendlyCreateError(session.error, ctx.t) }
      sessionId = session.sessionId
    }
    await bindProjectSession(project.id, sessionId)
    const canvasId = activeCanvasId(project)
    const canvasOpened = await openOnSession(ctx, sessionId, projectRoot, {
      workspaceId: canvasId,
      timeoutMs: opts.timeoutMs,
    })
    return {
      ok: true,
      action,
      project: { ...project, sessionId, path: projectRoot },
      canvasOpened,
    }
  } catch (error) {
    return { ok: false, error: friendlyCreateError(error instanceof Error ? error.message : String(error), ctx.t) }
  }
}

/**
 * 在同一个窗口中新建会话（清空上下文）：
 * 基于 DSH 原生机制调用 sessions.create({ workspaceId })，再由 uiWorkspace.openSession
 * （旧宿主 sessions.open）把新会话切到前台，
 * 0 历史 Token 消耗，不重开桌面窗口，保持当前工作区与右侧画布连接。
 *
 * @param {{
 *   sessions: { create: (opts: { workspaceId: string }) => Promise<string> },
 *   workspaces: { create: Function, list?: object },
 *   betterSidebar?: object,
 *   layout?: { closeDetails?: () => void },
 *   getSessionNavigation?: () => ({ openSession?: (id: string) => void } | undefined),
 *   t?: (key: string) => string,
 * }} ctx
 * @param {{ workspaceId?: string, cwd?: string, pageId?: string, timeoutMs?: number }} opts
 */
export async function runResetSession(ctx, opts = {}) {
  try {
    const cwd = opts.cwd || '';
    let workspaceId = opts.workspaceId;
    if (!workspaceId && cwd && ctx.workspaces) {
      workspaceId = resolveWorkspaceForCwd(cwd, ctx.workspaces);
    }
    if (!workspaceId && cwd && ctx.workspaces?.create) {
      const created = await ctx.workspaces.create({ path: cwd });
      workspaceId = created?.workspaceId !== undefined && created?.workspaceId !== null
        ? String(created.workspaceId)
        : resolveWorkspaceForCwd(cwd, ctx.workspaces);
    }
    if (!workspaceId) {
      return { ok: false, error: 'no-workspace' };
    }

    // 1. 调用 DSH 原生 API 在当前 workspace 创建全新的空白会话
    const newSessionId = await ctx.sessions.create({ workspaceId });
    // 2. 在当前窗口无缝切换打开（无需重开窗口）；拿不到导航能力就明确失败。
    if (!focusSessionForCanvas(ctx, newSessionId)) {
      return { ok: false, error: 'session-navigation-unavailable' };
    }
    // 3. Enter-Conversation：解除中间栏折叠（与 runNewProject / inspiration #552 对齐）
    revealConversationAfterOpen(newSessionId);
    // 4. 保持右侧栏画布无缝连接并刷新比例
    const opened = await activateProjectCanvas(ctx, { sessionId: newSessionId, cwd, pageId: opts.pageId, timeoutMs: opts.timeoutMs });

    return opened
      ? { ok: true, sessionId: newSessionId }
      : { ok: false, error: 'canvas-unavailable' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
