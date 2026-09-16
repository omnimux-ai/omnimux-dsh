// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Session tab-binding self-heal (Issue #2103).
 *
 * The live report was a user who had paired successfully and still could not
 * send: their session predated pairing, so it carried no tab binding, and the
 * prompt guard refused it with an English dead end. These assertions pin the
 * contract that replaced that refusal — an on-demand binding, and a refusal
 * only when no active tab exists, phrased so the user knows what to do.
 */
describe('session tab-binding self-heal (#2103)', () => {
  const background = readFileSync(resolve(import.meta.dirname, '../src/background/index.ts'), 'utf8')

  it('binds an unbound session on demand instead of refusing the prompt', () => {
    expect(background).toContain('async function ensureSessionTabBinding')
    expect(background).toContain('return ensureSessionTabBinding(rpcSessionId)')
    // The dead end itself must not come back.
    expect(background).not.toContain('This session is not bound to a live browser tab')
  })

  it('binds through the same path a brand-new session uses', () => {
    const helper = background.slice(background.indexOf('async function ensureSessionTabBinding'))
    const body = helper.slice(0, helper.indexOf('\n}\n'))
    for (const step of [
      'tabAffinity.getSessionTab(sessionId)',
      'syncActiveTab()',
      'tabAffinity.bindNewSession(sessionId, summary)',
      'pageSessionContexts.bind(sessionId',
      'persistTabAffinity()',
      'broadcastTabAffinity()',
    ]) {
      expect(body).toContain(step)
    }
  })

  it('tells the user what to do when no tab can be bound', () => {
    expect(background).toContain('当前没有可绑定的网页标签页')
    expect(background).toContain('No live browser tab is available')
  })
})
