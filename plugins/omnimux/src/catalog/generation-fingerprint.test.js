import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { stringify as stringifyYaml } from 'yaml'
import { loadAll } from './contract/load.js'
import { buildModelCatalog, fingerprintOf } from './list.js'
import { MODEL_CHANNEL_GROUPS } from './serving/channel-groups.js'

const fixtureRoot = fileURLToPath(new URL('../../../../.tmp/3250/', import.meta.url))

/** A synthetic contract, validated and admitted by the production loader. */
function contractFixture() {
  const prompt = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 }
  const status = {
    research: { status: 'verified', docUrl: 'https://example.com/fixture-video' },
    implementation: { status: 'ready', profileId: 'videoGenerate', seam: 'videoGenerate', notes: 'fixture' },
    execution: { status: 'none' },
  }
  return {
    schemaVersion: '1.1',
    managementGroup: 'video',
    models: [{
      id: 'seedance-2-5', label: 'Fixture Video', family: 'fixture', badge: 'fixture', subtitle: 'fixture', role: 'flagship',
      research: { status: 'draft' }, implementation: { status: 'none' }, execution: { status: 'none' },
      routing: { channel: 'omnimux', wireModel: 'fixture-video', endpoint: '/v1/video', automaticFallback: false },
      operations: [
        { id: 'text_to_video', label: '文生视频', output: { type: 'video' }, inputs: [structuredClone(prompt)], ...structuredClone(status) },
        {
          id: 'video_multi_ref', label: '参考视频', output: { type: 'video' },
          inputs: [structuredClone(prompt), {
            slot: 'reference_images', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 4,
            allowedMimes: ['image/png', 'image/jpeg'], maxSizeMb: 10,
            limitSource: { kind: 'policy_conservative', note: 'fixture' },
          }],
          inputGroups: [{ slots: ['reference_images'], min: 1 }],
          ...structuredClone(status),
        },
      ],
    }],
  }
}

function loadFixture(t, doc = contractFixture()) {
  mkdirSync(fixtureRoot, { recursive: true })
  const dir = mkdtempSync(join(fixtureRoot, 'fingerprint-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'fixture.yaml')
  const load = (next) => {
    writeFileSync(file, stringifyYaml(next))
    const index = loadAll(dir)
    assert.equal(index.schemaVersion, '1.1')
    assert.deepEqual(index.parseErrors, [])
    assert.deepEqual(index.issues.filter((issue) => issue.level === 'error'), [])
    assert.equal(index.all().length, 1, 'the fixture must actually be indexed')
    const catalog = buildModelCatalog({ contractIndex: index, env: {} })
    assert.equal(catalog.models.length, 1)
    assert.deepEqual(catalog.models[0].operations.map((op) => op.listed), [true, true])
    return { index, catalog }
  }
  return { load, before: load(doc) }
}

test('loadAll and the published catalog invalidate when inputGroups alone change', (t) => {
  const doc = contractFixture()
  const { load, before } = loadFixture(t, doc)
  doc.models[0].operations[1].inputGroups[0].min = 2
  const after = load(doc)
  assert.notEqual(after.index.contentCacheKey, before.index.contentCacheKey)
  assert.equal(after.catalog.models[0].operations[1].inputGroups[0].min, 2)
  assert.notEqual(after.index.contentFingerprint, before.index.contentFingerprint)
  assert.notEqual(after.catalog.fingerprint, before.catalog.fingerprint)
})

for (const [field, mutate] of [
  ['operation implementation', (model) => { model.operations[1].implementation.notes = 'updated fixture' }],
  ['routing wireModel', (model) => { model.routing.wireModel = 'fixture-video-v2' }],
  ['routing endpoint', (model) => { model.routing.endpoint = '/v2/video' }],
  ['routing automaticFallback', (model) => { model.routing.automaticFallback = true }],
  ['family', (model) => { model.family = 'fixture-v2' }],
  ['badge', (model) => { model.badge = 'fixture-v2' }],
  ['subtitle', (model) => { model.subtitle = 'fixture-v2' }],
  ['role', (model) => { model.role = 'classic' }],
  ['model research defaults', (model) => { model.research.notes = 'updated fixture' }],
  ['model implementation defaults', (model) => { model.implementation.notes = 'updated fixture' }],
  ['model execution defaults', (model) => { model.execution.notes = 'updated fixture' }],
]) {
  test(`loadAll and the published catalog invalidate when ${field} alone changes`, (t) => {
    const doc = contractFixture()
    const { load, before } = loadFixture(t, doc)
    mutate(doc.models[0])
    const after = load(doc)
    assert.deepEqual(after.index.listedOperations, before.index.listedOperations, 'listing must not mask a missing field')
    assert.notEqual(after.index.contentFingerprint, before.index.contentFingerprint, field)
    assert.notEqual(after.catalog.fingerprint, before.catalog.fingerprint, field)
  })
}

test('loadAll includes canonical management metadata without changing output buckets', (t) => {
  const doc = contractFixture()
  const { load, before } = loadFixture(t, doc)
  doc.managementGroup = 'image'
  const after = load(doc)
  assert.equal(after.index.get('seedance-2-5').managementGroup, 'image')
  assert.deepEqual(after.catalog.video, before.catalog.video, 'management group must not own output buckets')
  assert.notEqual(after.index.contentFingerprint, before.index.contentFingerprint)
  assert.notEqual(after.catalog.fingerprint, before.catalog.fingerprint)
})

/** Mutate only this test process's public pool metadata; always restore it. */
function withChannelGroups(t) {
  const groups = MODEL_CHANNEL_GROUPS['seedance-2-5']
  const saved = structuredClone(groups)
  t.after(() => groups.splice(0, groups.length, ...saved))
  return groups
}

for (const [field, mutate] of [
  ['constraints', (group) => { group.constraints.parameters.duration.fixed = 20 }],
  ['enabled', (group) => { group.enabled = !group.enabled }],
  ['wireGroup', (group) => { group.wireGroup = 'fixture-wire-group' }],
  ['pricing', (group) => { group.pricing.pointsEstimate += 1 }],
  ['sla', (group) => { group.sla.avgWaitTimeSec += 1 }],
  ['default', (group) => { group.default = true }],
]) {
  test(`buildModelCatalog invalidates when channelGroups ${field} alone changes`, (t) => {
    const groups = withChannelGroups(t)
    const { before } = loadFixture(t)
    mutate(groups[0])
    const after = buildModelCatalog({ contractIndex: before.index, env: {} })
    assert.notDeepEqual(after.models[0].channelGroups, before.catalog.models[0].channelGroups)
    assert.deepEqual(after.defaults, before.catalog.defaults)
    assert.equal(after.contractFingerprint, before.catalog.contractFingerprint)
    assert.notEqual(after.fingerprint, before.catalog.fingerprint, field)
  })
}

test('buildModelCatalog invalidates when defaultOperations alone change', (t) => {
  const { before } = loadFixture(t)
  const after = buildModelCatalog({
    contractIndex: before.index, env: {}, settingsDefaults: { defaultVideoOperation: 'text_to_video' },
  })
  assert.deepEqual(after.defaults, before.catalog.defaults)
  assert.deepEqual(after.models, before.catalog.models)
  assert.equal(after.contractFingerprint, before.catalog.contractFingerprint)
  assert.notDeepEqual(after.defaultOperations, before.catalog.defaultOperations)
  assert.notEqual(after.fingerprint, before.catalog.fingerprint)
})

/** Object insertion order is irrelevant; array elements are not reordered. */
function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseObjectKeys(child)]))
}

test('loadAll and buildModelCatalog ignore recursive object key order', (t) => {
  const doc = contractFixture()
  const groups = withChannelGroups(t)
  const { load, before } = loadFixture(t, doc)
  groups.splice(0, groups.length, ...reverseObjectKeys(groups))
  const after = load(reverseObjectKeys(doc))
  assert.notEqual(after.index.contentCacheKey, before.index.contentCacheKey, 'file bytes actually changed')
  assert.deepEqual(after.catalog.models, before.catalog.models)
  assert.equal(after.index.contentFingerprint, before.index.contentFingerprint)
  assert.equal(after.catalog.fingerprint, before.catalog.fingerprint)
})

test('loadAll and buildModelCatalog preserve semantic operation candidate order', (t) => {
  const doc = contractFixture()
  const { load, before } = loadFixture(t, doc)
  doc.models[0].operations.reverse()
  const after = load(doc)
  assert.deepEqual(after.catalog.models[0].operations.map((op) => op.id), ['video_multi_ref', 'text_to_video'])
  assert.deepEqual(after.index.listedOperations, before.index.listedOperations)
  assert.notEqual(after.index.contentFingerprint, before.index.contentFingerprint)
  assert.notEqual(after.catalog.fingerprint, before.catalog.fingerprint)
})

test('buildModelCatalog preserves semantic channel candidate order', (t) => {
  const groups = withChannelGroups(t)
  const { before } = loadFixture(t)
  groups.reverse()
  const after = buildModelCatalog({ contractIndex: before.index, env: {} })
  assert.deepEqual(after.models[0].channelGroups.map((group) => group.id),
    before.catalog.models[0].channelGroups.map((group) => group.id).reverse())
  assert.equal(after.contractFingerprint, before.catalog.contractFingerprint)
  assert.notEqual(after.fingerprint, before.catalog.fingerprint)
})

test('fingerprintOf reuses canonical key ordering in both supported overloads', () => {
  const lists = { text: [], image: [], video: [{ id: 'fixture' }], audio: [] }
  const defaults = { text: '', image: '', video: 'fixture', audio: '' }
  const context = {
    schemaVersion: '1.1', contractFingerprint: 'fixture', listedOperations: ['fixture#text_to_video'],
    defaultsByOperation: { text_to_video: 'fixture', video_multi_ref: 'fixture' }, dispositions: [],
    defaultOperations: { video: { modelId: 'fixture', operationId: 'text_to_video', rule: 'configured' } },
  }
  assert.equal(fingerprintOf(lists, defaults), fingerprintOf(lists, reverseObjectKeys(defaults)))
  assert.equal(fingerprintOf(lists, defaults, context),
    fingerprintOf(lists, reverseObjectKeys(defaults), reverseObjectKeys(context)))
})
