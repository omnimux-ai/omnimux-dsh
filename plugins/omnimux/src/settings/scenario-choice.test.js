import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSettingsSection } from './schema.js'
import { resolveScenarioChoice, resolveScenarioBindings, readScenarioSettings } from './runtime-mode.js'

test('media settings do not change an explicitly chosen text assistant', () => {
  const settings = parseSettingsSection({ runtimeMode: 'key', runtimeAgentId: 'fixture-agent', runtimeAgentVerified: true,
    scenarioBindings: { text: { channel: 'agent' }, image: { channel: 'byok', provider: 'custom' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'] }] })
  assert.equal(resolveScenarioChoice(settings, 'text').channel, 'agent')
  assert.equal(resolveScenarioChoice(settings, 'text').configured, true)
  assert.equal(resolveScenarioChoice(settings, 'image').provider, 'custom')
  assert.equal(resolveScenarioChoice(settings, 'image').model, 'fixture-image')
})

test('a partial new binding never lets the legacy global choice decide other scenarios', () => {
  const first = { runtimeMode: 'agent', runtimeAgentId: 'fixture', scenarioBindings: { image: { channel: 'official' } } }
  const second = { runtimeMode: 'official', runtimeAgentId: 'fixture', scenarioBindings: { image: { channel: 'official' } } }
  assert.equal(resolveScenarioBindings(first).text.channel, 'pending')
  assert.equal(resolveScenarioBindings(second).text.channel, 'pending')
})

test('raw user evidence wins over schema default choices during legacy migration', () => {
  const raw = { runtimeMode: 'key', runtimeKeyEndpoint: 'https://legacy.invalid/v1', runtimeKeyModel: 'unknown-purpose' }
  const settings = readScenarioSettings({ describe: () => [{ ns: 'omnimux', user: raw, value: parseSettingsSection({}) }] })
  assert.equal(resolveScenarioChoice(settings, 'text').channel, 'pending')
})

test('partially saved provider is never executable even with old models present', () => {
  const choice = resolveScenarioChoice({ scenarioBindings: { image: { channel: 'byok', provider: 'custom' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'], saveState: 'pending' }] }, 'image')
  assert.equal(choice.configured, false)
  assert.equal(choice.model, 'fixture-image')
})
