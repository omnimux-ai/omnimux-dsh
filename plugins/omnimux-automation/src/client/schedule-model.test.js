import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUTOMATION_SESSION_PREFIX,
  automationToggleMutation,
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
