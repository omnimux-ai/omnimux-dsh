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
 * @typedef {{ id: string, title: string, updatedAt: string, sessionId: string | null, path?: string }} ProjectSummary
 * @typedef {{ id: string, title: string, createdAt: string, updatedAt: string, sessionId: string | null, canvasWorkspaceIds: string[], path?: string }} Project
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
 * Host 在默认库 mkdir + 写 project.json。
 * 可选 projectRoot：已存在的作品包路径（打开已有文件夹时种子）。
 * @param {string} title
 * @param {string | null} [sessionId]
 * @param {string} [projectRoot]
 */
export function createProject(title, sessionId = null, projectRoot) {
  return workflowRequest('/omnimux-workflow/api/projects', {
    method: 'POST',
    body: {
      title,
      sessionId,
      ...(typeof projectRoot === 'string' && projectRoot !== '' ? { projectRoot } : {}),
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

/** 删除：只摘元数据。 */
export function deleteProject(id) {
  return workflowRequest(`/omnimux-workflow/api/projects/${id}`, {
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
