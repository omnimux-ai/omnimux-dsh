import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'

import { probeAgentAuth } from './auth.js'

const HOME = '/home/test'
const SETTINGS = path.join(HOME, '.qwen', 'settings.json')
const LEGACY = path.join(HOME, '.qwen', 'oauth_creds.json')

/** Read-only in-memory `node:fs` stand-in so probes never touch a real home. */
function virtualFs(entries) {
  const files = new Map(entries)
  return {
    existsSync: (target) => files.has(String(target)),
    readFileSync: (target) => {
      const key = String(target)
      if (!files.has(key)) throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' })
      return files.get(key)
    },
  }
}

function settingsFile(value) {
  return [SETTINGS, typeof value === 'string' ? value : JSON.stringify(value)]
}

describe('probeAgentAuth · qwen settings.json', () => {
  it('reports signed-in when the declared provider key is present in the settings env layer', async () => {
    const fsImpl = virtualFs([settingsFile({
      modelProviders: { openai: [{ id: 'qwen3.8-max', envKey: 'QWENCLOUD_API_KEY' }] },
      env: { QWENCLOUD_API_KEY: 'present-not-read' },
      security: { auth: { selectedType: 'openai' } },
    })])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: {} })
    assert.deepEqual(result, { state: 'signed-in', method: 'file' })
    assert.equal(JSON.stringify(result).includes('present-not-read'), false, 'credential values never ride the verdict')
  })

  it('reports signed-in when the protocol default key exists in the process environment', async () => {
    const fsImpl = virtualFs([settingsFile({
      security: { auth: { selectedType: 'openai' } },
    })])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: { OPENAI_API_KEY: 'x' } })
    assert.deepEqual(result, { state: 'signed-in', method: 'file' })
  })

  it('reports unknown when a protocol is selected but no key is visible', async () => {
    const fsImpl = virtualFs([settingsFile({
      modelProviders: { anthropic: [{ id: 'claude-sonnet-4-5' }] },
      security: { auth: { selectedType: 'anthropic' } },
    })])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: {} })
    assert.deepEqual(result, { state: 'unknown', method: 'file' }, 'a shell-only key is not proof of being signed out')
  })

  it('reports signed-out when neither settings nor legacy credentials exist', async () => {
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl: virtualFs([]), env: {} })
    assert.deepEqual(result, { state: 'signed-out', method: 'file' })
  })

  it('still honours the retired oauth credential store', async () => {
    const fsImpl = virtualFs([[LEGACY, JSON.stringify({ access_token: 'legacy-token' })]])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: {} })
    assert.deepEqual(result, { state: 'signed-in', method: 'file' })
  })

  it('reports unknown for a malformed settings document instead of guessing', async () => {
    const fsImpl = virtualFs([settingsFile('{ not json')])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: {} })
    assert.deepEqual(result, { state: 'unknown', method: 'file' })
  })

  it('reports signed-in for a provider list whose key is present, even without selectedType', async () => {
    const fsImpl = virtualFs([settingsFile({
      modelProviders: { openai: [{ id: 'qwen3.8-max', envKey: 'QWENCLOUD_API_KEY' }] },
      env: { QWENCLOUD_API_KEY: 'present-not-read' },
    })])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: {} })
    assert.deepEqual(result, { state: 'signed-in', method: 'file' }, 'a configured provider with its key is usable')
  })

  it('does not fall back to the protocol default when the provider declares its own envKey', async () => {
    const fsImpl = virtualFs([settingsFile({
      modelProviders: { openai: [{ id: 'qwen3.8-max', envKey: 'DASHSCOPE_API_KEY' }] },
      security: { auth: { selectedType: 'openai' } },
    })])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: { OPENAI_API_KEY: 'other-protocol-key' } })
    assert.deepEqual(result, { state: 'unknown', method: 'file' }, 'an unrelated OPENAI_API_KEY must not stand in for the declared DASHSCOPE_API_KEY')
  })

  it('falls back to the protocol default when the provider entry declares no envKey', async () => {
    const fsImpl = virtualFs([settingsFile({
      modelProviders: { openai: [{ id: 'qwen3.8-max' }] },
      security: { auth: { selectedType: 'openai' } },
    })])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: { OPENAI_API_KEY: 'other-protocol-key' } })
    assert.deepEqual(result, { state: 'signed-in', method: 'file' }, 'without an explicit envKey the protocol default is the source')
  })

  it('does not borrow another provider key for the selected protocol', async () => {
    const fsImpl = virtualFs([settingsFile({
      modelProviders: {
        openai: [{ id: 'qwen3.8-max' }],
        anthropic: [{ id: 'claude-sonnet-4-5' }],
      },
      security: { auth: { selectedType: 'anthropic' } },
    })])
    const result = await probeAgentAuth('qwen', { home: HOME, fsImpl, env: { OPENAI_API_KEY: 'other-protocol-key' } })
    assert.deepEqual(result, { state: 'unknown', method: 'file' }, 'the anthropic protocol must not count an openai key')
  })
})