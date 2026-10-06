import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeAccountPosts, sortFeedRows } from '../rival/rival-feed.js'
import { toRivalCardRow, rivalVelocityHasSignal } from './rival-filter.js'
import { rivalVelocityText } from './rival-format.js'
import { zh } from './locales.js'

/**
 * 全链路端到端断言（#3113）：落库的 views_history → mergeAccountPosts 的
 * velocity 事实 → toRivalCardRow 卡片描述 → rivalVelocityText 派生文案。
 * 与 deny-network 同一运行环境——整条链零网络、零采集，断言「增速信号
 * 只消费已落库采样，不触发任何新调用」。
 */

const NOW = '2026-10-06T20:00:00.000Z'
const H = 3600_000
const iso = (ms) => new Date(ms).toISOString()
const nowMs = Date.parse(NOW)
const account = { id: 'ra_a', nickname: 'A', handle: '@a', platform: 'tiktok' }
const t = (key) => zh[key] || key

const post = (id, extra = {}) => ({
  id,
  title: `w${id}`,
  posted_at: iso(nowMs - 4 * H),
  stats: { views: 1000, likes: 0, comments: 0, shares: 0 },
  ...extra,
})

function feed(posts, now = NOW) {
  return mergeAccountPosts({
    accounts: [account],
    postsByAccount: { ra_a: posts },
    now,
  })
}

describe('端到端：views_history → 胶囊事实 → 逐字文案', () => {
  it('实测档卡片的胶囊文案逐字为「爆款 23k/h」，且 relativeBadge 不与胶囊重复', () => {
    const [row] = feed([post('p1', {
      metrics: { views_history: [
        { at: iso(nowMs - 4 * H), views: 1000 },
        { at: iso(nowMs - 2 * H), views: 47000 },
      ] },
    })])
    const card = toRivalCardRow(row)
    assert.equal(rivalVelocityText(card.velocity, t), '爆款 23k/h')
    assert.equal(card.relativeBadge, undefined,
      'card descriptor must not synthesize a relative badge — the pill carries the only 该号 signal')
  })

  it('三档降级端到端：实测 → 均速 → 相对，坏输入全程不抛错', () => {
    // 小号场景（PRD §5.1「绝对量级无法判断」）：账号历史播放中位低，
    // 本帖相对中位爆发——这正是「该号 Nx」要表达的、且不与实测混淆。
    const rows = feed([
      post('m', { metrics: { views_history: [
        { at: iso(nowMs - 4 * H), views: 0 },
        { at: iso(nowMs - 2 * H), views: 2400 },
      ] } }),
      post('a', { stats: { views: 7200 } }),
      post('r', { posted_at: null, stats: { views: 4500 } }),
      post('o', { posted_at: null, stats: { views: 500 } }),
      post('l1', { posted_at: null, stats: { views: 200 } }),
      post('l2', { posted_at: null, stats: { views: 200 } }),
      post('l3', { posted_at: null, stats: { views: 200 } }),
      post('l4', { posted_at: null, stats: { views: 200 } }),
      post('l5', { posted_at: null, stats: { views: 200 } }),
    ])
    const byId = new Map(rows.map((r) => [r.id, r]))
    assert.equal(rivalVelocityText(byId.get('m').velocity, t), '飙升 1.2k/h')
    assert.equal(rivalVelocityText(byId.get('a').velocity, t), '均速 1.8k/h')
    const rel = rivalVelocityText(byId.get('r').velocity, t)
    assert.match(rel, /^该号 [\d.]+x$/, 'relative tier keeps the multiplier form without /h')
    assert.ok(!rel.includes('/h'), 'relative tier never looks like realtime speed')
    assert.equal(byId.get('o').velocity, null, 'below the burst gate reads as no signal')
    for (const id of ['l1', 'l2', 'l3', 'l4', 'l5']) {
      assert.equal(byId.get(id).velocity, null,
        `${id} sits at the account median itself — no burst, no pill`)
    }
    // 时钟异常 + views 回退：整链不抛错、降级为空信号
    assert.doesNotThrow(() => feed([
      post('x', {
        posted_at: iso(nowMs + 3 * H),
        metrics: { views_history: [
          { at: iso(nowMs - 4 * H), views: 999 },
          { at: iso(nowMs - 2 * H), views: 5 },
        ] },
        stats: { views: 5 },
      }),
    ]))
  })

  it('velocity 排序端到端：实测降序 → 相对兜底 → 无信号垫底', () => {
    const rows = feed([
      post('none', { posted_at: null, stats: { views: 10 } }),
      post('rel', { posted_at: null, stats: { views: 4500 } }),
      post('avg', { posted_at: iso(nowMs - 1000 * H), stats: { views: 0 } }),
      post('hot', { metrics: { views_history: [
        { at: iso(nowMs - 4 * H), views: 0 },
        { at: iso(nowMs - 2 * H), views: 47000 },
      ] } }),
      post('l1', { posted_at: null, stats: { views: 300 } }),
      post('l2', { posted_at: null, stats: { views: 300 } }),
      post('l3', { posted_at: null, stats: { views: 300 } }),
    ])
    const ordered = sortFeedRows(rows, 'velocity').map((r) => r.id)
    assert.deepEqual(ordered, ['hot', 'rel', 'avg', 'none', 'l3', 'l2', 'l1'],
      'vph signals → relative → no-signal last; ties settle by id desc so the order is stable')
    // 「增速信号不增加云调用次数」的结构证据：整条链没有网络面——
    // velocity 只由已落库的 views_history/posted_at/first_seen_at 派生
    assert.equal(rivalVelocityHasSignal(rows.find((r) => r.id === 'none').velocity), false)
    assert.equal(rivalVelocityHasSignal(rows.find((r) => r.id === 'rel').velocity), true)
  })
})
