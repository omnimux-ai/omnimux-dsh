/**
 * fetch wrapper over the plugin's local HTTP routes. Every call resolves to
 * `{ ok, status, body }`; the UI only renders `body.error` / `body.message`.
 */

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
export async function workflowRequest(path, opts = {}) {
  const response = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = { error: `HTTP ${String(response.status)}` }
  }
  return { ok: response.ok, status: response.status, body: json }
}

/**
 * Build manifest (canvas.js content hash) for cache-busting the island.
 * @returns {Promise<string | null>}
 */
export async function fetchCanvasHash() {
  try {
    const result = await workflowRequest('/omnimux-workflow/api/manifest')
    const hash = result.body?.canvasHash
    return typeof hash === 'string' ? hash : null
  } catch {
    return null
  }
}

// ============================================================================
// 项目库 API。作用域 = host 解析的默认库，不再传 cwd。
// ============================================================================

/**
 * @typedef {{ id: string, title: string, updatedAt: string, path?: string, pages: Array<{ id: string, canvasWorkspaceId: string }>, activePageId: string }} ProjectSummary
 * @typedef {{ id: string, title: string, createdAt: string, updatedAt: string, path?: string, pages: Array<{ id: string, canvasWorkspaceId: string }>, activePageId: string }} Project
 */

/** Host 解析 videos + ensure OmniMux/Projects。 */
export function fetchProjectLibrary() {
  return workflowRequest('/omnimux-workflow/api/projects/library')
}

/** 扫描默认库下一层含合法 project.json 的文件夹。 */
export function listProjects() {
  return workflowRequest('/omnimux-workflow/api/projects')
}

/**
 * 按文件夹绝对路径认项目（含库外已有档案）。
 * @param {string} projectRoot
 */
export function findProjectByRoot(projectRoot) {
  const path = typeof projectRoot === 'string' ? projectRoot.trim() : ''
  if (!path) return Promise.resolve({ ok: false, status: 400, body: { error: 'invalid-project-root' } })
  return workflowRequest(`/omnimux-workflow/api/projects?path=${encodeURIComponent(path)}`)
}

/**
 * 在已有画布上新建一张带空白画布的创作页。
 * @param {string} canvasWorkspaceId
 * @param {string} [title]
 */
export function createCanvasProjectPage(canvasWorkspaceId, title) {
  const id = typeof canvasWorkspaceId === 'string' ? canvasWorkspaceId.trim() : ''
  if (!id) return Promise.resolve({ ok: false, status: 400, body: { error: 'invalid-id' } })
  return workflowRequest(`/omnimux-workflow/api/workspaces/${encodeURIComponent(id)}/project-pages`, {
    method: 'POST',
    body: title ? { title } : {},
  })
}

/**
 * 按会话解析所属工作区的项目（缺失即登记，Issue #2104）。
 * 返回体 `source`: existing | registered | outside-library | unknown-session。
 * @param {string} sessionId
 */
export function fetchSessionProjectBinding(sessionId) {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!id) return Promise.resolve({ ok: false, status: 400, body: { error: 'session-required' } })
  return workflowRequest(`/omnimux-workflow/api/projects/session-binding?sessionId=${encodeURIComponent(id)}`)
}

/**
 * 创建/对齐项目（B2）。
 * - 传对象：`{ mode: 'independent'|'workspace', workspaceDir?, projectRoot? }`；
 * - 兼容旧签名：第二个参数是字符串时视为 projectRoot（= 绑定/对齐该目录）。
 * @param {string} title
 * @param {string | { mode?: 'independent'|'workspace', workspaceDir?: string, projectRoot?: string }} [options]
 */
export function createProject(title, options) {
  const body = { title }
  if (typeof options === 'string') {
    if (options !== '') body.projectRoot = options
  } else if (options && typeof options === 'object') {
    if (typeof options.mode === 'string' && options.mode !== '') body.mode = options.mode
    if (typeof options.workspaceDir === 'string' && options.workspaceDir !== '') body.workspaceDir = options.workspaceDir
    if (typeof options.projectRoot === 'string' && options.projectRoot !== '') body.projectRoot = options.projectRoot
  }
  return workflowRequest('/omnimux-workflow/api/projects', { method: 'POST', body })
}

/**
 * 只读对齐预检（S0–S4 + 建议动作，零写盘）。
 * @param {{ mode?: 'independent'|'workspace', workspaceDir?: string, projectRoot?: string, title?: string }} payload
 */
export function preflightProject(payload = {}) {
  return workflowRequest('/omnimux-workflow/api/projects/preflight', {
    method: 'POST',
    body: {
      ...(payload.mode ? { mode: payload.mode } : {}),
      ...(payload.workspaceDir ? { workspaceDir: payload.workspaceDir } : {}),
      ...(payload.projectRoot ? { projectRoot: payload.projectRoot } : {}),
      ...(payload.title ? { title: payload.title } : {}),
    },
  })
}

/** 获取单个项目详情 (含全部 pages 及 activePageId) */
export function getProject(id) {
  return workflowRequest(`/omnimux-workflow/api/projects/${id}`)
}

/** 重命名项目（展示名；不改文件夹名）。 */
export function renameProject(id, title) {
  return workflowRequest(`/omnimux-workflow/api/projects/${id}`, {
    method: 'PATCH',
    body: { title },
  })
}

/** 回写会话绑定。 */
export function bindProjectSession(id, sessionId) {
  return workflowRequest(`/omnimux-workflow/api/projects/${id}`, {
    method: 'PATCH',
    body: { sessionId },
  })
}

/**
 * 两级删除：
 * - 默认「移出项目库」：摘 project.json + 索引，保留画布/资产/用户文件；
 * - `{ purge: true }`「删除项目」：再删 .omnimux/canvases 与 assets.json（用户自有文件仍保留）。
 */
export function deleteProject(id, opts = {}) {
  const query = opts && opts.purge ? '?mode=purge' : ''
  return workflowRequest(`/omnimux-workflow/api/projects/${id}${query}`, {
    method: 'DELETE',
  })
}

/** 新建创作页 */
export function createProjectPage(projectId, title, opts = {}) {
  return workflowRequest(`/omnimux-workflow/api/projects/${projectId}/pages`, {
    method: 'POST',
    body: { title, ...opts },
  })
}

/** 更新创作页（重命名或激活） */
export function updateProjectPage(projectId, pageId, updates = {}) {
  return workflowRequest(`/omnimux-workflow/api/projects/${projectId}/pages/${pageId}`, {
    method: 'PATCH',
    body: updates,
  })
}

/** 删除创作页 */
export function deleteProjectPage(projectId, pageId) {
  return workflowRequest(`/omnimux-workflow/api/projects/${projectId}/pages/${pageId}`, {
    method: 'DELETE',
  })
}

/** 浏览工作区真实物理文件列表 */
export function fetchProjectFiles(projectId, subpath = '') {
  const query = subpath ? `?subpath=${encodeURIComponent(subpath)}` : ''
  return workflowRequest(`/omnimux-workflow/api/projects/${projectId}/files${query}`)
}

/** 在工作区物理目录下新建文件夹 */
export function mkdirProjectFile(projectId, name, subpath = '') {
  return workflowRequest(`/omnimux-workflow/api/projects/${projectId}/mkdir`, {
    method: 'POST',
    body: { name, subpath },
  })
}

/** 上传本地物理文件到工作区目录 */
export function uploadProjectFiles(projectId, paths = [], subpath = '') {
  return workflowRequest(`/omnimux-workflow/api/projects/${projectId}/upload`, {
    method: 'POST',
    body: { paths, subpath },
  })
}

/**
 * 唤起系统原生文件管理器打开窗口选择文件夹。
 * @returns {Promise<unknown>}
 */
export function pickProjectDirectory() {
  return workflowRequest('/omnimux-workflow/api/pick', {
    method: 'POST',
    body: { kind: 'directory' },
  })
}

/**
 * 弹窗内列出本机一层文件夹。path 为空则落到桌面或用户主目录。
 * @deprecated 改用 pickProjectDirectory 调用系统原生打开窗口
 * @param {string} [path]
 */
export function browseProjectDirectory(path) {
  return workflowRequest('/omnimux-workflow/api/browse-directory', {
    method: 'POST',
    body: typeof path === 'string' && path.trim() !== '' ? { path } : {},
  })
}
