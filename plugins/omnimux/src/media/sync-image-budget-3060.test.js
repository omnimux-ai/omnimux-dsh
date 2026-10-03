import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpenAiMediaRuntime } from './protocols/openai-media.js'

function runtime(capability, fetcher) {
  return createOpenAiMediaRuntime({ providerId: 'omnimux', capability,
    baseUrl: 'https://fixture.invalid/v1', apiKey: 'sk-synthetic-budget', modelId: 'fixture', fetcher })
}
const request = capability => ({ providerId: 'omnimux', modelId: `omnimux-${capability}`,
  input: { prompt: 'budget fixture' }, timeoutMs: 1260000, metadata: { wait: false } })

test('sync image uses the supported bounded ten-minute client budget; video keeps two-minute submission', async () => {
  const original = AbortSignal.timeout
  const observed = []
  AbortSignal.timeout = ms => { observed.push(ms); return original(ms) }
  try {
    for (const capability of ['image', 'video']) {
      const start = observed.length
      let calls = 0
      const result = await runtime(capability, async () => {
        calls++
        return new Response(JSON.stringify({ url: 'https://fixture.invalid/result.' + (capability === 'image' ? 'png' : 'mp4') }), { headers: { 'Content-Type': 'application/json' } })
      }).execute(request(capability))
      assert.deepEqual(observed.slice(start), [capability === 'image' ? 600000 : 120000])
      assert.equal(result.outputs[0].type, capability)
      assert.equal(calls, 1)
    }
  } finally { AbortSignal.timeout = original }
})

test('the longer image budget still forwards caller abort and never retries a paid submission', async () => {
  const controller = new AbortController()
  let calls = 0
  let signal
  const started = Promise.withResolvers()
  const operation = runtime('image', async (_url, init) => {
    calls++
    signal = init.signal
    started.resolve()
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }).execute({ ...request('image'), signal: controller.signal })
  await started.promise
  controller.abort(new Error('caller cancelled'))
  await assert.rejects(operation)
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
})
