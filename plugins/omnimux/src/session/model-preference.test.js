import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AUTO_SESSION_MODEL,
  createSessionModelPreference,
  normalizeSessionModelChoice,
} from './model-preference.js'

describe('session model preference', () => {
  it('reports no preference for a session that was never recorded', () => {
    const preference = createSessionModelPreference()
    assert.equal(preference.get('s1'), null)
  })

  it('round-trips one session pin without leaking it into another session', () => {
    const preference = createSessionModelPreference()
    preference.set('s1', { auto: false, modelId: 'seedance-2-5', label: 'Seedance 2.5' })

    assert.deepEqual(preference.get('s1'), {
      auto: false,
      modelId: 'seedance-2-5',
      label: 'Seedance 2.5',
    })
    // Per-session isolation: another session must stay on automatic.
    assert.equal(preference.get('s2'), null)
  })

  it('treats auto as the absence of a preference instead of storing an empty pin', () => {
    const preference = createSessionModelPreference()
    preference.set('s1', { auto: false, modelId: 'seedance-2-5', label: 'x' })
    preference.set('s1', { auto: true })

    assert.equal(preference.get('s1'), null)
    // A stale row would resurrect itself once a later payload is partial.
    assert.equal(preference.size(), 0)
  })

  it('clears an existing pin and reports whether anything was removed', () => {
    const preference = createSessionModelPreference()
    preference.set('s1', { auto: false, modelId: 'minimax-h3', label: 'H3' })

    assert.equal(preference.clear('s1'), true)
    assert.equal(preference.clear('s1'), false)
    assert.equal(preference.get('s1'), null)
  })

  it('returns a copy, so a caller cannot mutate stored state', () => {
    const preference = createSessionModelPreference()
    preference.set('s1', { auto: false, modelId: 'seedance-2-5', label: 'Seedance 2.5' })

    const first = preference.get('s1')
    first.modelId = 'tampered'
    assert.equal(preference.get('s1').modelId, 'seedance-2-5')
  })

  it('normalizes blank and hostile payloads to automatic', () => {
    assert.deepEqual(normalizeSessionModelChoice(undefined), AUTO_SESSION_MODEL)
    assert.deepEqual(normalizeSessionModelChoice(null), AUTO_SESSION_MODEL)
    assert.deepEqual(normalizeSessionModelChoice('seedance-2-5'), AUTO_SESSION_MODEL)
    // `auto` wins over a model the client also sent: the switch is the intent.
    assert.deepEqual(normalizeSessionModelChoice({ auto: true, modelId: 'x' }), AUTO_SESSION_MODEL)
    assert.deepEqual(normalizeSessionModelChoice({ auto: false, modelId: '   ' }), AUTO_SESSION_MODEL)
    assert.deepEqual(normalizeSessionModelChoice({ auto: false, modelId: 42 }), AUTO_SESSION_MODEL)
  })

  it('trims the model id and tolerates a missing label', () => {
    const preference = createSessionModelPreference()
    preference.set('s1', { auto: false, modelId: '  seedance-2-5  ' })

    assert.deepEqual(preference.get('s1'), { auto: false, modelId: 'seedance-2-5', label: '' })
  })

  it('ignores writes and reads with no usable session id', () => {
    const preference = createSessionModelPreference()
    preference.set('', { auto: false, modelId: 'seedance-2-5' })
    preference.set(undefined, { auto: false, modelId: 'seedance-2-5' })

    assert.equal(preference.size(), 0)
    assert.equal(preference.get(''), null)
    assert.equal(preference.get(undefined), null)
    assert.equal(preference.clear(''), false)
  })
})
