import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  createAgentModelResolver,
  probeAgentModelsDetailed,
  qwenProviderModels,
  scanLocalAgents,
} from './local.js'

function fixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omnimux-live-models-'))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

describe('qwenProviderModels', () => {
  it('reads every declared provider model and ignores malformed entries', () => {
    assert.deepEqual(qwenProviderModels({
      modelProviders: {
        openai: [{ id: 'qwen3.8-max' }, { id: 'glm-5' }, { name: 'no id' }],
        anthropic: [{ id: 'claude-sonnet-4-5' }, 'bare-model'],
      },
    }), ['qwen3.8-max', 'glm-5', 'claude-sonnet-4-5', 'bare-model'])
  })

  it('falls back to the single configured model when no provider list exists', () => {
    assert.deepEqual(qwenProviderModels({ model: { name: 'qwen3.8-max' } }), ['qwen3.8-max'])
  })

  it('refuses unsafe identifiers and empty settings', () => {
    assert.deepEqual(qwenProviderModels({ modelProviders: { openai: [{ id: '--org-secret' }, { id: 'ok-model' }] } }), ['ok-model'])
    assert.deepEqual(qwenProviderModels(null), [])
  })
})

describe('probeAgentModelsDetailed', () => {
  it('marks Qwen provider models as live', async () => {
    const dir = fixtureDir()
    try {
      const qwenPath = path.join(dir, 'settings.json')
      writeJson(qwenPath, { modelProviders: { openai: [{ id: 'qwen3.8-max' }] } })
      const result = await probeAgentModelsDetailed('qwen', { qwenPath, home: dir })
      assert.deepEqual(result, { models: ['qwen3.8-max'], source: 'live' })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('marks Qwen without a provider list as preset', async () => {
    const dir = fixtureDir()
    try {
      const result = await probeAgentModelsDetailed('qwen', { qwenPath: path.join(dir, 'missing.json'), home: dir })
      assert.equal(result.source, 'preset')
      assert.ok(result.models.includes('qwen-max'))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('marks Codex cache rows live and a missing cache as preset', async () => {
    const dir = fixtureDir()
    try {
      const codexPath = path.join(dir, 'models_cache.json')
      writeJson(codexPath, { models: [{ id: 'gpt-live', visibility: 'list' }, { id: 'gpt-hidden', visibility: 'hidden' }] })
      const live = await probeAgentModelsDetailed('codex', { codexPath, home: dir })
      assert.deepEqual(live, { models: ['gpt-live'], source: 'live' })
      const preset = await probeAgentModelsDetailed('codex', { codexPath: path.join(dir, 'absent.json'), home: dir })
      assert.equal(preset.source, 'preset')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never marks Claude as live because the CLI publishes no model list', async () => {
    const result = await probeAgentModelsDetailed('claude', { home: '/nonexistent-home' })
    assert.equal(result.source, 'preset')
    assert.ok(result.models.length > 0)
  })
})

describe('createAgentModelResolver', () => {
  it('serves a cached probe and bypasses it on an explicit refresh', async () => {
    const dir = fixtureDir()
    try {
      const qwenPath = path.join(dir, 'settings.json')
      writeJson(qwenPath, { modelProviders: { openai: [{ id: 'first-model' }] } })
      let clock = 1000
      const resolver = createAgentModelResolver({ now: () => clock, ttlMs: 60000 })
      const first = await resolver.resolve('qwen', { qwenPath, home: dir })
      assert.deepEqual(first.models, ['first-model'])
      writeJson(qwenPath, { modelProviders: { openai: [{ id: 'second-model' }] } })
      clock += 1000
      const cached = await resolver.resolve('qwen', { qwenPath, home: dir })
      assert.deepEqual(cached.models, ['first-model'], 'a probe inside the TTL must not re-read the file')
      clock += 60000
      const expired = await resolver.resolve('qwen', { qwenPath, home: dir })
      assert.deepEqual(expired.models, ['second-model'], 'an expired entry re-reads the source')
      writeJson(qwenPath, { modelProviders: { openai: [{ id: 'third-model' }] } })
      const refreshed = await resolver.resolve('qwen', { qwenPath, home: dir, refresh: true })
      assert.deepEqual(refreshed.models, ['third-model'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('scanLocalAgents model provenance', () => {
  it('names live and preset sources per row', async () => {
    const dir = fixtureDir()
    try {
      const codexPath = path.join(dir, 'models_cache.json')
      const kimiPath = path.join(dir, 'config.toml')
      const qwenPath = path.join(dir, 'settings.json')
      writeJson(codexPath, { models: [{ id: 'gpt-live', visibility: 'list' }] })
      fs.writeFileSync(kimiPath, '[models."kimi-live"]\nprovider = "moonshot"\n')
      writeJson(qwenPath, { modelProviders: { openai: [{ id: 'qwen-live' }] } })
      const rows = await scanLocalAgents(async () => { throw new Error('not installed') }, {
        codexPath,
        kimiPath,
        qwenPath,
        home: dir,
        env: { HOME: dir, PATH: '' },
        resolveModels: createAgentModelResolver({ now: () => 0 }),
      })
      const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
      assert.equal(byId.claude.modelsSource, 'preset')
      assert.equal(byId.codex.modelsSource, 'live')
      assert.deepEqual(byId.codex.models, ['gpt-live'])
      assert.equal(byId.kimi.modelsSource, 'live')
      assert.deepEqual(byId.kimi.models, ['kimi-live'])
      assert.equal(byId.qwen.modelsSource, 'live')
      assert.deepEqual(byId.qwen.models, ['qwen-live'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})