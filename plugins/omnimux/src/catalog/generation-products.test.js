import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGenerationProducts } from './generation-products.js'

const registry = { version: '1', operations: [
  { id: 'text_to_image', label: '文生图', defaultOutputType: 'image' },
  { id: 'image_to_image', label: '图生图', defaultOutputType: 'image' },
  { id: 'multi_reference', label: '多图主体参考', defaultOutputType: 'image' },
  { id: 'video_multi_ref', label: '全能参考', defaultOutputType: 'video' },
  { id: 'first_last_frame', label: '首尾帧过渡', defaultOutputType: 'video' },
  { id: 'video_edit', label: '视频编辑', defaultOutputType: 'video' },
] }
const image = (pathOrUrl = 'https://example.invalid/a.png') => ({ type: 'image', pathOrUrl })
const model = (id = 'PRIVATE-MODEL', parameters = {}, inputs = []) => ({
  id, label: 'PRIVATE-LABEL', listed: true, research: { status: 'verified', docUrl: 'PRIVATE-PROOF-URL' },
  routing: { channel: 'PRIVATE-CHANNEL', wireModel: 'PRIVATE-WIRE', protocol: 'fixture' },
  parameters, operations: [{ id: 'text_to_image', output: { type: 'image' }, inputs,
    execution: { status: 'live', profileId: 'PRIVATE-PROFILE' } }],
})
const group = (id = 'PRIVATE-GROUP', constraints = {}) => ({ id, wireGroup: `wire-${id}`, enabled: true, constraints })
function proof({ identity, domain }) {
  return { identity, domain, active: true, sourceDigest: 'a'.repeat(64), documentVersion: 'fixture-v1',
    sample: { mode: 'live', taskId: 'PRIVATE-TASK', output: { type: domain.output.type, verified: true } } }
}
function fixture(models = [model()], groups = [group()], qualification = proof) {
  const counters = { index: 0, groups: 0, qualification: 0 }
  const index = { schemaVersion: '1.1', registry, issues: [], parseErrors: [], all: () => models }
  const products = createGenerationProducts({
    readIndex: () => { counters.index++; return index },
    readGroups: () => { counters.groups++; return groups },
    ...(qualification ? { readQualification: (candidate) => { counters.qualification++; return qualification(candidate) } } : {}),
  })
  return { products, models, groups, index, counters }
}
const request = (products, changes = {}) => ({ schemaVersion: 1, currentFingerprint: products.list().currentFingerprint,
  productId: 'generation.image', intent: 'text_to_image', parameters: {}, assets: [], ...changes })
const preview = (f, changes = {}) => f.products.preparePreview(request(f.products, changes))
const intent = f => f.products.list().products[0].intents[0]
const codes = result => result.issues.map(item => item.code)

// All fixtures are synthetic read-only sources, never production qualification or live execution.
test('AC1 legacy listed/docs/live do not prove qualification; complete bound fixture is ready but never executable', () => {
  const pending = fixture(undefined, undefined, null)
  assert.equal(preview(pending).status, 'pending')
  assert.ok(codes(preview(pending)).includes('qualification_pending'))
  const ready = preview(fixture())
  assert.equal(ready.status, 'ready'); assert.equal(ready.executable, false)
  assert.deepEqual(Object.keys(ready).sort(), ['currentFingerprint', 'executable', 'issues', 'requestFingerprint', 'schemaVersion', 'status'])
  assert.equal(preview(fixture(), { eligible: true }).status, 'rejected')
})
test('qualification requires all current identity, live mode, active and full domain evidence, not an eligible hint', () => {
  for (const mutate of [p => ({ eligible: true }), p => ({ ...p, active: false }), p => ({ ...p, sourceDigest: '' }),
    p => ({ ...p, documentVersion: '' }), p => ({ ...p, identity: { ...p.identity, wireModel: 'old' } }),
    p => ({ ...p, domain: { ...p.domain, parameters: { wider: {} } } }),
    p => ({ ...p, sample: { ...p.sample, mode: 'stub' } }), p => ({ ...p, sample: { mode: 'live', taskId: 'x' } })]) {
    assert.equal(preview(fixture(undefined, undefined, c => mutate(proof(c)))).status, 'pending')
  }
  for (const field of ['channel', 'wireModel', 'protocol']) {
    const m = model(); delete m.routing[field]
    assert.equal(preview(fixture([m])).status, 'pending')
  }
})
test('AC2 one complete candidate cannot borrow parameter and asset support from another; C pending survives A/B hard failures', () => {
  const m = model('m', { n: { type: 'number', range: { min: 0, max: 20 } } }, [{ slot: 'ref', type: 'image', min: 0, max: 3 }])
  const groups = [group('a', { inputs: { image: { max: 1 } }, parameters: { n: { fixed: 5 } } }), group('b', { parameters: { n: { fixed: 15 } } })]
  const f = fixture([m], groups)
  assert.equal(preview(f, { parameters: { n: 5 }, assets: [image(), image()] }).status, 'rejected')
  groups.push(group('c'))
  const withC = fixture([m], groups, c => c.identity.realGroupId === 'c' ? null : proof(c))
  assert.equal(preview(withC, { parameters: { n: 5 }, assets: [image(), image()] }).status, 'pending')
  assert.equal(preview(fixture([], [])).status, 'pending')
})
test('AC3 disabled and empty only remain hard without qualification; unknown constraints remain indeterminate', () => {
  const m = model('m', { n: { type: 'number' } })
  assert.equal(preview(fixture([m], [{ ...group(), enabled: false }], null)).status, 'rejected')
  assert.equal(preview(fixture([m], [group('a', { parameters: { n: { only: [] } } })], null)).status, 'rejected')
  assert.equal(preview(fixture([m], [group('a', { parameters: { n: { fixed: 15 } } })], null), { parameters: { n: 5 } }).status, 'rejected')
  for (const constraints of [{ unknown: true }, { inputs: { image: { max: '2' } } }, { parameters: { n: { mystery: true } } }]) {
    const f = fixture([m], [group('a', constraints)], null)
    assert.equal(preview(f).status, 'indeterminate'); assert.equal(intent(f).status, 'indeterminate')
    assert.deepEqual(intent(f).alternatives, [])
  }
})
test('AC4 operation replaces entire field; explicit n=7 ignores conflicting defaults but omitted n is unresolved', () => {
  const a = model('a', { n: { type: 'number', range: { min: 0, max: 20 }, defaultValue: 5 } })
  const b = model('b', { n: { type: 'number', range: { min: 0, max: 20 }, defaultValue: 15 } })
  const f = fixture([a, b])
  assert.equal(preview(f, { parameters: { n: 7 } }).status, 'ready')
  assert.equal(codes(preview(f, { parameters: { n: 7 } })).includes('default_ambiguous'), false)
  assert.equal(preview(f).status, 'pending'); assert.ok(codes(preview(f)).includes('default_ambiguous'))
  assert.equal(preview(f, { parameters: { n: 25 } }).status, 'rejected')
  a.operations[0].parameters = { n: { type: 'number', options: [7] } }
  assert.equal(preview(f, { parameters: { n: 7 } }).status, 'ready')
  assert.equal(preview(fixture([a]), { parameters: { n: 5 } }).status, 'rejected')
})
test('default consensus only freezes present same-domain valid primitive defaults; empty option default cannot become a hard request', () => {
  const a = model('a', { n: { type: 'number', options: [], defaultValue: 5 } })
  const b = model('b', { n: { type: 'number', defaultValue: 15 } })
  assert.equal(preview(fixture([a, b])).status, 'pending')
  assert.equal(preview(fixture([a, b]), { parameters: { n: 5 } }).status, 'ready') // B alone is a complete valid candidate.
  assert.equal(preview(fixture([a]), { parameters: { n: 5 } }).status, 'rejected')
  const c = model('c', { n: { type: 'number', defaultValue: 5 } })
  const d = model('d', { n: { type: 'number' } })
  assert.equal(preview(fixture([c, d])).status, 'pending')
  assert.equal(preview(fixture([d])).status, 'ready')
  assert.equal(preview(fixture([c], [group('x', { parameters: { n: { fixed: 15 } } })])).status, 'rejected')
  assert.equal(preview(fixture([a, b], [group('x', { parameters: { n: { only: [] } } })])).status, 'rejected')
})
test('explicit false zero null and empty string retain exact primitive identity and are never defaulted', () => {
  for (const [value, def] of [[false, { type: 'boolean', defaultValue: true }], [0, { type: 'number', defaultValue: 5 }],
    [null, { options: [null], defaultValue: null }], ['', { type: 'string', defaultValue: 'x' }]]) {
    const f = fixture([model('m', { n: def })]); const r = request(f.products, { parameters: { n: value } })
    const before = structuredClone(r)
    assert.equal(f.products.preparePreview(r).status, 'ready'); assert.deepEqual(r, before)
    assert.notEqual(f.products.preparePreview(r).requestFingerprint, preview(f).requestFingerprint)
  }
})
test('top-only prompt is inserted only for declared defs, explicit parameters.prompt is never filtered', () => {
  const a = model('a', {}, [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }])
  assert.equal(preview(fixture([a], undefined, null), { prompt: 'x' }).status, 'pending')
  assert.equal(preview(fixture([a]), { prompt: 'x', parameters: { prompt: 'x' } }).status, 'rejected')
  a.parameters = { prompt: { type: 'string' } }
  assert.equal(preview(fixture([a]), { prompt: 'x' }).status, 'ready')
  assert.equal(preview(fixture([a]), { parameters: { prompt: 'x' } }).status, 'ready')
  assert.equal(preview(fixture([a]), { prompt: 'x', parameters: { prompt: 'y' } }).status, 'rejected')
  const b = model('b'); assert.equal(preview(fixture([a, b]), { prompt: 'x' }).status, 'ready')
})
test('undefined sole transport exception equals omission; unknown undefined is rejected before omission', () => {
  const f = fixture([model('m', { n: { type: 'number', defaultValue: 5 } })])
  const omitted = preview(f)
  const r = request(f.products, { prompt: undefined, parameters: { n: undefined } })
  assert.equal(f.products.preparePreview(r).requestFingerprint, omitted.requestFingerprint)
  assert.equal(Object.hasOwn(r, 'prompt'), true); assert.equal(Object.hasOwn(r.parameters, 'n'), true)
  assert.deepEqual(codes(preview(f, { parameters: { unknown: undefined } })), ['unknown_parameter'])
  assert.deepEqual(codes(preview(f, { productId: undefined })), ['invalid_request'])
  assert.deepEqual(codes(preview(f, { assets: [{ ...image(), role: undefined }] })), ['invalid_request'])
})
test('getter hidden symbol sparse and extra-array fields fail without invoking getters or mutating input', () => {
  const f = fixture(); let getterCalls = 0
  const mutations = [r => Object.defineProperty(r, 'prompt', { enumerable: true, get() { getterCalls++; return 'x' } }),
    r => Object.defineProperty(r.parameters, 'x', { value: 1 }), r => { r[Symbol('x')] = 1 },
    r => { r.assets = new Array(1) }, r => { r.assets.extra = true }, r => { r.parameters = new Date() },
    r => Object.defineProperty(r.assets, '0', { enumerable: true, get() { getterCalls++; return image() } })]
  for (const mutate of mutations) { const r = request(f.products); mutate(r); assert.equal(f.products.preparePreview(r).status, 'rejected') }
  assert.equal(getterCalls, 0)
})
test('special own parameter names survive list, preview, consensus and fingerprints without prototype changes', () => {
  const defs = JSON.parse('{"__proto__":{"type":"number","defaultValue":5},"constructor":{"type":"number"},"toString":{"type":"string"}}')
  const f = fixture([model('m', defs)]); const parameters = JSON.parse('{"__proto__":7,"constructor":0,"toString":""}')
  const original = Object.getPrototypeOf(parameters); const r = request(f.products, { parameters })
  assert.equal(f.products.preparePreview(r).status, 'ready')
  const projected = intent(f).alternatives[0].parameters
  for (const name of ['__proto__', 'constructor', 'toString']) assert.equal(Object.hasOwn(projected, name), true)
  const hash = f.products.preparePreview(r).requestFingerprint
  parameters.__proto__ = 8; assert.notEqual(f.products.preparePreview(r).requestFingerprint, hash)
  assert.equal(Object.getPrototypeOf(parameters), original)
  const before = f.products.list().currentFingerprint; defs.__proto__.defaultValue = 6
  assert.notEqual(f.products.list().currentFingerprint, before)
})
test('AC5 full original asset metadata, selection, order, repetition and null/omission affect fingerprint', () => {
  const f = fixture([model('m', {}, [{ slot: 'ref', type: 'image', min: 0, max: 4 }])])
  const base = { ...image(), role: 'reference', targetSlot: 'ref', mime: 'image/png', sizeBytes: 1, durationSec: 0,
    sourceNodeId: 'node', edgeId: 'edge', outputId: 'output', outputVersion: 'v1', originalName: 'a.png', dimensions: { width: 1, height: 1 } }
  const r = request(f.products, { assets: [base, image('b')] }); const saved = structuredClone(r)
  const hash = f.products.preparePreview(r).requestFingerprint
  for (const [key, value] of Object.entries({ type: 'video', pathOrUrl: 'other', role: 'other', targetSlot: 'other', mime: 'image/jpeg',
    sizeBytes: null, durationSec: null, sourceNodeId: 'new', edgeId: 'new', outputId: 'new', outputVersion: 'v2', originalName: 'b.png', dimensions: { width: 2, height: 1 } })) {
    assert.notEqual(preview(f, { assets: [{ ...base, [key]: value }, image('b')] }).requestFingerprint, hash, key)
  }
  assert.notEqual(preview(f, { assets: [...r.assets].reverse() }).requestFingerprint, hash)
  assert.notEqual(preview(f, { assets: [base, base] }).requestFingerprint, hash)
  assert.notEqual(preview(f, { assets: [image()] }).requestFingerprint, preview(f, { assets: [{ ...image(), sizeBytes: null }] }).requestFingerprint)
  assert.deepEqual(r, saved)
  assert.equal(preview(f, { assets: [{ pathOrUrl: 'x' }] }).status, 'indeterminate')
  assert.equal(preview(f, { assets: [{ type: 'unknown', pathOrUrl: 'x' }] }).status, 'rejected')
})
test('asset scalar types and dimensions are strict, never synthesized or sanitized', () => {
  const f = fixture()
  for (const asset of [{}, { ...image(), type: 1 }, { ...image(), pathOrUrl: ' ' }, { ...image(), outputVersion: 1 },
    { ...image(), sizeBytes: 0.1 }, { ...image(), durationSec: -1 }, { ...image(), dimensions: { width: 0, height: 1 } },
    { ...image(), dimensions: { width: 1 } }, { ...image(), dimensions: { width: 1, height: 1, extra: 0 } }, { ...image(), meta: {} }]) {
    assert.deepEqual(codes(preview(f, { assets: [asset] })), ['invalid_request'])
  }
})
test('AC6 every current private mapping, group, proof and covered contract change invalidates fingerprint; key order does not', () => {
  const f = fixture(); let active = true
  const q = fixture(f.models, f.groups, c => ({ ...proof(c), active }))
  const before = q.products.list().currentFingerprint; active = false
  assert.notEqual(q.products.list().currentFingerprint, before)
  for (const mutate of [() => { f.models[0].routing.wireModel += 'x' }, () => { f.models[0].routing.protocol += 'x' },
    () => { f.groups[0].enabled = false }, () => { f.groups[0].constraints = { inputs: { image: { max: 2 } } } },
    () => { f.models[0].parameters.n = { type: 'number', defaultValue: 5 } }, () => { f.index.registry = { ...registry, version: '2' } },
    () => { f.models[0].label += 'x' }, () => { f.models[0].research.status = 'draft' }]) {
    const old = f.products.list().currentFingerprint; mutate(); assert.notEqual(f.products.list().currentFingerprint, old)
  }
  const a = fixture([model('m', { n: { type: 'number', options: [{ value: 5, label: '五' }] } })])
  const old = a.products.list().currentFingerprint; a.models[0].parameters.n.options[0].value = 6
  assert.notEqual(a.products.list().currentFingerprint, old)
  const keyOrder = fixture([model('m', { n: { options: [5], type: 'number' } })])
  const keyOrder2 = fixture([model('m', { n: { type: 'number', options: [5] } })])
  assert.equal(keyOrder.products.list().currentFingerprint, keyOrder2.products.list().currentFingerprint)
  const stale = request(a.products); a.groups[0].wireModel = 'new'
  const result = a.products.preparePreview(stale)
  assert.equal(result.status, 'pending'); assert.deepEqual(codes(result), ['stale_fingerprint'])
})
test('reads fresh index once per call and one group source per model; owned fixtures and returned data are not retained', () => {
  const f = fixture(); f.products.list(); assert.deepEqual(f.counters, { index: 1, groups: 1, qualification: 1 })
  const r = request(f.products); f.products.preparePreview(r)
  assert.equal(f.counters.index, 3); assert.equal(f.counters.groups, 3)
  const out = intent(f); out.alternatives[0].output.type = 'video'
  assert.equal(intent(f).alternatives[0].output.type, 'image')
  const bad = createGenerationProducts({ readIndex() { throw new Error('PRIVATE-PATH') } })
  assert.throws(() => bad.list()); assert.throws(() => bad.preparePreview(r))
})
test('AC7 public exact schemas never leak model/group/proof/profile/pricing and refuse private request keys', () => {
  const f = fixture(); const list = f.products.list()
  assert.deepEqual(list.products.map(p => p.productId), ['generation.image', 'generation.video'])
  assert.deepEqual(list.products[0].intents.map(i => i.intent), ['text_to_image', 'image_to_image', 'multi_reference'])
  assert.deepEqual(list.products[1].intents.map(i => i.intent), ['video_multi_ref', 'first_last_frame'])
  assert.equal(JSON.stringify([list, preview(f)]).includes('PRIVATE-'), false)
  for (const [key, value] of Object.entries({ model: 'x', group: 'x', route: {}, credentials: {}, taskId: 'x', dest: 'x', source: 'explicit', defaults: {} })) {
    assert.deepEqual(codes(preview(f, { [key]: value })), ['invalid_request'])
  }
  assert.deepEqual(codes(preview(f, { schemaVersion: 2 })), ['unsupported_version'])
  assert.deepEqual(codes(preview(f, { productId: 'unknown' })), ['unknown_product'])
  assert.deepEqual(codes(preview(f, { intent: 'video_edit' })), ['unknown_intent'])
  assert.deepEqual(codes(preview(f, { parameters: { unknown: 1 } })), ['unknown_parameter'])
})
test('complete alternatives preserve only/fixed/whole-media caps without domain union or default promises', () => {
  const m = model('m', { n: { type: 'number', range: { min: 4, max: 15 }, defaultValue: 5 } },
    [{ slot: 'a', type: 'image', min: 0, max: 2 }, { slot: 'b', type: 'image', min: 0, max: 2 }])
  const groups = [group('a', { parameters: { n: { only: [5] } } }), group('b', { parameters: { n: { only: [15] } } }),
    group('c', { parameters: { n: { fixed: 15 } } }), group('d', { inputs: { image: { max: 1 } } }), group('e', { inputs: { image: { max: 2 } } })]
  const f = fixture([m], groups); const alternatives = intent(f).alternatives
  assert.equal(alternatives.length, 5)
  for (const a of alternatives) {
    assert.deepEqual(Object.keys(a).sort(), ['constraints', 'inputGroups', 'inputs', 'output', 'parameters', 'status'])
    assert.equal(Object.hasOwn(a.parameters.n, 'defaultValue'), false)
    assert.deepEqual(a.parameters.n.range, { min: 4, max: 15 })
  }
  assert.deepEqual(alternatives[4].constraints, { inputs: { image: { max: 2 } } })
  assert.equal(preview(fixture([m], [groups[4]]), { parameters: { n: 5 }, assets: [image(), image(), image()] }).status, 'rejected')
  groups.push(group('duplicate', groups[0].constraints)); assert.equal(intent(f).alternatives.length, 5)
})
test('unconsumed canonical input composition, valueSources, unknown output/parameter semantics invalidate whole branch', () => {
  for (const mutate of [m => { m.operations[0].inputs = [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' } }] },
    m => { m.operations[0].output.newLimit = 1 }, m => { m.parameters.n = { type: 'number', newDomain: true } },
    m => { m.parameters.n = { optionsFrom: 'unknown' } }]) {
    const m = model(); mutate(m); const f = fixture([m])
    assert.deepEqual(intent(f).alternatives, []); assert.equal(intent(f).status, 'indeterminate')
    assert.equal(preview(f, { prompt: 'x' }).status, 'indeterminate')
  }
})
