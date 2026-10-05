import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSafeExternalUrl, openExternalUrl } from './open-url.js'

/**
 * The `window.open` whitelist shared by every「打开外部链接」surface in this
 * plugin (原帖直达 / 查看原帖 / 账号主页跳转).
 *
 * What is pinned: only absolute `http:`/`https:` URLs may reach `window.open` —
 * `javascript:`/`data:`/`vbscript:` and malformed or relative values must be
 * refused, and refused means the function is never invoked.
 */

describe('isSafeExternalUrl', () => {
  it('allows absolute http/https only', () => {
    assert.equal(isSafeExternalUrl('https://www.tiktok.com/@alice/video/1'), true)
    assert.equal(isSafeExternalUrl('http://example.com/a'), true)
    assert.equal(isSafeExternalUrl('  https://x.com/bob  '), true, 'surrounding whitespace must not disqualify a good URL')
  })

  it('refuses scriptable and non-web schemes', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<h1>x</h1>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.example.com/x',
      '/relative/path',
      'tiktok.com/@alice',
      '',
      'not a url at all',
      null,
      undefined,
      42,
    ]) {
      assert.equal(isSafeExternalUrl(url), false, `must refuse ${JSON.stringify(url)}`)
    }
  })
})

describe('openExternalUrl', () => {
  it('never calls window.open for a non-http(s) URL', () => {
    const opened = []
    const win = { open: (url) => opened.push(url) }
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '/relative', '']) {
      assert.equal(openExternalUrl(url, { window: win }), false)
    }
    assert.deepEqual(opened, [], 'window.open must not run for refused URLs')
  })

  it('opens allowed URLs in a new, severed tab', () => {
    const opened = []
    const win = { open: (url, target, features) => { opened.push([url, target, features]); return null } }
    assert.equal(openExternalUrl('https://www.tiktok.com/@alice', { window: win }), true)
    assert.deepEqual(opened, [['https://www.tiktok.com/@alice', '_blank', 'noopener,noreferrer']])
  })
})
