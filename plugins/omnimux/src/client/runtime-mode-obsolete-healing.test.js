import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'RuntimeModeSection.jsx'), 'utf8')

describe('RuntimeModeSection preserves user model choices at their source', () => {
  it('has no client model blacklist or parallel known-model list', () => {
    assert.doesNotMatch(source, /OBSOLETE_MODEL_IDS/)
    assert.doesNotMatch(source, /CLI_KNOWN_MODELS/)
  })

  it('does not clear saved model choices while rendering settings', () => {
    assert.doesNotMatch(source, /scope\.set\('runtimeAgentModel',\s*''\)/)
    assert.doesNotMatch(source, /setAgentModel\(''\)/)
  })

  it('uses current host-discovered models and keeps an unmatched stored choice visible', () => {
    assert.match(source, /Array\.isArray\(agent\.models\)/)
    assert.match(source, /!agentModels\.includes\(agentModel\)/)
    assert.match(source, /value: agentModel, label: agentModel/)
  })

  it('keeps model writes in the continue flow', () => {
    assert.match(source, /const handleModelChange = \(nextModel\) => \{/)
    assert.match(source, /setAgentModel\(nextModel\)/)
    assert.match(source, /await scope\.set\('runtimeAgentModel', agentModel\)/)
    assert.match(source, /savedModel === false/)
  })
})
