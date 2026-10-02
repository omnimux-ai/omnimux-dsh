import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listSessionModels } from './session-models.js'

/**
 * A minimal settings service stub: describe() returns the descriptor array
 * shape the harness settings registry actually serves ({ ns, base, user }).
 */
function settingsStub(descriptor) {
  return {
    describe() {
      return descriptor === null ? [] : [descriptor]
    },
  }
}

const LLM_PI_AI = 'llm-pi-ai'

function descriptorWith(userProviders, baseProviders) {
  return {
    ns: LLM_PI_AI,
    base: { providers: baseProviders ?? {} },
    user: { providers: userProviders ?? {} },
  }
}

describe('listSessionModels', () => {
  it('flattens every provider model list into provider:modelId entries', () => {
    const settings = settingsStub(descriptorWith({
      cpa: {
        displayName: 'CPA',
        models: [
          { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
          { id: 'grok-4.6', name: 'Grok 4.6' },
        ],
      },
      omnimux: {
        displayName: 'OmniMux',
        models: [{ id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol' }],
      },
    }))

    const rows = listSessionModels(settings)
    assert.deepEqual(rows, [
      { id: 'cpa:gpt-6.1-sol', label: 'GPT-6.1 Sol · CPA' },
      { id: 'cpa:grok-4.6', label: 'Grok 4.6 · CPA' },
      { id: 'omnimux:gpt-5.6-sol', label: 'GPT 5.6 Sol · OmniMux' },
    ])
  })

  it('drops models that declare input without text', () => {
    const settings = settingsStub(descriptorWith({
      cpa: {
        displayName: 'CPA',
        models: [
          { id: 'chat-model', name: 'Chat', input: ['text', 'image'] },
          { id: 'audio-only', name: 'Audio', input: ['audio'] },
        ],
      },
    }))

    const rows = listSessionModels(settings)
    assert.deepEqual(rows.map((row) => row.id), ['cpa:chat-model'])
  })

  it('falls back to the base layer when the user layer is absent', () => {
    const settings = settingsStub(descriptorWith(null, {
      cpa: { displayName: 'CPA', models: [{ id: 'm1', name: 'M1' }] },
    }))

    assert.deepEqual(listSessionModels(settings), [{ id: 'cpa:m1', label: 'M1 · CPA' }])
  })

  it('returns an empty list when the namespace is missing or describe fails', () => {
    assert.deepEqual(listSessionModels(settingsStub(null)), [])
    assert.deepEqual(listSessionModels(null), [])
    assert.deepEqual(
      listSessionModels({ describe() { throw new Error('boom') } }),
      [],
    )
  })
})

describe('listSessionModels overlay merge', () => {
  it('keeps base models when the user entry only overlays other fields', () => {
    const settings = settingsStub(descriptorWith(
      { cpa: { apiKeyEnv: 'CPA_API_KEY', baseURL: 'http://127.0.0.1:8317/v1' } },
      { cpa: { displayName: 'CPA', models: [{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' }] } },
    ))
    assert.deepEqual(listSessionModels(settings), [{ id: 'cpa:gpt-6.1-sol', label: 'GPT-6.1 Sol · CPA' }])
  })

  it('parses a model id that itself contains a colon tag', async () => {
    const { executeOmnimuxText } = await import('../text/execute.js')
    const seen = []
    const result = await executeOmnimuxText({
      prompt: 'hi',
      settings: { get: (k) => k === 'omnimux' ? { toolModel: 'ollama:llama3.1:8b' } : undefined },
      llm: {
        async * stream(options) {
          seen.push(options)
          yield { type: 'text-delta', text: 'ok' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      },
    })
    assert.equal(seen[0].provider, 'ollama')
    assert.equal(seen[0].model, 'llama3.1:8b')
    assert.equal(result.text, 'ok')
  })
})
