import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { feedVelocity, mergeAccountPosts, sortFeedRows, toFeedRow } from './rival-feed.js'

/**
 * 增速胶囊三级口径契约（Issue #3113，规格 §3.3 红线区 + PRD §5.1）。
 *
 * 每个断言钉的是「改前会红」的行为：服务端只下发事实
 * （tier / confidence / vph|multiplier / samples_at），界面文字与
 * 档位前缀由客户端按字典派生；本文件不产出任何中文字符串断言。
 */

const NOW = '2026-10-06T20:00:00.000Z'
const H = 3600_000
const iso = (ms) => new Date(ms).toISOString()
const nowMs = Date.parse(NOW)

const account = { id: 'ra_a', nickname: 'A', handle: '@a', platform: 'tiktok' }

const post = (id, extra = {}) => ({
  id,
  title: `w${id}`,
  posted_at: iso(nowMs - 4 * H),
  stats: { views: 1000, likes: 0, comments: 0, shares: 0 },
  ...extra,
})

const history = (...entries) => ({ views_history: entries })

describe('feedVelocity — A · 实测增速', () => {
  it('两有效采样点间隔 ≥1.5h → measured，vph = Δviews/Δh，t1<t2', () => {
    const v = feedVelocity(post('p', {
      metrics: history(
        { at: iso(nowMs - 4 * H), views: 1000 },
        { at: iso(nowMs - 2 * H), views: 47000 },
      ),
    }), { now: NOW })
    assert.equal(v.confidence, 'measured')
    assert.equal(v.vph, 23000)
    assert.equal(v.tier, 'hot')
    assert.deepEqual(v.samples_at, [iso(nowMs - 4 * H), iso(nowMs - 2 * H)])
  })

  it('爆款/飙升/观察 阈值：>20k / ≥1k / ≥200', () => {
    const base = { at: iso(nowMs - 4 * H), views: 0 }
    const mk = (views) => feedVelocity(post('p', {
      metrics: history(base, { at: iso(nowMs - 2 * H), views }),
    }), { now: NOW })
    assert.equal(mk(41000).tier, 'hot', 'vph 20500 > 20k → hot')
    assert.equal(mk(2000).tier, 'rising', 'vph 1000 ∈ [1k,20k] → rising')
    assert.equal(mk(400).tier, 'watch', 'vph 200 ∈ [200,1k) → watch')
  })

  it('vph <200 → null（胶囊不渲染、不留位）', () => {
    const v = feedVelocity(post('p', {
      posted_at: null,
      metrics: history(
        { at: iso(nowMs - 4 * H), views: 0 },
        { at: iso(nowMs - 2 * H), views: 199 },
      ),
      stats: { views: 199 },
    }), { now: NOW })
    assert.equal(v, null)
  })

  it('views 回退（v2 < v1）→ 不判 measured，降级到 B/C，不抛错', () => {
    const v = feedVelocity(post('p', {
      metrics: history(
        { at: iso(nowMs - 4 * H), views: 50000 },
        { at: iso(nowMs - 2 * H), views: 30000 },
      ),
      stats: { views: 30000 },
    }), { now: NOW, medianViews: 200 })
    assert.ok(v === null || v.confidence !== 'measured',
      `a views rollback must never read as measured velocity, got ${JSON.stringify(v)}`)
  })

  it('采样间隔 <1.5h → 不判 measured', () => {
    const v = feedVelocity(post('p', {
      metrics: history(
        { at: iso(nowMs - 2 * H), views: 0 },
        { at: iso(nowMs - 1 * H), views: 5000 },
      ),
      stats: { views: 5000 },
    }), { now: NOW })
    assert.ok(v === null || v.confidence !== 'measured',
      `a <1.5h span must fall through, got ${JSON.stringify(v)}`)
  })

  it('历史里有非法行 → 只用有效点对判定，不因坏行抛错', () => {
    const v = feedVelocity(post('p', {
      metrics: history(
        { at: 'not-a-date', views: 'x' },
        { at: iso(nowMs - 4 * H), views: 0 },
        { at: iso(nowMs - 2 * H), views: 47000 },
        null,
      ),
    }), { now: NOW })
    assert.equal(v.confidence, 'measured')
    assert.equal(v.vph, 23500)
  })
})

describe('feedVelocity — B · 发布均速', () => {
  it('单采样点 → estimated：vph = views ÷ 发布至今小时', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 10 * H),
      stats: { views: 18000 },
      metrics: history({ at: iso(nowMs - 1 * H), views: 18000 }),
    }), { now: NOW })
    assert.equal(v.confidence, 'average')
    assert.equal(v.tier, 'average')
    assert.equal(v.vph, 1800)
  })

  it('views_history 缺失 → estimated（views ÷ posted_at 年龄）', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 5 * H),
      stats: { views: 10000 },
    }), { now: NOW })
    assert.equal(v.confidence, 'average')
    assert.equal(v.vph, 2000)
  })

  it('posted_at 缺失 → 年龄退用 first_seen_at', () => {
    const v = feedVelocity(post('p', {
      posted_at: null,
      first_seen_at: iso(nowMs - 8 * H),
      stats: { views: 16000 },
    }), { now: NOW })
    assert.equal(v.confidence, 'average')
    assert.equal(v.vph, 2000)
  })

  it('posted_at 在未来（时钟异常）→ 不判 estimated，降级不抛错', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs + 3 * H),
      first_seen_at: null,
      stats: { views: 10000 },
    }), { now: NOW, medianViews: 100 })
    assert.ok(v === null || v.confidence === 'relative',
      `a future posted_at must not produce average, got ${JSON.stringify(v)}`)
  })

  it('views 不可读 → B/C 均无法给绝对量，返回 null', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 5 * H),
      stats: { views: null },
    }), { now: NOW })
    assert.equal(v, null)
  })
})

describe('feedVelocity — C · 账号内相对爆发', () => {
  it('A/B 不可用且 views ≥ 3× 中位 → relative，multiplier 保留倍数', () => {
    const v = feedVelocity(post('p', {
      posted_at: null,
      stats: { views: 8920 },
    }), { now: NOW, medianViews: 2123.8 })
    assert.equal(v.confidence, 'relative')
    assert.equal(v.tier, 'relative')
    assert.equal(v.multiplier, 4.2)
    assert.equal(v.vph, undefined, '相对档严禁携带小时速率')
  })

  it('倍数 <3 → null（不给弱化假信号）', () => {
    const v = feedVelocity(post('p', {
      posted_at: null,
      stats: { views: 2900 },
    }), { now: NOW, medianViews: 1000 })
    assert.equal(v, null)
  })

  it('中位数缺失/为 0 → null', () => {
    assert.equal(feedVelocity(post('p', { posted_at: null, stats: { views: 5000 } }), { now: NOW }), null)
    assert.equal(feedVelocity(post('p', { posted_at: null, stats: { views: 5000 } }), { now: NOW, medianViews: 0 }), null)
  })
})

describe('toFeedRow / mergeAccountPosts — 数据通路', () => {
  it('toFeedRow 透传 views_history 与 first_seen_at（计算原料随行下发）', () => {
    const row = toFeedRow(post('p', {
      metrics: history({ at: iso(nowMs - 2 * H), views: 5 }),
      first_seen_at: iso(nowMs - 9 * H),
    }), account)
    assert.deepEqual(row.views_history, [{ at: iso(nowMs - 2 * H), views: 5 }])
    assert.equal(row.first_seen_at, iso(nowMs - 9 * H))
  })

  it('mergeAccountPosts 接受 now：实测行带 measured，采样不足行带 average', () => {
    const rows = mergeAccountPosts({
      accounts: [account],
      postsByAccount: {
        ra_a: [
          post('m', {
            metrics: history(
              { at: iso(nowMs - 4 * H), views: 0 },
              { at: iso(nowMs - 2 * H), views: 4000 },
            ),
          }),
          post('a', { stats: { views: 8000 }, posted_at: iso(nowMs - 4 * H) }),
        ],
      },
      now: NOW,
    })
    const byId = new Map(rows.map((r) => [r.id, r]))
    assert.equal(byId.get('m').velocity.confidence, 'measured')
    assert.equal(byId.get('m').velocity.vph, 2000)
    assert.equal(byId.get('a').velocity.confidence, 'average')
    assert.equal(byId.get('a').velocity.vph, 2000)
  })

  it('C 档中位数取账号全部作品（含筛选命中的本行），不按请求子集另算', () => {
    const rows = mergeAccountPosts({
      accounts: [account],
      postsByAccount: {
        ra_a: [
          post('self', { posted_at: null, stats: { views: 9000 } }),
          post('o1', { posted_at: null, stats: { views: 1000 } }),
          post('o2', { posted_at: null, stats: { views: 1000 } }),
          post('o3', { posted_at: null, stats: { views: 1000 } }),
        ],
      },
      now: NOW,
    })
    const self = rows.find((r) => r.id === 'self')
    assert.equal(self.velocity.confidence, 'relative')
    assert.equal(self.velocity.multiplier, 9, 'views 9000 / 中位 1000 = 9x')
  })
})

describe('sortFeedRows — velocity', () => {
  const row = (id, velocity) => ({ id, posted_at: null, stats: { views: 0 }, velocity })

  it('vph 降序 → relative 按倍数降序 → 无信号卡排最后', () => {
    const sorted = sortFeedRows([
      row('none', null),
      row('rel', { confidence: 'relative', tier: 'relative', multiplier: 4.2 }),
      row('avg', { confidence: 'average', tier: 'average', vph: 1800 }),
      row('hot', { confidence: 'measured', tier: 'hot', vph: 23000 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['hot', 'avg', 'rel', 'none'])
  })

  it('vph 相同按 id 降序，顺序稳定', () => {
    const sorted = sortFeedRows([
      row('a', { tier: 'watch', vph: 500 }),
      row('b', { tier: 'watch', vph: 500 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['b', 'a'])
  })
})
