/**
 * 新建本地项目副作用（规格 2026-08-23，桌面壳补丁）：
 *   1. POST /api/projects { title } → Host mkdir 默认库 + 说明.md + project.json
 *      （OmniMux.app 的 directoryPicker 是 native，没有 workspaces.createDirectory）
 *   2. workspaces.create({ path: projectRoot })
 *   3. sessions.create({ workspaceId }) 禁止 cwd
 *   4. bind → 关一级页 overlay → sessions.open → activateProjectCanvas 15:85
 *
 * 禁止 connectWorkspace、sessions.create({ cwd })、resolveCurrentCwd 当库作用域。
 */
import { bindProjectSession, createProject } from '../api.js'
import { resolveWorkspaceForCwd } from './cwd.js'
import { validateProjectTitle } from './folderName.js'
import { activateProjectCanvas } from './projectCanvas.js'

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
 * @param {{
 *   sessions: { create: (opts: { workspaceId: string }) => Promise<string>, open: (id: string) => void },
 *   workspaces: { create: Function },
 *   layout?: { closeDetails?: () => void },
 *   betterSidebar?: object,
 *   t: (key: string) => string,
 *   stage?: { set?: (open: boolean) => void },
 * }} ctx
 * @param {{ title: string, projectRoot?: string }} [opts] 标题必填（弹窗在入口层收，取消则不调用本函数）；projectRoot 可选，留空则 Host 写入默认库
 * @returns {Promise<{ ok: boolean, project?: object, error?: string }>}
 */
export async function runNewProject(ctx, opts = {}) {
  const title = typeof opts.title === 'string' ? opts.title : ''
  const givenRoot = typeof opts.projectRoot === 'string' ? opts.projectRoot.trim() : ''
  const validated = validateProjectTitle(title)
  if (!validated.ok) return { ok: false, error: validated.error }

  const seeded = await createProject(validated.title, null, givenRoot !== '' ? givenRoot : undefined)
  if (!seeded.ok || !seeded.body?.project) {
    return { ok: false, error: errorText(seeded.body?.error || seeded.body?.message || seeded.status) }
  }
  const projectRoot = typeof seeded.body.project.path === 'string' ? seeded.body.project.path : ''
  if (projectRoot === '') {
    return { ok: false, error: 'invalid-project-root' }
  }
  const project = { ...seeded.body.project, path: projectRoot }

  try {
    const session = await createProjectSession(ctx.sessions, ctx.workspaces, projectRoot)
    if (!session.ok) return session
    await bindProjectSession(project.id, session.sessionId)
    dismissProductStage(ctx.stage)
    ctx.sessions.open(session.sessionId)
    revealConversationAfterOpen(session.sessionId)
    await activateProjectCanvas(ctx, { sessionId: session.sessionId, cwd: projectRoot })
    return { ok: true, project: { ...project, sessionId: session.sessionId, path: projectRoot } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 在同一个窗口中新建会话（清空上下文）：
 * 基于 DSH 原生机制调用 sessions.create({ workspaceId }) + sessions.open(newSessionId)，
 * 0 历史 Token 消耗，不重开桌面窗口，保持当前工作区与右侧画布连接。
 *
 * @param {{
 *   sessions: { create: (opts: { workspaceId: string }) => Promise<string>, open: (id: string) => void },
 *   workspaces: { create: Function, list?: object },
 *   betterSidebar?: object,
 *   layout?: { closeDetails?: () => void },
 *   t?: (key: string) => string,
 * }} ctx
 * @param {{ workspaceId?: string, cwd?: string, pageId?: string }} opts
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
    // 2. 在当前窗口无缝切换打开（无需重开窗口）
    ctx.sessions.open(newSessionId);
    // 3. Enter-Conversation：解除中间栏折叠（与 runNewProject / inspiration #552 对齐）
    revealConversationAfterOpen(newSessionId);
    // 4. 保持右侧栏画布无缝连接并刷新比例
    await activateProjectCanvas(ctx, { sessionId: newSessionId, cwd, pageId: opts.pageId });

    return { ok: true, sessionId: newSessionId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
