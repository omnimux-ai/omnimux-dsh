import test from 'node:test'
import assert from 'node:assert/strict'
import { validateVeoTaskRequest } from '../contracts/veoContracts.js'
import {
  resolveVeoMode,
  VEO_MODE_IDS,
  VEO_TASK_SPEC,
} from './veoTaskSpec.js'

test('VEO_TASK_SPEC exposes create/modify/animate/extend with fixed labels', () => {
  assert.deepEqual([...VEO_MODE_IDS], ['create', 'modify', 'animate', 'extend'])
  assert.deepEqual(
    VEO_TASK_SPEC.modes.map((m) => m.label),
    ['创建', '修改', '动画', '扩展'],
  )
  assert.equal(VEO_TASK_SPEC.paramCapsule, '720p · 16:9 · 10s')
  assert.equal(VEO_TASK_SPEC.durationSec.min, 3)
  assert.equal(VEO_TASK_SPEC.durationSec.max, 10)
  assert.equal(VEO_TASK_SPEC.durationSec.fallback, 10)
})

test('resolveVeoMode falls back to create', () => {
  assert.equal(resolveVeoMode('animate').label, '动画')
  assert.equal(resolveVeoMode('nope').id, 'create')
  assert.equal(resolveVeoMode(null).placeholder, VEO_TASK_SPEC.modes[0].placeholder)
})

test('validateVeoTaskRequest still rejects empty / bad mode / out-of-range duration', () => {
  assert.equal(validateVeoTaskRequest({ prompt: '   ' }).valid, false)
  assert.equal(validateVeoTaskRequest({ prompt: 'hello', mode: 'invalid_mode' }).valid, false)
  assert.equal(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 2 } }).valid, false)
  assert.equal(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 15 } }).valid, false)
  assert.equal(validateVeoTaskRequest({ prompt: 'hello', mode: 'extend', parameters: { durationSec: 10 } }).valid, true)
})
