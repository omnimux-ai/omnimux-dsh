/**
 * @file 脏数值解析表驱动断言（四类单位 + 六类脏输入）。
 *
 * 核心约定：解析失败返回 `null` 且不吞错；静默转 0 会把爆款判成哑帖。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MISSING_PLACEHOLDERS,
  UNIT_MULTIPLIERS,
  isMissingValue,
  parseMetric,
  parseMetricWithAnomaly,
  parseOptionalMetric,
  toHalfWidth,
} from '../src/collect/parse-metrics.js'

test('四类单位后缀解析', () => {
  const cases = [
    ['1.2k', 1200],
    ['1.2K', 1200],
    ['3.4m', 3_400_000],
    ['3.4M', 3_400_000],
    ['1.1b', 1_100_000_000],
    ['1.1B', 1_100_000_000],
    ['12.7万', 127_000],
    ['2.5w', 25_000],
    ['3千', 3000],
    ['1.2亿', 120_000_000],
  ]
  for (const [input, expected] of cases) {
    assert.equal(parseMetric(input), expected, `${JSON.stringify(input)} 应解析为 ${expected}`)
  }
})

test('六类脏输入一律返回 null', () => {
  const cases = [
    ['', '空串'],
    ['   ', '纯空白'],
    ['—', '破折号占位'],
    [undefined, 'undefined'],
    ['abc', '非数字串'],
    ['-5', '负数'],
  ]
  for (const [input, label] of cases) {
    assert.equal(parseMetric(input), null, `${label} 应返回 null`)
  }
})

test('表驱动断言：≥10 条脏字符串', () => {
  const table = [
    ['1.2k', 1200],
    ['3.4m', 3_400_000],
    ['1.1b', 1_100_000_000],
    ['12.7万', 127_000],
    ['1,234', 1234],
    ['', null],
    ['—', null],
    [undefined, null],
    ['abc', null],
    ['-5', null],
  ]
  assert.ok(table.length >= 10)
  for (const [input, expected] of table) {
    assert.equal(parseMetric(input), expected)
  }
})

test('更多真实脏形态', () => {
  assert.equal(parseMetric('3,456,789'), 3_456_789)
  assert.equal(parseMetric(' 42 '), 42)
  assert.equal(parseMetric('１２３'), 123, '全角数字')
  assert.equal(parseMetric('1，234'), 1234, '全角逗号')
  assert.equal(parseMetric('1.5'), 2, '四舍五入到整数')
  assert.equal(parseMetric(1234), 1234)
  assert.equal(parseMetric(0), 0)
  assert.equal(parseMetric(Number.NaN), null)
  assert.equal(parseMetric(Number.POSITIVE_INFINITY), null)
  assert.equal(parseMetric(-1), null)
  assert.equal(parseMetric(null), null)
  assert.equal(parseMetric(true), null)
  assert.equal(parseMetric({}), null)
  assert.equal(parseMetric([]), null)
  assert.equal(parseMetric('N/A'), null)
  assert.equal(parseMetric('12abc'), null)
  assert.equal(parseMetric('abc12'), null)
})

test('isMissingValue 区分「源未提供」与「解析失败」', () => {
  assert.equal(isMissingValue(null), true)
  assert.equal(isMissingValue(undefined), true)
  assert.equal(isMissingValue(''), true)
  assert.equal(isMissingValue('   '), true)
  assert.equal(isMissingValue('—'), true)
  assert.equal(isMissingValue('N/A'), true)
  assert.equal(isMissingValue('null'), true)
  assert.equal(isMissingValue('abc'), false, 'abc 是「有值但解析失败」')
  assert.equal(isMissingValue(0), false)
  assert.equal(isMissingValue('0'), false)
  assert.ok(MISSING_PLACEHOLDERS.has('—'))
})

test('parseMetricWithAnomaly 精确给出数据缺陷标记', () => {
  assert.deepEqual(parseMetricWithAnomaly(undefined), { value: null, anomaly: 'VIEWS_MISSING' })
  assert.deepEqual(parseMetricWithAnomaly(null), { value: null, anomaly: 'VIEWS_MISSING' })
  assert.deepEqual(parseMetricWithAnomaly(''), { value: null, anomaly: 'VIEWS_MISSING' })
  assert.deepEqual(parseMetricWithAnomaly('—'), { value: null, anomaly: 'VIEWS_MISSING' })
  assert.deepEqual(parseMetricWithAnomaly('abc'), { value: null, anomaly: 'VIEWS_UNPARSEABLE' })
  assert.deepEqual(parseMetricWithAnomaly('-9'), { value: null, anomaly: 'VIEWS_UNPARSEABLE' })
  assert.deepEqual(parseMetricWithAnomaly('1.2k'), { value: 1200, anomaly: null })
  assert.deepEqual(parseMetricWithAnomaly(0), { value: 0, anomaly: null })
})

test('parseOptionalMetric 语义等同 parseMetric（点赞/转推/回复用）', () => {
  assert.equal(parseOptionalMetric('1,234'), 1234)
  assert.equal(parseOptionalMetric(undefined), null)
  assert.equal(parseOptionalMetric('abc'), null)
})

test('toHalfWidth 归一全角字符', () => {
  assert.equal(toHalfWidth('１２３'), '123')
  assert.equal(toHalfWidth('1，234'), '1,234')
  assert.equal(toHalfWidth('1．5'), '1.5')
  assert.equal(toHalfWidth('１２.７万'), '12.7万')
})

test('单位乘数表完备', () => {
  assert.equal(UNIT_MULTIPLIERS.k, 1_000)
  assert.equal(UNIT_MULTIPLIERS.m, 1_000_000)
  assert.equal(UNIT_MULTIPLIERS.b, 1_000_000_000)
  assert.equal(UNIT_MULTIPLIERS['万'], 10_000)
})
