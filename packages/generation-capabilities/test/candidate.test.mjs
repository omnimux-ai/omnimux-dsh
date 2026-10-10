import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as source from '../src/index.js'
import * as artifact from '../../../plugins/omnimux/lib/generation-core.js'

const candidate = (parameters = {}, constraints = {}, inputs = [], inputGroups) => ({ operation: { id: 'op', inputs, ...(inputGroups === undefined ? {} : { inputGroups }) }, parameters, constraints, knownOperationIds: ['op'], currentEligibility: 'eligible' })
const snapshot = (logicalParameters = {}, parameterSources = {}, assets = [], extra = {}) => ({ assets, logicalParameters, parameterSources, parameterAuthority: 'resolved', ...extra })
for (const [entry, core] of [['source', source], ['artifact', artifact]]) {
  test(`${entry}: repair1 alias lookup is own-only and preserves special exact targets and hard verdicts`, () => {
    const slots = [{ slot: 'reference', type: 'image', max: 1 }]
    for (const targetSlot of ['__proto__', 'constructor', 'toString']) {
      assert.deepEqual(core.getSlotAliases(targetSlot), [])
      const asset = Object.freeze({ type: 'image', targetSlot })
      const snap = snapshot({}, {}, [asset])
      const rejected = core.evaluateCandidateRequest(candidate({}, {}, slots), snap)
      assert.equal(rejected.status, 'rejected'); assert.equal(rejected.assignment, undefined)
      assert.ok(rejected.diagnostics.some(d => d.code === 'asset_rejected' && d.assetIndex === 0))
      const exact = core.evaluateCandidateRequest(candidate({}, {}, [{ ...slots[0], slot: targetSlot }]), snap)
      assert.equal(exact.status, 'ready'); assert.equal(exact.assignment.bindings[0].asset, asset)
      for (const c of [{ ...candidate({}, {}, slots), currentEligibility: 'rejected' }, candidate({}, { inputs: { image: { max: 0 } } }, slots)]) {
        const hard = core.evaluateCandidateRequest(c, snap)
        assert.equal(hard.status, 'rejected'); assert.equal(hard.assignment, undefined)
      }
      assert.deepEqual(asset, { type: 'image', targetSlot })
    }
    for (const [slot, alias] of [['reference_image', 'reference_images'], ['reference_images', 'reference_image'], ['first_frame', 'first_frame_image'], ['first_frame_image', 'first_frame'], ['last_frame', 'last_frame_image'], ['last_frame_image', 'last_frame']]) {
      assert.deepEqual(core.getSlotAliases(slot), [alias]); assert.ok(Object.isFrozen(core.getSlotAliases(slot)))
      const asset = { type: 'image', targetSlot: slot }
      const op = { inputs: [{ slot: alias, type: 'image', max: 1 }] }
      assert.equal(core.evaluateCandidateRequest(candidate({}, {}, op.inputs), snapshot({}, {}, [asset])).status, 'ready')
      assert.equal(core.solveAssetAssignment(op, [asset], {}, { strategy: 'legacy', mode: 'full' }).status, 'ready')
    }
  })
  for (const [field, value] of [['maxSizeMb', 0], ['minDurationSec', 0], ['maxDurationSec', 0], ['totalMinDurationSec', 0], ['totalMaxDurationSec', 0], ['combinedOutputMaxDurationSec', 0], ['maxSizeExclusive', false], ['totalMinExclusive', false], ['totalMaxExclusive', false], ['allowedMimes', null], ['allowedMimes', ['image/png']]]) {
    test(`${entry}: repair2 text cannot consume media-only ${field} ${JSON.stringify(value)}`, () => {
      const text = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1, [field]: value }
      const snap = snapshot({}, {}, [], { prompt: 'x' })
      const result = core.evaluateCandidateRequest(candidate({}, {}, [text]), snap)
      assert.equal(result.status, 'indeterminate'); assert.equal(result.assignment, undefined)
      assert.equal(result.effectiveParameters, undefined); assert.equal(result.parameterSources, undefined)
      assert.ok(result.diagnostics.some(d => d.code === 'unchecked_constraint' && d.slotIndex === 0))
      assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [{ ...text, max: 0 }]), snap).status, 'rejected')
      assert.equal(core.evaluateCandidateRequest(candidate({ prompt: { type: 'string', minLength: 1 } }, {}, [text]), snapshot({ prompt: '' }, { prompt: { source: 'explicit', value: '' } }, [], { prompt: '' })).status, 'rejected')
      assert.deepEqual(snap, snapshot({}, {}, [], { prompt: 'x' }))
    })
  }
  for (const [label, def] of [['future', { type: 'future' }], ['option-label', { options: [{ value: 5, label: 123 }] }], ['step-zero', { type: 'number', range: { min: 0, step: 0 } }]]) {
    test(`${entry}: repair3 independent empty limit wins over ${label}`, () => {
      const c = candidate({ n: def }, { parameters: { n: { only: [] } } })
      const s = snapshot({}, { n: { source: 'absent' } })
      const before = JSON.stringify({ c, s })
      const result = core.evaluateCandidateRequest(c, s)
      assert.equal(result.status, 'rejected'); assert.equal(result.assignment, undefined)
      assert.ok(result.diagnostics.some(d => d.code === 'empty_domain' && d.field === 'n'))
      assert.equal(JSON.stringify({ c, s }), before)
      const nonempty = core.evaluateCandidateRequest(candidate({ n: def }, { parameters: { n: { only: [5] } } }), s)
      assert.equal(nonempty.status, 'indeterminate'); assert.ok(!nonempty.diagnostics.some(d => d.code === 'empty_domain'))
      for (const limit of [{ only: undefined }, { only: [], supported: 0 }, { only: [], fixed: undefined }]) assert.equal(core.evaluateCandidateRequest(candidate({ n: def }, { parameters: { n: limit } }), s).status, 'indeterminate')
    })
    test(`${entry}: repair3 explicit disabled wins over ${label}`, () => {
      const result = core.evaluateCandidateRequest(candidate({ n: def }, { parameters: { n: { supported: false } } }), snapshot({ n: false }, { n: { source: 'explicit', value: false } }))
      assert.equal(result.status, 'rejected'); assert.equal(result.assignment, undefined)
      assert.ok(result.diagnostics.some(d => d.code === 'disabled' && d.field === 'n'))
    })
  }
  test(`${entry}: repair3 malformed definition getters are not invoked for independent hard evidence`, () => {
    let calls = 0
    const def = {}; Object.defineProperty(def, 'type', { enumerable: true, get() { calls++; return 'number' } })
    for (const [limit, code, s] of [[{ only: [] }, 'empty_domain', snapshot({}, { n: { source: 'absent' } })], [{ supported: false }, 'disabled', snapshot({ n: false }, { n: { source: 'explicit', value: false } })]]) {
      const result = core.evaluateCandidateRequest(candidate({ n: def }, { parameters: { n: limit } }), s)
      assert.equal(result.status, 'rejected'); assert.ok(result.diagnostics.some(d => d.code === code)); assert.equal(calls, 0)
      assert.equal(Object.getOwnPropertyDescriptor(def, 'type').get instanceof Function, true)
    }
    const limit = {}; Object.defineProperty(limit, 'only', { enumerable: true, get() { calls++; return [] } })
    assert.equal(core.evaluateCandidateRequest(candidate({ n: { type: 'future' } }, { parameters: { n: limit } }), snapshot({}, { n: { source: 'absent' } })).status, 'indeterminate'); assert.equal(calls, 0)
  })
  for (const variant of ['missing-value', 'undefined-value', 'object-value', 'nonfinite-value', 'extra-key', 'hidden-key', 'symbol-key', 'value-getter', 'source-getter', 'missing-logical', 'mismatched-logical', 'missing-source-tag', 'invalid-source-tag', 'missing-source-record', 'inherited-record']) {
    test(`${entry}: source-proof ${variant} is not an explicit disabled witness`, () => {
      let calls = 0
      const logical = { n: 5 }, origins = { n: { source: 'explicit', value: 5 } }
      const origin = origins.n
      if (variant === 'missing-value') delete origin.value
      if (variant === 'undefined-value') origin.value = undefined
      if (variant === 'object-value') origin.value = {}
      if (variant === 'nonfinite-value') origin.value = NaN
      if (variant === 'extra-key') origin.extra = true
      if (variant === 'hidden-key') Object.defineProperty(origin, 'hidden', { value: true })
      if (variant === 'symbol-key') origin[Symbol('extra')] = true
      if (variant === 'value-getter') Object.defineProperty(origin, 'value', { enumerable: true, get() { calls++; return 5 } })
      if (variant === 'source-getter') Object.defineProperty(origin, 'source', { enumerable: true, get() { calls++; return 'explicit' } })
      if (variant === 'missing-logical') delete logical.n
      if (variant === 'mismatched-logical') origin.value = 6
      if (variant === 'missing-source-tag') delete origin.source
      if (variant === 'invalid-source-tag') origin.source = 123
      if (variant === 'missing-source-record') delete origins.n
      if (variant === 'inherited-record') Object.setPrototypeOf(origin, { inherited: true })
      const before = Object.getOwnPropertyDescriptors(origin), prototype = Object.getPrototypeOf(origin)
      const s = snapshot(Object.freeze(logical), Object.freeze(origins))
      for (const def of [{ type: 'future' }, { options: [{ value: 5, label: 123 }] }, { type: 'integer' }]) {
        const result = core.evaluateCandidateRequest(candidate({ n: def }, { parameters: { n: { supported: false } } }), s)
        assert.equal(result.status, 'indeterminate')
        assert.ok(!result.diagnostics.some(d => d.code === 'disabled'))
        for (const key of ['assignment', 'effectiveParameters', 'parameterSources']) assert.equal(Object.hasOwn(result, key), false)
        const empty = core.evaluateCandidateRequest(candidate({ n: def }, { parameters: { n: { supported: false, only: [] } } }), s)
        assert.equal(empty.status, 'rejected'); assert.ok(empty.diagnostics.some(d => d.code === 'empty_domain'))
        assert.ok(!empty.diagnostics.some(d => d.code === 'disabled'))
      }
      assert.equal(calls, 0); assert.deepEqual(Object.getOwnPropertyDescriptors(origin), before)
      assert.equal(Object.getPrototypeOf(origin), prototype); assert.equal(s.logicalParameters, logical); assert.equal(s.parameterSources, origins)
    })
  }
  test(`${entry}: source-proof legal explicit primitives remain disabled before an unknown definition`, () => {
    for (const value of [false, 0, null, '']) {
      const result = core.evaluateCandidateRequest(candidate({ n: { type: 'future' } }, { parameters: { n: { supported: false } } }), snapshot({ n: value }, { n: { source: 'explicit', value } }))
      assert.equal(result.status, 'rejected'); assert.ok(result.diagnostics.some(d => d.code === 'disabled'))
      for (const key of ['assignment', 'effectiveParameters', 'parameterSources']) assert.equal(Object.hasOwn(result, key), false)
    }
    const zero = core.evaluateCandidateRequest(candidate({ n: { type: 'future' } }, { parameters: { n: { supported: false } } }), snapshot({ n: -0 }, { n: { source: 'explicit', value: 0 } }))
    assert.equal(zero.status, 'rejected'); assert.ok(zero.diagnostics.some(d => d.code === 'disabled'))
    const folded = core.evaluateCandidateRequest(candidate({ n: { type: 'string', caseInsensitive: true } }, { parameters: { n: { supported: false } } }), snapshot({ n: 'X' }, { n: { source: 'explicit', value: 'x' } }))
    assert.equal(folded.status, 'indeterminate'); assert.ok(!folded.diagnostics.some(d => d.code === 'disabled'))
  })
  test(`${entry}: source-proof does not mask independent known parameter failures or alter omission`, () => {
    const defs = { n: { type: 'integer', options: [5] } }
    const hard = core.evaluateCandidateRequest(candidate(defs, { parameters: { n: { supported: false } } }), snapshot({ n: 7 }, { n: { source: 'explicit', value: 5 } }))
    assert.equal(hard.status, 'rejected'); assert.ok(hard.diagnostics.some(d => d.code === 'parameter_nonmember'))
    assert.ok(!hard.diagnostics.some(d => d.code === 'disabled'))
    for (const [values, origin] of [[{}, { source: 'absent' }], [{ n: 5 }, { source: 'definition-default', value: 5 }]]) {
      const result = core.evaluateCandidateRequest(candidate(defs, { parameters: { n: { supported: false } } }), snapshot(values, { n: origin }))
      assert.equal(result.status, 'ready'); assert.deepEqual(result.effectiveParameters, {}); assert.deepEqual(result.parameterSources, { n: 'omitted-by-group' })
    }
    for (const limit of [{ only: undefined }, { only: [], supported: 0 }, { only: [], fixed: undefined }, { only: [5] }]) {
      const result = core.evaluateCandidateRequest(candidate({ n: { type: 'future' } }, { parameters: { n: limit } }), snapshot({ n: 5 }, { n: { source: 'explicit' } }))
      assert.equal(result.status, 'indeterminate'); assert.ok(!result.diagnostics.some(d => d.code === 'empty_domain'))
    }
  })
  test(`${entry}: normalized empty candidate is ready without fabricated inputs`, () => {
    const result = core.evaluateCandidateRequest(candidate(), snapshot())
    assert.equal(result.status, 'ready')
    assert.deepEqual(result.effectiveParameters, {})
    assert.deepEqual(result.assignment.bindings, [])
    assert.deepEqual(result.diagnostics, [])
  })
  test(`${entry}: request/default/group limits are a conjunction, never a repair`, () => {
    const def = { duration: { type: 'number', range: { min: 4, max: 15, step: 1 }, defaultValue: 5 } }
    const snap = snapshot({ duration: 5 }, { duration: { source: 'definition-default', value: 5 } })
    assert.equal(core.evaluateCandidateRequest(candidate(def, { parameters: { duration: { fixed: 15 } } }), snap).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate(def, { parameters: { duration: { only: [5, 7] } } }), snap).status, 'ready')
    assert.equal(core.evaluateCandidateRequest(candidate(def, { parameters: { duration: { only: [5.5] } } }), snap).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate(def, { parameters: { duration: { fixed: 30 } } }), snap).status, 'rejected')
    const omitted = core.evaluateCandidateRequest(candidate(def, { parameters: { duration: { supported: false } } }), snap)
    assert.equal(omitted.status, 'ready'); assert.deepEqual(omitted.effectiveParameters, {}); assert.equal(omitted.parameterSources.duration, 'omitted-by-group')
    assert.equal(core.evaluateCandidateRequest(candidate(def, { parameters: { duration: { supported: false } } }), snapshot({ duration: 5 }, { duration: { source: 'explicit', value: 5 } })).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate({ toggle: { type: 'boolean', supported: false, defaultValue: false } }), snapshot({ toggle: false }, { toggle: { source: 'definition-default', value: false } })).status, 'rejected')
    assert.deepEqual(snap.logicalParameters, { duration: 5 })
  })
  test(`${entry}: unresolved inactive domains and unknown only members never become empty or ready`, () => {
    for (const def of [{ type: 'string', optionsFrom: 'upstream' }, { type: 'string', options: ['x'], optionsFrom: 'upstream' }, { type: 'number', range: { step: 1 } }, { type: 'future' }, { optionsFrom: 123 }, { options: [{ value: 5, label: 123 }] }]) {
      const result = core.evaluateCandidateRequest(candidate({ quality: def }), snapshot({}, { quality: { source: 'absent' } }))
      assert.equal(result.status, 'indeterminate'); assert.equal(result.assignment, undefined)
    }
    const complete = { type: 'number', range: { min: 4, max: 15, step: 1 }, allowAuto: true, caseInsensitive: false }
    assert.equal(core.evaluateCandidateRequest(candidate({ quality: complete }), snapshot({}, { quality: { source: 'absent' } })).status, 'ready')
    assert.deepEqual(core.evaluateCandidateRequest(candidate({ quality: { ...complete, defaultValue: 5 } }), snapshot({}, { quality: { source: 'absent' } })).effectiveParameters, {})
    assert.equal(core.evaluateCandidateRequest(candidate({ quality: { ...complete, defaultValue: 30 } }), snapshot({}, { quality: { source: 'absent' } })).status, 'rejected')
    for (const only of [[0, 1e20], [1e20]]) {
      const result = core.evaluateCandidateRequest(candidate({ n: { type: 'number', range: { min: 0, max: 1e20, step: 1 } } }, { parameters: { n: { only } } }), snapshot({ n: 0 }, { n: { source: 'explicit', value: 0 } }))
      assert.equal(result.status, 'indeterminate'); assert.ok(!result.diagnostics.some(d => d.code === 'empty_domain'))
    }
  })
  test(`${entry}: total capacities retain every minimum and do not certify joint completion`, () => {
    const required = [{ slot: 'a', type: 'image', min: 1, max: 1 }]
    const two = [...required, { slot: 'b', type: 'image', min: 1, max: 1 }]
    for (const [inputs, max, groups] of [[required, 0], [two, 1], [two.map(s => ({ ...s, min: 0 })), 1, [{ slots: ['a', 'b'], min: 2 }]], [[{ slot: 'a', type: 'image', max: 1 }], 0, [{ slots: ['a'], min: 1 }]]]) {
      assert.equal(core.evaluateCandidateRequest(candidate({}, { inputs: { image: { max } } }, inputs, groups), snapshot()).status, 'rejected')
    }
    assert.equal(core.evaluateCandidateRequest(candidate({}, { inputs: { image: { max: 1 } } }, required), snapshot()).status, 'pending')
    const joint = core.evaluateCandidateRequest(candidate({}, { inputs: { image: { max: 2 } } }, two), snapshot())
    assert.equal(joint.status, 'indeterminate'); assert.ok(joint.diagnostics.some(d => d.code === 'completion_unproven'))
    const metadata = core.evaluateCandidateRequest(candidate({}, { inputs: { image: { max: 1 } } }, [{ ...required[0], allowedMimes: ['image/png'] }]), snapshot())
    assert.equal(metadata.status, 'indeterminate')
  })
  test(`${entry}: unclassified original entries never disappear and known local failures win`, () => {
    const unknown = { role: 'reference' }
    const onlyVideo = [{ slot: 'video', type: 'video', role: 'reference', max: 2 }]
    const hard = core.evaluateCandidateRequest(candidate({}, {}, onlyVideo), snapshot({}, {}, [{ type: 'image' }, unknown]))
    assert.equal(hard.status, 'rejected'); assert.ok(hard.diagnostics.some(d => d.code === 'asset_rejected' && d.assetIndex === 0))
    assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [{ slot: 'ref', type: 'image', max: 0 }]), snapshot({}, {}, [unknown])).status, 'indeterminate')
    const alias = core.evaluateCandidateRequest(candidate({}, {}, [{ slot: 'first_frame_image', type: 'image', role: 'first_frame', max: 1 }]), snapshot({}, {}, [{ type: 'image', role: 'reference', targetSlot: 'first_frame' }, unknown]))
    assert.equal(alias.status, 'rejected'); assert.ok(alias.diagnostics.some(d => d.assetIndex === 0))
    const missingSize = core.evaluateCandidateRequest(candidate({}, {}, [{ slot: 'video', type: 'video', role: 'reference', max: 2, maxSizeMb: 1, maxDurationSec: 2 }]), snapshot({}, {}, [{ type: 'video', role: 'reference', durationSec: 3 }, unknown]))
    assert.equal(missingSize.status, 'rejected'); assert.ok(missingSize.diagnostics.some(d => d.assetIndex === 0))
    assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [{ slot: 'ref', type: 'image', role: 'reference', max: 2, allowedMimes: [' image/png '] }]), snapshot({}, {}, [{ type: 'image', role: 'reference', mime: 'image/png' }, unknown])).status, 'indeterminate')
    for (const assets of [[undefined], [null], [{}], [{ type: 'text' }], [{ type: 'video', durationSec: -1 }], Array(1)]) assert.equal(core.evaluateCandidateRequest(candidate(), snapshot({}, {}, assets)).status, 'rejected')
  })
  test(`${entry}: descriptors and exact sources are safe, special fields preserve identity`, () => {
    let calls = 0
    const getter = { type: 'image' }; Object.defineProperty(getter, 'mime', { enumerable: true, get() { calls++; return 'image/png' } })
    assert.notEqual(core.evaluateCandidateRequest(candidate(), snapshot({}, {}, [getter])).status, 'ready'); assert.equal(calls, 0)
    for (const field of ['provider', 'profile', 'endpoint', 'purchaseCost']) assert.notEqual(core.evaluateCandidateRequest({ ...candidate(), [field]: 'private' }, snapshot()).status, 'ready')
    for (const currentEligibility of [true, 'eligible-ish', undefined]) assert.equal(core.evaluateCandidateRequest({ ...candidate(), currentEligibility }, snapshot()).status, 'indeterminate')
    for (const parameterAuthority of [true, 'resolved-ish', undefined]) assert.equal(core.evaluateCandidateRequest(candidate(), snapshot({}, {}, [], { parameterAuthority })).status, 'indeterminate')
    const def = { quality: { type: 'string', caseInsensitive: true, options: ['X'] } }
    assert.equal(core.evaluateCandidateRequest(candidate(def), snapshot({ quality: 'X' }, { quality: { source: 'explicit', value: 'x' } })).status, 'indeterminate')
    for (const source of [{ source: 123 }, {}, { source: 'explicit' }, { source: 'absent', value: 'X' }]) assert.equal(core.evaluateCandidateRequest(candidate(def), snapshot({ quality: 'X' }, { quality: source })).status, 'indeterminate')
    const hidden = {}; Object.defineProperty(hidden, 'quality', { value: { type: 'string' } })
    assert.equal(core.evaluateCandidateRequest(candidate(hidden), snapshot()).status, 'indeterminate')
    const symbol = { ...candidate() }; symbol[Symbol('hidden')] = 1
    assert.equal(core.evaluateCandidateRequest(symbol, snapshot()).status, 'indeterminate')
    const definitions = JSON.parse('{"__proto__":{"type":"number"},"constructor":{"type":"number"},"toString":{"type":"number"}}')
    const values = JSON.parse('{"__proto__":1,"constructor":2,"toString":3}')
    const sources = JSON.parse('{"__proto__":{"source":"explicit","value":1},"constructor":{"source":"explicit","value":2},"toString":{"source":"explicit","value":3}}')
    const result = core.evaluateCandidateRequest(candidate(definitions), snapshot(values, sources))
    assert.equal(result.status, 'ready'); assert.equal(Object.getPrototypeOf(result.effectiveParameters), Object.prototype)
    assert.deepEqual(Object.getOwnPropertyNames(result.effectiveParameters), ['__proto__', 'constructor', 'toString']); assert.equal(result.effectiveParameters.__proto__, 1)
  })
  test(`${entry}: complete assignment retains exact assets and cross-candidate failures cannot union`, () => {
    const inputs = [{ slot: 'first', type: 'image', role: 'first_frame', min: 1, max: 1 }, { slot: 'last', type: 'image', role: 'last_frame', min: 1, max: 1 }]
    const assets = [{ type: 'image', role: 'first_frame', targetSlot: 'first', payload: { original: true } }, { type: 'image', role: 'last_frame', targetSlot: 'last' }]
    const defs = { duration: { type: 'number', options: [5, 15] } }
    const snap = snapshot({ duration: 15 }, { duration: { source: 'explicit', value: 15 } }, assets)
    assert.equal(core.evaluateCandidateRequest(candidate(defs, { inputs: { image: { max: 1 } } }, inputs), snap).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate(defs, { parameters: { duration: { fixed: 5 } } }, inputs), snap).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest({ ...candidate(defs, {}, inputs), currentEligibility: 'pending' }, snap).status, 'pending')
    const result = core.evaluateCandidateRequest(candidate(defs, {}, inputs), snap)
    assert.equal(result.status, 'ready'); assert.equal(result.assignment.bindings[0].asset, assets[0]); assert.equal(result.assignment.bindings[1].asset, assets[1])
    assert.deepEqual(result.assignment.uncheckedConstraints, [])
    const bounded = core.evaluateCandidateRequest(candidate(defs, {}, inputs), snap, { maxStates: 1 }); assert.equal(bounded.status, 'indeterminate'); assert.equal(bounded.assignment, undefined)
    for (const policy of [{ mode: 'full' }, { maxStates: 0 }, { maxStates: Infinity }, { maxStates: undefined }]) assert.throws(() => core.evaluateCandidateRequest(candidate(), snapshot(), policy), TypeError)
  })
  test(`${entry}: normalized contract shapes and all constraint references are checked`, () => {
    for (const slot of [{ slot: 'a' }, { slot: 'a', type: 'document' }, { slot: 'a', type: 'image', source: 'invented' }]) assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [slot]), snapshot()).status, 'indeterminate')
    for (const slot of [{ slot: 'a', type: 'video', maxDurationSec: -1 }, { slot: 'a', type: 'image', allowedMimes: 42 }, { slot: 'a', type: 'image', min: -1 }, { slot: 'a', type: 'image', max: Infinity }]) assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [slot]), snapshot()).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [{ slot: 'a', type: 'image' }, { slot: 'a', type: 'image' }]), snapshot()).status, 'rejected')
    for (const group of [{ slots: ['a', 'a'] }, { slots: ['missing'] }, { slots: ['a'], hint: 1 }]) assert.notEqual(core.evaluateCandidateRequest(candidate({}, {}, [{ slot: 'a', type: 'image' }], [group]), snapshot()).status, 'ready')
    for (const constraints of [{ operations: [] }, { operations: ['other'] }, { parameters: { unknown: { only: [1] } } }]) {
      const c = { ...candidate({}, constraints), knownOperationIds: ['op', 'other'] }
      assert.equal(core.evaluateCandidateRequest(c, snapshot()).status, 'rejected')
    }
    assert.equal(core.evaluateCandidateRequest(candidate({}, { operations: ['unknown'] }), snapshot()).status, 'indeterminate')
    for (const constraints of [{ inputs: { image: { max: undefined } } }, { parameters: { n: { only: undefined } } }, { extra: true }]) assert.notEqual(core.evaluateCandidateRequest(candidate({ n: { type: 'number' } }, constraints), snapshot({}, { n: { source: 'absent' } })).status, 'ready')
    const capacity = core.evaluateCandidateRequest(candidate({ n: { type: 'number', optionsFrom: 'future' } }, { inputs: { image: { max: 0 } } }, [{ slot: 'a', type: 'image', max: 1 }]), snapshot({}, { n: { source: 'absent' } }, [{ type: 'image' }]))
    assert.equal(capacity.status, 'rejected')
    const slot = { slot: 'video', type: 'video', role: 'reference', max: 1, combinedOutputMaxDurationSec: 10 }
    for (const duration of [-1, 0, -2]) {
      const r = core.evaluateCandidateRequest(candidate({ duration: { type: 'number', options: [-1, 0, -2, 5] } }, {}, [slot]), snapshot({ duration }, { duration: { source: 'explicit', value: duration } }, [{ type: 'video', role: 'reference', durationSec: 5 }]))
      assert.equal(r.status, 'pending'); assert.equal(r.assignment, undefined)
    }
    assert.equal(core.evaluateCandidateRequest(candidate({ duration: { type: 'number', options: [5] } }, {}, [slot]), snapshot({ duration: 5 }, { duration: { source: 'explicit', value: 5 } }, [{ type: 'video', role: 'reference', durationSec: 5 }])).status, 'ready')
  })
  test(`${entry}: independent small count and origin enumeration uses literal expected states`, () => {
    let checked = 0
    for (const actual of [0, 1, 2]) for (const min of [0, 1, 2]) for (const cap of [0, 1, 2]) {
      const expected = actual > cap || min > cap ? 'rejected' : actual < min ? 'pending' : 'ready'
      const result = core.evaluateCandidateRequest(candidate({}, { inputs: { image: { max: cap } } }, [{ slot: 'ref', type: 'image', min, max: 2 }]), snapshot({}, {}, Array.from({ length: actual }, () => ({ type: 'image' }))))
      assert.equal(result.status, expected, JSON.stringify({ actual, min, cap })); checked++
    }
    for (const origin of ['explicit', 'definition-default', 'absent']) for (const disabled of [false, true]) {
      const active = origin !== 'absent'
      const expected = disabled && origin === 'explicit' ? 'rejected' : 'ready'
      const result = core.evaluateCandidateRequest(candidate({ n: { type: 'number', options: [5], defaultValue: 5 } }, { parameters: { n: { supported: !disabled } } }), snapshot(active ? { n: 5 } : {}, { n: active ? { source: origin, value: 5 } : { source: 'absent' } }))
      assert.equal(result.status, expected)
      if (result.status === 'ready') { assert.deepEqual(result.effectiveParameters, active && !disabled ? { n: 5 } : {}); assert.equal(result.parameterSources.n, disabled ? 'omitted-by-group' : origin) }
      checked++
    }
    for (const cap of [0, 1, 2]) for (const minimum of [0, 1, 2]) {
      const result = core.evaluateCandidateRequest(candidate({}, { inputs: { image: { max: cap } } }, [{ slot: 'a', type: 'image', max: 1 }, { slot: 'b', type: 'image', max: 1 }], [{ slots: ['a', 'b'], min: minimum }]), snapshot())
      assert.equal(result.status, minimum > cap ? 'rejected' : minimum === 0 ? 'ready' : 'indeterminate'); checked++
    }
    assert.equal(checked, 42)
  })
  test(`${entry}: absent malformed flags cannot hide behind an undefined nonmember`, () => {
    for (const def of [{ type: 'number', allowAuto: undefined }, { type: 'number', range: { min: undefined, max: 15 } }, { type: 'number', supported: undefined }]) {
      assert.equal(core.evaluateCandidateRequest(candidate({ n: def }), snapshot({}, { n: { source: 'absent' } })).status, 'indeterminate')
    }
  })
  test(`${entry}: prompt counts and canonical empty strings preserve hard priority`, () => {
    const text = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 0, max: 0 }
    assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [text]), snapshot({}, {}, [], { prompt: 'x' })).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [{ ...text, min: 1 }]), snapshot()).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate({ prompt: { type: 'string', minLength: 1 } }, {}, [{ ...text, min: 1, max: 1 }]), snapshot({ prompt: '' }, { prompt: { source: 'explicit', value: '' } }, [], { prompt: '' })).status, 'rejected')
    assert.equal(core.evaluateCandidateRequest(candidate({ prompt: { type: 'string' } }, {}, [{ ...text, min: 1, max: 1 }]), snapshot({ prompt: '' }, { prompt: { source: 'explicit', value: '' } }, [], { prompt: '' })).status, 'pending')
  })
}

for (const [entry, core] of [['source', source], ['artifact', artifact]]) {
  test(`${entry}: #3276 known dual-source declaration checks only the complete final prompt and never supplies eligibility`, () => {
    for (const valueSources of [['local_field', 'upstream_output'], ['upstream_output', 'local_field']]) {
      const slot = Object.freeze({ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
        valueSources: Object.freeze(valueSources), composition: Object.freeze({ kind: 'content_with_instruction', localRole: 'instruction' }) })
      const input = candidate({}, {}, [slot]), finalPrompt = '  来源内容\n\n补充要求：保持角色\n'
      const snap = snapshot({}, {}, [], { prompt: finalPrompt })
      const checked = core.evaluateCandidateRequest(input, snap)
      assert.equal(checked.status, 'ready'); assert.deepEqual(checked.diagnostics, [])
      assert.equal(snap.prompt, finalPrompt); assert.deepEqual(input.operation.inputs, [slot])
      assert.equal(core.evaluateCandidateRequest({ ...input, currentEligibility: 'pending' }, snap).status, 'pending')
      assert.equal(core.evaluateCandidateRequest({ ...input, currentEligibility: 'rejected' }, snap).status, 'rejected')
      for (const prompt of [undefined, '', ' \n']) {
        assert.equal(core.evaluateCandidateRequest(input, snapshot({}, {}, [], prompt === undefined ? {} : { prompt })).status, 'pending')
      }
      assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [{ ...slot, min: 0 }]), snapshot()).status, 'ready')
      assert.equal(core.evaluateCandidateRequest(candidate({}, {}, [{ ...slot, min: 0, max: 0 }]), snap).status, 'rejected')
    }
  })
  test(`${entry}: #3276 unsupported text declarations stay closed without getters or mutation`, () => {
    let calls = 0
    const base = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
      valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' } }
    const mutations = [
      s => { delete s.composition }, s => { delete s.valueSources },
      s => { s.valueSources = ['upstream_output'] }, s => { s.valueSources = ['local_field'] },
      s => { s.valueSources = [] }, s => { s.valueSources = ['local_field', 'local_field'] },
      s => { s.valueSources = ['local_field', 'future'] }, s => { s.valueSources = ['local_field', , 'upstream_output'] },
      s => { s.valueSources.extra = true }, s => { s.valueSources[Symbol('hidden')] = true },
      s => { Object.setPrototypeOf(s.valueSources, null) },
      s => { const inherited = Object.create(Array.prototype); Object.setPrototypeOf(s.valueSources, inherited) },
      s => { const inherited = Object.create(Array.prototype);
        Object.defineProperty(inherited, Symbol.iterator, { get() { calls++; return function* () { yield 'local_field'; yield 'upstream_output' } } });
        inherited.includes = () => { calls++; return true };
        s.valueSources = ['evil_one', 'evil_two']; Object.setPrototypeOf(s.valueSources, inherited) },
      s => { const inherited = Object.create(Array.prototype);
        Object.defineProperty(inherited, 'includes', { get() { calls++; return () => true } });
        Object.setPrototypeOf(s.valueSources, inherited) },
      s => { const inherited = Object.create(Array.prototype);
        Object.defineProperty(inherited, '0', { get() { calls++; return 'local_field' } });
        delete s.valueSources[0]; Object.setPrototypeOf(s.valueSources, inherited) },
      s => { s.composition.kind = 'single_body' }, s => { s.composition.localRole = 'body' },
      s => { s.composition.extra = false }, s => { s.composition.kind = undefined },
      s => { Object.setPrototypeOf(s.composition, { inherited: true }) },
      s => { Object.defineProperty(s.composition, 'hidden', { value: false }) },
      s => { s.composition[Symbol('hidden')] = true },
      s => { Object.defineProperty(s.composition, 'kind', { enumerable: true, get() { calls++; return 'content_with_instruction' } }) },
      s => { Object.defineProperty(s.valueSources, '0', { enumerable: true, get() { calls++; return 'local_field' } }) },
      s => { s.type = 'image'; s.role = 'reference' }, s => { s.allowedMimes = ['image/png'] },
    ]
    for (const mutate of mutations) {
      const slot = structuredClone(base); mutate(slot)
      const before = Object.getOwnPropertyDescriptors(slot.composition ?? {}), input = candidate({}, {}, [slot])
      const result = core.evaluateCandidateRequest(input, snapshot({}, {}, [], { prompt: 'x' }))
      assert.equal(result.status, 'indeterminate'); assert.equal(result.assignment, undefined); assert.equal(result.effectiveParameters, undefined)
      assert.deepEqual(Object.getOwnPropertyDescriptors(slot.composition ?? {}), before)
      assert.equal(core.evaluateCandidateRequest({ ...input, currentEligibility: 'rejected' }, snapshot({}, {}, [], { prompt: 'x' })).status, 'rejected')
    }
    assert.equal(calls, 0)
  })
}
