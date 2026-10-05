import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatCount,
  formatEngagementCount,
  formatRelativeTime,
  rivalLocaleOf,
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
