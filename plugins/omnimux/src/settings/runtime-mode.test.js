import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertRuntimeReady, requiresOfficialSignIn, resolveRuntimeChoice } from './runtime-mode.js'

describe('resolveRuntimeChoice', () => {
  it('keeps an unset install on the official route', () => {
    assert.deepEqual(resolveRuntimeChoice({}), {
      mode: 'official',
      textReady: true,
      mediaReady: true,
    })
  })

  it('blocks an unverified local agent and never marks media ready', () => {
    const choice = resolveRuntimeChoice({ runtimeMode: 'agent', runtimeAgentId: 'claude' })
    assert.equal(choice.textReady, false)
    assert.equal(choice.mediaReady, false)
    assert.equal(choice.reason, 'unconfigured')
  })

  it('allows only text after a verified local agent', () => {
    const choice = resolveRuntimeChoice({
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
    })
    assert.equal(choice.textReady, true)
    assert.equal(choice.mediaReady, false)
  })

  it('keeps an unfinished custom key unavailable', () => {
    const choice = resolveRuntimeChoice({
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
    })
    assert.equal(choice.textReady, false)
    assert.equal(choice.mediaReady, false)
  })

  it('enables only the media kinds a verified custom key selected', () => {
    const textOnly = resolveRuntimeChoice({
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
      runtimeKeyModel: 'demo',
      runtimeKeyVerified: true,
    })
    assert.equal(textOnly.textReady, true)
    assert.equal(textOnly.mediaReady, false)

    const withImage = resolveRuntimeChoice({
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
      runtimeKeyModel: 'demo',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    })
    assert.equal(withImage.mediaReady, true)
  })

  it('asks for official sign-in only when the action needs the official account', () => {
    const custom = { runtimeMode: 'key', runtimeKeyEndpoint: 'https://example.test/v1', runtimeKeyModel: 'demo', runtimeKeyVerified: true }
    assert.equal(requiresOfficialSignIn(custom, 'generate'), false)
    assert.equal(requiresOfficialSignIn(custom, 'publish'), true)
    assert.equal(requiresOfficialSignIn(custom, 'accounts'), true)
    assert.equal(requiresOfficialSignIn(custom, 'quota'), true)
    assert.equal(requiresOfficialSignIn(custom, 'inspiration'), true)
    // A local agent or custom key never sees the boot-time / unclassified window;
    // only the named account actions open it for them.
    assert.equal(requiresOfficialSignIn(custom, 'something-else'), false)
    assert.equal(requiresOfficialSignIn(custom, undefined), false)
    // Official mode keeps today's rule: everything prompts, unclassified included.
    assert.equal(requiresOfficialSignIn({}, 'generate'), true)
    assert.equal(requiresOfficialSignIn({ runtimeMode: 'official' }, 'something-else'), true)
  })

  it('checks media kinds one by one: an image-only key never lets video through', () => {
    const imageOnly = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
      runtimeKeyModel: 'demo',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    }
    assert.doesNotThrow(() => assertRuntimeReady(imageOnly, 'image'))
    assert.throws(() => assertRuntimeReady(imageOnly, 'video'), /尚未配置/)
    assert.throws(() => assertRuntimeReady(imageOnly, 'audio'), /尚未配置/)
    // The aggregate must not rescue a kind the user never ticked.
    assert.equal(resolveRuntimeChoice(imageOnly).mediaReady, true)
  })

  it('stops an unconfigured media request before it can fall back', () => {
    assert.throws(
      () => assertRuntimeReady({ runtimeMode: 'agent', runtimeAgentId: 'claude', runtimeAgentVerified: true }, 'image'),
      /尚未配置/,
    )
    assert.doesNotThrow(() => assertRuntimeReady({}, 'video'))
  })
})
