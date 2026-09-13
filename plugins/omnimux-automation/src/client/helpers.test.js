import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import {
  formatDuration,
  formatRelativeTime,
  formatSchedule,
  formatWithin,
} from './helpers.js'

/** @returns {any} */
const t = (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`)

const ONCE_AT_SHANGHAI = { kind: 'once', at: '2026-08-16T01:00:00.000Z', timeZone: 'Asia/Shanghai' }

/** 子进程里动态 import 用的绝对地址。 */
const HELPERS_URL = new URL('./helpers.js', import.meta.url).href

test('formatSchedule 覆盖七种计划类型，缺一不可', () => {
  assert.equal(formatSchedule(ONCE_AT_SHANGHAI, t), 'schedule.onceAt:{"time":"2026-08-16 09:00"}')
  assert.equal(formatSchedule({ kind: 'interval', everyMinutes: 30 }, t), 'schedule.everyMinutes:{"count":30}')
  assert.equal(formatSchedule({ kind: 'daily', time: '09:00' }, t), 'schedule.dailyAt:{"time":"09:00"}')
  assert.equal(
    formatSchedule({ kind: 'weekly', weekdays: [1, 5], time: '09:00' }, t),
    'schedule.weeklyAt:{"days":"day.1、day.5","time":"09:00"}',
  )
  assert.equal(formatSchedule({ kind: 'hourly', minute: 15 }, t), 'schedule.hourlyAt:{"minute":"15"}')
  assert.equal(formatSchedule({ kind: 'monthly', day: 31, time: '09:00' }, t), 'schedule.monthlyAt:{"day":31,"time":"09:00"}')
  assert.equal(formatSchedule({ kind: 'custom', everyDays: 3, time: '09:00' }, t), 'schedule.customAt:{"count":3,"time":"09:00"}')
})

/**
 * 在指定宿主时区里渲染一次，用来证明渲染结果只跟任务自身时区有关。
 *
 * @param {string} hostZone 子进程的 TZ。
 * @param {object} schedule 任务计划。
 * @returns {string}
 */
function renderOnceUnderHostZone(hostZone, schedule) {
  const script = [
    `import { formatSchedule } from ${JSON.stringify(HELPERS_URL)};`,
    'const t = (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`);',
    `process.stdout.write(formatSchedule(${JSON.stringify(schedule)}, t));`,
  ].join('\n')
  return execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
    env: { ...process.env, TZ: hostZone },
  })
}

test('一次性任务只按任务时区渲染，宿主时区换了也不漂移', () => {
  const hostZones = ['UTC', 'America/New_York', 'Asia/Shanghai', 'Pacific/Kiritimati']
  const cases = [
    [ONCE_AT_SHANGHAI, 'schedule.onceAt:{"time":"2026-08-16 09:00"}'],
    [{ kind: 'once', at: '2026-08-16T01:00:00.000Z', timeZone: 'UTC' }, 'schedule.onceAt:{"time":"2026-08-16 01:00"}'],
    [
      { kind: 'once', at: '2026-03-08T09:30:00.000Z', timeZone: 'America/New_York' },
      'schedule.onceAt:{"time":"2026-03-08 05:30"}',
    ],
  ]
  for (const hostZone of hostZones) {
    for (const [schedule, expected] of cases) {
      assert.equal(renderOnceUnderHostZone(hostZone, schedule), expected, `宿主时区 ${hostZone}`)
    }
    assert.equal(
      renderOnceUnderHostZone(hostZone, { kind: 'once', at: 'not-a-date', timeZone: 'Asia/Shanghai' }),
      'schedule.onceAt:{"time":"not-a-date"}',
      `宿主时区 ${hostZone} 下非法时间原样返回`,
    )
  }
})

test('formatWithin 用「还有多久」口径，过去时间显示为此刻', () => {
  const now = new Date('2026-08-16T01:00:00.000Z')
  assert.equal(formatWithin('2026-08-16T00:59:00.000Z', now, t), 'time.now')
  assert.equal(formatWithin('2026-08-16T01:30:00.000Z', now, t), 'time.withinMinute:{"count":30}')
  assert.equal(formatWithin('2026-08-16T05:00:00.000Z', now, t), 'time.withinHour:{"count":4}')
  assert.equal(formatWithin('2026-08-18T05:00:00.000Z', now, t), 'time.withinDay:{"count":3}')
})

test('formatRelativeTime 区分将来与过去，非法时间原样返回', () => {
  const now = new Date('2026-08-16T01:00:00.000Z')
  assert.equal(formatRelativeTime('2026-08-16T01:00:20.000Z', now, t), 'time.now')
  assert.equal(formatRelativeTime('2026-08-16T01:30:00.000Z', now, t), 'time.inMinute:{"count":30}')
  assert.equal(formatRelativeTime('2026-08-16T00:30:00.000Z', now, t), 'time.minuteAgo:{"count":30}')
  assert.equal(formatRelativeTime('2026-08-17T01:00:00.000Z', now, t), 'time.inDay:{"count":1}')
  assert.equal(formatRelativeTime('broken', now, t), 'broken')
})

test('formatDuration 在缺少端点或倒挂时不给假时长', () => {
  assert.equal(formatDuration('2026-08-16T01:00:00.000Z', '2026-08-16T01:00:01.500Z'), '1.5s')
  assert.equal(formatDuration(undefined, '2026-08-16T01:00:01.500Z'), undefined)
  assert.equal(formatDuration('2026-08-16T01:00:02.000Z', '2026-08-16T01:00:01.000Z'), undefined)
})
