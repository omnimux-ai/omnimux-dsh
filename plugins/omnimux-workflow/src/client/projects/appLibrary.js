/**
 * 已发布 AI 应用清单（「项目」页「AI应用」分类的数据源）。
 *
 * 唯一真实落点：浏览器 `localStorage['omnimux_apps_manifests']`，
 * 结构 `Record<appId, ApplicationManifest>`；写入方是创作画布的发布向导
 * （`src/canvas/editor/components/publish/PublishWizardModal.tsx`）。
 * `plugins/omnimux-apps` 未接入运行时（无 cordis.patch.yml、无 dsh 字段、
 * 全仓零 import），不作为数据源；也没有服务端注册表。
 *
 * 本模块只做纯数据变换 + 存储读写，不依赖 React，便于单测。
 */

/** 发布向导写入的存储键（与 AppTab / 向导保持一致，改名即破坏读回）。 */
export const APP_MANIFESTS_STORAGE_KEY = 'omnimux_apps_manifests'

/** 应用标签页 id 前缀：`app_<appId>`（插件自有面板布局下的关闭约定）。 */
export const APP_TAB_ID_PREFIX = 'app_'

/** 应用分类 → i18n 键后缀，用于卡片副标题。 */
export const APP_CATEGORY_LABEL_KEYS = {
  video: 'projects.appCategoryVideo',
  image: 'projects.appCategoryImage',
  audio: 'projects.appCategoryAudio',
}

/** 删除失败原因码 → i18n 键。 */
export const APP_REMOVE_ERROR_KEYS = {
  'invalid-app-id': 'projects.appDeleteFailed',
  'storage-unavailable': 'projects.appStorageUnavailable',
  unreadable: 'projects.appStorageUnreadable',
  'not-found': 'projects.appNotFound',
  'write-failed': 'projects.appDeleteFailed',
}

function textOf(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/** 宿主 localStorage；不可用（SSR / 隐私模式）时返回 null。 */
export function defaultAppStorage() {
  try {
    const storage = globalThis.localStorage
    return storage && typeof storage.getItem === 'function' ? storage : null
  } catch {
    return null
  }
}

/** `appId` → 应用标签页 id。 */
export function appTabIdFor(appId) {
  const id = textOf(appId)
  return id ? `${APP_TAB_ID_PREFIX}${id}` : ''
}

/** 应用标签页 id → `appId`（非应用标签页返回空串）。 */
export function appIdFromTabId(tabId) {
  const id = textOf(tabId)
  return id.startsWith(APP_TAB_ID_PREFIX) ? id.slice(APP_TAB_ID_PREFIX.length) : ''
}

/**
 * 读取全部 manifest 映射。任何损坏（非 JSON / 非对象 / 数组）都退化为空映射，
 * 不抛异常——列表页据此渲染真实空态。
 *
 * @param {Storage | null | undefined} [storage]
 * @returns {Record<string, unknown>}
 */
export function readAppManifestMap(storage = defaultAppStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return {}
  let raw = null
  try {
    raw = storage.getItem(APP_MANIFESTS_STORAGE_KEY)
  } catch {
    return {}
  }
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  return plainObject(parsed) || {}
}

/**
 * manifest → 卡片条目。字段缺失时给安全缺省，绝不返回 undefined。
 *
 * @param {unknown} manifest
 * @param {string} [fallbackAppId] 映射键（manifest 自身缺 appId 时兜底）
 * @returns {null | {
 *   appId: string, name: string, category: string, description: string,
 *   coverUrl: string, iconSvg: string, version: string, createdAt: string,
 *   workspaceId: string, projectId: string, groupId: string, manifest: unknown,
 * }}
 */
export function toPublishedAppEntry(manifest, fallbackAppId = '') {
  const row = plainObject(manifest)
  if (!row) return null
  const appId = textOf(row.appId) || textOf(fallbackAppId)
  if (!appId) return null
  const metadata = plainObject(row.metadata) || {}
  const binding = plainObject(row.workflowBinding) || {}
  return {
    appId,
    name: textOf(metadata.name) || appId,
    category: textOf(metadata.category),
    description: textOf(metadata.description),
    coverUrl: textOf(metadata.coverUrl),
    iconSvg: typeof metadata.iconSvg === 'string' ? metadata.iconSvg : '',
    version: textOf(row.version),
    createdAt: textOf(row.createdAt),
    workspaceId: textOf(binding.workspaceId),
    projectId: textOf(binding.projectId),
    groupId: textOf(binding.sourceGroupId),
    manifest: row,
  }
}

/**
 * 列出全部已发布应用，按 `createdAt` 倒序（缺失时间的排最后，同时间按 appId 稳定排序）。
 *
 * @param {Storage | null | undefined} [storage]
 */
export function listPublishedApps(storage = defaultAppStorage()) {
  const map = readAppManifestMap(storage)
  const entries = []
  for (const key of Object.keys(map)) {
    const entry = toPublishedAppEntry(map[key], key)
    if (entry) entries.push(entry)
  }
  return entries.sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return a.createdAt < b.createdAt ? 1 : -1
    }
    return a.appId < b.appId ? -1 : a.appId > b.appId ? 1 : 0
  })
}

/** 搜索词匹配（大小写不敏感，匹配应用名与描述）。 */
export function appEntryMatchesQuery(entry, query) {
  const q = textOf(query).toLowerCase()
  if (!q) return true
  if (!entry) return false
  return String(entry.name || '').toLowerCase().includes(q)
    || String(entry.description || '').toLowerCase().includes(q)
}

/**
 * 删除一条已发布应用记录。
 *
 * 只操作 manifest 映射本身：不触碰项目文件、不取消执行、不动其他条目。
 * 写盘失败或记录不存在都返回失败结果，调用方据此保留卡片并报错（不伪造成功）。
 *
 * @param {string} appId
 * @param {Storage | null | undefined} [storage]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function removePublishedApp(appId, storage = defaultAppStorage()) {
  const id = textOf(appId)
  if (!id) return { ok: false, reason: 'invalid-app-id' }
  if (!storage || typeof storage.setItem !== 'function') return { ok: false, reason: 'storage-unavailable' }
  const map = readAppManifestMap(storage)
  if (!Object.prototype.hasOwnProperty.call(map, id)) return { ok: false, reason: 'not-found' }
  const next = { ...map }
  delete next[id]
  try {
    storage.setItem(APP_MANIFESTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
  return { ok: true }
}

/** 项目是否拥有该画布工作区（`canvasWorkspaceIds` 或任一创作页）。 */
export function projectOwnsWorkspace(project, workspaceId) {
  const ws = textOf(workspaceId)
  if (!project || !ws) return false
  const ids = Array.isArray(project.canvasWorkspaceIds) ? project.canvasWorkspaceIds : []
  if (ids.includes(ws)) return true
  const pages = Array.isArray(project.pages) ? project.pages : []
  return pages.some((page) => page && page.canvasWorkspaceId === ws)
}

/**
 * 反查应用所属项目：优先 manifest 里记下的 `projectId`，
 * 否则按 `workspaceId` 在项目列表里匹配（兼容本次改动前发布的旧记录）。
 *
 * @param {Array<{ id?: string, canvasWorkspaceIds?: string[], pages?: Array<{ canvasWorkspaceId?: string }> }>} projects
 * @param {{ projectId?: string, workspaceId?: string } | null} entry
 * @returns {object | null}
 */
export function resolveOwningProject(projects, entry) {
  const list = Array.isArray(projects) ? projects : []
  if (list.length === 0 || !entry) return null
  const projectId = textOf(entry.projectId)
  if (projectId) {
    const byId = list.find((project) => project && project.id === projectId)
    if (byId) return byId
  }
  const workspaceId = textOf(entry.workspaceId)
  if (!workspaceId) return null
  return list.find((project) => projectOwnsWorkspace(project, workspaceId)) || null
}

/**
 * 「编辑」定位目标：项目 id + 画布工作区 id + 发布时的工作流组 id。
 * 组 id 为空表示旧记录或未从组内发布，调用方按「只打开画布」降级。
 *
 * @param {{ projectId?: string, workspaceId?: string, groupId?: string } | null} entry
 */
export function resolveAppEditTarget(entry) {
  return {
    projectId: textOf(entry?.projectId),
    workspaceId: textOf(entry?.workspaceId),
    groupId: textOf(entry?.groupId),
  }
}

/**
 * 应用分类副标题的 i18n 键；未知分类回退为「应用」。
 * @param {string} category
 */
export function appCategoryLabelKey(category) {
  return APP_CATEGORY_LABEL_KEYS[textOf(category)] || 'projects.appCategoryUnknown'
}

/**
 * 已打开的应用标签页登记表：`标签页 id -> 该标签页当前展示的 appId`。
 *
 * 宿主 dsh-better-sidebar 的原生 surface 会另发一个标签页 id（实测形如 `tab6`），
 * 插件在 openTab 时拿不到；只有标签页组件渲染时能从自己的 tab 上读到它。
 * 「确认删除后关掉该应用的标签页」必须按这个真实 id 关（宿主的 close 只认它，
 * 查不到就整体放弃），因此由组件把「哪个标签页正开着哪个应用」登记回来。
 */
const openAppTabs = new Map()

/** 登记 / 更新某个标签页当前展示的应用。 */
export function registerOpenAppTab(tabId, appId) {
  const id = textOf(tabId)
  if (!id) return
  const next = textOf(appId)
  if (openAppTabs.get(id) === next) return
  openAppTabs.set(id, next)
}

/** 某个标签页当前展示的 appId（未登记或登记为空时返回空串）。 */
export function appIdOfOpenAppTab(tabId) {
  return openAppTabs.get(textOf(tabId)) || ''
}

/** 正在展示该应用的标签页 id（没有则空串）。 */
export function openAppTabIdFor(appId) {
  const app = textOf(appId)
  if (!app) return ''
  for (const [tabId, current] of openAppTabs) {
    if (current === app) return tabId
  }
  return ''
}

/** 忘掉一个标签页的登记（标签页刚被关掉时调用）。 */
export function forgetOpenAppTab(tabId) {
  openAppTabs.delete(textOf(tabId))
}

/** 测试用：清空登记表（模块级状态，跨用例必须显式重置）。 */
export function resetOpenAppTabs() {
  openAppTabs.clear()
}
