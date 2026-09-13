/**
 * @file GenUI 看板 spec 结构合法性（组件白名单 + 节点数/嵌套上限）。
 *
 * 看板是本期唯一的「交互呈现」形态：插件只产出 spec，渲染交给宿主或 Agent。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { scoreTweets } from '../src/core/algorithm.js'
import { buildRecord } from '../src/collect/tweet.js'
import {
  DASHBOARD_MAX_ROWS,
  DASHBOARD_SUMMARY_WIDTH,
  GENUI_COMPONENT_WHITELIST,
  MAX_NESTING_DEPTH,
  MAX_ROOT_NODES,
  MAX_TOTAL_NODES,
  buildDashboard,
  collectComponentTypes,
  dashboardColumns,
  dashboardRow,
  measureSpec,
  tierCounts,
  validateDashboardSpec,
} from '../src/present/genui-dashboard.js'
import { displayWidth } from '../src/present/table-renderer.js'

const NOW_MS = Date.parse('2026-09-13T07:00:00.000Z')

/**
 * 构造若干打分结果。
 * @param {Array<Record<string, unknown>>} specs 规格
 * @returns {import('../src/core/sort.js').ScoredTweet[]}
 */
function makeRows(specs) {
  const records = specs.map((spec, index) => {
    /** @type {Record<string, unknown>} */
    const raw = {
      id: spec.id ?? `id-${index}`,
      author: spec.author ?? `作者${index}`,
      handle: spec.handle ?? `handle_${index}`,
      text: spec.text ?? `第 ${index} 条推文正文，用于验证看板摘要截断行为是否稳定可复现。`,
      replies: spec.replies ?? 0,
      likes: spec.likes ?? 0,
      retweets: spec.retweets ?? 0,
      created_at: spec.created_at ?? '2026-09-13T05:00:00.000Z',
    }
    // 显式传 undefined 时**整条字段缺失**，才能触发 VIEWS_MISSING。
    if (spec.views !== undefined) raw.views = spec.views
    return buildRecord(raw, NOW_MS, 'fixture')
  })
  return scoreTweets(records, NOW_MS)
}

/** 一份干净的候选清单（无数据缺陷）。 */
const CLEAN_ROWS = makeRows([
  { id: 'v1', views: '120000', text: '爆款推文正文' },
  { id: 's1', views: '5000', text: '飙升推文正文' },
  { id: 's2', views: '4000', text: '飙升推文正文二' },
])

/** 一份含数据缺陷的候选清单。 */
const DIRTY_ROWS = makeRows([
  { id: 'd1', views: undefined, text: 'views 缺失' },
  { id: 'd2', views: 'abc', text: 'views 不可解析' },
  { id: 'v2', views: '90000', text: '正常爆款' },
])

/** 两份草稿。 */
const DRAFTS = [
  { tweetId: 'v1', reply: { text: '评论草稿一', strategy: '模型生成（host 通道）' }, quote: null, usedChannel: 'host', warnings: [] },
  { tweetId: 's1', reply: { text: '评论草稿二', strategy: '离线模板骨架（信息增量优先）' }, quote: null, usedChannel: 'template', warnings: [] },
]

const META = {
  runId: '20260913T070000Z-8000',
  startedAtMs: NOW_MS,
  source: 'fixture',
  fetchedCount: 3,
  allCount: 3,
  warnings: [],
  formatShanghai: () => '2026-09-13 15:00:00',
}

test('buildDashboard 产出合法 spec（零违规）', () => {
  const spec = buildDashboard(CLEAN_ROWS, DRAFTS, META)
  assert.deepEqual(validateDashboardSpec(spec), [])
})

test('组件全部落在 GenUI 白名单内', () => {
  const spec = buildDashboard(DIRTY_ROWS, DRAFTS, META)
  const types = collectComponentTypes(spec)
  assert.ok(types.length > 0)
  for (const type of types) {
    assert.ok(GENUI_COMPONENT_WHITELIST.has(type), `${type} 不在白名单内`)
  }
  assert.ok(types.includes('stat'))
  assert.ok(types.includes('table'))
  assert.ok(types.includes('callout'))
})

test('根节点 ≤ 8、嵌套 ≤ 8 层、节点总数 ≤ 200', () => {
  const spec = buildDashboard(CLEAN_ROWS, DRAFTS, META)
  const measured = measureSpec(spec)
  assert.ok(measured.roots <= MAX_ROOT_NODES, `根节点 ${measured.roots}`)
  assert.ok(measured.depth <= MAX_NESTING_DEPTH, `嵌套 ${measured.depth}`)
  assert.ok(measured.total <= MAX_TOTAL_NODES, `节点 ${measured.total}`)
  assert.equal(measured.roots, spec.items.length)
})

test('包含 1 个 stat（待截流条数）、1 个 table、1 个 callout', () => {
  const spec = buildDashboard(CLEAN_ROWS, DRAFTS, META)
  const stats = spec.items.filter((item) => item.type === 'stat')
  const tables = spec.items.filter((item) => item.type === 'table')
  const callouts = spec.items.filter((item) => item.type === 'callout')

  assert.equal(stats.length, 1)
  assert.equal(tables.length, 1)
  assert.equal(callouts.length, 1)

  assert.equal(stats[0].label, '待截流条数')
  assert.equal(stats[0].value, String(CLEAN_ROWS.length))
  assert.equal(tables[0].columns.length, dashboardColumns().length)
  assert.equal(tables[0].rows.length, CLEAN_ROWS.length)
  assert.equal(tables[0].total, CLEAN_ROWS.length)
})

test('callout 的 tone：有 anomaly 为 warning，无 anomaly 为 info', () => {
  const dirtySpec = buildDashboard(DIRTY_ROWS, DRAFTS, META)
  const dirtyCallout = dirtySpec.items.find((item) => item.type === 'callout')
  assert.equal(dirtyCallout.tone, 'warning')
  assert.ok(String(dirtyCallout.content).includes('数据缺陷'))

  const cleanSpec = buildDashboard(CLEAN_ROWS, DRAFTS, META)
  const cleanCallout = cleanSpec.items.find((item) => item.type === 'callout')
  assert.equal(cleanCallout.tone, 'info')
  assert.ok(String(cleanCallout.content).includes('解析正常'))
})

test('有运行警告时 callout 也为 warning', () => {
  const spec = buildDashboard(CLEAN_ROWS, DRAFTS, { ...META, warnings: ['COOLDOWN_OVERRIDDEN'] })
  const callout = spec.items.find((item) => item.type === 'callout')
  assert.equal(callout.tone, 'warning')
})

test('摘要截断 60 字且不换行（防节点膨胀）', () => {
  const long = makeRows([{ id: 'long', views: '120000', text: '很长的推文'.repeat(60) }])
  const row = dashboardRow(long[0])
  const summary = row[row.length - 1]

  assert.ok(summary.length > 0)
  assert.ok(displayWidth(summary) <= DASHBOARD_SUMMARY_WIDTH, `摘要宽度 ${displayWidth(summary)}`)
  assert.ok(!summary.includes('\n'))
  assert.ok(summary.endsWith('…'))
})

test('degraded 行带 ! 前缀', () => {
  const row = dashboardRow(DIRTY_ROWS[0])
  assert.equal(DIRTY_ROWS[0].degraded, true)
  assert.ok(row[0].startsWith('!'))
})

test('tierCounts 统计三档分布', () => {
  assert.deepEqual(tierCounts(CLEAN_ROWS), { viral: 1, surging: 2, normal: 0 })
  assert.deepEqual(tierCounts([]), { viral: 0, surging: 0, normal: 0 })
})

test('空候选清单同样产出合法 spec', () => {
  const spec = buildDashboard([], [], META)
  assert.deepEqual(validateDashboardSpec(spec), [])
  const stats = spec.items.find((item) => item.type === 'stat')
  assert.equal(stats.value, '0')
  const table = spec.items.find((item) => item.type === 'table')
  assert.deepEqual(table.rows, [])
})

test('行数上限与 maxTweets 对齐，保证两视图行数一致', () => {
  assert.equal(DASHBOARD_MAX_ROWS, 200)
  const many = makeRows(
    Array.from({ length: 60 }, (_value, index) => ({
      id: `m${index}`,
      views: '120000',
      text: `第 ${index} 条`,
    })),
  )
  const spec = buildDashboard(many, [], META)
  const table = spec.items.find((item) => item.type === 'table')
  assert.equal(table.rows.length, many.length)
  assert.deepEqual(validateDashboardSpec(spec), [])
})

test('validateDashboardSpec 能识别违规 spec', () => {
  assert.deepEqual(validateDashboardSpec({ items: [] }), [])
  assert.ok(validateDashboardSpec({}).length > 0)
  assert.ok(
    validateDashboardSpec({ items: [{ type: 'not-a-real-component' }] }).some((problem) =>
      problem.includes('白名单'),
    ),
  )
  assert.ok(
    validateDashboardSpec({ items: Array.from({ length: 9 }, () => ({ type: 'text' })) }).some(
      (problem) => problem.includes('根节点'),
    ),
  )
  // 9 层嵌套（row → col → … → text）
  let deep = { type: 'text' }
  for (let index = 0; index < 9; index += 1) deep = { type: 'col', items: [deep] }
  assert.ok(
    validateDashboardSpec({ items: [deep] }).some((problem) => problem.includes('嵌套')),
  )
})

test('dashboardColumns 与行宽一致', () => {
  const columns = dashboardColumns()
  assert.equal(columns.length, 7)
  for (const row of CLEAN_ROWS) {
    assert.equal(dashboardRow(row).length, columns.length)
  }
})
