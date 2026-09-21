import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCreativePresetsStore } from './presets-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientIndex = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf8')

test('composer left rail no longer mounts creative preset pills', () => {
  assert.doesNotMatch(clientIndex, /omnimux-creative-presets-triggers/)
  assert.doesNotMatch(clientIndex, /ComposerPresetsTriggers/)
  assert.doesNotMatch(clientIndex, /omnimux-composer-product-picker-button/)
  assert.doesNotMatch(clientIndex, /omnimux-composer-character-picker-button/)
})

test('PresetsStore: provides isolated state for triggers and chips', () => {
  const store = getCreativePresetsStore()
  const sid = 'slot-test-session'
  assert.equal(store.hasAnyPreset(sid), false)

  store.setPreset(sid, 'format', { id: 'fmt-1', title: 'Before & After', titleZh: '前后对比' })
  assert.equal(store.hasAnyPreset(sid), true)
  assert.equal(store.getSnapshot(sid).format.titleZh, '前后对比')

  store.clearPresets(sid)
  assert.equal(store.hasAnyPreset(sid), false)
})
