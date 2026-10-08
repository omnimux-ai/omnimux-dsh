import assert from 'node:assert/strict'
import test from 'node:test'
import * as core from '../src/index.js'
import { assignAndValidateSlots, operationAcceptsAssets } from '../../../plugins/omnimux/src/catalog/contract/submit-guard/slots.js'

const image = (mime, extra = {}) => ({ type: 'image', mime, pathOrUrl: mime, ...extra })
const slot = (name, extra = {}) => ({ slot: name, type: 'image', role: 'reference', min: 1, max: 1, ...extra })

test('a PNG followed by JPEG is not rejected when JPEG can use A and PNG can use B', () => {
  const operation = { inputs: [slot('A', { allowedMimes: ['image/png', 'image/jpeg'] }), slot('B', { allowedMimes: ['image/png'] })] }
  const assets = [image('image/png'), image('image/jpeg')]
  const result = assignAndValidateSlots(operation, assets)
  assert.equal(result.ok, true)
  assert.equal(result.bySlot.get('A')[0], assets[1])
  assert.equal(result.bySlot.get('B')[0], assets[0])
})

// Exact targets and known metadata only; no production domain helper is used.
function oracleDomain(asset, target) {
  return asset.type === target.type
    && (!asset.targetSlot || asset.targetSlot === target.slot)
    && (!asset.role || !target.role || asset.role === target.role)
    && (!target.allowedMimes?.length || target.allowedMimes.includes(asset.mime))
    && (target.minDurationSec === undefined || asset.durationSec >= target.minDurationSec)
    && (target.maxDurationSec === undefined || asset.durationSec <= target.maxDurationSec)
}

// Exhaustively enumerate complete assignments independently of production predicates/search.
function oracle(operation, assets, duration = 0) {
  const choices = []
  function enumerate(index) {
    if (index < assets.length) {
      for (let s = 0; s < operation.inputs.length; s++) {
        choices[index] = s
        if (enumerate(index + 1)) return true
      }
      return false
    }
    const buckets = operation.inputs.map(() => [])
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i], s = choices[i], target = operation.inputs[s]
      if (!oracleDomain(asset, target)) return false
      buckets[s].push(asset)
    }
    for (let s = 0; s < operation.inputs.length; s++) {
      const target = operation.inputs[s], bucket = buckets[s]
      if (bucket.length < (target.min ?? 0) || bucket.length > (target.max ?? Infinity)) return false
      if (!bucket.length) continue
      const total = bucket.reduce((sum, a) => sum + (a.durationSec ?? 0), 0)
      if (target.totalMinDurationSec !== undefined && (target.totalMinExclusive ? total <= target.totalMinDurationSec : total < target.totalMinDurationSec)) return false
      if (target.totalMaxDurationSec !== undefined && (target.totalMaxExclusive ? total >= target.totalMaxDurationSec : total > target.totalMaxDurationSec)) return false
      if (target.combinedOutputMaxDurationSec !== undefined && total + duration > target.combinedOutputMaxDurationSec) return false
    }
    return (operation.inputGroups ?? []).every(g => g.slots.reduce((n, name) => n + buckets[operation.inputs.findIndex(s => s.slot === name)].length, 0) >= g.min)
  }
  return enumerate(0)
}
function permutations(items) {
  if (items.length < 2) return [items]
  return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest]))
}

test('independent finite enumeration agrees on known image/audio assignments across every input order', t => {
  let cases = 0, possible = 0, impossible = 0, multidomain = 0
  const dimensions = { totalMin: 0, combined: 0, perDuration: 0, role: 0, mixedType: 0 }
  for (let n = 1; n <= 4; n++) for (let count = 1; count <= 3; count++) {
    for (let mask = 0; mask < 8; mask++) for (const variant of ['image', 'audio', 'totalMin', 'combined', 'perDuration', 'role', 'mixedType']) {
      const audio = !['image', 'role', 'mixedType'].includes(variant)
      const inputs = Array.from({ length: count }, (_, i) => slot(`S${i}`, {
        type: variant === 'mixedType' && i === count - 1 ? 'audio' : audio ? 'audio' : 'image',
        role: variant === 'role' && i === count - 1 ? 'source' : 'reference',
        min: mask & 1 ? 1 : 0, max: mask & 2 ? 1 : 2,
        ...(audio ? { totalMaxDurationSec: 5 } : { allowedMimes: variant === 'mixedType' && i === count - 1 ? ['audio/mpeg'] : i === count - 1 ? ['image/png'] : ['image/png', 'image/jpeg'] }),
        ...(variant === 'totalMin' ? { totalMinDurationSec: 4, totalMinExclusive: Boolean(mask & 4), maxDurationSec: 3 } : {}),
        ...(variant === 'combined' ? { combinedOutputMaxDurationSec: 5 } : {}),
        ...(variant === 'perDuration' ? { minDurationSec: 2, maxDurationSec: i === count - 1 ? 2 : 3 } : {}),
      }))
      const operation = { inputs, ...(mask & 4 ? { inputGroups: [{ slots: [`S${count - 1}`], min: 1 }] } : {}) }
      const assets = Array.from({ length: n }, (_, i) => {
        const extra = { ...(i === n - 1 && mask === 7 && variant !== 'role' ? { targetSlot: 'S0' } : {}), ...(variant === 'role' ? { role: i % 2 ? 'source' : 'reference' } : {}) }
        return audio || (variant === 'mixedType' && i === n - 1)
          ? { type: 'audio', mime: 'audio/mpeg', durationSec: i % 2 ? 2 : 3, pathOrUrl: `${i}`, ...extra }
          : image(i % 2 ? 'image/jpeg' : 'image/png', extra)
      })
      const context = { duration: variant === 'combined' ? 1 : 0 }
      for (const order of permutations(assets)) {
        const expected = oracle(operation, order, context.duration)
        const actual = assignAndValidateSlots(operation, order, context).ok
        for (const strategy of ['legacy', 'strict']) {
          const result = core.solveAssetAssignment(operation, order, context, { strategy, maxStates: 100000 })
          // Known metadata proves ready existence, not arbitrary future completion terminality.
          assert.equal(result.status === 'ready', expected, JSON.stringify({ operation, order, strategy }))
        }
        assert.equal(actual, expected, JSON.stringify({ operation, order }))
        cases++; if (expected) possible++; else impossible++
        if (order.some(asset => inputs.filter(target => oracleDomain(asset, target)).length >= 2)) multidomain++
        if (Object.hasOwn(dimensions, variant)) dimensions[variant]++
      }
    }
  }
  assert.ok(cases > 0 && possible > 0 && impossible > 0 && multidomain > 0)
  assert.ok(Object.values(dimensions).every(value => value > 0))
  t.diagnostic(`oracle actualCaseCount=${cases}, satisfiable=${possible}, unsatisfiable=${impossible}, actualMultiDomain=${multidomain}, dimensions=${JSON.stringify(dimensions)}`)
})

const solve = (...args) => core.solveAssetAssignment(...args)
test('single-cause legacy failures retain exact messages and payloads in pure and Hub results', () => {
  const cases = [
    [{ slot: 'A', type: 'audio', max: 1, totalMaxDurationSec: 5 }, [{ type: 'audio', durationSec: 6 }], {}, { code: 'duration_exceeded', message: 'slot A total duration 6s exceeds the documented maximum', slot: 'A', totalDurationSec: 6, totalMaxDurationSec: 5, exclusive: false }],
    [{ slot: 'A', type: 'audio', max: 1, totalMaxDurationSec: 10, combinedOutputMaxDurationSec: 10 }, [{ type: 'audio', durationSec: 6 }], { duration: 5 }, { code: 'duration_exceeded', message: 'slot A input duration 6s plus output duration 5s exceeds the documented maximum', slot: 'A', totalDurationSec: 6, outputDurationSec: 5, combinedOutputMaxDurationSec: 10 }],
    [{ slot: 'A', type: 'audio', max: 1, totalMinDurationSec: 5 }, [{ type: 'audio', durationSec: 4 }], {}, { code: 'duration_exceeded', message: 'slot A total duration 4s is below the documented minimum', slot: 'A', totalDurationSec: 4, totalMinDurationSec: 5, exclusive: false }],
    [{ slot: 'A', type: 'image', max: 0 }, [image('image/png')], {}, { code: 'slot_capacity', message: 'slot A is full (max 0)', slot: 'A', max: 0 }],
    [{ slot: 'A', type: 'image', max: 1 }, [image('image/png'), image('image/png')], {}, { code: 'slot_capacity', message: 'slot A is full (max 1)', slot: 'A', max: 1 }],
    [{ slot: 'A', type: 'audio' }, [image('image/png', { role: 'reference' })], {}, { code: 'role_conflict', message: 'no slot with role reference for type image', role: 'reference', type: 'image' }],
    [{ slot: 'A', type: 'audio' }, [image('image/png')], {}, { code: 'operation_incompatible', message: 'operation has no slot for type image', type: 'image' }],
  ]
  for (const [input, assets, context, expected] of cases) {
    const operation = { inputs: [input] }
    for (const result of [solve(operation, assets, context), assignAndValidateSlots(operation, assets, context)]) {
      assert.equal(result.rejections.length, 1)
      const { assetIndex, slotIndex, ...reason } = result.rejections[0]
      assert.deepEqual(reason, expected)
    }
  }
})
test('joint multi-domain rejection does not present a first branch as a global reason', () => {
  const operation = { inputs: [slot('A', { min: 0, totalMaxDurationSec: 1, type: 'audio' }), slot('B', { min: 0, totalMaxDurationSec: 2, type: 'audio' })] }
  const result = solve(operation, [{ type: 'audio', durationSec: 3 }])
  assert.equal(result.status, 'rejected')
  assert.deepEqual(result.rejections, [{ code: 'operation_incompatible', message: 'no complete assignment satisfies the operation' }])
})
test('legacy ready witness preserves dynamic ordering and all original indices and identities', () => {
  const operation = { inputs: [{ slot: 'prompt', type: 'text', min: 0, max: 1 }, slot('A', { max: 2 }), slot('B', { max: 2 })] }
  const x = image('image/png'), y = image('image/png', { targetSlot: 'A' }), z = image('image/png')
  const assets = [null, x, { type: 'text' }, y, z]
  const result = solve(operation, assets)
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.bindings.map(b => [b.assetIndex, b.slotIndex]), [[1, 1], [3, 1], [4, 2]])
  assert.equal(result.bindings[0].asset, x)
  assert.deepEqual(result.buckets, [[], [x, y], [z]])
  assert.deepEqual(assets, [null, x, { type: 'text' }, y, z])
  const repeated = image('image/png')
  const twice = solve({ inputs: [slot('A', { min: 0, max: 2 })] }, [repeated, repeated])
  assert.equal(twice.bindings.length, 2)
  assert.equal(twice.bindings[0].asset, repeated)
  assert.equal(twice.bindings[1].asset, repeated)
})
test('explicit late target, group and joint duration constraints are searched rather than greedily rejected', () => {
  const operation = { inputs: [slot('A'), slot('B')] }
  assert.deepEqual(solve(operation, [image('image/png'), image('image/png', { targetSlot: 'A' })]).bindings.map(b => b.slot), ['B', 'A'])
  const group = { inputs: [slot('A', { min: 0 }), slot('B', { min: 0 })], inputGroups: [{ slots: ['B'], min: 1 }] }
  assert.equal(solve(group, [image('image/png')]).bindings[0].slot, 'B')
  const audio = { inputs: [slot('A', { type: 'audio', max: 2, totalMaxDurationSec: 5 }), slot('B', { type: 'audio', max: 2, totalMaxDurationSec: 5 })] }
  for (const order of permutations([3, 3, 2, 2])) assert.equal(solve(audio, order.map(durationSec => ({ type: 'audio', durationSec }))).status, 'ready')
})
test('strict never guesses semantic frames and role conflicts do not alter legacy target override', () => {
  const frames = { inputs: [slot('first_frame', { role: 'first_frame' }), slot('last_frame', { role: 'last_frame' })] }
  const result = solve(frames, [image('image/png'), image('image/png')], {}, { strategy: 'strict' })
  assert.equal(result.status, 'pending')
  assert.ok(result.pending.every(p => p.diagnostic === 'intent_required'))
  assert.equal(solve(frames, [image('image/png', { role: 'last_frame', targetSlot: 'first_frame' })], {}, { strategy: 'strict' }).status, 'rejected')
  assert.notEqual(solve(frames, [image('image/png', { role: 'last_frame', targetSlot: 'first_frame' })]).status, 'rejected')
  const explicit = solve(frames, [image('image/png', { targetSlot: 'first_frame' }), image('image/png', { targetSlot: 'last_frame' })], {}, { strategy: 'strict' })
  assert.equal(explicit.status, 'ready')
})
test('unknown is a soft domain, known conflicts remain hard, and ready outranks pending', () => {
  const op = { inputs: [slot('A', { min: 0, maxSizeMb: 1 }), slot('B', { min: 0 })] }
  assert.equal(solve(op, [image('image/png')], {}, { strategy: 'strict' }).status, 'ready')
  const unknown = solve({ inputs: [slot('A', { maxSizeMb: 1, maxDurationSec: 5 })] }, [image('image/png', { durationSec: 6 })])
  assert.equal(unknown.status, 'rejected')
  const mixed = { inputs: [slot('A', { min: 0, allowedMimes: ['image/png'], maxSizeMb: 1 }), slot('B', { min: 0, allowedMimes: ['image/jpeg'], maxSizeMb: 1 })] }
  const p = solve(mixed, [image('image/png')])
  assert.equal(p.status, 'pending'); assert.equal(p.bindings[0].slot, 'A')
  assert.equal(p.pending[0].field, 'sizeBytes')
  assert.equal(solve({ inputs: [slot('A', { allowedMimes: ['image/png'] })] }, [image(undefined)], {}, { strategy: 'strict' }).pending[0].field, 'mime')
  assert.equal(operationAcceptsAssets(mixed, [image('image/png')]).ok, false)
})
test('one shared budget overrides a saved pending witness and counts root before assignment', () => {
  const op = { inputs: [slot('A', { min: 0, maxSizeMb: 1 }), slot('B', { min: 0 })] }
  const r = solve(op, [image('image/png')], {}, { maxStates: 3 })
  assert.equal(r.status, 'indeterminate'); assert.equal(r.diagnostic, 'search_budget_exceeded'); assert.equal(r.visitedStates, 3)
  const first = solve({ inputs: [slot('A', { max: 2 })] }, [image('image/png'), image('image/png')], {}, { maxStates: 1 })
  assert.equal(first.status, 'indeterminate'); assert.equal(first.visitedStates, 1)
  assert.deepEqual(first.bindings, []); assert.deepEqual(first.buckets, [[]])
  for (const maxStates of [0, -1, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => solve(op, [], {}, { maxStates }), TypeError)
})
test('quantity minima need a real completion proof and timed unknown completion is indeterminate', () => {
  assert.equal(solve({ inputs: [slot('A')], inputGroups: [{ slots: ['A'], min: 2 }] }, [image('image/png')]).status, 'rejected')
  const count = solve({ inputs: [slot('A', { min: 2, max: 2 }), slot('B', { min: 0 })], inputGroups: [{ slots: ['A', 'B'], min: 3 }] }, [image('image/png')])
  assert.equal(count.status, 'pending')
  const audio = { inputs: [slot('A', { type: 'audio', totalMinDurationSec: 5 })] }
  assert.equal(solve(audio, [{ type: 'audio', durationSec: 2 }]).status, 'rejected')
  const future = solve({ inputs: [{ ...audio.inputs[0], max: 2 }] }, [{ type: 'audio', durationSec: 2 }])
  assert.equal(future.status, 'indeterminate'); assert.equal(future.diagnostic, 'completion_unproven')
  const laterReady = solve({ inputs: [{ ...audio.inputs[0], min: 0, max: 2 }, slot('B', { type: 'audio', min: 0 })] }, [{ type: 'audio', durationSec: 2 }])
  assert.equal(laterReady.status, 'ready'); assert.equal(laterReady.bindings[0].slot, 'B')
})
test('combined-only ceiling is enforced and skipped output checks are explicit private diagnostics', () => {
  const op = { inputs: [slot('A', { type: 'video', combinedOutputMaxDurationSec: 10 })] }
  for (const strategy of ['legacy', 'strict']) assert.equal(solve(op, [{ type: 'video', durationSec: 6 }], { duration: 5 }, { strategy }).status, 'rejected')
  assert.equal(solve(op, [{ type: 'video' }], { duration: 5 }).status, 'pending')
  assert.equal(solve(op, [{ type: 'video', durationSec: 6 }], {}, { strategy: 'strict' }).pending[0].field, 'outputDurationSec')
  for (const policy of [{}, { strategy: 'strict', mode: 'accept' }]) {
    const r = solve(op, [{ type: 'video', durationSec: 6 }], {}, policy)
    assert.equal(r.status, 'ready')
    assert.deepEqual(r.uncheckedConstraints, [{ constraint: 'combined_output_ceiling', slotIndex: 0, field: 'outputDurationSec' }])
  }
  assert.equal(solve(op, [], { duration: 20 }, { mode: 'accept' }).status, 'ready')
})
test('unknown input cannot pretend a completion exists across contradictory duration bounds', () => {
  const impossible = { inputs: [slot('A', { type: 'audio', totalMinDurationSec: 5, combinedOutputMaxDurationSec: 4 })] }
  assert.equal(solve(impossible, [{ type: 'audio' }], { duration: 0 }).status, 'rejected')
  const inputAlreadyOver = { inputs: [slot('A', { type: 'audio', combinedOutputMaxDurationSec: 4 })] }
  assert.equal(solve(inputAlreadyOver, [{ type: 'audio', durationSec: 5 }]).status, 'rejected')
  assert.equal(solve({ inputs: [slot('A', { type: 'audio', minDurationSec: 6, maxDurationSec: 5 })] }, [{ type: 'audio' }]).status, 'rejected')
  assert.equal(solve({ inputs: [slot('A', { type: 'audio', totalMinDurationSec: 6, totalMaxDurationSec: 5, max: 2 })] }, [{ type: 'audio', durationSec: 2 }]).status, 'rejected')
  assert.equal(solve({ inputs: [slot('A', { maxSizeMb: 0, maxSizeExclusive: true })] }, [image('image/png')]).status, 'rejected')
})

test('finite per-duration and remaining capacity prove total minima impossible without hiding another ready slot', () => {
  const bounded = { inputs: [slot('A', { type: 'audio', min: 0, max: 2, maxDurationSec: 2, totalMinDurationSec: 5 })] }
  for (const strategy of ['legacy', 'strict']) {
    for (const asset of [{ type: 'audio' }, { type: 'audio', durationSec: 1 }]) {
      const result = solve(bounded, [asset], {}, { strategy })
      assert.equal(result.status, 'rejected')
      assert.deepEqual(result.bindings, [])
      assert.deepEqual(result.buckets, [[]])
    }
    const equality = { inputs: [{ ...bounded.inputs[0], totalMinDurationSec: 4, totalMinExclusive: true }] }
    assert.equal(solve(equality, [{ type: 'audio' }], {}, { strategy }).status, 'rejected')
    const alternative = { inputs: [...bounded.inputs, slot('B', { type: 'audio', min: 0 })] }
    const ready = solve(alternative, [{ type: 'audio', durationSec: 1 }], {}, { strategy })
    assert.equal(ready.status, 'ready'); assert.equal(ready.bindings[0].slot, 'B')
    const unboundedDuration = { inputs: [{ ...bounded.inputs[0], maxDurationSec: undefined }] }
    const unresolved = solve(unboundedDuration, [{ type: 'audio', durationSec: 1 }], {}, { strategy })
    assert.equal(unresolved.status, 'indeterminate'); assert.equal(unresolved.diagnostic, 'completion_unproven')
  }
})

test('exclusive duration endpoints are exact for known and unknown inputs and empty size domains stay local', () => {
  for (const strategy of ['legacy', 'strict']) {
    const policy = { strategy }
    for (const totalMinExclusive of [false, true]) for (const totalMaxExclusive of [false, true]) {
      const operation = { inputs: [slot('A', { type: 'audio', min: 0, totalMinDurationSec: 2, totalMaxDurationSec: 2, totalMinExclusive, totalMaxExclusive, maxDurationSec: 2 })] }
      const impossible = totalMinExclusive || totalMaxExclusive
      assert.equal(solve(operation, [{ type: 'audio', durationSec: 2 }], {}, policy).status, impossible ? 'rejected' : 'ready')
      assert.equal(solve(operation, [{ type: 'audio' }], {}, policy).status, impossible ? 'rejected' : 'pending')
    }
    const zero = { inputs: [slot('A', { type: 'audio', min: 0, max: null, maxDurationSec: 0, totalMinDurationSec: 1 })] }
    assert.equal(solve(zero, [{ type: 'audio', durationSec: 0 }], {}, policy).status, 'rejected')
    const sizes = { inputs: [slot('A', { min: 0, maxSizeMb: 0, maxSizeExclusive: true })] }
    assert.equal(solve(sizes, [image('image/png')], {}, policy).status, 'rejected')
    assert.equal(solve({ inputs: [...sizes.inputs, slot('B', { min: 0 })] }, [image('image/png')], {}, policy).status, 'ready')
    const emptyFuture = { inputs: [slot('A', { min: 1, allowedMimes: [] })] }
    const completion = solve(emptyFuture, [], {}, policy)
    assert.equal(completion.status, 'pending'); assert.equal(completion.bindings.length, 0)
  }
})

test('malformed declarations and strict invalid metadata reject with empty witnesses', () => {
  for (const op of [{}, { inputs: null }, { inputs: [null] }, { inputs: [slot('A'), slot('A')] }, { inputs: [slot('A', { min: null })] }, { inputs: [slot('A', { max: Infinity })] }, { inputs: [slot('A')], inputGroups: [{ slots: ['missing'], min: 0 }] }]) {
    const r = solve(op, [])
    assert.equal(r.status, 'rejected'); assert.equal(r.rejections[0].diagnostic, 'malformed_contract'); assert.deepEqual(r.bindings, [])
  }
  assert.equal(solve({ inputs: [] }, []).status, 'ready')
  for (const value of [-1, NaN, Infinity]) {
    assert.equal(solve({ inputs: [slot('A', { maxSizeMb: 1 })] }, [image('image/png', { sizeBytes: value })], {}, { strategy: 'strict' }).rejections[0].diagnostic, 'invalid_metadata')
    assert.throws(() => solve({ inputs: [slot('A', { maxSizeMb: 1 })] }, [image('image/png', { sizeBytes: value })]), TypeError)
  }
})
