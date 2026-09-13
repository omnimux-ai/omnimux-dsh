import assert from 'node:assert/strict'
import test from 'node:test'
import { automationSessionTitle, formatRunStamp } from './run-title.js'

test('运行时间戳按任务时区渲染（Host 与客户端共用同一真源）', () => {
  assert.equal(formatRunStamp('2026-08-16T01:00:00.000Z', 'Asia/Shanghai'), '2026-08-16 09:00')
  assert.equal(formatRunStamp('2026-08-16T01:00:00.000Z', 'UTC'), '2026-08-16 01:00')
})

test('无效时间戳原样返回，不制造假时间', () => {
  assert.equal(formatRunStamp('not-a-date', 'Asia/Shanghai'), 'not-a-date')
  assert.equal(formatRunStamp('not-a-date'), 'not-a-date')
})

test('未知时区回退到原 ISO，不抛异常', () => {
  assert.equal(formatRunStamp('2026-08-16T01:00:00.000Z', 'Not/AZone'), '2026-08-16T01:00:00.000Z')
})

test('会话标题是「执行时间 + 任务名」', () => {
  assert.equal(
    automationSessionTitle('每日检查', '2026-08-16T01:00:00.000Z', 'Asia/Shanghai'),
    '2026-08-16 09:00 - 每日检查',
  )
})
