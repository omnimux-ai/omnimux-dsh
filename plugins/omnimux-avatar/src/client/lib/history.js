// 任务记录（TaskRecord）的纯读取逻辑：终态判定、元数据解析、产物 URL 与宽高比。
//
// 来源：OmniMux/web/src/features/influencer/lib/history.ts（只读真源），行为 1:1。

const TERMINAL = new Set(['SUCCESS', 'FAILURE'])

/**
 * 已完成的任务不可变：状态、产物与配额都不会再变。
 * @param {string|undefined} status
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  return (
    TERMINAL.has((status ?? '').toUpperCase()) ||
    (status ?? '').toLowerCase() === 'succeeded' ||
    (status ?? '').toLowerCase() === 'failed'
  )
}

/**
 * 宽松读取控制器塞进 properties.input 的载荷。与 parseTaskMeta 不同，它不要求
 * 存在 sheet 参数，因此派生动作写入的行也能读到。
 * @param {import('./types.js').TaskRecord} record
 * @returns {import('./types.js').InfluencerTaskMeta|null}
 */
function readTaskMeta(record) {
  const raw = record.properties?.input
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    return null
  } catch {
    return null
  }
}

/**
 * 解析控制器塞进 properties.input 的 sheet 参数。
 * @param {import('./types.js').TaskRecord} record
 * @returns {import('./types.js').InfluencerTaskMeta|null}
 */
export function parseTaskMeta(record) {
  const parsed = readTaskMeta(record)
  if (!parsed) return null
  return 'selection' in parsed ? parsed : null
}

/**
 * 没有 kind 的行是角色设定板：派生行才是例外。
 * @param {import('./types.js').TaskRecord} record
 * @returns {import('./types.js').InfluencerTaskKind}
 */
export function taskKind(record) {
  return readTaskMeta(record)?.kind === 'multiview' ? 'multiview' : 'sheet'
}

/**
 * 派生设定板所属的角色设定板；设定板本身返回 null。
 * @param {import('./types.js').TaskRecord} record
 * @returns {string|null}
 */
export function parentTaskId(record) {
  if (taskKind(record) !== 'multiview') return null
  const parent = readTaskMeta(record)?.parent_task_id
  return typeof parent === 'string' && parent ? parent : null
}

/**
 * 存下来的产物 URL，保持绝对：外部提供方必须能自行抓取。
 * @param {import('./types.js').TaskRecord} record
 * @returns {string|null}
 */
function rawImageUrl(record) {
  const art = record.artifacts?.find((a) => (a.content_url ?? a.url ?? '').length > 0)
  return art?.content_url ?? art?.url ?? null
}

/**
 * 绝对产物 URL，供把图片交给别人（下载，或需要经网络抓取的上游提供方）的调用方使用。
 * 相对 URL 直接拒绝而不是补全：它只在本浏览器会话里有效。
 * @param {import('./types.js').TaskRecord} record
 * @returns {string|null}
 */
export function taskAbsoluteImageUrl(record) {
  const url = rawImageUrl(record)
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : null
}

/**
 * 控制器塞进 properties.input 的生成尺寸，转成 CSS `aspect-ratio` 值。
 * 预留尺寸可避免图片加载时把下方画廊顶动；读不到尺寸的记录保持自然尺寸。
 * 工作台提交 `9:16`/`16:9`，而控制器自身默认值与更早的记录是 `1024x1536` 这类像素尺寸。
 * @param {import('./types.js').TaskRecord} record
 * @returns {string|undefined}
 */
export function taskAspectRatio(record) {
  const raw = record.properties?.input
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.size !== 'string') return undefined
    const match = /^(\d{1,4})\s*[:x*]\s*(\d{1,4})$/i.exec(parsed.size.trim())
    if (!match) return undefined
    const width = Number(match[1])
    const height = Number(match[2])
    if (!width || !height) return undefined
    return `${width} / ${height}`
  } catch {
    return undefined
  }
}

/**
 * 网关在任意命中它的 origin 上都提供产物内容；保持 URL 相对，
 * 这样开发代理或其他部署主机仍能解析。
 * @param {string} url
 * @returns {string}
 */
function sameOrigin(url) {
  try {
    return new URL(url).pathname + new URL(url).search
  } catch {
    return url
  }
}

/**
 * 画廊展示用的相对图片 URL。
 * @param {import('./types.js').TaskRecord} record
 * @returns {string|null}
 */
export function taskImageUrl(record) {
  const art = record.artifacts?.find((a) => (a.content_url ?? a.url ?? '').length > 0)
  const url = art?.content_url ?? art?.url
  if (url) return sameOrigin(url)
  if (record.result_url) return sameOrigin(record.result_url)
  if (record.legacy_content_url) return sameOrigin(record.legacy_content_url)
  return null
}
