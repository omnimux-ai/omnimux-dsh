import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeRuntimeGuide } from './runtime-guide-view.js'

describe('describeRuntimeGuide', () => {
  it('shows the first-run chooser while no channel has been configured', () => {
    assert.equal(describeRuntimeGuide({}).visible, true)
    assert.equal(describeRuntimeGuide(undefined).visible, true)
    assert.equal(describeRuntimeGuide(null).visible, true)
    assert.deepEqual(describeRuntimeGuide({}).pendingScenarios, [])
  })

  it('hides once any channel carries a saved choice', () => {
    assert.equal(describeRuntimeGuide({ runtimeMode: 'official' }).visible, false)
    assert.equal(describeRuntimeGuide({ runtimeMode: 'agent' }).visible, false)
    assert.equal(describeRuntimeGuide({ runtimeMode: 'key' }).visible, false)
    assert.equal(describeRuntimeGuide({ runtimeMode: 'nonsense' }).visible, false)
    assert.equal(describeRuntimeGuide({ runtimeAgentId: 'claude' }).visible, false)
    assert.equal(describeRuntimeGuide({ runtimeKeyEndpoint: 'https://example.test' }).visible, false)
    assert.equal(describeRuntimeGuide({ byokProviders: [{ provider: 'custom', endpoint: 'https://x', models: { text: 'm' } }] }).visible, false)
  })

  it('does not mistake schema defaults or empty containers for a choice', () => {
    assert.equal(describeRuntimeGuide({ runtimeMode: '', runtimeAgentId: '', byokProviders: [], runtimeKeyEndpoint: '' }).visible, true)
    assert.equal(describeRuntimeGuide({ runtimeMode: '   ' }).visible, true)
  })

  it('keeps unconfigured legacy scenarios local instead of blocking all creation', () => {
    assert.deepEqual(describeRuntimeGuide({ runtimeMode: 'key' }).pendingScenarios, ['text', 'analysis', 'image', 'video', 'audio'])
  })

  it('reports incomplete scenario bindings independently of a legacy mode', () => {
    const guide = describeRuntimeGuide({ runtimeMode: 'agent', scenarioBindings: { image: { channel: 'official' } } })
    assert.equal(guide.visible, false)
    assert.deepEqual(guide.pendingScenarios, ['text', 'analysis', 'video', 'audio'])
  })
})
