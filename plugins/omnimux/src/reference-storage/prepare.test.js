import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareReferencePayload, verifyRemoteReference } from './prepare.js'

function deps() {
  const calls = []
  const credentials = { async resolve(ref) { return { value: ref.endsWith('_SECRET') ? 'synthetic-secret' : 'synthetic-access' } } }
  const settings = { enabled: true, endpoint: 'https://storage.example.test', bucket: 'reference-media', region: 'auto', publicBaseUrl: 'https://media.example.test', credentialId: '0123456789abcdef0123456789abcdef' }
  async function upload(source, options) { calls.push({ source, options }); return 'https://media.example.test/reference.png' }
  return { calls, credentials, config: settings, upload }
}
test('all supported reference fields share preparation and preserve roles and unrelated text', async () => {
  const d = deps()
  const input = { prompt: '/private/prompt-not-a-file', image: '/tmp/ref.png', images: ['/tmp/ref.png'], references: [{ type: 'image', role: 'style', pathOrUrl: '/tmp/ref.png' }], audioTrack: { type: 'audio', pathOrUrl: '/tmp/audio.wav' }, video_urls: ['/tmp/ref.mp4'] }
  const result = await prepareReferencePayload(input, d)
  assert.equal(d.calls.length, 3)
  assert.equal(result.image, 'https://media.example.test/reference.png')
  assert.equal(result.references.at(0).pathOrUrl, result.image)
  assert.equal(result.references.at(0).role, 'style')
  assert.equal(result.prompt, input.prompt)
  assert.equal(input.image, '/tmp/ref.png')
})
test('disabled settings do not resolve credentials or upload; pure text needs no cloud access', async () => {
  const d = deps()
  d.config.enabled = false
  d.credentials.resolve = async () => { throw Error('must not resolve') }
  assert.deepEqual(await prepareReferencePayload({ image: '/tmp/ref.png' }, d), { image: '/tmp/ref.png' })
  d.config.enabled = true
  assert.deepEqual(await prepareReferencePayload({ prompt: 'no references' }, d), { prompt: 'no references' })
})
test('upload failure propagates without old cloud fallback or partial payload return', async () => {
  const d = deps()
  d.upload = async () => { throw Error('upload refused') }
  await assert.rejects(prepareReferencePayload({ image: '/tmp/ref.png' }, d), /upload refused/)
})
test('remote video and audio declarations cannot disguise ordinary text', async () => {
  for (const mime of ['video/mp4', 'audio/mpeg']) await assert.rejects(verifyRemoteReference('https://existing.example.test/ref', { request: async () => new Response('ordinary text', { headers: { 'content-type': mime } }) }))
})

test('existing public media is verified but never copied into user storage', async () => {
  const d = deps()
  let checks = 0
  d.verifyRemote = async url => { assert.equal(url, 'https://existing.example.test/ref.png'); checks++ }
  const result = await prepareReferencePayload({ image: 'https://existing.example.test/ref.png' }, d)
  assert.equal(result.image, 'https://existing.example.test/ref.png')
  assert.equal(d.calls.length, 0)
  assert.equal(checks, 1)
})
