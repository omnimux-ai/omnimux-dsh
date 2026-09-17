import test from 'node:test'
import assert from 'node:assert/strict'
import { formatBytes, formatRelative, formatTimeAgo, extToBucket, bucketLabelKey } from './format.js'

test('formatTimeAgo: 安全容错与防御性回退', () => {
  assert.equal(formatTimeAgo(null), '')
  assert.equal(formatTimeAgo(undefined), '')
  assert.equal(formatTimeAgo(''), '')
  assert.equal(formatTimeAgo('invalid-date-string'), '')
  assert.equal(formatTimeAgo(NaN), '')
})

test('formatTimeAgo: 刚刚（< 60秒及未来微小时钟偏差）', () => {
  const now = new Date('2026-09-17T12:00:00.000Z').getTime()
  // 刚刚（5秒前）
  assert.equal(formatTimeAgo(now - 5000, now), '刚刚')
  // 刚刚（59秒前）
  assert.equal(formatTimeAgo(now - 59000, now), '刚刚')
  // 未来偏差（未来 5 秒）
  assert.equal(formatTimeAgo(now + 5000, now), '刚刚')
})

test('formatTimeAgo: N分钟前（1~59分钟）', () => {
  const now = new Date('2026-09-17T12:00:00.000Z').getTime()
  assert.equal(formatTimeAgo(now - 60 * 1000, now), '1分钟前')
  assert.equal(formatTimeAgo(now - 15 * 60 * 1000, now), '15分钟前')
  assert.equal(formatTimeAgo(now - 59 * 60 * 1000, now), '59分钟前')
})

test('formatTimeAgo: N小时前（1~23小时）', () => {
  const now = new Date('2026-09-17T12:00:00.000Z').getTime()
  assert.equal(formatTimeAgo(now - 3600 * 1000, now), '1小时前')
  assert.equal(formatTimeAgo(now - 5 * 3600 * 1000, now), '5小时前')
})

test('formatTimeAgo: 天数与月年梯级（标准多少时间前）', () => {
  const now = new Date('2026-09-17T12:00:00.000Z').getTime()
  // 1天前（25小时前）
  assert.equal(formatTimeAgo(now - 25 * 3600 * 1000, now), '1天前')
  // 3天前
  assert.equal(formatTimeAgo(now - 3 * 86400 * 1000, now), '3天前')
  // 29天前
  assert.equal(formatTimeAgo(now - 29 * 86400 * 1000, now), '29天前')
  // 65天前（2个月前）
  assert.equal(formatTimeAgo(now - 65 * 86400 * 1000, now), '2个月前')
  // 400天前（1年前）
  assert.equal(formatTimeAgo(now - 400 * 86400 * 1000, now), '1年前')
})

test('formatTimeAgo: showYesterday 选项支持', () => {
  const now = new Date('2026-09-17T12:00:00.000Z').getTime()
  // 25小时前在 showYesterday 下为“昨天”
  assert.equal(formatTimeAgo(now - 25 * 3600 * 1000, { now, showYesterday: true }), '昨天')
})

test('formatTimeAgo: 支持 Date 实例与 ISO 字符串输入', () => {
  const now = new Date('2026-09-17T12:00:00.000Z').getTime()
  const iso = '2026-09-17T11:00:00.000Z'
  assert.equal(formatTimeAgo(iso, now), '1小时前')
  assert.equal(formatTimeAgo(new Date(iso), now), '1小时前')
})

test('formatBytes & formatRelative 既有功能健全性', () => {
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(0), '0 B')
  assert.equal(extToBucket('.jpg'), 'image')
  assert.equal(bucketLabelKey('character'), 'type.character')
})
