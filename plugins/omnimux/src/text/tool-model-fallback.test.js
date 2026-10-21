// @ts-nocheck
import { strictEqual, deepEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { executeOmnimuxText } from './execute.js'
import { parseTextConfig } from './catalog.js'

/** Minimal settings seam: only the stale tool model is configured. */
function settingsWithToolModel(toolModel) {
  return {
    get(section) {
      if (section === 'omnimux') return { toolModel }
      return {}
    },
  }
}

/** Stream stub: fails on the stale provider, answers on the configured one. */
function llmStub(calls) {
  return {
    async *stream(options) {
      calls.push({ provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort })
      if (options.provider === 'cpa') {
        throw new Error('no adapter registered for provider "cpa"')
      }
      yield { type: 'text-delta', text: '回退后的正文' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
}

test('tool model without a registered provider retries with the live catalog default', async () => {
  const calls = []
  const result = await executeOmnimuxText({
    prompt: '写一句测试',
    text: parseTextConfig(undefined),
    settings: settingsWithToolModel('cpa:gpt-6.1-sol'),
    llm: llmStub(calls),
    env: {},
    modelCatalog: () => ({ default: { provider: 'deepseek-official', model: 'deepseek-flash' } }),
  })

  strictEqual(calls.at(0).provider, 'cpa')
  strictEqual(calls.length, 2, 'the catalog default must run exactly once')
  strictEqual(calls.at(1).provider, 'deepseek-official')
  strictEqual(calls.at(1).model, 'deepseek-flash')
  strictEqual(calls.at(1).reasoningEffort, 'off')
  strictEqual(result.text, '回退后的正文')
})

test('without a catalog the stale tool model still falls back to the default text route', async () => {
  const calls = []
  const result = await executeOmnimuxText({
    prompt: '写一句测试',
    text: parseTextConfig(undefined),
    settings: settingsWithToolModel('cpa:gpt-6.1-sol'),
    llm: llmStub(calls),
    env: {},
  })

  strictEqual(calls.at(1).provider, 'omnimux')
  strictEqual(result.text, '回退后的正文')
})

test('non-adapter tool model failures stay visible', async () => {
  const calls = []
  const llm = {
    async *stream(options) {
      calls.push(options.provider)
      throw new Error('model overloaded')
    },
  }
  let failure
  try {
    await executeOmnimuxText({
      prompt: '写一句测试',
      text: parseTextConfig(undefined),
      settings: settingsWithToolModel('cpa:gpt-6.1-sol'),
      llm,
      env: {},
    })
  } catch (error) {
    failure = error
  }
  strictEqual(failure?.message, 'model overloaded')
  deepEqual(calls, ['cpa'])
})
