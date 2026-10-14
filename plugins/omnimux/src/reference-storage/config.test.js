import test from 'node:test'
import assert from 'node:assert/strict'
import { parseReferenceStorageConfig, credentialRefs, readReferenceStorage, saveReferenceStorage } from './config.js'

function configuration() {
  return { enabled: true, endpoint: 'https://storage.example.test', bucket: 'reference-media', region: 'auto', publicBaseUrl: 'https://media.example.test' }
}
function fixture() {
  let revision = 1
  let value = { referenceStorage: { enabled: false } }
  const entries = new Map()
  const settings = {
    get: () => structuredClone(value),
    describe: () => [{ namespace: 'omnimux', revision }],
    async update(ns, patch, expected) {
      assert.equal(ns, 'omnimux')
      if (expected !== revision) throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' })
      value = Object.assign({}, value, structuredClone(patch)); revision++
    },
  }
  const credentials = {
    async set(ref, secret) { entries.set(ref, secret) },
    async unset(ref) { entries.delete(ref) },
    async resolve(ref) { return entries.has(ref) ? { value: entries.get(ref) } : undefined },
    async describe(ref) { return { configured: entries.has(ref), writable: true } },
  }
  return { settings, credentials, entries, get value() { return value } }
}
function submission() { return Object.assign(configuration(), { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', expectedRevision: 1 }) }

test('disabled default preserves existing upload policy', () => {
  assert.deepEqual(parseReferenceStorageConfig(undefined), { enabled: false, endpoint: '', bucket: '', region: 'auto', publicBaseUrl: '', credentialId: '' })
})
test('rejects private, insecure, credential-bearing targets and unknown secret fields', () => {
  const addresses = ['http://storage.example.test', 'https://127.0.0.1', 'https://10.0.0.1', 'https://[::ffff:7f00:1]', 'https://storage.local', 'https://x:y@storage.example.test', 'https://storage.example.test?token=x', 'https://storage.example.test#x']
  for (const address of addresses) assert.throws(() => parseReferenceStorageConfig(Object.assign(configuration(), { endpoint: address })))
  assert.throws(() => parseReferenceStorageConfig(Object.assign(configuration(), { secretAccessKey: 'do-not-store' })))
  assert.throws(() => parseReferenceStorageConfig(Object.assign(configuration(), { enabled: 'true' })))
  assert.throws(() => parseReferenceStorageConfig(Object.assign(configuration(), { bucket: '../other' })))
})
test('publishes non-secret config after credential pair; read returns neither credential value', async () => {
  const f = fixture()
  const result = await saveReferenceStorage(f, submission())
  assert.equal(result.hasCredentials, true)
  assert.equal(result.revision, 2)
  assert.equal(JSON.stringify(f.value).includes('synthetic'), false)
  assert.equal(JSON.stringify(result).includes('synthetic'), false)
  const refs = credentialRefs(f.value.referenceStorage.credentialId)
  assert.equal(f.entries.get(refs.accessKeyId), 'synthetic-access')
  assert.equal(f.entries.get(refs.secretAccessKey), 'synthetic-secret')
  assert.deepEqual(await readReferenceStorage(f), result)
})
test('blank inputs preserve pair; partial replacement refuses before mutation', async () => {
  const f = fixture()
  await saveReferenceStorage(f, submission())
  const id = f.value.referenceStorage.credentialId
  await saveReferenceStorage(f, Object.assign(configuration(), { region: 'us-east-1', accessKeyId: '', secretAccessKey: '', expectedRevision: 2 }))
  assert.equal(f.value.referenceStorage.credentialId, id)
  await assert.rejects(saveReferenceStorage(f, Object.assign(configuration(), { accessKeyId: 'new-access', secretAccessKey: '', expectedRevision: 3 })))
  assert.equal(f.entries.size, 2)
})
test('settings refusal cleans staged pair without deleting active credentials', async () => {
  const f = fixture()
  await saveReferenceStorage(f, submission())
  const previous = structuredClone(f.value)
  f.settings.update = async () => { throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' }) }
  await assert.rejects(saveReferenceStorage(f, Object.assign(configuration(), { accessKeyId: 'new-access', secretAccessKey: 'new-secret', expectedRevision: 2 })), e => e.code === 'SETTINGS_CONFLICT')
  assert.deepEqual(f.value, previous)
  assert.equal(f.entries.size, 2)
})
test('second credential write failure cleans first staged value and leaves settings unchanged', async () => {
  const f = fixture()
  f.credentials.set = async (ref, secret) => { if (ref.endsWith('_SECRET')) throw new Error('refused'); f.entries.set(ref, secret) }
  await assert.rejects(saveReferenceStorage(f, submission()))
  assert.equal(f.entries.size, 0)
  assert.deepEqual(f.value, { referenceStorage: { enabled: false } })
})
test('reading configuration refuses a revision changed during the value read', async () => {
  const f = fixture()
  const original = f.settings.get
  let revision = 1
  f.settings.describe = () => [{ namespace: 'omnimux', revision }]
  f.settings.get = () => { const value = original(); revision++; return value }
  await assert.rejects(readReferenceStorage(f), e => e.code === 'SETTINGS_CONFLICT')
})

test('stale form and absent credentials fail closed; disable retains pair', async () => {
  const f = fixture()
  await assert.rejects(saveReferenceStorage(f, Object.assign(configuration(), { expectedRevision: 1 })))
  await assert.rejects(saveReferenceStorage(f, Object.assign(submission(), { expectedRevision: 0 })), e => e.code === 'SETTINGS_CONFLICT')
  assert.equal(f.entries.size, 0)
  const saved = await saveReferenceStorage(f, submission())
  const disabled = await saveReferenceStorage(f, Object.assign({}, saved.config, { enabled: false, expectedRevision: 2 }))
  assert.equal(disabled.config.enabled, false)
  assert.equal(disabled.hasCredentials, true)
})
