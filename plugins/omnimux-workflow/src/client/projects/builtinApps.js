/**
 * 官方内置 AI 应用清单（「项目」页「AI应用」分类的第二数据源）。
 *
 * 真源：`plugins/omnimux-apps/catalog/builtin-apps.json`（随包内联）。
 * 本模块不复制清单内容，只按公开 HTTP 缝读取：
 *   GET /omnimux-apps/api/apps        -> { apps: ApplicationManifest[] }
 *   GET /omnimux-apps/api/apps/:appId -> { app: ApplicationManifest }
 * 跨包私有模块（`omnimux-apps/src/...`）一律不 import，边界见
 * docs/contracts/workflow-app-boundary.md。
 *
 * 纯数据变换 + fetch，不依赖 React，便于单测。
 */

import { toPublishedAppEntry } from './appLibrary.js'

/** 内置应用清单接口（与 host 路由 PREFIX 同源，改名即破坏读回）。 */
export const BUILTIN_APPS_ENDPOINT = '/omnimux-apps/api/apps'

function textOf(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/**
 * 内置 manifest 的封面：`metadata.coverUrl` 优先，其次取 showcase 首条的 posterUrl。
 * 两者都没有时给空串，由卡片渲染组件库占位图。
 *
 * @param {unknown} manifest
 * @returns {string}
 */
export function builtinCoverUrl(manifest) {
  const row = plainObject(manifest)
  if (!row) return ''
  const metadata = plainObject(row.metadata) || {}
  const direct = textOf(metadata.coverUrl)
  if (direct) return direct
  const showcase = plainObject(row.showcase)
  const items = Array.isArray(showcase?.items) ? showcase.items : []
  for (const item of items) {
    const poster = textOf(plainObject(item)?.posterUrl)
    if (poster) return poster
  }
  return ''
}

/**
 * 内置 manifest → 卡片条目（与 `toPublishedAppEntry` 同构，多一个 `isBuiltin` 标记）。
 * 缺 `appId` 时返回 null，不伪造条目。
 *
 * @param {unknown} manifest
 * @returns {null | {
 *   appId: string, name: string, category: string, description: string,
 *   coverUrl: string, iconSvg: string, version: string, createdAt: string,
 *   workspaceId: string, projectId: string, groupId: string, manifest: unknown,
 *   isBuiltin: true,
 * }}
 */
export function mapBuiltinAppEntry(manifest) {
  const base = toPublishedAppEntry(manifest)
  if (!base) return null
  return {
    ...base,
    coverUrl: base.coverUrl || builtinCoverUrl(manifest),
    isBuiltin: true,
  }
}

/**
 * 合并两类应用：用户已发布在前（既有顺序原样保留），内置在后（清单顺序稳定）。
 * 同一个 `appId` 只保留用户版本——用户覆盖发布的内置应用仍按用户应用管理。
 *
 * @param {Array<object>} [published]
 * @param {Array<object>} [builtin]
 * @returns {Array<object>}
 */
export function mergeAppEntries(published, builtin) {
  const userList = Array.isArray(published) ? published.filter(Boolean) : []
  const builtinList = Array.isArray(builtin) ? builtin.filter(Boolean) : []
  const seen = new Set(userList.map((entry) => textOf(entry.appId)).filter(Boolean))
  const extras = []
  for (const entry of builtinList) {
    const appId = textOf(entry.appId)
    if (!appId || seen.has(appId)) continue
    seen.add(appId)
    extras.push(entry)
  }
  return [...userList, ...extras]
}

/**
 * 拉取内置应用清单。任何失败（网络 / 非 2xx / 坏 JSON / 坏载荷）都返回
 * `{ entries: [], error: true }`：调用方据此给出真实错误提示，
 * 而不是把「读不到」伪装成「没有内置应用」。
 *
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ entries: Array<object>, error: boolean }>}
 */
export async function fetchBuiltinApps(options = {}) {
  const fetchImpl = options.fetchImpl
    || (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined)
  if (typeof fetchImpl !== 'function') return { entries: [], error: true }
  try {
    const res = await fetchImpl(BUILTIN_APPS_ENDPOINT, { headers: { Accept: 'application/json' } })
    if (!res || !res.ok) return { entries: [], error: true }
    const body = await res.json()
    const rows = Array.isArray(plainObject(body)?.apps) ? body.apps : null
    if (!rows) return { entries: [], error: true }
    const entries = []
    for (const row of rows) {
      const entry = mapBuiltinAppEntry(row)
      if (entry) entries.push(entry)
    }
    return { entries, error: false }
  } catch {
    return { entries: [], error: true }
  }
}

/**
 * 按 appId 解析单个应用 manifest：先读内置接口，接口不可用时返回 null。
 * 供 `AppTab` 在本地缓存缺失时解析内置应用（内置应用从不写 localStorage）。
 *
 * @param {string} appId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object | null>}
 */
export async function fetchAppManifest(appId, options = {}) {
  const id = textOf(appId)
  if (!id) return null
  const fetchImpl = options.fetchImpl
    || (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined)
  if (typeof fetchImpl !== 'function') return null
  try {
    const res = await fetchImpl(`${BUILTIN_APPS_ENDPOINT}/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res || !res.ok) return null
    const body = await res.json()
    const manifest = plainObject(plainObject(body)?.app)
    if (!manifest) return null
    return textOf(manifest.appId) === id ? manifest : null
  } catch {
    return null
  }
}
