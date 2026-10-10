import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createGenerationMapping } from './generation-mapping.js'
import { parseMediaConfig, resolveMediaRoute } from './route.js'
import { getModelChannelGroups, MODEL_CHANNEL_GROUPS } from '../catalog/serving/id-universe.js'
import { createGenerationProducts } from '../catalog/generation-products.js'

const candidate = (id = 'gpt-image-2.5', groupId = 'standard', type = 'image') => {
  const row = getModelChannelGroups(id).find(group => group.id === groupId)
  return { model: { id }, operation: { id: type === 'image' ? 'multi_reference' : 'video_multi_ref', output: { type } },
    group: row ? { id: row.id, ...(row.wireGroup ? { wireGroup: row.wireGroup } : {}), ...(row.wireModel ? { wireModel: row.wireModel } : {}), enabled: row.enabled } : { id: groupId, enabled: true } }
}
const parsed = (id = 'omnimux', baseUrl = 'https://transport.example.invalid/v1') => parseMediaConfig({ defaultProvider: id,
  providers: { [id]: { protocol: 'openai-media', baseUrl, apiKey: 'test-token-unused', models: { image: 'gpt-image-2.5', video: 'seedance-2-0-mini' } } } })

test('#3272 actual image and Mini standard identities agree with the unchanged single-group resolver', () => {
  const media = parsed(), mapping = createGenerationMapping(media)
  for (const c of [candidate(), candidate('seedance-2-0-mini', 'standard', 'video')]) {
    const expected = resolveMediaRoute(c.operation.output.type, { model: c.model.id, group: 'default', allowedGroups: ['standard'] }, media, {})
    const current = mapping(c)
    assert.equal(current.providerId, 'omnimux'); assert.equal(current.protocol, expected.protocol)
    assert.equal(current.wireGroup, 'default'); assert.equal(current.wireModel, c.model.id)
    assert.deepEqual(expected.candidates, [`${current.wireModel}@${current.wireGroup}`])
    assert.match(current.sourceVersion, /^[a-f0-9]{64}$/)
    assert.deepEqual(current.transportTarget, { origin: 'https://transport.example.invalid', basePath: '/v1' })
    assert.deepEqual(Object.keys(current).sort(), ['protocol', 'providerId', 'sourceVersion', 'transportTarget', 'wireGroup', 'wireModel'])
    assert.ok(Object.isFrozen(current) && Object.isFrozen(current.transportTarget))
  }
})

test('#3272 custom provider retains execute bare-candidate group fallback without supplier or channel invention', () => {
  const media = parsed('private-custom'), c = candidate(), route = resolveMediaRoute('image', { model: c.model.id, group: 'default', allowedGroups: ['standard'] }, media, {})
  assert.deepEqual(route.candidates, ['gpt-image-2.5'])
  const mapped = createGenerationMapping(media)(c)
  assert.equal(mapped.providerId, 'private-custom'); assert.equal(mapped.wireGroup, route.group)
  assert.equal(mapped.wireModel, route.candidates[0]); assert.equal(Object.hasOwn(mapped, 'channelId'), false)
})

test('#3272 only exact enabled declared groups qualify; malformed private candidates invoke no getters', () => {
  const map = createGenerationMapping(parsed()), good = candidate(); let calls = 0
  for (const mutate of [c => { c.group.enabled = false }, c => { delete c.group.enabled }, c => { c.group.id = 'unknown' },
    c => { c.group.wireGroup = 'other' }, c => { c.group.wireModel = 'supplier.dot.model' }, c => { c.model.id = 'unknown-model' },
    c => { c.operation.output.type = 'audio' }, c => { c.group.extra = { token: 'DUMMY' } },
    c => Object.defineProperty(c.group, 'id', { enumerable: true, get() { calls++; return 'standard' } }),
    c => Object.defineProperty(c.group, 'hidden', { value: 'DUMMY' }), c => { c.group[Symbol('private')] = 'DUMMY' }]) {
    const input = structuredClone(good); mutate(input); assert.equal(map(input), null)
  }
  assert.equal(calls, 0)
})

test('#3272 literal registered wire overrides are preserved and cross-group tails never qualify', () => {
  const pool = MODEL_CHANNEL_GROUPS['gpt-image-2.5'], row = pool.find(g => g.id === 'standard'), original = row.wireModel
  try {
    row.wireModel = 'grok-imagine-image-2.0'
    const c = candidate(), mapped = createGenerationMapping(parsed())(c)
    assert.equal(mapped.wireModel, 'grok-imagine-image-2.0')
    assert.equal(mapped.wireGroup, 'default')
    c.group.id = 'pro'; c.group.wireGroup = 'default'
    assert.equal(createGenerationMapping(parsed())(c), null)
  } finally { if (original === undefined) delete row.wireModel; else row.wireModel = original }
})

test('#3272 parsed media credential settings profile and environment getters are never read or retained', () => {
  const media = parsed(); let calls = 0
  const secret = () => { calls++; throw new Error('DUMMY-SECRET-GETTER') }
  for (const key of ['apiKey', 'apiKeyEnv', 'credentials', 'settings', 'profile']) Object.defineProperty(media.providers.omnimux, key, { enumerable: true, configurable: true, get: secret })
  for (const key of ['credentials', 'settings', 'profile', 'authMode']) Object.defineProperty(media, key, { enumerable: true, get: secret })
  const saved = Object.getOwnPropertyDescriptor(process, 'env')
  const environment = {}; for (const key of ['OMNIMUX_TOKEN', 'OMNIMUX_API_KEY', 'OMNIMUX_BASE_URL', 'OMNIMUX_IMAGE_MODEL']) Object.defineProperty(environment, key, { get: secret })
  let result
  try { Object.defineProperty(process, 'env', { value: environment, configurable: true, writable: true }); result = createGenerationMapping(media)(candidate()) }
  finally { Object.defineProperty(process, 'env', saved) }
  assert.equal(calls, 0); assert.equal(result.wireModel, 'gpt-image-2.5')
  media.providers.omnimux.baseUrl = 'https://replaced.example.invalid/v2'
  assert.equal(result.transportTarget.origin, 'https://transport.example.invalid')
})

test('#3272 secret-bearing malformed or unsupported transport addresses produce only fixed unavailable', () => {
  for (const baseUrl of ['https://user:password@example.invalid/v1', 'https://example.invalid/v1?token=DUMMY',
    'https://example.invalid/v1#DUMMY', 'file:///private/path', 'not-a-url']) {
    const media = parsed(); media.providers.omnimux.baseUrl = baseUrl
    assert.throws(() => createGenerationMapping(media)(candidate()), error => error.message === 'catalog unavailable')
  }
  for (const mutate of [m => { m.defaultProvider = 'missing' }, m => { m.providers.omnimux.protocol = 'unsupported' }]) {
    const media = parsed(); mutate(media)
    assert.throws(() => createGenerationMapping(media)(candidate()), error => error.message === 'catalog unavailable')
  }
})

const sourcePaths = ['media/generation-mapping.js', 'media/route.js', 'media/execute.js', 'media/vendors/omnimux.js',
  'media/protocols/openai-media.js', 'catalog/generation-products.js', 'catalog/serving/id-universe.js', 'catalog/serving/channel-groups.js',
  'catalog/contract/auto-serving-manifest.json', 'catalog/contract/dispositions.json', 'catalog/contract/submit-guard/map.js',
  'catalog/contract/submit-guard/map-bindings.js', 'catalog/contract/submit-guard/map-contract.js']
async function isolatedPackage(run) {
  const scratch = fileURLToPath(new URL('../../../../.tmp/3272-implementation/mapping-package', import.meta.url))
  fs.mkdirSync(scratch, { recursive: true })
  fs.cpSync(fileURLToPath(new URL('../', import.meta.url)), `${scratch}/src`, { recursive: true })
  fs.cpSync(fileURLToPath(new URL('../../lib/', import.meta.url)), `${scratch}/lib`, { recursive: true })
  try { await run(scratch) } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
}
test('#3272 each of thirteen fixed package sources changes fresh identity; already loaded factories remain stable', async () => {
  await isolatedPackage(async scratch => {
    const url = pathToFileURL(`${scratch}/src/media/generation-mapping.js`).href
    const first = await import(`${url}?initial`), initial = first.createGenerationMapping(parsed())(candidate()).sourceVersion
    assert.match(initial, /^[a-f0-9]{64}$/)
    const held = first.createGenerationMapping(parsed())
    for (const [index, path] of sourcePaths.entries()) {
      const file = `${scratch}/src/${path}`, bytes = fs.readFileSync(file)
      try {
        fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n')]))
        assert.equal(held(candidate()).sourceVersion, initial)
        assert.equal(first.createGenerationMapping(parsed())(candidate()).sourceVersion, initial)
        const fresh = await import(`${url}?changed=${index}`)
        assert.notEqual(fresh.createGenerationMapping(parsed())(candidate()).sourceVersion, initial, path)
      } finally { fs.writeFileSync(file, bytes) }
    }
  })
})
test('#3272 unreadable package source never breaks import but list and preview fail closed', async () => {
  await isolatedPackage(async scratch => {
    const read = fs.readFileSync, failed = `${scratch}/src/media/vendors/omnimux.js`
    fs.readFileSync = function(path, ...args) {
      if ((path instanceof URL ? fileURLToPath(path) : String(path)) === failed) throw new Error('DUMMY-PRIVATE-PATH')
      return read(path, ...args)
    }
    syncBuiltinESMExports()
    try {
      const module = await import(`${pathToFileURL(`${scratch}/src/media/generation-mapping.js`).href}?unreadable`)
      const readMapping = module.createGenerationMapping(parsed())
      const products = createGenerationProducts({ readMapping })
      assert.throws(() => readMapping(candidate()), error => error.message === 'catalog unavailable')
      assert.throws(() => products.list(), error => error.message === 'catalog unavailable')
      assert.throws(() => products.preparePreview({}), error => error.message === 'catalog unavailable')
    } finally { fs.readFileSync = read; syncBuiltinESMExports() }
  })
})

test('#3276 actual packaged decision bytes change fresh mapping identity and do not rewrite an already loaded version', async () => {
  await isolatedPackage(async scratch => {
    const url = pathToFileURL(`${scratch}/src/media/generation-mapping.js`).href
    const first = await import(`${url}?core-before`), held = first.createGenerationMapping(parsed())
    const initial = held(candidate()).sourceVersion, file = `${scratch}/lib/generation-core.js`, bytes = fs.readFileSync(file)
    try {
      fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n// private identity-only probe\n')]))
      assert.equal(held(candidate()).sourceVersion, initial)
      const changed = await import(`${url}?core-after`)
      assert.notEqual(changed.createGenerationMapping(parsed())(candidate()).sourceVersion, initial)
    } finally { fs.writeFileSync(file, bytes) }
  })
})

test('#3276 unreadable packaged decision never yields a usable mapping or catalog', async () => {
  await isolatedPackage(async scratch => {
    const read = fs.readFileSync, failed = `${scratch}/lib/generation-core.js`
    fs.readFileSync = function(path, ...args) {
      if ((path instanceof URL ? fileURLToPath(path) : String(path)) === failed) throw new Error('DUMMY-PACKAGED-DECISION-UNREADABLE')
      return read(path, ...args)
    }
    syncBuiltinESMExports()
    try {
      const module = await import(`${pathToFileURL(`${scratch}/src/media/generation-mapping.js`).href}?missing-core-proof`)
      const readMapping = module.createGenerationMapping(parsed())
      assert.throws(() => readMapping(candidate()), error => error.message === 'catalog unavailable')
      assert.throws(() => createGenerationProducts({ readMapping }).list(), error => error.message === 'catalog unavailable')
    } finally { fs.readFileSync = read; syncBuiltinESMExports() }
  })
})
