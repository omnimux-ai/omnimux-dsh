/**
 * 工作台双视图共用的纯函数：按任务分组的执行会话、任务总览行、启停映射。
 *
 * 这里只保留与官方左侧任务树无关的逻辑；原生任务/工作区/归档包装全部不在本插件内。
 */

import { formatRunStamp } from '../run-title.js'

export const AUTOMATION_SESSION_PREFIX = 'dsh-automation-session-'

/**
 * @typedef {object} ScheduledSessionRow
 * @property {string} id 会话 id（只来自 run 记录，绝不拼接）
 * @property {boolean} running
 * @property {string} label
 */

/**
 * @typedef {object} ScheduledGroup
 * @property {string} id 任务 id
 * @property {string} name 任务名称
 * @property {readonly ScheduledSessionRow[]} sessions
 */

/**
 * @typedef {object} ScheduleRunLike
 * @property {string} automationId
 * @property {string} [automationName]
 * @property {string | null} [sessionId]
 * @property {string} status
 * @property {'schedule' | 'manual'} [trigger]
 * @property {string | null} [startedAt]
 * @property {string} scheduledFor
 */

/**
 * @typedef {object} AutomationRunRow
 * @property {string} id run id
 * @property {string} sessionId
 * @property {string} status
 * @property {'schedule' | 'manual'} trigger
 * @property {string} scheduledFor
 * @property {string | null} [startedAt]
 * @property {string | null} [finishedAt]
 * @property {string | null} [summary]
 * @property {boolean} [unread]
 * @property {string} label 执行时间戳（按该任务时区）
 */

/**
 * @typedef {object} AutomationRunGroup
 * @property {string} id 任务 id
 * @property {string} name 任务名称
 * @property {string} timeZone
 * @property {readonly AutomationRunRow[]} runs 按执行时间倒序
 */

/**
 * 定时会话标题：优先用 Session 真实标题，没有再用执行时间兜底。
 *
 * @param {string | undefined} liveTitle
 * @param {string} fallbackLabel
 * @returns {string}
 */
export function scheduledSessionTitle(liveTitle, fallbackLabel) {
  const title = liveTitle?.trim() ?? ''
  return title !== '' ? title : fallbackLabel
}

/**
 * 宿主会话簿的 updatedAt 可能是毫秒数或 ISO 字符串，统一成 ISO。
 *
 * @param {number | string | undefined} value
 * @param {string} fallback
 * @returns {string}
 */
export function sessionUpdatedAtIso(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  if (typeof value === 'string' && value.trim() !== '') return value
  return fallback
}

/**
 * 按任务把执行会话分组：任务定义在前，只有历史记录的孤儿任务在后。
 * 只保留真正产生过 sessionId 的 run。
 *
 * @param {readonly { id: string, name: string, timeZone?: string }[]} automations
 * @param {readonly ScheduleRunLike[]} runs
 * @returns {ScheduledGroup[]}
 */
export function groupScheduledSessions(automations, runs) {
  const nameById = new Map()
  const timeZoneById = new Map()
  for (const item of automations) {
    nameById.set(item.id, item.name)
    if (typeof item.timeZone === 'string' && item.timeZone !== '') timeZoneById.set(item.id, item.timeZone)
  }
  for (const run of runs) {
    const stored = (run.automationName || '').trim()
    if (stored !== '' && stored !== run.automationId && !nameById.has(run.automationId)) {
      nameById.set(run.automationId, stored)
    }
  }
  const ids = []
  const seen = new Set()
  for (const item of automations) {
    if (seen.has(item.id)) continue
    ids.push(item.id)
    seen.add(item.id)
  }
  for (const run of runs) {
    if (run.sessionId === undefined || run.sessionId === null || run.sessionId === '' || seen.has(run.automationId)) continue
    ids.push(run.automationId)
    seen.add(run.automationId)
  }
  return ids.map((id) => {
    const name = nameById.get(id) ?? id
    return {
      id,
      name,
      sessions: runs
        .filter(run => run.automationId === id && run.sessionId !== undefined && run.sessionId !== null && run.sessionId !== '')
        .slice()
        .sort((left, right) => Date.parse(right.startedAt ?? right.scheduledFor) - Date.parse(left.startedAt ?? left.scheduledFor))
        .map(run => ({
          id: run.sessionId,
          running: run.status === 'running' || run.status === 'queued',
          label: `${formatRunStamp(run.startedAt ?? run.scheduledFor, timeZoneById.get(id))} - ${name}`,
        })),
    }
  }).filter(group => group.sessions.length > 0)
}

/**
 * 【执行记录】视图的数据源：按任务分组，携带状态、触发类型与执行时间。
 *
 * @param {readonly { id: string, name: string, timeZone?: string }[]} automations
 * @param {readonly ScheduleRunLike[]} runs
 * @returns {AutomationRunGroup[]}
 */
export function groupAutomationRuns(automations, runs) {
  const nameById = new Map()
  const timeZoneById = new Map()
  for (const item of automations) {
    nameById.set(item.id, item.name)
    if (typeof item.timeZone === 'string' && item.timeZone !== '') timeZoneById.set(item.id, item.timeZone)
  }
  for (const run of runs) {
    const stored = (run.automationName || '').trim()
    if (stored !== '' && stored !== run.automationId && !nameById.has(run.automationId)) {
      nameById.set(run.automationId, stored)
    }
  }
  const ids = []
  const seen = new Set()
  for (const item of automations) {
    if (seen.has(item.id)) continue
    ids.push(item.id)
    seen.add(item.id)
  }
  for (const run of runs) {
    if (seen.has(run.automationId)) continue
    ids.push(run.automationId)
    seen.add(run.automationId)
  }
  return ids.map((id) => {
    const timeZone = timeZoneById.get(id)
    const name = nameById.get(id) ?? id
    return {
      id,
      name,
      timeZone: timeZone ?? '',
      runs: runs
        .filter(run => run.automationId === id && run.sessionId !== undefined && run.sessionId !== null && run.sessionId !== '')
        .slice()
        .sort((left, right) => Date.parse(right.startedAt ?? right.scheduledFor) - Date.parse(left.startedAt ?? left.scheduledFor))
        .map(run => ({
          id: run.id,
          sessionId: run.sessionId,
          status: run.status,
          trigger: run.trigger,
          scheduledFor: run.scheduledFor,
          startedAt: run.startedAt ?? null,
          finishedAt: run.finishedAt ?? null,
          summary: run.summary ?? null,
          unread: run.unread === true,
          label: formatRunStamp(run.startedAt ?? run.scheduledFor, timeZone),
        })),
    }
  }).filter(group => group.runs.length > 0)
}

/**
 * @typedef {object} OverviewAutomationLike
 * @property {string} id
 * @property {string} name
 * @property {'active' | 'paused'} status
 * @property {string} [nextRunAt]
 */

/**
 * @typedef {object} TaskOverviewRow
 * @property {string} id
 * @property {string} name
 * @property {'active' | 'paused'} status
 * @property {string} [nextRunAt]
 */

/**
 * 启停开关映射：active → pause，其余 → resume。
 *
 * @param {'active' | 'paused'} status
 * @returns {'pause' | 'resume'}
 */
export function automationToggleMutation(status) {
  return status === 'active' ? 'pause' : 'resume'
}

/**
 * 任务总览只由任务定义生成，不依赖执行记录或会话是否已经创建。
 *
 * @param {readonly OverviewAutomationLike[]} automations
 * @returns {TaskOverviewRow[]}
 */
export function deriveTaskOverviewRows(automations) {
  return automations.map(item => ({
    id: item.id,
    name: item.name,
    status: item.status,
    ...(item.nextRunAt === undefined ? {} : { nextRunAt: item.nextRunAt }),
  }))
}

/**
 * 归档立即摘掉。宿主会话簿经常晚于自动化快照，缺席不能当成已删除。
 *
 * @param {string | undefined} sessionId
 * @param {ReadonlySet<string>} archived
 * @returns {boolean}
 */
export function keepScheduledSessionLink(sessionId, archived) {
  if (sessionId === undefined || sessionId === '') return false
  return !archived.has(sessionId)
}

/**
 * 收集所有仍然挂在自动化快照上的会话 id。
 *
 * @param {readonly { sessionId?: string | null }[] | undefined} runs
 * @returns {Set<string>}
 */
export function collectScheduledSessionIds(runs) {
  const ids = new Set()
  for (const run of runs ?? []) {
    const id = run.sessionId
    if (typeof id === 'string' && id !== '') ids.add(id)
  }
  return ids
}

const AUTOMATION_TITLE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/

/**
 * 判断某个会话是不是本插件跑出来的定时会话：前缀命中、仍挂在定时快照上，
 * 或标题是定时跑出来的时间戳。
 *
 * @param {string} id
 * @param {{ title?: string, displayTitle?: string } | undefined} item
 * @param {ReadonlySet<string>} [scheduledIds]
 * @returns {boolean}
 */
export function isAutomationSidebarSession(id, item, scheduledIds = new Set()) {
  if (id.startsWith(AUTOMATION_SESSION_PREFIX) || scheduledIds.has(id)) return true
  const title = String(item?.title ?? item?.displayTitle ?? '')
  return AUTOMATION_TITLE_RE.test(title)
}
