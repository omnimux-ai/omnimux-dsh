/**
 * @file 状态读写 —— 冷却戳、已开草稿推文去重表、运行台账。
 *
 * 单文件 JSON：`$DSH_HOME/omnimux-intercept/state.json`。
 * 本文件是**唯一**允许读写状态目录的模块（除 `present/report-writer.js` 写战报外）。
 * 读写均经注入的 `readFile` / `writeFile`，保证单测零文件系统依赖。
 */

import path from 'node:path'

import { MAX_DRAFTED_IDS, resolveStateRoot } from './config.js'

/** 状态文件格式版本；不匹配时整体重置（避免读到半旧结构）。 */
export const STATE_VERSION = 1

/** 状态文件默认文件名。 */
export const STATE_FILE_NAME = 'state.json'

/** 日志目录名。 */
export const LOG_DIR_NAME = 'logs'

/**
 * 插件路径集合。
 * @typedef {object} PluginPaths
 * @property {string} stateRoot 状态根目录
 * @property {string} stateFile 状态文件绝对路径
 * @property {string} logDir 日志目录绝对路径
 * @property {string} outDir 战报输出目录
 */

/**
 * 运行台账条目（写入 `runs.jsonl` 与 `state.runs`）。
 * @typedef {object} RunLedgerEntry
 * @property {string} runId
 * @property {number} startedAtMs
 * @property {number} finishedAtMs
 * @property {string} source
 * @property {number} fetched
 * @property {number} candidates
 * @property {number} viral
 * @property {number} surging
 * @property {string[]} warnings
 */

/**
 * 持久化状态。
 * @typedef {object} PersistedState
 * @property {number} version
 * @property {number | null} lastRunAtMs 上次运行时刻（冷却戳）
 * @property {string[]} draftedTweetIds 已开草稿的推文 id（去重表）
 * @property {RunLedgerEntry[]} runs 运行台账（仅保留最近 50 条）
 */

/**
 * 运行台账保留条数上限。
 */
export const MAX_LEDGER_ENTRIES = 50

/**
 * 解析插件路径集合。
 * @param {{ stateRoot?: string, outDir?: string }} [config] 生效配置
 * @param {Record<string, string | undefined>} [env] 环境变量
 * @returns {PluginPaths}
 */
export function resolvePluginPaths(config = {}, env = process.env) {
  const stateRoot =
    typeof config.stateRoot === 'string' && config.stateRoot.trim()
      ? config.stateRoot.trim()
      : resolveStateRoot(env)
  const outDir =
    typeof config.outDir === 'string' && config.outDir.trim()
      ? config.outDir.trim()
      : path.join(stateRoot, 'reports')

  return {
    stateRoot,
    stateFile: path.join(stateRoot, STATE_FILE_NAME),
    logDir: path.join(stateRoot, LOG_DIR_NAME),
    outDir,
  }
}

/**
 * 空状态。
 * @returns {PersistedState}
 */
export function emptyState() {
  return { version: STATE_VERSION, lastRunAtMs: null, draftedTweetIds: [], runs: [] }
}

/**
 * 把任意输入归一为合法状态（容忍缺字段、类型错、版本不符）。
 * @param {unknown} raw 原始状态
 * @returns {PersistedState}
 */
export function normalizeState(raw) {
  if (raw === null || typeof raw !== 'object') return emptyState()
  const source = /** @type {Record<string, unknown>} */ (raw)
  if (source.version !== STATE_VERSION) return emptyState()

  const lastRunAtMs =
    typeof source.lastRunAtMs === 'number' && Number.isFinite(source.lastRunAtMs)
      ? source.lastRunAtMs
      : null
  const draftedTweetIds = Array.isArray(source.draftedTweetIds)
    ? source.draftedTweetIds.filter((id) => typeof id === 'string' && id !== '')
    : []
  const runs = Array.isArray(source.runs)
    ? /** @type {RunLedgerEntry[]} */ (source.runs.filter((entry) => entry !== null && typeof entry === 'object'))
    : []

  return {
    version: STATE_VERSION,
    lastRunAtMs,
    draftedTweetIds: draftedTweetIds.slice(-MAX_DRAFTED_IDS),
    runs: runs.slice(-MAX_LEDGER_ENTRIES),
  }
}

/**
 * 读取状态：文件不存在、内容损坏、版本不符一律回退为空状态（**不抛错**）。
 * @param {PluginPaths} paths 路径集合
 * @param {{ readFile: (p: string) => Promise<string> }} deps 注入的读文件实现
 * @returns {Promise<PersistedState>}
 */
export async function loadState(paths, deps) {
  if (typeof deps?.readFile !== 'function') return emptyState()
  let text = ''
  try {
    text = await deps.readFile(paths.stateFile)
  } catch {
    return emptyState()
  }
  if (typeof text !== 'string' || text.trim() === '') return emptyState()
  try {
    return normalizeState(JSON.parse(text))
  } catch {
    return emptyState()
  }
}

/**
 * 写入状态（父目录必须已存在；写盘失败交由调用方决定是否致命）。
 * @param {PluginPaths} paths 路径集合
 * @param {PersistedState} state 状态
 * @param {{ writeFile: (p: string, content: string) => Promise<void> }} deps 注入的写文件实现
 * @returns {Promise<void>}
 */
export async function saveState(paths, state, deps) {
  if (typeof deps?.writeFile !== 'function') return
  const normalized = normalizeState({ ...state, version: STATE_VERSION })
  await deps.writeFile(paths.stateFile, `${JSON.stringify(normalized, null, 2)}\n`)
}

/**
 * 生成运行 id：`YYYYMMDDTHHmmssZ-<4 位十六进制>`（UTC + 随机后缀）。
 * @param {number} nowMs 当前时刻（epoch ms，显式注入）
 * @param {() => number} [random] 随机数发生器（注入以便测试确定化）
 * @returns {string}
 */
export function makeRunId(nowMs, random) {
  const sample = typeof random === 'function' ? random() : 0.5
  const bounded = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.999999) : 0.5
  const suffix = Math.floor(bounded * 0x1_0000)
    .toString(16)
    .padStart(4, '0')
  return `${formatCompactUtc(nowMs)}-${suffix}`
}

/**
 * `YYYYMMDDTHHmmssZ` 压缩 UTC 时间戳。
 * @param {number} nowMs 当前时刻（epoch ms）
 * @returns {string}
 */
export function formatCompactUtc(nowMs) {
  const safe = Number.isFinite(nowMs) ? nowMs : 0
  return new Date(safe).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * ISO 8601 UTC（日志与 JSONL 内的绝对时间一律用此格式）。
 * @param {number} nowMs 当前时刻（epoch ms）
 * @returns {string}
 */
export function formatIsoUtc(nowMs) {
  const safe = Number.isFinite(nowMs) ? nowMs : 0
  return new Date(safe).toISOString()
}

/**
 * `YYYY-MM-DD HH:mm:ss`（`Asia/Shanghai`）——给用户看的展示时间。
 * @param {number} nowMs 当前时刻（epoch ms）
 * @returns {string}
 */
export function formatShanghai(nowMs) {
  const safe = Number.isFinite(nowMs) ? nowMs : 0
  const shifted = new Date(safe + 8 * 3_600_000)
  return shifted.toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * 该推文是否已经开过草稿（跨运行去重）。
 * @param {PersistedState} state 状态
 * @param {string} tweetId 推文 id
 * @returns {boolean}
 */
export function isAlreadyDrafted(state, tweetId) {
  if (typeof tweetId !== 'string' || tweetId === '') return false
  const list = Array.isArray(state?.draftedTweetIds) ? state.draftedTweetIds : []
  return list.includes(tweetId)
}

/**
 * 批量登记已开草稿的推文 id（保序、去重、按容量截断最旧项）。
 * @param {PersistedState} state 状态
 * @param {string[]} tweetIds 推文 id 列表
 * @returns {PersistedState} 新状态（不修改入参）
 */
export function markDrafted(state, tweetIds) {
  const base = normalizeState(state)
  const merged = base.draftedTweetIds.slice()
  for (const id of Array.isArray(tweetIds) ? tweetIds : []) {
    if (typeof id === 'string' && id !== '' && !merged.includes(id)) merged.push(id)
  }
  return { ...base, draftedTweetIds: merged.slice(-MAX_DRAFTED_IDS) }
}

/**
 * 写入一轮运行的台账并推进冷却戳。
 * @param {PersistedState} state 状态
 * @param {RunLedgerEntry} entry 台账条目
 * @returns {PersistedState} 新状态（不修改入参）
 */
export function recordRun(state, entry) {
  const base = normalizeState(state)
  const startedAtMs =
    typeof entry?.startedAtMs === 'number' && Number.isFinite(entry.startedAtMs)
      ? entry.startedAtMs
      : null
  const runs = base.runs.concat([entry]).slice(-MAX_LEDGER_ENTRIES)
  return {
    ...base,
    lastRunAtMs: startedAtMs ?? base.lastRunAtMs,
    runs,
  }
}

/**
 * 组装一行 JSONL 日志（脱敏：`data` 里只允许出现业务字段，禁止 token/cookie）。
 * @param {number} nowMs 事件时刻（epoch ms）
 * @param {'info' | 'warn' | 'error'} level 级别
 * @param {string} event 事件名（见 §7.3 命名空间）
 * @param {Record<string, unknown>} [data] 业务数据
 * @returns {string} 单行 JSON（不含换行）
 */
export function formatLogLine(nowMs, level, event, data = {}) {
  return JSON.stringify({
    ts: formatIsoUtc(nowMs),
    level,
    event,
    data: sanitizeLogData(data),
  })
}

/** 禁止进入日志的敏感键名（值一律替换为 `[redacted]`）。 */
const SENSITIVE_KEY_PATTERN = /token|secret|api[_-]?key|password|cookie|credential|authorization/i

/**
 * 日志数据脱敏：只保留键名与安全值。
 * @param {unknown} data 原始数据
 * @returns {Record<string, unknown>}
 */
export function sanitizeLogData(data) {
  if (data === null || typeof data !== 'object') return {}
  /** @type {Record<string, unknown>} */
  const output = {}
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (data))) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[redacted]'
      continue
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value
      continue
    }
    if (typeof value === 'string') {
      output[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value
      continue
    }
    if (Array.isArray(value)) {
      output[key] = value.length
      continue
    }
    output[key] = typeof value
  }
  return output
}

/**
 * 日志文件绝对路径。
 * @param {PluginPaths} paths 路径集合
 * @param {string} runId 运行 id
 * @returns {string}
 */
export function resolveLogPath(paths, runId) {
  return path.join(paths.logDir, `run-${runId}.jsonl`)
}
