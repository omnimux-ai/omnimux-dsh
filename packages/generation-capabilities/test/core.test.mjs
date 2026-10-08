import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BYTES_PER_MB, mbToBytes, isWithinSizeLimit, isWithinDurationLimit,
  GUARD_CODES, SLOT_ALIASES, getSlotAliases, validateAssetAgainstSlot,
} from '../src/index.js'

const image = { type: 'image', role: 'reference', mime: 'image/png', sizeBytes: 1048576 }
const slot = { slot: 'reference_images', type: 'image', role: 'reference', allowedMimes: ['image/png'], maxSizeMb: 1 }

test('declared MiB and exact size boundaries preserve inclusive/exclusive behavior', () => {
  assert.equal(BYTES_PER_MB, 1048576)
  assert.equal(mbToBytes(1.5), 1572864)
  assert.equal(isWithinSizeLimit(1048576, 1), true)
  assert.equal(isWithinSizeLimit(1048577, 1), false)
  assert.equal(isWithinSizeLimit(1048576, 1, true), false)
  assert.equal(isWithinSizeLimit(1048575, 1, true), true)
  assert.deepEqual(validateAssetAgainstSlot(image, slot), { ok: true })
  assert.equal(validateAssetAgainstSlot(image, { ...slot, maxSizeExclusive: true }).rejection.code, 'size_exceeded')
})

test('single asset diagnostics preserve complete size and missing metadata results', () => {
  assert.deepEqual(validateAssetAgainstSlot({ ...image, sizeBytes: 1048577 }, slot), {
    ok: false, rejection: { code: 'size_exceeded', message: 'sizeBytes 1048577 exceeds slot reference_images maxSizeMb 1', slot: 'reference_images', sizeBytes: 1048577, maxSizeMb: 1, maxSizeExclusive: false },
  })
  assert.deepEqual(validateAssetAgainstSlot({ ...image, sizeBytes: null }, slot), {
    ok: false, rejection: { code: 'metadata_unknown', message: 'sizeBytes unknown for slot reference_images which declares maxSizeMb=1', slot: 'reference_images', field: 'sizeBytes', maxSizeMb: 1 },
  })
  assert.deepEqual(validateAssetAgainstSlot({ type: 'image' }, { slot: 'image', type: 'image' }), { ok: true })
})

test('duration endpoints, minima, maxima and unknown metadata retain legacy order', () => {
  const audioSlot = { slot: 'audio', type: 'audio', minDurationSec: 2, maxDurationSec: 5 }
  for (const durationSec of [2, 5]) assert.deepEqual(validateAssetAgainstSlot({ type: 'audio', durationSec }, audioSlot), { ok: true })
  for (const durationSec of [1.99, 5.01]) assert.equal(validateAssetAgainstSlot({ type: 'audio', durationSec }, audioSlot).rejection.code, 'duration_exceeded')
  assert.deepEqual(validateAssetAgainstSlot({ type: 'audio' }, audioSlot).rejection, {
    code: 'metadata_unknown', message: 'durationSec unknown for slot audio which declares maxDurationSec=5', slot: 'audio', field: 'durationSec', maxDurationSec: 5,
  })
  assert.equal(validateAssetAgainstSlot({ type: 'audio' }, { slot: 'audio', minDurationSec: 2 }).rejection.minDurationSec, 2)
  assert.equal(isWithinDurationLimit(5, 5), true)
  assert.equal(isWithinDurationLimit(5.01, 5), false)
  // Min-only legacy checks do not call the maximum-bound numeric helper.
  assert.deepEqual(validateAssetAgainstSlot({ durationSec: NaN }, { slot: 'audio', minDurationSec: 2 }), { ok: true })
})

test('MIME case comparison, unknown MIME and target alias role override stay legacy-compatible', () => {
  assert.deepEqual(validateAssetAgainstSlot({ ...image, mime: 'IMAGE/PNG' }, slot), { ok: true })
  assert.deepEqual(validateAssetAgainstSlot({ ...image, mime: undefined }, slot), { ok: true })
  assert.equal(validateAssetAgainstSlot({ ...image, mime: 'image/' }, slot).rejection.code, 'mime_unsupported')
  assert.equal(validateAssetAgainstSlot({ ...image, mime: ' image/png ' }, slot).rejection.code, 'mime_unsupported')
  assert.deepEqual(validateAssetAgainstSlot({ ...image, role: 'last_frame', targetSlot: 'reference_image' }, slot), { ok: true })
  assert.equal(validateAssetAgainstSlot({ ...image, role: 'last_frame' }, slot).rejection.code, 'role_conflict')
  assert.equal(validateAssetAgainstSlot({ ...image, type: 'video' }, slot).rejection.code, 'asset_type_mismatch')
  assert.deepEqual(getSlotAliases('first_frame_image'), ['first_frame'])
  assert.deepEqual(getSlotAliases('unknown'), [])
  assert.deepEqual(getSlotAliases(), [])
  assert.ok(Object.isFrozen(SLOT_ALIASES.reference_image))
  assert.ok(Object.isFrozen(GUARD_CODES))
  assert.equal(GUARD_CODES.PARAMETER_UNSUPPORTED, 'parameter_unsupported')
})

test('invalid numeric metadata and malformed known MIME preserve existing exceptions', () => {
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => mbToBytes(value), TypeError)
    assert.throws(() => isWithinSizeLimit(value, 1), TypeError)
    assert.throws(() => isWithinDurationLimit(value, 5), TypeError)
    assert.throws(() => validateAssetAgainstSlot({ ...image, sizeBytes: value }, slot), TypeError)
    assert.throws(() => validateAssetAgainstSlot({ durationSec: value }, { slot: 'audio', maxDurationSec: 5 }), TypeError)
  }
  assert.throws(() => validateAssetAgainstSlot({ ...image, mime: 42 }, slot), TypeError)
  assert.throws(() => validateAssetAgainstSlot(null, slot), TypeError)
})
