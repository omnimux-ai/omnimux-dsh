import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatCount,
  formatEngagementCount,
  formatRelativeTime,
  rivalLocaleOf,
  rivalVelocityHasSignal,
  rivalVelocityText,
} from './rival-format.js'
import { zh, en } from './locales.js'

/**
 * Locale contract of the rival workbench's display formatting (QA N1).
 *
 * The plugin registers exactly two dictionaries (zh/en), and the components
 * receive only `t` — never a locale string — so `rivalLocaleOf(t)` derives the
 * locale by probing a dictionary key whose zh/en values differ.
 *
 * `?locale=en` must leave no Chinese in the hover layer: that means the
 * relative time (`4 小时前` → `4h ago`) and every count unit (`12.8万` →
 * `128K`) go through the en branches.
 */

const tZh = (key) => zh[key] || key
const tEn = (key) => en[key] || key

const NOW = Date.parse('2026-10-05T12:00:00.000Z')
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString()
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString()
const daysAgo = (d) => new Date(NOW - d * 86400_000).toISOString()

describe('rivalLocaleOf', () => {
  it('derives the locale from the bound t() probe key', () => {
    assert.equal(rivalLocaleOf(tZh), 'zh')
    assert.equal(rivalLocaleOf(tEn), 'en')
  })

  it('defaults to zh when t is missing or returns the raw key', () => {
    assert.equal(rivalLocaleOf(undefined), 'zh')
    assert.equal(rivalLocaleOf(null), 'zh')
    assert.equal(rivalLocaleOf(() => ''), 'zh')
    assert.equal(rivalLocaleOf((key) => key), 'zh', 'an unbound t returning the key itself is not English')
  })

  it('reads the host locale service when the bound t carries it (R5-⑦)', () => {
    // The dictionary probe is only a fallback: `apply(ctx)` pins ctx.locale
    // onto t as `hostLocale`, and its snapshot — not a dictionary value — is
    // the language's single source of truth.
    const enHost = { getSnapshot: () => ({ active: 'en' }) }
    const zhHost = { getSnapshot: () => ({ active: 'zh' }) }
    const tEnWithHost = Object.assign((key) => en[key] || key, { hostLocale: enHost })
    assert.equal(rivalLocaleOf(tEnWithHost), 'en')
    // The host answer wins even over a probe that cannot reach a dictionary.
    const tBareWithEnHost = Object.assign((key) => key, { hostLocale: enHost })
    assert.equal(rivalLocaleOf(tBareWithEnHost), 'en')
    const tZhWithHost = Object.assign((key) => zh[key] || key, { hostLocale: zhHost })
    assert.equal(rivalLocaleOf(tZhWithHost), 'zh')
    // Snapshot-less service shapes (string .current, like omnimux-video's).
    const tCurrent = Object.assign((key) => key, { hostLocale: { current: 'zh-Hans' } })
    assert.equal(rivalLocaleOf(tCurrent), 'zh')
  })

  it('a third host locale falls through to the dictionary probe instead of being judged zh (R6-⑧)', () => {
    // host 'ja'/'ko' must not default to zh copy + zh units: the format layer
    // falls through to the probe, which resolves against the actual bound
    // dictionary (en dictionary → 'en', so a ja user gets K/M and "3d ago"
    // consistently instead of mixed zh units under ja copy).
    const jaHost = { getSnapshot: () => ({ active: 'ja' }) }
    const koHost = { getSnapshot: () => ({ active: 'ko-KR' }) }
    const tJaEnDict = Object.assign((key) => en[key] || key, { hostLocale: jaHost })
    assert.equal(rivalLocaleOf(tJaEnDict), 'en', 'ja host + en dictionary must resolve to en, not zh')
    const tKoZhDict = Object.assign((key) => zh[key] || key, { hostLocale: koHost })
    assert.equal(rivalLocaleOf(tKoZhDict), 'zh', 'ko host + zh dictionary resolves via the probe')
    // zh-prefix hosts keep winning directly.
    const tZhTw = Object.assign((key) => en[key] || key, { hostLocale: { getSnapshot: () => ({ active: 'zh-TW' }) } })
    assert.equal(rivalLocaleOf(tZhTw), 'zh')
  })
})

describe('formatCount — locale', () => {
  it('keeps the zh behaviour as the default', () => {
    assert.equal(formatCount(128000), '12.8万')
    assert.equal(formatCount(120000000), '1.2亿')
    assert.equal(formatCount(8640), '8640')
  })

  it('formats en as K/M/B', () => {
    assert.equal(formatCount(128000, 'en'), '128K')
    assert.equal(formatCount(12300, 'en'), '12.3K')
    assert.equal(formatCount(2_400_000, 'en'), '2.4M')
    assert.equal(formatCount(1_300_000_000, 'en'), '1.3B')
    assert.equal(formatCount(8640, 'en'), '8.6K')
    assert.equal(formatCount(999, 'en'), '999')
  })

  it('returns -- for unreadable values in both locales', () => {
    assert.equal(formatCount('x', 'en'), '--')
    assert.equal(formatCount(undefined), '--')
  })
})

describe('formatEngagementCount — locale', () => {
  it('keeps the zh 万 abbreviation as the default', () => {
    assert.equal(formatEngagementCount(8640), '8,640')
    assert.equal(formatEngagementCount(19640), '2万')
    assert.equal(formatEngagementCount(214), '214')
  })

  it('formats en with K/M units and no Chinese characters', () => {
    assert.equal(formatEngagementCount(19640, 'en'), '19.6K')
    assert.equal(formatEngagementCount(2_400_000, 'en'), '2.4M')
    assert.equal(formatEngagementCount(8640, 'en'), '8.6K')
    assert.equal(formatEngagementCount(214, 'en'), '214')
  })
})

describe('formatRelativeTime — locale', () => {
  it('keeps the zh wording as the default', () => {
    assert.equal(formatRelativeTime(minutesAgo(12), NOW), '12 分钟前')
    assert.equal(formatRelativeTime(hoursAgo(4), NOW), '4 小时前')
    assert.equal(formatRelativeTime(daysAgo(3), NOW), '3 天前')
    assert.equal(formatRelativeTime(minutesAgo(0.2), NOW), '刚刚')
  })

  it('formats en without any Chinese character', () => {
    const cases = [
      [minutesAgo(0.2), 'just now'],
      [minutesAgo(12), '12m ago'],
      [hoursAgo(4), '4h ago'],
      [daysAgo(3), '3d ago'],
      [daysAgo(45), '1mo ago'],
      [daysAgo(400), '1y ago'],
    ]
    for (const [iso, expected] of cases) {
      assert.equal(formatRelativeTime(iso, NOW, 'en'), expected)
    }
    for (const [iso] of cases) {
      assert.doesNotMatch(formatRelativeTime(iso, NOW, 'en'), /[一-鿿]/)
    }
  })

  it('returns -- for unreadable values in both locales', () => {
    assert.equal(formatRelativeTime('not-a-date', NOW, 'en'), '--')
    assert.equal(formatRelativeTime(null, NOW, 'en'), '--')
  })
})


describe('rivalVelocityText — §3.3 三档逐字文案（#3113）', () => {
  it('measured hot/rising/watch 按前缀与 k/h 格式渲染', () => {
    assert.equal(rivalVelocityText({ tier: 'hot', confidence: 'measured', vph: 23000 }, tZh), '爆款 23k/h')
    assert.equal(rivalVelocityText({ tier: 'rising', confidence: 'measured', vph: 1200 }, tZh), '飙升 1.2k/h')
    assert.equal(rivalVelocityText({ tier: 'watch', confidence: 'measured', vph: 320 }, tZh), '观察 320/h')
  })

  it('average 档逐字「均速 {v}」：同样走数字格式、不带热度前缀', () => {
    assert.equal(rivalVelocityText({ tier: 'average', confidence: 'average', vph: 1800 }, tZh), '均速 1.8k/h')
    assert.equal(rivalVelocityText({ tier: 'average', confidence: 'average', vph: 220 }, tZh), '均速 220/h')
  })

  it('relative 档逐字「该号 {v}x」：严禁 /h 单位与爆款/飙升前缀（§3.3 红线）', () => {
    const text = rivalVelocityText({ tier: 'relative', confidence: 'relative', multiplier: 4.2 }, tZh)
    assert.equal(text, '该号 4.2x')
    assert.ok(!text.includes('/h'), '相对档不得携带小时速率单位')
    assert.ok(!text.includes('爆款') && !text.includes('飙升'), '相对档不得使用热度前缀')
  })

  it('legacy 直传 text 优先返回（向后兼容旧 row 形态）', () => {
    assert.equal(rivalVelocityText({ text: '爆款 23k/h', tier: 'hot' }, tZh), '爆款 23k/h')
  })

  it('vph/multiplier 都读不出 → 空串（胶囊不渲染）', () => {
    assert.equal(rivalVelocityText({ tier: 'hot' }, tZh), '')
    assert.equal(rivalVelocityText(null, tZh), '')
    assert.equal(rivalVelocityText({ tier: 'relative' }, tZh), '')
  })

  it('不变量：谓词 true ⇒ 文案非空（谓词与文案同域）', () => {
    // 四轴必修 A：vph=0 之类输入曾让谓词判 true 而文案为 ''，渲染层据此
    // 铺出 28px 空白胶囊行。谓词必须与文案共享同一数值域——速率族
    // vph>=200（§3.3 下限），相对族 multiplier>0。
    const rates = [0, 199.9, 200, 1_000, 20_000, 20_000.5]
    for (const tier of ['hot', 'rising', 'watch', 'average']) {
      for (const vph of rates) {
        const velocity = { tier, confidence: tier === 'average' ? 'average' : 'measured', vph }
        const signal = rivalVelocityHasSignal(velocity)
        assert.equal(signal, vph >= 200, `tier=${tier} vph=${vph} must signal only at/above the 200 floor`)
        if (signal) {
          assert.ok(rivalVelocityText(velocity, tZh) !== '',
            `predicate true must never pair with empty copy: tier=${tier} vph=${vph}`)
        }
      }
    }
    for (const multiplier of [0, 3]) {
      const velocity = { tier: 'relative', confidence: 'relative', multiplier }
      const signal = rivalVelocityHasSignal(velocity)
      assert.equal(signal, multiplier > 0, `multiplier=${multiplier}`)
      if (signal) assert.ok(rivalVelocityText(velocity, tZh) !== '')
    }
    assert.equal(rivalVelocityHasSignal({ text: '飙升 2.6k/h' }), true, 'legacy text passthrough')
    assert.equal(rivalVelocityHasSignal({ text: '' }), false)
    assert.equal(rivalVelocityHasSignal(null), false)
  })

  it('en 字典键存在且形态同构（不带中文）', () => {
    const text = rivalVelocityText({ tier: 'hot', confidence: 'measured', vph: 23000 }, tEn)
    assert.ok(text.endsWith('23k/h'), `en hot tier keeps the rate suffix, got ${text}`)
    assert.ok(!/[一-鿿]/.test(text), `en pill must not leak Chinese, got ${text}`)
    const rel = rivalVelocityText({ tier: 'relative', confidence: 'relative', multiplier: 4.2 }, tEn)
    assert.ok(rel.endsWith('4.2x') && !rel.includes('/h'), `en relative tier, got ${rel}`)
  })
})
