import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUTOMATION_SESSION_PREFIX,
  automationDraftKey,
  automationStateOf,
  automationToggleMutation,
  compareMasterTasks,
  countMasterTasks,
  filterMasterTasks,
  masterRowViewModels,
  runHistoryRows,
  sortMasterTasks,
  collectScheduledSessionIds,
  deriveTaskOverviewRows,
  groupAutomationRuns,
  groupScheduledSessions,
  isAutomationSidebarSession,
  keepScheduledSessionLink,
  scheduledSessionTitle,
  sessionUpdatedAtIso,
} from './schedule-model.js'

/** @returns {any} */
const t = (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`)

const AUTOMATIONS = [
  { id: 'a1', name: '每日检查', timeZone: 'Asia/Shanghai', status: 'active', nextRunAt: '2026-08-17T01:00:00.000Z' },
  { id: 'a2', name: '每周依赖巡检', timeZone: 'UTC', status: 'paused' },
]

const RUNS = [
  {
    id: 'run_1',
    automationId: 'a1',
    status: 'succeeded',
    trigger: 'schedule',
    sessionId: 'sess_1',
    scheduledFor: '2026-08-16T01:00:00.000Z',
    startedAt: '2026-08-16T01:00:02.000Z',
  },
  {
    id: 'run_2',
    automationId: 'a1',
    status: 'running',
    trigger: 'manual',
    sessionId: 'sess_2',
    scheduledFor: '2026-08-16T02:00:00.000Z',
    startedAt: '2026-08-16T02:00:00.000Z',
  },
  { id: 'run_3', automationId: 'a1', status: 'skipped', trigger: 'schedule', sessionId: null, scheduledFor: '2026-08-16T03:00:00.000Z' },
]

test('定时会话 id 前缀是上游兼容契约，不得改动', () => {
  assert.equal(AUTOMATION_SESSION_PREFIX, 'dsh-automation-session-')
})

test('按任务分组只保留真正产生过会话的运行，并按执行时间倒序', () => {
  const groups = groupScheduledSessions(AUTOMATIONS, RUNS)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, 'a1')
  assert.equal(groups[0].name, '每日检查')
  assert.deepEqual(groups[0].sessions.map(item => item.id), ['sess_2', 'sess_1'])
  assert.deepEqual(groups[0].sessions.map(item => item.running), [true, false])
  assert.match(groups[0].sessions[0].label, /^2026-08-16 10:00 - 每日检查$/)
})

test('已删除任务的历史运行仍按孤儿任务分组，名称取快照', () => {
  const groups = groupScheduledSessions([], [
    { automationId: 'gone', automationName: '已删除的任务', status: 'failed', sessionId: 'sess_9', scheduledFor: '2026-08-16T05:00:00.000Z' },
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].name, '已删除的任务')
})

test('执行记录视图按任务携带状态、触发类型与按任务时区渲染的时间', () => {
  const groups = groupAutomationRuns(AUTOMATIONS, RUNS)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].timeZone, 'Asia/Shanghai')
  assert.deepEqual(groups[0].runs.map(run => run.id), ['run_2', 'run_1'])
  assert.equal(groups[0].runs[0].trigger, 'manual')
  assert.equal(groups[0].runs[0].status, 'running')
  assert.equal(groups[0].runs[1].label, '2026-08-16 09:00')
  assert.equal(groups[0].runs[1].unread, false)
})

test('孤儿任务在执行记录里也保留，不丢历史', () => {
  const groups = groupAutomationRuns([], [
    { id: 'run_9', automationId: 'gone', automationName: '旧任务', status: 'succeeded', trigger: 'schedule', sessionId: 'sess_9', scheduledFor: '2026-08-16T05:00:00.000Z' },
  ])
  assert.equal(groups[0].name, '旧任务')
  assert.equal(groups[0].timeZone, '')
})

test('启停开关映射与总览行只依赖任务定义', () => {
  assert.equal(automationToggleMutation('active'), 'pause')
  assert.equal(automationToggleMutation('paused'), 'resume')
  const rows = deriveTaskOverviewRows(AUTOMATIONS)
  assert.deepEqual(rows.map(row => row.id), ['a1', 'a2'])
  assert.equal(rows[0].nextRunAt, '2026-08-17T01:00:00.000Z')
  assert.equal('nextRunAt' in rows[1], false)
})

test('归档立即摘掉链接，缺席不等于已删除', () => {
  assert.equal(keepScheduledSessionLink('sess_1', new Set()), true)
  assert.equal(keepScheduledSessionLink('sess_1', new Set(['sess_1'])), false)
  assert.equal(keepScheduledSessionLink(undefined, new Set()), false)
  assert.equal(keepScheduledSessionLink('', new Set()), false)
})

test('会话 id 集合只收非空字符串', () => {
  const ids = collectScheduledSessionIds([{ sessionId: 'a' }, { sessionId: null }, { sessionId: '' }, {}])
  assert.deepEqual([...ids], ['a'])
  assert.equal(collectScheduledSessionIds(undefined).size, 0)
})

test('标题兜底与时间戳归一不制造假数据', () => {
  assert.equal(scheduledSessionTitle('  真实标题 ', '兜底'), '真实标题')
  assert.equal(scheduledSessionTitle(undefined, '兜底'), '兜底')
  assert.equal(sessionUpdatedAtIso(1755306002000, 'fallback'), new Date(1755306002000).toISOString())
  assert.equal(sessionUpdatedAtIso('2026-08-16T01:00:00.000Z', 'fallback'), '2026-08-16T01:00:00.000Z')
  assert.equal(sessionUpdatedAtIso('   ', 'fallback'), 'fallback')
  assert.equal(sessionUpdatedAtIso(undefined, 'fallback'), 'fallback')
})

test('定时会话识别覆盖前缀、仍挂快照与时间戳标题三种情况', () => {
  assert.equal(isAutomationSidebarSession(`${AUTOMATION_SESSION_PREFIX}x`), true)
  assert.equal(isAutomationSidebarSession('sess_1', undefined, new Set(['sess_1'])), true)
  assert.equal(isAutomationSidebarSession('sess_2', { title: '2026-08-16 09:00 - 每日检查' }), true)
  assert.equal(isAutomationSidebarSession('sess_3', { title: '普通会话' }), false)
})

/* ── 主从两栏模型层 ─────────────────────────────────────────────────────
   AC-2「开启 → 开启 → 暂停 → 已完成」的排序断言与 AC-3「已完成只命中一次性任务」
   共用同一份夹具：2 个已开启、1 个已暂停、1 个一次性且已跑完。 */

const MASTER_TASKS = [
  {
    id: 'a4',
    name: '一次性发布检查',
    status: 'active',
    schedule: { kind: 'once', at: '2026-08-16T04:00:00.000Z', timeZone: 'Asia/Shanghai' },
    updatedAt: '2026-08-16T04:00:00.000Z',
  },
  {
    id: 'a2',
    name: '每十分钟巡检',
    status: 'active',
    schedule: { kind: 'interval', everyMinutes: 10, timeZone: 'Asia/Shanghai' },
    nextRunAt: '2026-08-17T02:00:00.000Z',
    updatedAt: '2026-08-16T02:00:00.000Z',
  },
  {
    id: 'a3',
    name: '每周依赖巡检',
    status: 'paused',
    schedule: { kind: 'weekly', time: '09:00', weekdays: [1], timeZone: 'Asia/Shanghai' },
    updatedAt: '2026-08-16T03:00:00.000Z',
  },
  {
    id: 'a1',
    name: '每日检查',
    status: 'active',
    schedule: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' },
    nextRunAt: '2026-08-17T01:00:00.000Z',
    updatedAt: '2026-08-16T01:00:00.000Z',
  },
]

test('派生状态：一次性且无下次执行才是已完成，暂停优先于已完成', () => {
  assert.equal(automationStateOf({ status: 'active', schedule: { kind: 'daily' } }), 'active')
  assert.equal(automationStateOf({ status: 'paused', schedule: { kind: 'daily' } }), 'paused')
  assert.equal(automationStateOf(MASTER_TASKS[0]), 'finished')
  // 被用户暂停的一次性任务归 paused，否则「恢复」就没有确定语义。
  assert.equal(automationStateOf({ status: 'paused', schedule: { kind: 'once' } }), 'paused')
  // 重复型任务永不进入已完成。
  assert.equal(automationStateOf({ status: 'active', schedule: { kind: 'interval' }, nextRunAt: undefined }), 'active')
})

test('三段固定排序：开启（按下次执行升序）→ 暂停 → 已完成', () => {
  assert.deepEqual(
    sortMasterTasks(MASTER_TASKS).map(task => task.id),
    ['a1', 'a2', 'a3', 'a4'],
  )
  // 不改动入参，保证 React 侧拿到的仍是服务端快照。
  assert.equal(MASTER_TASKS[0].id, 'a4')
})

test('同段内无下次执行排组尾，暂停与已完成为 updatedAt 降序，同值按 id 升序', () => {
  const items = [
    { id: 'b', name: 'B', status: 'active', schedule: { kind: 'daily' } },
    { id: 'a', name: 'A', status: 'active', schedule: { kind: 'daily' } },
    { id: 'c', name: 'C', status: 'paused', schedule: { kind: 'daily' }, updatedAt: '2026-08-16T01:00:00.000Z' },
    { id: 'd', name: 'D', status: 'paused', schedule: { kind: 'daily' }, updatedAt: '2026-08-16T05:00:00.000Z' },
  ]
  assert.deepEqual(sortMasterTasks(items).map(item => item.id), ['a', 'b', 'd', 'c'])
  assert.equal(compareMasterTasks({ id: 'x', status: 'active', schedule: {} }, { id: 'x', status: 'active', schedule: {} }), 0)
})

test('搜索只匹配任务名并忽略大小写与首尾空格，清空即恢复', () => {
  const sorted = sortMasterTasks(MASTER_TASKS)
  assert.deepEqual(filterMasterTasks(sorted, '每日', 'all').map(task => task.id), ['a1'])
  assert.deepEqual(filterMasterTasks(sorted, '  巡检 ', 'all').map(task => task.id), ['a2', 'a3'])
  assert.equal(filterMasterTasks(sorted, '', 'all').length, 4)
  assert.equal(filterMasterTasks(sorted, '不存在的任务', 'all').length, 0)
})

test('「已完成」胶囊只命中一次性且已跑完的任务，契约未新增枚举', () => {
  const sorted = sortMasterTasks(MASTER_TASKS)
  assert.deepEqual(filterMasterTasks(sorted, '', 'finished').map(task => task.id), ['a4'])
  assert.deepEqual(filterMasterTasks(sorted, '', 'paused').map(task => task.id), ['a3'])
  assert.deepEqual(filterMasterTasks(sorted, '', 'active').map(task => task.id), ['a1', 'a2'])
  const counts = countMasterTasks(MASTER_TASKS)
  assert.deepEqual(counts, { all: 4, active: 2, paused: 1, finished: 1 })
  assert.equal(counts.active + counts.paused + counts.finished, counts.all)
})

test('列表行视图模型携带派生状态、周期摘要与运行中标记', () => {
  const t = (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`)
  const rows = masterRowViewModels(sortMasterTasks(MASTER_TASKS), t, new Set(['a2']))
  assert.deepEqual(rows.map(row => row.state), ['active', 'active', 'paused', 'finished'])
  assert.equal(rows[0].scheduleText, 'schedule.dailyAt:{"time":"09:00"}')
  assert.equal(rows[1].running, true)
  assert.equal(rows[0].running, false)
  assert.equal(rows[3].status, 'active')
})

test('运行历史按 startedAt ?? scheduledFor 倒序，无会话的行保留为灰态', () => {
  const t = (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`)
  const item = { id: 'a1', name: '每日检查', timeZone: 'Asia/Shanghai', workspaceId: 'ws_1' }
  const now = new Date('2026-08-16T05:00:00.000Z')
  const rows = runHistoryRows(item, [
    { id: 'run_1', automationId: 'a1', sessionId: 'sess_1', status: 'succeeded', trigger: 'schedule', scheduledFor: '2026-08-16T01:00:00.000Z', startedAt: '2026-08-16T01:00:00.000Z' },
    { id: 'run_2', automationId: 'a1', sessionId: null, status: 'skipped', trigger: 'schedule', scheduledFor: '2026-08-16T04:00:00.000Z' },
    { id: 'run_3', automationId: 'a9', sessionId: 'sess_9', status: 'succeeded', trigger: 'manual', scheduledFor: '2026-08-16T09:00:00.000Z' },
  ], [{ id: 'ws_1', title: '演示工作区' }], t, now)

  assert.deepEqual(rows.map(row => row.id), ['run_2', 'run_1'])
  assert.equal(rows[0].sessionId, null)
  assert.equal(rows[0].absoluteStamp, '2026-08-16 12:00')
  assert.equal(rows[0].title, '2026-08-16 12:00')
  assert.equal(rows[1].workspaceTitle, '演示工作区')
  assert.equal(rows[1].trigger, 'schedule')
  assert.equal(runHistoryRows(undefined, [], [], t, now).length, 0)
})

test('草稿投影只取真正参与提交的字段，避免「打开即脏」与「切周期后假脏」', () => {
  const base = {
    name: 'A', prompt: 'p', scheduleKind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai',
    onceAt: '2026-08-16T10:00', everyMinutes: '60', intervalAnchor: '',
    hourlyMinute: '00', monthDay: '1', customDays: '2', weekdays: [1, 2, 3, 4, 5],
    workspaceId: 'ws_1', modelKey: 'default', reasoningEffort: 'none', maxConcurrentRuns: '1', permission: 'read-only',
  }
  // 「每天」的任务里 onceAt 随时间漂移不算脏；只有切到「不重复」才把它纳入投影。
  assert.equal(automationDraftKey(base), automationDraftKey({ ...base, onceAt: '2026-08-16T23:00' }))
  assert.notEqual(automationDraftKey(base), automationDraftKey({ ...base, onceAt: '2026-08-16T23:00', scheduleKind: 'once' }))
  // 周一/周三 与 周三/周一 是同一个提交产物。
  const weekly = { ...base, scheduleKind: 'weekly', weekdays: [1, 3] }
  assert.equal(automationDraftKey(weekly), automationDraftKey({ ...weekly, weekdays: [3, 1] }))
  assert.notEqual(automationDraftKey(weekly), automationDraftKey({ ...weekly, weekdays: [1, 3, 5] }))
  assert.notEqual(automationDraftKey(base), automationDraftKey({ ...base, time: '10:00' }))
  assert.equal(automationDraftKey(undefined), '')
})
