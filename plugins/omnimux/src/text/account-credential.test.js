import assert from 'node:assert/strict'
import { test } from 'node:test'
import { completeTextViaChat } from './chat.js'
import { executeOmnimuxText } from './execute.js'
import { mountTextComplete } from './mount.js'
import { parseTextConfig } from './catalog.js'

function completion(extra = {}) {
  return { model: 'gemini-3.8-flash', prompt: 'describe', maxTokens: 100, env: {},
    credentials: { resolve: async () => undefined }, ...extra }
}

test('official direct completion consumes the execution key, never the identity token', async () => {
  const identityToken = 'synthetic-identity-only'
  const executionKey = `sk-${'b'.repeat(48)}`
  let requests = 0
  const result = await completeTextViaChat(completion({ env: { OMNIMUX_ACCESS_TOKEN: identityToken },
    resolveOfficialApiKey: async () => executionKey,
    fetcher: async (url, init) => {
      requests += 1
      assert.equal(init.headers.authorization, `Bearer ${executionKey}`)
      assert.equal(JSON.stringify(init).includes(identityToken), false)
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'analysis result' } }] }) }
    },
  }))
  assert.equal(result.text, 'analysis result')
  assert.equal(requests, 1)
})

test('explicit key retains priority and account fallback cannot target a custom server', async () => {
  let resolves = 0, requests = 0
  const deps = { resolveOfficialApiKey: async () => { resolves++; return 'account-key' },
    fetcher: async () => { requests++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'done' } }] }) } } }
  for (const baseUrl of ['https://custom.example/v1', 'https://api.omnimux.ai/some-other-path']) {
    await assert.rejects(() => completeTextViaChat(completion({ ...deps, baseUrl })),
      (error) => error.code === 'official-credential-destination-invalid')
  }
  assert.equal(requests, 0)
  assert.equal(resolves, 0)
  await completeTextViaChat(completion({ ...deps, apiKey: 'explicit-user-key', baseUrl: 'https://custom.example/v1' }))
  assert.equal(requests, 1)
  assert.equal(resolves, 0)
})

test('missing, unreadable and rejected execution credentials stay distinct and safe', async () => {
  await assert.rejects(() => completeTextViaChat(completion()), (error) => error.code === 'official-credential-required')
  await assert.rejects(() => completeTextViaChat(completion({ credentials: { resolve: async () => { throw new Error('private-value') } } })),
    (error) => error.code === 'official-credential-unavailable' && !error.message.includes('private-value'))
  const key = `sk-${'c'.repeat(48)}`
  for (const [status, code] of [[401, 'official-credential-rejected'], [403, 'official-permission-denied']]) {
    await assert.rejects(() => completeTextViaChat(completion({ apiKey: key,
      fetcher: async () => ({ ok: false, status, json: async () => ({ error: { message: `denied ${key} ${key.slice(3)}` } }) }) })),
    (error) => error.code === code && error.status === status && error.message.includes('denied') && !error.message.includes(key.slice(3)))
  }
})

test('analysis pending has its own actionable error before credentials or media work', async () => {
  let requests = 0
  await assert.rejects(() => executeOmnimuxText({ prompt: 'describe', video: 'https://not-fetched.example/video.mp4',
    settings: { get: () => ({ scenarioBindings: { analysis: { channel: 'pending' } } }) },
    credentials: { resolve: async () => { requests++; return undefined } },
    fetcher: async () => { requests++; throw new Error('must not request') },
  }), (error) => error.code === 'analysis-service-unconfigured')
  assert.equal(requests, 0)
})

test('unrouted official text and image requests use the private execution credential seam', async () => {
  const executionKey = `sk-${'d'.repeat(48)}`
  for (const media of [{}, { image: 'data:image/png;base64,iVBORw0KGgoAAAAA' }]) {
    let api, httpCalls = 0, streams = 0, attachmentWrites = 0, resolves = 0
    mountTextComplete({ tools: { register() {} }, provide(_name, value) { api = value },
      get(name) {
        if (name === 'llm') return { async * stream() { streams++; yield { type: 'text-delta', text: 'must not use Host credentials' } } }
        if (name === 'credentials') return { resolve: async () => undefined }
        if (name === 'settings') return { get: () => ({ scenarioBindings: { text: { channel: 'official' }, analysis: { channel: 'official' } } }) }
        if (name === 'attachments') return { saveImage: async () => { attachmentWrites++ } }
      },
    }, { text: parseTextConfig({ defaultModel: 'gemini-3.8-flash' }) }, {}, (error) => { throw error }, {
      resolveOfficialApiKey: async () => { resolves++; return executionKey },
    })
    const result = await api.execute({ prompt: 'describe', ...media, env: {},
      fetcher: async (_url, init) => {
        httpCalls++
        assert.equal(init.headers.authorization === `Bearer ${executionKey}`, true)
        const body = JSON.parse(init.body)
        assert.equal(body.messages[0].content.length, media.image ? 2 : 1)
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'result' } }] }) }
      },
    })
    assert.equal(result.text, 'result')
    assert.equal(httpCalls, 1)
    assert.equal(resolves, 1)
    assert.equal(streams, 0)
    assert.equal(attachmentWrites, 0)
  }
})

test('a configured tool model retains its selected Host channel without account credential lookup', async () => {
  let resolves = 0, calls = 0
  const result = await executeOmnimuxText({ prompt: 'describe', settings: { get: () => ({ toolModel: 'chosen:tool' }) },
    resolveOfficialApiKey: async () => { resolves++; return 'unused-account-key' },
    llm: { async * stream(input) { calls++; assert.equal(input.provider, 'chosen'); yield { type: 'text-delta', text: 'chosen reply' } } },
  })
  assert.equal(result.text, 'chosen reply')
  assert.equal(resolves, 0)
  assert.equal(calls, 1)
})
