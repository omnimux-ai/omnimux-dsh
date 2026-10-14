import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeRuntimeGuide } from './runtime-guide-view.js'

describe('describeRuntimeGuide', () => {
  it('does not force a fresh install into an exclusive runtime choice', () => {
    assert.equal(describeRuntimeGuide({}).visible, false)
    assert.equal(describeRuntimeGuide(undefined).visible, false)
    assert.equal(describeRuntimeGuide(null).visible, false)
    assert.deepEqual(describeRuntimeGuide({}).pendingScenarios, [])
  })

  it('keeps unconfigured legacy scenarios local instead of blocking all creation', () => {
    assert.equal(describeRuntimeGuide({ runtimeMode: 'key' }).visible, false)
    assert.deepEqual(describeRuntimeGuide({ runtimeMode: 'key' }).pendingScenarios, ['text', 'analysis', 'image', 'video', 'audio'])
    assert.equal(describeRuntimeGuide({ runtimeMode: 'nonsense' }).visible, false)
  })

  it('reports incomplete scenario bindings independently of a legacy mode', () => {
    const guide = describeRuntimeGuide({ runtimeMode: 'agent', scenarioBindings: { image: { channel: 'official' } } })
    assert.equal(guide.visible, false)
    assert.deepEqual(guide.pendingScenarios, ['text', 'analysis', 'video', 'audio'])
  })
})
