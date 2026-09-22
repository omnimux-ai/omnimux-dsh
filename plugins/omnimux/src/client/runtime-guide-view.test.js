import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { describeRuntimeGuide } from './runtime-guide-view.js'

describe('describeRuntimeGuide', () => {
  it('shows on a fresh install with no choice stored', () => {
    assert.deepEqual(describeRuntimeGuide({}), { visible: true, mode: '' })
    assert.deepEqual(describeRuntimeGuide(undefined), { visible: true, mode: '' })
    assert.deepEqual(describeRuntimeGuide(null), { visible: true, mode: '' })
  })

  it('shows when the stored value is not a valid choice', () => {
    assert.deepEqual(describeRuntimeGuide({ runtimeMode: '' }), { visible: true, mode: '' })
    assert.deepEqual(describeRuntimeGuide({ runtimeMode: 'nonsense' }), { visible: true, mode: '' })
  })

  it('hides forever once any of the three modes is stored', () => {
    for (const mode of ['official', 'agent', 'key']) {
      assert.deepEqual(describeRuntimeGuide({ runtimeMode: mode }), { visible: false, mode })
    }
  })
})
