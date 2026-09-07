import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { zh, en } from './locales.js'
import { DEFAULT_SORT_DIRECTIONS, sortAccounts } from './view.js'
import { STYLES } from './styles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Accounts Stage UX & Spacing Contract (Issue #303)', () => {
  it('defines Chinese and English subtitles in locales', () => {
    assert.ok(zh.subtitle, 'zh.subtitle should exist')
    assert.match(zh.subtitle, /社交账号授权|Agent 访问权限/)
    assert.ok(en.subtitle, 'en.subtitle should exist')
    assert.match(en.subtitle, /authorization|Agent access/i)
  })

  it('defines 6 sort keys in locales', () => {
    const keys = ['display_name', 'platform', 'status', 'lastUsed', 'connectedAt', 'expiresAt']
    for (const k of keys) {
      assert.ok(zh[`sort.${k}`], `zh.sort.${k} missing`)
      assert.ok(en[`sort.${k}`], `en.sort.${k} missing`)
    }
  })

  it('provides DEFAULT_SORT_DIRECTIONS for all 6 dimensions', () => {
    assert.equal(DEFAULT_SORT_DIRECTIONS.display_name, 'asc')
    assert.equal(DEFAULT_SORT_DIRECTIONS.platform, 'asc')
    assert.equal(DEFAULT_SORT_DIRECTIONS.status, 'asc')
    assert.equal(DEFAULT_SORT_DIRECTIONS.last_used_at, 'desc')
    assert.equal(DEFAULT_SORT_DIRECTIONS.connected_at, 'desc')
    assert.equal(DEFAULT_SORT_DIRECTIONS.expires_at, 'asc')
  })

  it('sorts correctly on all 6 dimensions', () => {
    const data = [
      { id: '1', display_name: 'Zeta', platform: 'tiktok', status: 'expired', last_used_at: '2026-08-01T00:00:00Z', connected_at: '2026-07-01T00:00:00Z', expires_at: '2026-09-01T00:00:00Z' },
      { id: '2', display_name: 'Alpha', platform: 'instagram', status: 'active', last_used_at: '2026-08-20T00:00:00Z', connected_at: '2026-08-15T00:00:00Z', expires_at: '2026-08-25T00:00:00Z' },
      { id: '3', display_name: 'Beta', platform: 'youtube', status: 'expiring', last_used_at: null, connected_at: null, expires_at: null },
    ]

    assert.deepEqual(sortAccounts(data, 'display_name', 'asc').map((r) => r.id), ['2', '3', '1'])
    assert.deepEqual(sortAccounts(data, 'platform', 'asc').map((r) => r.id), ['2', '1', '3'])
    assert.deepEqual(sortAccounts(data, 'status', 'asc').map((r) => r.id), ['2', '3', '1'])
    assert.deepEqual(sortAccounts(data, 'last_used_at', 'desc').map((r) => r.id), ['2', '1', '3'])
    assert.deepEqual(sortAccounts(data, 'connected_at', 'desc').map((r) => r.id), ['2', '1', '3'])
    assert.deepEqual(sortAccounts(data, 'expires_at', 'asc').map((r) => r.id), ['2', '1', '3'])
  })

  it('implements Layer 2 ActionRow with PlusIcon and removes .omnimux-accounts-cta', () => {
    const sectionJsx = readFileSync(join(__dirname, 'AccountsSection.jsx'), 'utf8')
    assert.match(sectionJsx, /omnimux-accounts-action-row/)
    assert.match(sectionJsx, /<PlusIcon \/>/)
    assert.doesNotMatch(sectionJsx, /omnimux-accounts-cta/)
    assert.doesNotMatch(sectionJsx, /\+ \{t\('connect'\)\}/)
  })

  it('passes subtitle to PageHeader in AccountsStage', () => {
    const stageJsx = readFileSync(join(__dirname, 'AccountsStage.jsx'), 'utf8')
    assert.match(stageJsx, /subtitle=\{t\('subtitle'\)\}/)
  })

  it('exposes all 6 sort options in FilterBar', () => {
    const filterJsx = readFileSync(join(__dirname, 'FilterBar.jsx'), 'utf8')
    assert.match(filterJsx, /value:\s*'connected_at'/)
    assert.match(filterJsx, /value:\s*'expires_at'/)
  })

  it('formats platform Tabs with simplified "平台" and standard localized labels', () => {
    const filterJsx = readFileSync(join(__dirname, 'FilterBar.jsx'), 'utf8')
    assert.match(filterJsx, /import\s*\{[^}]*localeText[^}]*\}\s*from\s*'\.\/view\.js'/)
    assert.match(filterJsx, /id:\s*'',\s*label:\s*t\('platform'\)/)
    assert.match(filterJsx, /label:\s*localeText\(t,\s*`platform\.\$\{value\}`,\s*value\)/)
  })

  it('declares standard four-layer spacing in styles.js', () => {
    assert.match(STYLES, /\.omnimux-accounts-action-row\s*\{[^}]*padding-top:\s*8px/)
    assert.doesNotMatch(STYLES, /\.omnimux-accounts-cta/)
  })
})
