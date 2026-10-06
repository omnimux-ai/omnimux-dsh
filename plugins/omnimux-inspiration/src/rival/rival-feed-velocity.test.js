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

  it('views 回退（v2 < v1）→ 钉住降级落点为 B 档 average，不抛错', () => {
    const v = feedVelocity(post('p', {
      metrics: history(
        { at: iso(nowMs - 4 * H), views: 50000 },
        { at: iso(nowMs - 2 * H), views: 30000 },
      ),
      stats: { views: 30000 },
    }), { now: NOW, medianViews: 200 })
    // 30000 views / 4h 龄 = 7500/h ≥ 200 → average（vph<200 的降级落点见 B 档断言）。
    assert.equal(v.confidence, 'average', 'rollback degrades to the publish average, never measured')
    assert.equal(v.tier, 'average')
    assert.equal(v.vph, 7500)
  })

  it('采样间隔 <1.5h → 钉住降级落点为 B 档 average', () => {
    const v = feedVelocity(post('p', {
      metrics: history(
        { at: iso(nowMs - 2 * H), views: 0 },
        { at: iso(nowMs - 1 * H), views: 5000 },
      ),
      stats: { views: 5000 },
    }), { now: NOW })
    // 5000 views / 4h 龄（夹具 posted_at）= 1250/h ≥ 200 → average。
    assert.equal(v.confidence, 'average', 'a <1.5h span falls through to the publish average')
    assert.equal(v.tier, 'average')
    assert.equal(v.vph, 1250)
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

  it('posted_at 在未来（时钟异常）→ 钉住降级落点为 C 档 relative', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs + 3 * H),
      first_seen_at: null,
      stats: { views: 10000 },
    }), { now: NOW, medianViews: 100 })
    // 10000 / median 100 = 100x ≥ 3 → relative（中位数缺失的落点是 null，另测）。
    assert.equal(v.confidence, 'relative', 'a future posted_at must not produce average')
    assert.equal(v.tier, 'relative')
    assert.equal(v.multiplier, 100)
  })

  it('views 不可读 → B/C 均无法给绝对量，返回 null', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 5 * H),
      stats: { views: null },
    }), { now: NOW })
    assert.equal(v, null)
  })

  it('views=0（vph=0）→ §3.3 的 <200 下限同样约束 B 档，返回 null', () => {
    // PM 终验裁定：「<200 不渲染」是对胶囊存在性的规定，A/B 两档一致适用；
    // vph=0 的均速描述会让谓词判 true 而文案为空——渲染成空白胶囊行。
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 4 * H),
      stats: { views: 0 },
    }), { now: NOW })
    assert.equal(v, null, 'vph=0 must not produce an average descriptor')
  })

  it('vph=33.3 <200 → null（均速 33/h 一类噪音胶囊不渲染）', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 12 * H),
      stats: { views: 400 },
    }), { now: NOW })
    assert.equal(v, null, 'B tier honours the same <200 floor as A tier')
  })

  it('vph 边界：恰好 200 → average；199.9 与 199 → null', () => {
    const at200 = feedVelocity(post('p', {
      posted_at: iso(nowMs - 4 * H),
      stats: { views: 800 },
    }), { now: NOW })
    assert.equal(at200.confidence, 'average', 'vph=200 is the inclusive floor')
    assert.equal(at200.tier, 'average')
    assert.equal(at200.vph, 200)
    assert.equal(feedVelocity(post('p', {
      posted_at: iso(nowMs - 10 * H),
      stats: { views: 1999 },
    }), { now: NOW }), null, 'vph=199.9 is below the floor')
    assert.equal(feedVelocity(post('p', {
      posted_at: iso(nowMs - 10 * H),
      stats: { views: 1990 },
    }), { now: NOW }), null, 'vph=199 is below the floor')
  })

  it('vph<200 但相对中位数成立 → 降级到 C 档而不是丢弃信号', () => {
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 100 * H),
      stats: { views: 9000 },
    }), { now: NOW, medianViews: 1000 })
    // 均速 90/h <200 不成立；9000/1000=9x ≥3 → 落到「该号 9x」。
    assert.equal(v.confidence, 'relative', 'a below-floor average falls through to the relative tier')
    assert.equal(v.tier, 'relative')
    assert.equal(v.multiplier, 9)
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
  it('toFeedRow 不随行下发增速原料（wire 行只带 velocity 结论）', () => {
    // 增速原料留在 Host 侧的原始 post 上；mergeAccountPosts 计算的是
    // feedVelocity(post) 而非 feedVelocity(row)——views_history/first_seen_at
    // 透传进 wire 行只增体积，客户端无一处读取（四轴 M5）。
    const row = toFeedRow(post('p', {
      metrics: history({ at: iso(nowMs - 2 * H), views: 5 }),
      first_seen_at: iso(nowMs - 9 * H),
    }), account)
    assert.ok(!('views_history' in row), 'wire row must not carry the raw sample list')
    assert.ok(!('first_seen_at' in row), 'wire row must not carry the seen timestamp')
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

  it('速率族与相对族分桶：vph 恒先于 multiplier，不随数值大小穿插', () => {
    // 旧实现 vph*1000 与 multiplier 同轴比较：multiplier=9.5 会把 vph=0.005
    // 的速率行挤到相对族之后（QA M3 实测 rel 排在 avg 前）。
    const sorted = sortFeedRows([
      row('rel', { tier: 'relative', multiplier: 9.5 }),
      row('tiny', { tier: 'watch', vph: 0.005 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['tiny', 'rel'],
      'the hourly-rate family always precedes the relative family')
    // 双向极端：极小的相对族与极大的速率族同样不交换桶。
    const sorted2 = sortFeedRows([
      row('relmin', { tier: 'relative', multiplier: 3 }),
      row('vmax', { tier: 'hot', vph: 23000 }),
      row('vmin', { tier: 'watch', vph: 200 }),
    ], 'velocity')
    assert.deepEqual(sorted2.map((r) => r.id), ['vmax', 'vmin', 'relmin'],
      'vph=23000 sorts before vph=200, and the smallest relative still sits in its own bucket')
  })

  it('vph=0（无胶囊）与 velocity=null 一样沉到末尾', () => {
    const sorted = sortFeedRows([
      row('zero', { tier: 'average', vph: 0 }),
      row('rel', { tier: 'relative', multiplier: 9.5 }),
      row('nul', null),
      row('hot', { tier: 'hot', vph: 23000 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['hot', 'rel', 'zero', 'nul'],
      'a descriptor that renders no pill sorts as no signal')
  })

  it('vph 相同按 id 降序，顺序稳定', () => {
    const sorted = sortFeedRows([
      row('a', { tier: 'watch', vph: 500 }),
      row('b', { tier: 'watch', vph: 500 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['b', 'a'])
  })
})
