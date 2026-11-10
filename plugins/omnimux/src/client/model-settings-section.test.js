import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isSharedModelSettingsDetailSubject } from './model-settings-section.js'

describe('shared model settings detail section subject', () => {
  it('skips the hub bundle because plugins.bundle.config already renders its card', () => {
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'bundle', pkg: { name: 'omnimux' } }), false)
  })

  it('covers sibling OmniMux bundles', () => {
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'bundle', pkg: { name: 'omnimux-workflow' } }), true)
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'bundle', pkg: { name: 'omnimux-accounts' } }), true)
  })

  it('never claims rows, official items, foreign bundles, or malformed subjects', () => {
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'row', pkg: { name: 'omnimux' }, row: { rowId: 'omnimux' } }), false)
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'item', id: 'omnimux' }), false)
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'bundle', pkg: { name: '@acme/omnimux-theme' } }), false)
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'bundle', pkg: { name: 'omnimuxy' } }), false)
    assert.equal(isSharedModelSettingsDetailSubject({ kind: 'bundle', pkg: {} }), false)
    assert.equal(isSharedModelSettingsDetailSubject(null), false)
  })
})
