import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCreativePresetsStore } from './presets-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientIndex = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf8')

test('ComposerPresetsTriggers slot registration contract: conversation.input.left order 30', () => {
  // 必须通过官方标准插槽 conversation.input.left 注入
  assert.ok(clientIndex.includes("ctx.slots.inject('conversation.input.left'"), 'Must inject to conversation.input.left')
  assert.ok(clientIndex.includes("id: 'omnimux-creative-presets-triggers'"), 'Must register with id omnimux-creative-presets-triggers')
  assert.ok(clientIndex.includes('order: 30'), 'Must place triggers at order 30 (after skills order 10 and models order 20)')
  assert.ok(clientIndex.includes('ComposerPresetsTriggers'), 'Must bind ComposerPresetsTriggers component')
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
