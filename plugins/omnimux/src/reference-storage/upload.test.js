import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { uploadReferenceMedia } from './upload.js'

const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC', 'base64')
function options(mode = 'correct') {
  const calls = []
  const request = async (url, init) => {
    calls.push({ url, init })
    if (init.method === 'PUT') {
      assert.ok(init.headers.authorization.startsWith('AWS4-HMAC-SHA256 '))
      const chunks = []
      for await (const chunk of init.body) chunks.push(chunk)
      assert.deepEqual(Buffer.concat(chunks), bytes)
      return new Response(null, { status: mode === 'upload-failure' ? 403 : 200 })
    }
    assert.equal(init.headers.authorization, undefined)
    assert.equal(init.headers.cookie, undefined)
    if (mode === 'private') return new Response(null, { status: 403 })
    if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://other.example.test' } })
    if (mode === 'html') return new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } })
    return new Response(mode === 'wrong' ? Buffer.from('wrong-content') : bytes, { headers: { 'content-type': 'image/png' } })
  }
  return { calls, config: { enabled: true, endpoint: 'https://storage.example.test', bucket: 'reference-media', region: 'auto', publicBaseUrl: 'https://media.example.test' }, accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret', request }
}
test('signs user storage PUT then verifies anonymous complete matching media before returning URL', async () => {
  const opts = options()
  const result = await uploadReferenceMedia('data:image/png;base64,' + bytes.toString('base64'), opts)
  const digest = createHash('sha256').update(bytes).digest('hex')
  assert.equal(result, 'https://media.example.test/omnimux/references/' + digest + '.png')
  assert.equal(opts.calls.length, 2)
  assert.ok(opts.calls.at(0).url.startsWith('https://storage.example.test/reference-media/'))
})
test('private, redirected, HTML, wrong media and rejected PUT never yield a usable link', async () => {
  for (const mode of ['private', 'redirect', 'html', 'wrong', 'upload-failure']) {
    const opts = options(mode)
    await assert.rejects(uploadReferenceMedia('data:image/png;base64,' + bytes.toString('base64'), opts))
    assert.equal(opts.calls.length, mode === 'upload-failure' ? 1 : 2)
  }
})
test('cancellation and missing credentials reject before any upload', async () => {
  const opts = options()
  const controller = new AbortController()
  controller.abort()
  opts.signal = controller.signal
  await assert.rejects(uploadReferenceMedia('data:image/png;base64,' + bytes.toString('base64'), opts))
  assert.equal(opts.calls.length, 0)
  const empty = options()
  empty.secretAccessKey = ''
  await assert.rejects(uploadReferenceMedia('data:image/png;base64,' + bytes.toString('base64'), empty))
  assert.equal(empty.calls.length, 0)
})
