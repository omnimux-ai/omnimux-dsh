import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { TEXT_KEY_PROVIDERS, providerById } from './text-key-providers.js'
import { DEFAULT_PROVIDER_ENDPOINTS } from '../byok/http.js'
import { BYOK_PROVIDERS } from '../settings/runtime-mode.js'

const here = dirname(fileURLToPath(import.meta.url))
const panelSource = readFileSync(join(here, 'TextKeyPanel.jsx'), 'utf8')
const guideSource = readFileSync(join(here, 'RuntimeGuideGate.jsx'), 'utf8')
const sectionSource = readFileSync(join(here, 'RuntimeModeSection.jsx'), 'utf8')

describe('first-run text key providers', () => {
  it('ships the seven providers from the approved reference', () => {
    assert.deepEqual(TEXT_KEY_PROVIDERS.map((item) => item.id), [
      'anthropic', 'openai', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix',
    ])
    for (const item of TEXT_KEY_PROVIDERS) {
      assert.ok(item.label, `${item.id} needs a label`)
      assert.ok(item.quickLabel, `${item.id} needs a quick-fill label`)
      assert.match(item.endpoint, /^https:\/\//, `${item.id} needs an https endpoint`)
      assert.ok(item.models.length > 0, `${item.id} needs at least one text model`)
    }
  })

  it('falls back to the first provider for an unknown id', () => {
    assert.equal(providerById('nope').id, 'anthropic')
    assert.equal(providerById(undefined).id, 'anthropic')
  })

  it('keeps the client catalogue in sync with the server allowlist and defaults', () => {
    for (const item of TEXT_KEY_PROVIDERS) {
      assert.ok(BYOK_PROVIDERS.includes(item.id), `${item.id} must be accepted by the server`)
      assert.equal(DEFAULT_PROVIDER_ENDPOINTS[item.id], item.endpoint, item.id)
    }
  })
})

describe('first-run text key panel', () => {
  it('only configures the text conversation model', () => {
    assert.match(panelSource, /models:\s*\{\s*text:\s*model\.trim\(\)\s*\}/)
    assert.match(panelSource, /capabilities:\s*\['text'\]/)
    assert.match(panelSource, /runtime\.apiKeyRequired/)
    assert.doesNotMatch(panelSource, /CONSUMPTION_SCENARIOS/)
    assert.doesNotMatch(panelSource, /runtime\.scenario\./)
    assert.doesNotMatch(panelSource, /analysis|image|video|audio/)
  })

  it('is the panel mounted by the guide key step instead of the multi-scenario form', () => {
    assert.match(guideSource, /<TextKeyPanel/)
    assert.doesNotMatch(guideSource, /<ByokPanel/)
  })

  it('leaves the settings surface on the multi-scenario provider form', () => {
    assert.match(sectionSource, /ProviderConfigPanel/)
    assert.doesNotMatch(sectionSource, /TextKeyPanel/)
  })
})
