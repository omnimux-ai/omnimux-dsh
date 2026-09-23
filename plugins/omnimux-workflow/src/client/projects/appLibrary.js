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

import { PRESET_WORKFLOW_MAP } from './presetWorkflows.js'
import { createCanvasProjectPage, createProject, workflowRequest } from '../api.js'

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

/**
 * 判断某个应用是否属于当前用户拥有的应用（拥有源工程可直接编辑）。
 *
 * 判定规则：
 * 1. 官方预置应用（OmniMux Official 或以 app-creatify- 开头等）为公共应用，不属于当前用户；
 * 2. 清单里记录的 projectId 或 workspaceId 必须在本地项目列表（projects）中存在；
 * 3. 满足上述条件时判定为当前用户的应用，否则判定为不同用户/模板应用。
 *
 * @param {object | null | undefined} manifest
 * @param {Array<object>} [projects]
 * @returns {boolean}
 */
export function isAppOwnedByUser(manifest, projects = []) {
  if (!manifest || typeof manifest !== 'object') return false
  const author = textOf(manifest.metadata?.author)
  if (author === 'OmniMux Official' || manifest.metadata?.isBuiltin) return false
  const appId = textOf(manifest.appId)
  if (appId.startsWith('app-creatify-')) return false

  const target = resolveAppEditTarget(toPublishedAppEntry(manifest) || {
    projectId: manifest.workflowBinding?.projectId,
    workspaceId: manifest.workflowBinding?.workspaceId,
    groupId: manifest.workflowBinding?.sourceGroupId,
  })
  const project = resolveOwningProject(projects, target)
  return Boolean(project)
}

/**
 * 获取预置官方应用的工作流拓扑（节点与连线）。
 * @param {string} appId
 * @returns {{ name: string, nodes: Array<object>, edges: Array<object> } | null}
 */
export function getPresetWorkflowSnapshot(appId) {
  const id = textOf(appId)
  if (!id) return null
  return PRESET_WORKFLOW_MAP[id] || null
}

/**
 * 将一组节点和边封装在工作流组（GroupNode）容器内部。
 * 每一个工作流打组都是一个独立可执行、可打包发布的应用单元。
 *
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {string} [title]
 * @returns {{ groupId: string, nodes: Array<object>, edges: Array<object> }}
 */
export function wrapNodesInGroup(nodes = [], edges = [], title = '工作流 (副本)') {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { groupId: '', nodes: [], edges: Array.isArray(edges) ? edges : [] }
  }

  // 1. 如果已有顶层 GroupNode，更新标题并重用
  const existingGroup = nodes.find((n) => n && n.type === 'group')
  if (existingGroup) {
    const updatedNodes = nodes.map((n) => (n.id === existingGroup.id ? {
      ...n,
      data: { ...(n.data || {}), title },
    } : n))
    return {
      groupId: existingGroup.id,
      nodes: updatedNodes,
      edges: Array.isArray(edges) ? [...edges] : [],
    }
  }

  // 2. 否则根据子节点几何范围计算包围盒
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    if (!node) continue
    const x = typeof node.position?.x === 'number' ? node.position.x : 0
    const y = typeof node.position?.y === 'number' ? node.position.y : 0
    const w = node.width || (node.style?.width ? Number(node.style.width) : 240) || 240
    const h = node.height || (node.style?.height ? Number(node.style.height) : 180) || 180
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  }

  const padding = 36
  const groupX = Math.max(0, minX - padding)
  const groupY = Math.max(0, minY - padding)
  const groupWidth = Math.max(680, (maxX - minX) + padding * 2)
  const groupHeight = Math.max(380, (maxY - minY) + padding * 2)
  const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const groupNode = {
    id: groupId,
    type: 'group',
    position: { x: groupX, y: groupY },
    width: groupWidth,
    height: groupHeight,
    selected: true,
    style: {
      width: groupWidth,
      height: groupHeight,
      zIndex: 0,
    },
    data: {
      title,
      color: '',
      isCollapsed: false,
      expandedBounds: { width: groupWidth, height: groupHeight },
      minWidth: 260,
      minHeight: 120,
      padding: 32,
      nodeIds: nodes.map((n) => n.id),
    },
  }

  const childNodes = nodes.map((node) => {
    const absX = typeof node.position?.x === 'number' ? node.position.x : 0
    const absY = typeof node.position?.y === 'number' ? node.position.y : 0
    return {
      ...node,
      parentId: groupId,
      position: {
        x: Math.max(16, absX - groupX),
        y: Math.max(48, absY - groupY),
      },
      extent: 'parent',
      selected: false,
    }
  })

  return {
    groupId,
    nodes: [groupNode, ...childNodes],
    edges: Array.isArray(edges) ? [...edges] : [],
  }
}

/**
 * 根据应用清单创建一个全新的项目工程副本，并将应用工作流节点打组保存至新画布。
 *
 * @param {object} manifest
 * @param {{
 *   createProjectFn?: Function,
 *   requestFn?: Function,
 * }} [deps]
 * @returns {Promise<{ project: object, workspaceId: string, groupId: string }>}
 */
export async function createProjectForkFromManifest(manifest, deps = {}) {
  const appName = textOf(manifest?.metadata?.name) || 'AI 应用'
  const projectTitle = `${appName} (副本)`
  const pageTitle = `${appName}_副本`
  const hostProject = deps.hostProject && typeof deps.hostProject === 'object' ? deps.hostProject : null
  const groupTitle = hostProject?.id ? pageTitle : projectTitle

  let rawNodes = manifest?.workflowBinding?.snapshot?.nodes
  let rawEdges = manifest?.workflowBinding?.snapshot?.edges

  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    const preset = getPresetWorkflowSnapshot(manifest?.appId)
    if (preset) {
      rawNodes = preset.nodes
      rawEdges = preset.edges
    }
  }
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    rawNodes = []
    rawEdges = []
  }

  const { groupId, nodes, edges } = wrapNodesInGroup(rawNodes, rawEdges, groupTitle)
  const doRequest = deps.requestFn || workflowRequest

  if (hostProject?.id) {
    const pages = Array.isArray(hostProject.pages) ? hostProject.pages : []
    const active = pages.find((page) => page?.id === hostProject.activePageId) || pages[0]
    const hostCanvasId = active?.canvasWorkspaceId
      || hostProject.canvasWorkspaceId
      || (Array.isArray(hostProject.canvasWorkspaceIds) ? hostProject.canvasWorkspaceIds[0] : '')
      || ''
    if (!hostCanvasId) {
      throw new Error('未能为副本分配画布工作区')
    }
    const doCreatePage = deps.createPageFn || createCanvasProjectPage
    const pageRes = await doCreatePage(hostCanvasId, pageTitle)
    if (!pageRes || !pageRes.ok) {
      throw new Error(pageRes?.body?.error || pageRes?.body?.message || '创建创作页副本失败')
    }
    const workspaceId = pageRes.body?.page?.canvasWorkspaceId
      || pageRes.body?.workspace?.id
      || ''
    if (!workspaceId) {
      throw new Error('未能为副本分配画布工作区')
    }
    const saved = await doRequest(`/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'PUT',
      body: { nodes, edges },
    })
    if (!saved || saved.ok === false) {
      throw new Error(saved?.body?.error || saved?.body?.message || '保存创作页副本失败')
    }
    const page = pageRes.body?.page
    if (!page?.id) {
      throw new Error('创建创作页副本失败')
    }
    return {
      project: pageRes.body?.project || hostProject,
      page,
      workspaceId,
      groupId,
    }
  }

  const doCreateProject = deps.createProjectFn || createProject
  const createRes = await doCreateProject(projectTitle)
  if (!createRes || !createRes.ok || !createRes.body?.project) {
    throw new Error(createRes?.body?.error || createRes?.body?.message || '创建项目工程副本失败')
  }

  const newProject = createRes.body.project
  const workspaceId = Array.isArray(newProject.canvasWorkspaceIds) ? newProject.canvasWorkspaceIds[0] : ''
  if (!workspaceId) {
    throw new Error('未能为副本分配画布工作区')
  }

  const saved = await doRequest(`/omnimux-workflow/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'PUT',
    body: { nodes, edges },
  })
  if (!saved || saved.ok === false) {
    throw new Error(saved?.body?.error || saved?.body?.message || '保存创作页副本失败')
  }

  return {
    project: newProject,
    workspaceId,
    groupId,
  }
}

