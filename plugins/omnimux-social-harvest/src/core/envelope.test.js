/**
 * @file 信封解析与失败分类单测 —— 零子进程、零网络。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ERROR_CODES } from '../core/errors.js'
import { classifyFailure, parseEnvelope } from '../core/envelope.js'

describe('parseEnvelope', () => {
  it('解析纯 JSON 数组', () => {
    const r = parseEnvelope('[{"a":1},{"a":2}]')
    assert.equal(r.kind, 'array')
    assert.equal(r.items.length, 2)
  })

  it('解析含数组字段的信封（items/data/pins 等）', () => {
    for (const key of ['data', 'items', 'tweets', 'results', 'list', 'pins', 'videos', 'notes']) {
      const r = parseEnvelope(JSON.stringify({ [key]: [{ x: 1 }] }))
      assert.equal(r.kind, 'array', key)
      assert.equal(r.items.length, 1, key)
    }
  })

  it('识别 YAML 失败信封（ok: false）', () => {
    const r = parseEnvelope('ok: false\nerror:\n  code: COMMAND_EXEC\n  message: >-\n    attach failed\n  exitCode: 1\n')
    assert.equal(r.kind, 'error')
    assert.equal(r.code, 'COMMAND_EXEC')
    assert.match(r.message, /attach failed/)
  })

  it('识别 JSON 失败信封（ok:false）', () => {
    const r = parseEnvelope(JSON.stringify({ ok: false, error: { code: 'X', message: 'boom' } }))
    assert.equal(r.kind, 'error')
    assert.equal(r.code, 'X')
  })

  it('空 stdout → invalid', () => {
    assert.equal(parseEnvelope('').kind, 'invalid')
    assert.equal(parseEnvelope('   ').kind, 'invalid')
  })

  it('非 JSON → invalid', () => {
    assert.equal(parseEnvelope('<html>login</html>').kind, 'invalid')
  })

  it('JSON 对象但无数组字段 → invalid', () => {
    assert.equal(parseEnvelope('{"ok":true}').kind, 'invalid')
  })
})

describe('classifyFailure（顺序不可调换）', () => {
  it('ENOENT → NOT_INSTALLED，不可重试', () => {
    const e = classifyFailure({ code: 1, stderr: 'spawn opencli ENOENT' })
    assert.equal(e.code, ERROR_CODES.NOT_INSTALLED)
    assert.equal(e.retryable, false)
    assert.match(e.hint, /安装 OpenCLI/)
  })

  it('桥接特征 → UNAVAILABLE，可重试', () => {
    const e = classifyFailure({ code: 1, stderr: 'Pre-navigation to https://x.com failed: attach failed' })
    assert.equal(e.code, ERROR_CODES.UNAVAILABLE)
    assert.equal(e.retryable, true)
    assert.match(e.hint, /doctor/)
  })

  it('exit 69 → UNAVAILABLE（无 stderr 特征也成立）', () => {
    const e = classifyFailure({ code: 69, stderr: '' })
    assert.equal(e.code, ERROR_CODES.UNAVAILABLE)
  })

  it('登录特征 → AUTH，不可重试，hint 含平台名', () => {
    const e = classifyFailure({ code: 1, stderr: '401 Unauthorized' }, { siteLabel: 'TikTok' })
    assert.equal(e.code, ERROR_CODES.AUTH)
    assert.equal(e.retryable, false)
    assert.match(e.message, /TikTok/)
    assert.match(e.hint, /TikTok/)
  })

  it('exit 77 → AUTH', () => {
    const e = classifyFailure({ code: 77, stderr: '' }, { siteLabel: 'YouTube' })
    assert.equal(e.code, ERROR_CODES.AUTH)
  })

  it('顺序：ENOENT 优先于登录特征', () => {
    const e = classifyFailure({ code: 1, stderr: 'spawn opencli ENOENT 401' })
    assert.equal(e.code, ERROR_CODES.NOT_INSTALLED)
  })

  it('顺序：桥接优先于登录特征（intercept 实测教训）', () => {
    const e = classifyFailure({ code: 1, stderr: 'attach failed login required' })
    assert.equal(e.code, ERROR_CODES.UNAVAILABLE)
  })

  it('其它失败 → UNAVAILABLE，带退出码与诊断截断', () => {
    const e = classifyFailure({ code: 1, stderr: 'weird\n'.repeat(100) })
    assert.equal(e.code, ERROR_CODES.UNAVAILABLE)
    assert.match(e.message, /退出码 1/)
    assert.ok((e.cause ?? '').length <= 500)
  })
})
