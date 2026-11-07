import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { en, zh } from './locales.js'

describe('CLI login copy', () => {
  it('keeps terminal fallback copy distinct from background copy', () => {
    assert.equal(zh['runtime.cliLoginOpened'], '已打开终端，请在终端里完成登录')
    assert.equal(zh['runtime.cliLoginStarted'], '已发起登录，请在浏览器中完成')
    assert.equal(en['runtime.cliLoginOpened'], 'Terminal opened. Finish signing in there')
    assert.equal(en['runtime.cliLoginStarted'], 'Sign-in started. Finish in your browser')
  })

  it('uses neutral failure copy for both modes', () => {
    assert.equal(zh['runtime.cliLoginFail'], '登录启动失败，请重试')
    assert.equal(en['runtime.cliLoginFail'], 'Could not start sign-in. Please retry')
  })
})
