import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'
import * as rivalConstants from './constants.js'
import { feedVelocity, mergeAccountPosts, sortFeedRows, toFeedRow } from './rival-feed.js'

// Namespace import on purpose: a missing export must fail THIS assertion, not
// the module load — otherwise the whole file red-flags on old code instead of
// one named test.
const RIVAL_VELOCITY_RANK_FAMILY = rivalConstants.RIVAL_VELOCITY_RANK_FAMILY

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

  it('vph <200 → 不产速率族胶囊，照 B 档继续走 C 档判定（PM 裁定甲案）', () => {
    // F6：A 档算出 vph 但低于 200 门槛是「未产出胶囊」的失败形态，
    // 与 B 档落空同构——继续下沉，不短路为 null。此夹具 posted_at 不可
    // 解析且中位数缺失，三档皆空 → null。
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

  it('F1/F2：A 档 166/h 落空与 B 档同帖无历史必须产出同一个 relative 描述', () => {
    // PM 裁定核心断言（F2' 单列）：同一篇帖子，有无 views_history 只
    // 是数据可得性差，不该决定胶囊的有无——A 档 1670→2002（Δ332/2h=
    // 166/h<200）落空，B 档 5000/30h=166.7/h 同样落空，都该落 C 档
    // 5000/100=50x。两路结论 deepEqual。
    const withHistory = feedVelocity(post('f1', {
      posted_at: iso(nowMs - 30 * H),
      stats: { views: 5000 },
      metrics: history(
        { at: iso(nowMs - 20 * H), views: 1670 },
        { at: iso(nowMs - 18 * H), views: 2002 },
      ),
    }), { now: NOW, medianViews: 100 })
    const withoutHistory = feedVelocity(post('f2', {
      posted_at: iso(nowMs - 30 * H),
      stats: { views: 5000 },
    }), { now: NOW, medianViews: 100 })
    assert.equal(withHistory.confidence, 'relative', 'A-tier below-floor must degrade, not return null')
    assert.equal(withHistory.tier, 'relative')
    assert.equal(withHistory.multiplier, 50)
    assert.equal(withHistory.vph, undefined, '相对族描述不携带小时速率')
    assert.equal(withoutHistory.confidence, 'relative')
    assert.equal(withoutHistory.multiplier, 50)
    assert.deepEqual(withHistory, withoutHistory,
      'F2\': the same post with and without views_history must reach the same descriptor')
  })

  it('F3：A 档落空只能下沉到相对族，速率族 200/h 门原样生效', () => {
    // 落空 ≠ 降门槛：A 档 0→166（83/h）落空、B 档 1000/10h=100/h 落空，
    // 产出的只能是 {relative, multiplier:10}——不得出现 watch/rising/hot
    // 任一速率族 tier，也不得携带 vph。
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 10 * H),
      stats: { views: 1000 },
      metrics: history(
        { at: iso(nowMs - 2 * H), views: 0 },
        { at: iso(nowMs - 1 * H), views: 166 },
      ),
    }), { now: NOW, medianViews: 100 })
    assert.equal(v.confidence, 'relative')
    assert.equal(v.tier, 'relative')
    assert.equal(v.multiplier, 10)
    assert.equal(v.vph, undefined)
    assert.ok(!['watch', 'rising', 'hot', 'average'].includes(v.tier),
      'the 200/h floor still rejects the rate family')
  })

  it('F5：A 档落空且倍数 <3 → null（落空不保证产出胶囊）', () => {
    // 与 F1 同夹具但中位数 2000：5000/2000=2.5x <3，A/B 落空后 C 档同样
    // 不满足 → null。防「甲案被读成落空必有 relative」。
    const v = feedVelocity(post('p', {
      posted_at: iso(nowMs - 30 * H),
      stats: { views: 5000 },
      metrics: history(
        { at: iso(nowMs - 20 * H), views: 1670 },
        { at: iso(nowMs - 18 * H), views: 2002 },
      ),
    }), { now: NOW, medianViews: 2000 })
    assert.equal(v, null)
  })

  it('未来采样点一律不计入实测窗口 → 降级（JSDoc：unparseable or future）', () => {
    // 两枚未来采样（+2h → +4h，间隔 2h ≥1.5h）若不被排除会产出
    // measured vph=250——「未来」与「不可解析」同列降级清单。posted_at
    // 置 null 使 B/C 同样落空，降级落点钉为 null。
    const v = feedVelocity(post('p', {
      posted_at: null,
      stats: { views: 1000 },
      metrics: history(
        { at: iso(nowMs + 2 * H), views: 0 },
        { at: iso(nowMs + 4 * H), views: 500 },
      ),
    }), { now: NOW })
    assert.equal(v, null, 'future samples must not feed the measured tier')
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

  it('中间采样回退（端点 delta 仍为正）→ 降级，不产 measured', () => {
    // 端点比较只查首/末：1000→500→3500 的首末差 +2500（833/h ≥200）为正，
    // 旧实现照样产出 measured——与 docblock「views rollback is a data
    // anomaly, never a negative speed — degrade」矛盾（四轴复审 M-C）。
    // 任一相邻对下降即回滚。posted_at 置 null 使 B 档落空、median 100 使
    // C 档成立：降级落点钉为 relative 3500/100=35x，而不是给一段含回滚
    // 的历史签发 measured。
    const v = feedVelocity(post('p', {
      posted_at: null,
      metrics: history(
        { at: iso(nowMs - 4 * H), views: 1000 },
        { at: iso(nowMs - 2 * H), views: 500 },
        { at: iso(nowMs - 1 * H), views: 3500 },
      ),
      stats: { views: 3500 },
    }), { now: NOW, medianViews: 100 })
    assert.notEqual(v?.confidence, 'measured',
      'an adjacent-pair views drop must degrade the measured tier')
    assert.equal(v.confidence, 'relative',
      'the degraded descriptor lands on the relative tier (B also fails here)')
    assert.equal(v.multiplier, 35)
  })

  it('相邻采样单调不减（含持平补采点）仍照常产 measured', () => {
    // 不误伤：相邻相等不算回滚——平台补采 0 增量是正常形态；
    // Δ7000/3h = 2333.3/h → rising。
    const v = feedVelocity(post('p', {
      metrics: history(
        { at: iso(nowMs - 4 * H), views: 1000 },
        { at: iso(nowMs - 2 * H), views: 1000 },
        { at: iso(nowMs - 1 * H), views: 8000 },
      ),
      stats: { views: 8000 },
    }), { now: NOW })
    assert.equal(v.confidence, 'measured')
    assert.equal(v.tier, 'rising')
    assert.equal(v.vph, 2333.3)
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

  it('中位数按账号只算一次：同一账号 N 行 feedMedianViews 恰被调用一次', () => {
    // 性能契约（四轴复审 M-B）：feedMedianViews 曾坐在 kept.map 回调里，
    // 每一行都对同一份历史重算一次全量排序。计数桩：给该账号的帖子数组
    // 套 Proxy，`feedMedianViews` 每次调用都以 `.map` 起始——mapGets 即
    // 调用次数。同一账号 3 行 ⇒ 旧实现 3 次、新实现 1 次。
    let medianCalls = 0
    const countingPosts = new Proxy([
      post('r1', { posted_at: null, stats: { views: 9000 } }),
      post('r2', { posted_at: null, stats: { views: 1000 } }),
      post('r3', { posted_at: null, stats: { views: 1000 } }),
    ], {
      get(target, prop, receiver) {
        if (prop === 'map') medianCalls += 1
        return Reflect.get(target, prop, receiver)
      },
    })
    const rows = mergeAccountPosts({
      accounts: [account],
      postsByAccount: { ra_a: countingPosts },
      now: NOW,
    })
    assert.equal(rows.length, 3)
    assert.equal(medianCalls, 1,
      `median must be computed once per account, got ${medianCalls} calls for 3 rows`)
    // 复用的中位数照常生效：9000 / median(9000,1000,1000)=1000 → 9x。
    assert.equal(rows.find((r) => r.id === 'r1').velocity.multiplier, 9)
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
    // 旧实现 vph*1000 与 multiplier 同轴比较：multiplier=9.5 会把
    // vph=0.005 的速率行挤到相对族之后（QA M3 实测 rel 排在 avg 前）。
    // 速率族入桶门与谓词地板同值（vph>=200），故极值夹具用 200 起步——
    // (0,200) 的手造描述归无信号桶（另测）。
    const sorted = sortFeedRows([
      row('rel', { tier: 'relative', multiplier: 1e6 }),
      row('tiny', { tier: 'watch', vph: 200 }),
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

  it('渲染不出胶囊的描述与 velocity=null 同沉末尾（分桶语义）', () => {
    // 「谓词判 false」的三态（vph=0 / 0<vph<200 潜伏态 / multiplier<=0）
    // 与 null 同在无信号桶，落在最小相对族之后；无信号桶内部按 id 降序。
    // 比旧断言多了「0<vph<200 的手造 wire 行」与「multiplier<=0」——这两
    // 态在旧 rank（isFinite(vph)&&vph>0）下会错位进速率族。
    const sorted = sortFeedRows([
      row('zero', { tier: 'average', vph: 0 }),
      row('gap', { tier: 'watch', vph: 199.9 }),
      row('neg', { tier: 'relative', multiplier: 0 }),
      row('rel', { tier: 'relative', multiplier: 9.5 }),
      row('nul', null),
      row('hot', { tier: 'hot', vph: 23000 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['hot', 'rel', 'zero', 'nul', 'neg', 'gap'],
      'a descriptor that renders no pill sorts as no signal, ties by id desc')
  })

  it('速率族门与谓词地板同值：0<vph<200 的手造 wire 行不得进速率桶', () => {
    // velocityRank 的速率族门是 vph>=VELOCITY_TIER_WATCH（与谓词同一地
    // 板），不是「vph>0」——后者会让宿主不可产出的 (0,200) 描述排进速
    // 率族、压过真实 relative 行（QA/OCR 潜伏项，本轮修复）。
    const sorted = sortFeedRows([
      row('gap', { tier: 'watch', vph: 199.9 }),
      row('rel', { tier: 'relative', multiplier: 3 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['rel', 'gap'],
      'a below-floor rate descriptor must not sit in the rate bucket ahead of a real relative')
  })

  it('相对族 multiplier 再大也越不过速率族（二元组族序，非数值近似）', () => {
    // 分桶以（族, 值）二元组保证：相对族的上限不封顶，multiplier 1e9+1
    // 仍排在最小速率族之后——数值基数（1e9+vph）方案在 multiplier>1e9
    // +vph 时失效，二元组不依赖该近似前提。
    const sorted = sortFeedRows([
      row('v', { tier: 'watch', vph: 200 }),
      row('rel', { tier: 'relative', multiplier: 1e9 + 1 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['v', 'rel'],
      'family precedence is a tuple, not a numeric approximation')
  })

  it('族序序号来自 constants.js 的具名常量（速率 > 相对 > 无信号）', () => {
    // 常量存在且次序正确。常量缺失时本断言在旧源码上即失败
    //（undefined.rate 抛 TypeError）。
    assert.ok(RIVAL_VELOCITY_RANK_FAMILY.rate > RIVAL_VELOCITY_RANK_FAMILY.relative)
    assert.ok(RIVAL_VELOCITY_RANK_FAMILY.relative > RIVAL_VELOCITY_RANK_FAMILY.none)
    // 但这条断言只钉常量自身，钉不住「sorter 是否真的在用它」——见下一条
    //（R3 复审 R1：恢复内联字面量而保留常量导出时，本条仍全绿）。
  })

  it('velocityRankKey 消费具名常量且不内联族序字面量（R1 结构断言）', async () => {
    // 上一条只断言常量自身的数值次序，而它声称要防的是「sorter 恢复内联
    // 族序」——两者不同轴：恢复内联、常量保留导出时，行为完全一致，任何
    // 行为断言都抓不住（R3 复审 R1 实测：那种回退仍 36/36 全绿）。
    // 所以这里直接钉源码结构：族序只能来自 RIVAL_VELOCITY_RANK_FAMILY。
    const src = await readFile(new URL('./rival-feed.js', import.meta.url), 'utf8')
    const start = src.indexOf('function velocityRankKey')
    assert.notEqual(start, -1, 'velocityRankKey must exist')
    const body = src.slice(start, src.indexOf('export function sortFeedRows', start))
    assert.match(body, /RIVAL_VELOCITY_RANK_FAMILY\.(rate|relative|none)/,
      'family ordinal must be read from RIVAL_VELOCITY_RANK_FAMILY')
    assert.doesNotMatch(body, /return\s*\[\s*[0-9]/,
      'family ordinal must not be an inline literal in velocityRankKey')
  })

  it('vph 相同按 id 降序，顺序稳定', () => {
    const sorted = sortFeedRows([
      row('a', { tier: 'watch', vph: 500 }),
      row('b', { tier: 'watch', vph: 500 }),
    ], 'velocity')
    assert.deepEqual(sorted.map((r) => r.id), ['b', 'a'])
  })

  it('F9：A 档落空行与 B 档落空行同族同位，都在无信号行之前', () => {
    // 与 F1/F2 同一数据的 wire 行：两条都是 relative multiplier=50
    // （同族同 rank，按 id 降序 f2>f1），无信号行垫在最后——A/B 两档
    // 在排序层同样不得分叉。
    const rows = mergeAccountPosts({
      accounts: [account],
      postsByAccount: {
        ra_a: [
          post('f1', {
            posted_at: iso(nowMs - 30 * H),
            stats: { views: 5000 },
            metrics: history(
              { at: iso(nowMs - 20 * H), views: 1670 },
              { at: iso(nowMs - 18 * H), views: 2002 },
            ),
          }),
          post('f2', {
            posted_at: iso(nowMs - 30 * H),
            stats: { views: 5000 },
          }),
          post('none', { posted_at: null, stats: { views: 0 } }),
          post('med1', { posted_at: null, stats: { views: 100 } }),
          post('med2', { posted_at: null, stats: { views: 100 } }),
          post('med3', { posted_at: null, stats: { views: 100 } }),
        ],
      },
      now: NOW,
    })
    const ordered = sortFeedRows(rows, 'velocity').map((r) => r.id)
    assert.deepEqual(ordered, ['f2', 'f1', 'none', 'med3', 'med2', 'med1'],
      'both fallthrough rows share the relative bucket and precede the no-signal rows')
    assert.deepEqual(rows.find((r) => r.id === 'f1').velocity,
      rows.find((r) => r.id === 'f2').velocity)
  })
})
