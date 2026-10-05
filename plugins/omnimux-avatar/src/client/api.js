// 插件 HTTP API 客户端：只使用 fetch 与相对 URL，不引入 axios。
//
// 契约（冻结，不可改名）：见 docs/contracts 与任务规格中的 omnimux-avatar HTTP 面。
// 所有函数在服务端 `success:false` 时抛出携带服务端 error.message 的 Error，
// 绝不返回「静默的空成功」。
//
// 与真源 api.ts 的差异（数据源变更）：真源走 OmniMux 网关的 /api/influencer/* 与
// /pg/influencer/*；这里全部改为插件自身的 /api/omnimux/avatar/* 端点。

/** 端点表，集中一处便于核对冻结契约。 */
const PATHS = {
  taxonomy: '/api/omnimux/avatar/taxonomy',
  presets: '/api/omnimux/avatar/presets',
  presetAsset: '/api/omnimux/avatar/presets/asset',
  avatars: '/api/omnimux/avatar/avatars',
  avatarsUpdate: '/api/omnimux/avatar/avatars/update',
  avatarsDelete: '/api/omnimux/avatar/avatars/delete',
  sheet: '/api/omnimux/avatar/sheet',
  multiview: '/api/omnimux/avatar/multiview',
  sync: '/api/omnimux/avatar/sync',
  tasks: '/api/omnimux/avatar/tasks',
  task: '/api/omnimux/avatar/task',
  // 任务成图：只吃 avatarId + taskId，服务端自己从任务记录里取盘上路径。
  // 任务载荷已带现成的 imageUrl（见 history.js 的 taskImageUrl 兜底），
  // 这一条是给需要自行拼地址的调用方（深链 / 新窗口打开）核对契约用。
  taskImage: '/api/omnimux/avatar/task/image',
  tasksDelete: '/api/omnimux/avatar/tasks/delete',
}

/**
 * 从响应体里取出服务端错误文案。
 * @param {unknown} body
 * @param {string} fallback
 * @returns {string}
 */
function serverMessage(body, fallback) {
  if (body && typeof body === 'object') {
    const error = /** @type {{ error?: unknown, message?: unknown }} */ (body).error
    if (error && typeof error === 'object' && typeof (/** @type {{message?: unknown}} */ (error).message) === 'string') {
      return /** @type {string} */ (/** @type {{message?: string}} */ (error).message)
    }
    if (typeof error === 'string' && error) return error
    if (typeof (/** @type {{message?: unknown}} */ (body).message) === 'string') {
      return /** @type {string} */ (/** @type {{message?: string}} */ (body).message)
    }
  }
  return fallback
}

/**
 * 发一次请求并解析 JSON；HTTP 失败或 `success:false` 都抛错。
 * @param {string} path
 * @param {{ method?: string, body?: unknown, query?: Record<string, string|number|undefined> }} [options]
 * @returns {Promise<any>}
 */
async function request(path, options = {}) {
  const url = new URL(path, globalThis.location?.origin ?? 'http://localhost')
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  /** @type {RequestInit} */
  const init = { method: options.method ?? 'GET' }
  if (options.body !== undefined) {
    init.method = options.method ?? 'POST'
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(options.body)
  }
  const res = await fetch(`${url.pathname}${url.search}`, init)
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    throw new Error(serverMessage(body, `请求失败（HTTP ${res.status}）`))
  }
  if (!body || typeof body !== 'object') {
    throw new Error('服务端响应不是 JSON 对象')
  }
  if (body.success === false) {
    throw new Error(serverMessage(body, '请求失败'))
  }
  return body
}

/**
 * 形象数据集与内容摘要。
 * @returns {Promise<{ taxonomy: import('./lib/types.js').InfluencerTaxonomy, etag: string }>}
 */
export async function fetchTaxonomy() {
  const body = await request(PATHS.taxonomy)
  return { taxonomy: body.data, etag: body.etag }
}

/**
 * 预设快照（服务端载荷，交给 presets.js 的 setPresetSnapshot 注入）。
 * @returns {Promise<import('./lib/types.js').PresetSnapshot>}
 */
export async function fetchPresets() {
  const body = await request(PATHS.presets)
  return body.data
}

/**
 * 预设图片的取图地址（相对 URL，浏览器直接可用）。
 * @param {string} path 预设资产路径
 * @returns {string}
 */
export function presetAssetUrl(path) {
  return `${PATHS.presetAsset}?path=${encodeURIComponent(path ?? '')}`
}

/**
 * 形象列表与版本号。
 * @returns {Promise<{ revision: number, avatars: import('./lib/types.js').AvatarSummary[] }>}
 */
export async function fetchAvatars() {
  const body = await request(PATHS.avatars)
  return {
    revision: typeof body.revision === 'number' ? body.revision : 0,
    avatars: Array.isArray(body.avatars) ? body.avatars : [],
  }
}

/**
 * 新建形象。
 * @param {{ name: string, sheet: string }} input
 * @returns {Promise<import('./lib/types.js').AvatarSummary>}
 */
export async function createAvatar({ name, sheet }) {
  const body = await request(PATHS.avatars, { method: 'POST', body: { name, sheet } })
  return body.avatar
}

/**
 * 更新形象名称或设定板。
 * @param {{ id: string, name?: string, sheet?: string }} input
 * @returns {Promise<import('./lib/types.js').AvatarSummary>}
 */
export async function updateAvatar({ id, name, sheet }) {
  const payload = { id }
  if (name !== undefined) payload.name = name
  if (sheet !== undefined) payload.sheet = sheet
  const body = await request(PATHS.avatarsUpdate, { method: 'POST', body: payload })
  return body.avatar
}

/**
 * 删除形象。服务端要求显式 confirm，避免误删。
 * @param {{ id: string }} input
 * @returns {Promise<true>}
 */
export async function deleteAvatar({ id }) {
  const body = await request(PATHS.avatarsDelete, {
    method: 'POST',
    body: { id, confirm: true },
  })
  if (body.deleted !== true) throw new Error('删除形象失败')
  return true
}

/**
 * 提交角色设定板生成。
 *
 * `taskRef` 是轮询句柄（调用方拿它去 `GET /task?taskId=`），必须是本插件自己的
 * 任务编号：服务端顶层的 `taskRef` 是上游提供方的引用，用它取任务会 404。
 * @param {{ avatarId: string, model: string, group?: string, tier: string, selection: import('./lib/types.js').Selection, brief?: string, seed?: number, image_url?: string }} body
 * @returns {Promise<{ task: import('./lib/types.js').TaskRecord|null, mode: string, dest: unknown, taskRef: string }>}
 */
export async function submitSheet(body) {
  const payload = await request(PATHS.sheet, { method: 'POST', body })
  return {
    task: payload.task ?? null,
    mode: payload.mode ?? '',
    dest: payload.dest ?? null,
    taskRef: String(payload.task?.taskId ?? payload.taskRef ?? payload.task?.task_id ?? payload.task?.id ?? ''),
  }
}

/**
 * 提交由现有设定板派生的多视角设定板。
 *
 * `taskRef` 的口径与 `submitSheet` 一致：本插件自己的任务编号。
 * @param {{ avatarId: string, model: string, group?: string }} body
 * @returns {Promise<{ task: import('./lib/types.js').TaskRecord|null, mode: string, dest: unknown, taskRef: string }>}
 */
export async function submitMultiView(body) {
  const payload = await request(PATHS.multiview, { method: 'POST', body })
  return {
    task: payload.task ?? null,
    mode: payload.mode ?? '',
    dest: payload.dest ?? null,
    taskRef: String(payload.task?.taskId ?? payload.taskRef ?? payload.task?.task_id ?? payload.task?.id ?? ''),
  }
}

/**
 * 手动补偿归档：自动归档失败后，由界面把已产出的图重新存进资产库。
 *
 * 对应规格 §7.2 的 `POST /sync`；`kind` 缺省为 `'sheet'`，与路由取值一致
 * （`'sheet' | 'multiview' | 'both'`）。返回 `{ sheet, multiView, status }`，
 * 未参与本次补偿的两项为 null。
 *
 * @param {{ avatarId: string, kind?: 'sheet'|'multiview'|'both' }} input
 * @returns {Promise<{ sheet: unknown, multiView: unknown, status: unknown }>}
 */
export async function syncLibrary({ avatarId, kind = 'sheet' }) {
  const body = await request(PATHS.sync, { method: 'POST', body: { avatarId, kind } })
  return {
    sheet: body.sheet ?? null,
    multiView: body.multiView ?? null,
    status: body.status ?? null,
  }
}

/**
 * 某个形象的全部任务。
 * @param {string} avatarId
 * @returns {Promise<{ items: import('./lib/types.js').TaskRecord[], total: number }>}
 */
export async function fetchTasks(avatarId) {
  const body = await request(PATHS.tasks, { query: { avatarId } })
  const items = Array.isArray(body.tasks) ? body.tasks : []
  return { items, total: items.length }
}

/**
 * 单条任务读取，供轮询与深链使用。
 * @param {string} avatarId
 * @param {string} taskId
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<import('./lib/types.js').TaskRecord|null>}
 */
export async function fetchTask(avatarId, taskId, options = {}) {
  const body = await request(PATHS.task, {
    query: { avatarId, taskId, refresh: options.refresh ? 1 : undefined },
  })
  return body.task ?? null
}

/**
 * 删除一条任务。
 * @param {{ avatarId: string, taskId: string }} input
 * @returns {Promise<true>}
 */
export async function deleteTask({ avatarId, taskId }) {
  const body = await request(PATHS.tasksDelete, {
    method: 'POST',
    body: { avatarId, taskId },
  })
  if (body.success !== true) throw new Error('删除任务失败')
  return true
}

export { PATHS }
