/**
 * 工作台主从两栏共用的纯函数：派生状态、固定排序、搜索过滤、行视图模型与运行历史。
 *
 * 这里只保留与官方左侧任务树无关的逻辑；排序、过滤、状态判定全部单点实现，
 * 组件里不得再写第二份（否则四个状态胶囊、列表分组、右栏胶囊会各自漂移）。
 */

import { formatRelativeTime, formatSchedule, workspaceLabel } from './helpers.js'
import { formatRunStamp } from '../run-title.js'

export const AUTOMATION_SESSION_PREFIX = 'dsh-automation-session-'

/**
 * @typedef {'active' | 'paused' | 'finished'} AutomationState
 * @typedef {'all' | AutomationState} StatusFilter
 */

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
 * @typedef {object} MasterTaskLike
 * @property {string} id
 * @property {string} name
 * @property {'active' | 'paused'} status
 * @property {{ kind?: string }} [schedule]
 * @property {string} [nextRunAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} MasterRowViewModel
 * @property {string} id
 * @property {string} name
 * @property {'active' | 'paused'} status 数据契约里的原始状态（决定启停语义）
 * @property {AutomationState} state 客户端派生状态（决定排序分组与胶囊）
 * @property {string} scheduleText 周期摘要，由 formatSchedule 输出
 * @property {boolean} running 该任务是否有正在跑或排队的执行
 * @property {string} [nextRunAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} RunHistoryRowViewModel
 * @property {string} id
 * @property {string | null} sessionId 为空则行不可点（灰态）
 * @property {string} status 驱动 is-<status> 色点
 * @property {'schedule' | 'manual'} trigger
 * @property {string} title 会话标题（没有真实标题时退回执行时间戳）
 * @property {string} workspaceTitle
 * @property {string} relativeTime
 * @property {string} absoluteStamp 挂在 title 属性上的绝对时间戳
 * @property {boolean} unread
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
 * 【执行记录】分组数据源：按任务分组，携带状态、触发类型与执行时间。
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
 * ISO 时间戳的排序值；缺失或非法一律记 0，保证比较函数是全序且不抛异常。
 *
 * @param {string | undefined} value
 * @returns {number}
 */
function stampOf(value) {
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * 派生状态判定——**「已完成」的唯一真源**。
 *
 * `definitions` 表的 `status` 只有 `active | paused`，没有「已完成」。
 * 因此「一次性任务且没有下次执行」必须在客户端派生，禁止新增枚举值或改动数据契约。
 *
 * 口径（先判暂停再判完成）：被用户暂停的一次性任务语义上是「用户停的」而不是「跑完了」，
 * 归入 `paused` 才能让「已暂停」胶囊收到它，也才能让「恢复」有确定语义；
 * 编辑后 `nextRunAt` 重新有值即自动回到 `active`。
 *
 * @param {MasterTaskLike} task
 * @returns {AutomationState}
 */
export function automationStateOf(task) {
  if (task?.status !== 'active') return 'paused'
  return task.schedule?.kind === 'once' && task.nextRunAt === undefined ? 'finished' : 'active'
}

/** 三段排序分组权重：已开启在最前，已完成为最后一次。 */
const STATE_RANK = { active: 0, paused: 1, finished: 2 }

/**
 * 固定三段排序的比较器（排序策略取代历史上的排序下拉）：
 *
 * 1. `active`：`nextRunAt` 升序（最近要跑的排最前），无 `nextRunAt` 的排该组末尾；
 * 2. `paused`：`updatedAt` 降序（最近改过的在前）；
 * 3. `finished`：无 `nextRunAt`，同样用 `updatedAt` 降序。
 *
 * 同值一律回落到 `id` 升序，保证 React `key` 稳定、列表不抖动。
 *
 * @param {MasterTaskLike} left
 * @param {MasterTaskLike} right
 * @returns {number}
 */
export function compareMasterTasks(left, right) {
  const leftState = automationStateOf(left)
  const rightState = automationStateOf(right)
  const rank = STATE_RANK[leftState] - STATE_RANK[rightState]
  if (rank !== 0) return rank
  if (leftState === 'active') {
    const leftNext = left.nextRunAt === undefined ? undefined : stampOf(left.nextRunAt)
    const rightNext = right.nextRunAt === undefined ? undefined : stampOf(right.nextRunAt)
    if (leftNext === undefined && rightNext !== undefined) return 1
    if (leftNext !== undefined && rightNext === undefined) return -1
    if (leftNext !== undefined && rightNext !== undefined && leftNext !== rightNext) return leftNext - rightNext
  } else {
    const delta = stampOf(right.updatedAt) - stampOf(left.updatedAt)
    if (delta !== 0) return delta
  }
  return String(left.id).localeCompare(String(right.id))
}

/**
 * 三段固定排序；不改动入参，返回新数组。
 *
 * @param {readonly MasterTaskLike[]} tasks
 * @returns {MasterTaskLike[]}
 */
export function sortMasterTasks(tasks) {
  return tasks.slice().sort(compareMasterTasks)
}

/**
 * 先排序再过滤：过滤不改变组内相对顺序，避免「切胶囊后顺序变了」的困惑。
 *
 * 搜索只对 `name` 做 trim 后大小写不敏感的包含匹配，**不含** prompt 正文与周期文案
 * （否则会出现「搜出来的行里看不到关键词」）。
 *
 * @param {readonly MasterTaskLike[]} tasks 已排序的任务列表
 * @param {string} query 搜索词
 * @param {StatusFilter} statusFilter 状态胶囊
 * @returns {MasterTaskLike[]}
 */
export function filterMasterTasks(tasks, query, statusFilter) {
  const needle = String(query ?? '').trim().toLowerCase()
  const status = statusFilter ?? 'all'
  return tasks.filter((task) => {
    if (status !== 'all' && automationStateOf(task) !== status) return false
    if (needle === '') return true
    return String(task.name ?? '').toLowerCase().includes(needle)
  })
}

/**
 * 四个状态胶囊的计数：`all` 恒等于任务总数。
 *
 * @param {readonly MasterTaskLike[]} tasks
 * @returns {{ all: number, active: number, paused: number, finished: number }}
 */
export function countMasterTasks(tasks) {
  const counts = { all: tasks.length, active: 0, paused: 0, finished: 0 }
  for (const task of tasks) counts[automationStateOf(task)] += 1
  return counts
}

/**
 * 列表行视图模型：圆图标形态、周期摘要、运行中脉冲点都在这里定型，组件只负责渲染。
 *
 * @param {readonly MasterTaskLike[]} tasks
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {ReadonlySet<string>} [runningIds] 存在 running/queued 执行的任务 id
 * @returns {MasterRowViewModel[]}
 */
export function masterRowViewModels(tasks, t, runningIds = new Set()) {
  return tasks.map(task => ({
    id: task.id,
    name: task.name,
    status: task.status,
    state: automationStateOf(task),
    scheduleText: task.schedule === undefined ? '' : formatSchedule(task.schedule, t),
    running: runningIds.has(task.id),
    ...(task.nextRunAt === undefined ? {} : { nextRunAt: task.nextRunAt }),
    ...(task.updatedAt === undefined ? {} : { updatedAt: task.updatedAt }),
  }))
}

/**
 * 单个任务的运行历史行（详情栏底部专用）。
 *
 * 与 `groupAutomationRuns` 的区别：这里**保留没有 sessionId 的行**（渲染成不可点的灰态），
 * 因为「跑过但没留下会话」本身就是用户要看到的失败信号。时间倒序按 `startedAt ?? scheduledFor`。
 *
 * @param {MasterTaskLike | undefined} item 选中的任务
 * @param {readonly (ScheduleRunLike & { id: string, unread?: boolean, title?: string })[]} runs 全量执行记录
 * @param {readonly { id: string, title?: string, path?: string }[]} workspaces
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {Date} now
 * @returns {RunHistoryRowViewModel[]}
 */
export function runHistoryRows(item, runs, workspaces, t, now) {
  if (item === undefined) return []
  return runs
    .filter(run => run.automationId === item.id)
    .slice()
    .sort((left, right) => stampOf(right.startedAt ?? right.scheduledFor) - stampOf(left.startedAt ?? left.scheduledFor))
    .map((run) => {
      const source = run.startedAt ?? run.scheduledFor
      const absoluteStamp = formatRunStamp(source, item.timeZone)
      return {
        id: run.id,
        sessionId: run.sessionId === undefined || run.sessionId === '' ? null : run.sessionId,
        status: run.status,
        trigger: run.trigger ?? 'schedule',
        title: scheduledSessionTitle(run.title, absoluteStamp),
        workspaceTitle: workspaceLabel(item, workspaces),
        relativeTime: formatRelativeTime(source, now, t),
        absoluteStamp,
        unread: run.unread === true,
      }
    })
}

/**
 * 草稿投影：只取**真正参与提交**的字段，并对 `weekdays` 排序归一。
 *
 * 不能用 `JSON.stringify(form)` 代替：`defaultFormState` 每次都按当前时刻生成 `onceAt`，
 * 全量序列化会把「打开即脏」误判成脏。这里按周期类型**只投影该类型真正读取的参数**，
 * 于是「每天」的任务在 `onceAt` 随时间漂移时依然保持干净。
 *
 * @param {Record<string, unknown> | undefined} form
 * @returns {string}
 */
export function automationDraftKey(form) {
  if (form === undefined) return ''
  const kind = String(form.scheduleKind ?? '')
  const parts = [
    `name=${form.name ?? ''}`,
    `prompt=${form.prompt ?? ''}`,
    `kind=${kind}`,
    `time=${form.time ?? ''}`,
    `timeZone=${form.timeZone ?? ''}`,
    `workspaceId=${form.workspaceId ?? ''}`,
    `modelKey=${form.modelKey ?? ''}`,
    `reasoningEffort=${form.reasoningEffort ?? ''}`,
    `maxConcurrentRuns=${form.maxConcurrentRuns ?? ''}`,
    `permission=${form.permission ?? ''}`,
  ]
  if (kind === 'once') parts.push(`onceAt=${form.onceAt ?? ''}`)
  if (kind === 'interval') {
    parts.push(`everyMinutes=${form.everyMinutes ?? ''}`)
    parts.push(`anchor=${form.intervalAnchor ?? ''}`)
  }
  if (kind === 'hourly') parts.push(`hourlyMinute=${form.hourlyMinute ?? ''}`)
  if (kind === 'weekly') parts.push(`weekdays=${[...(form.weekdays ?? [])].map(Number).sort((left, right) => left - right).join(',')}`)
  if (kind === 'monthly') parts.push(`monthDay=${form.monthDay ?? ''}`)
  if (kind === 'custom') parts.push(`customDays=${form.customDays ?? ''}`)
  return parts.join('\u0001')
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
 * @property {AutomationState} state
 * @property {{ kind?: string }} [schedule]
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
 * 任务总览行只由任务定义生成，不依赖执行记录或会话是否已经创建。
 *
 * @param {readonly (OverviewAutomationLike & { schedule?: { kind?: string } })[]} automations
 * @returns {TaskOverviewRow[]}
 */
export function deriveTaskOverviewRows(automations) {
  return automations.map(item => ({
    id: item.id,
    name: item.name,
    status: item.status,
    state: automationStateOf(item),
    ...(item.schedule === undefined ? {} : { schedule: item.schedule }),
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
