import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'RuntimeModeSection.jsx'), 'utf8')

async function loadRuntimeModule() {
  const result = await esbuild.build({
    entryPoints: [join(here, 'RuntimeModeSection.jsx')],
    bundle: false,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
  })
  const mod = { exports: {} }
  const fn = new Function('require', 'module', 'exports', result.outputFiles[0].text)
  fn((id) => ({}), mod, mod.exports)
  return mod.exports
}

describe('RuntimeModeSection obsolete legacy models healing (Issue #2632)', () => {
  it('defines OBSOLETE_MODEL_IDS covering known deprecated models', async () => {
    const { OBSOLETE_MODEL_IDS } = await loadRuntimeModule()
    assert.ok(OBSOLETE_MODEL_IDS instanceof Set)
    assert.ok(OBSOLETE_MODEL_IDS.has('gpt-4o'))
    assert.ok(OBSOLETE_MODEL_IDS.has('o1'))
    assert.ok(OBSOLETE_MODEL_IDS.has('o3-mini'))
    assert.ok(OBSOLETE_MODEL_IDS.has('gpt-4.5-preview'))
    assert.ok(OBSOLETE_MODEL_IDS.has('kimi-latest'))
    assert.ok(OBSOLETE_MODEL_IDS.has('moonshot-v1-128k'))
  })

  it('contains self-healing mechanism that clears obsolete model from state and scope', () => {
    // Assert source code contains the self-healing hook
    assert.match(source, /OBSOLETE_MODEL_IDS\.has/)
    assert.match(source, /scope\.set\('runtimeAgentModel',\s*''\)/)
    assert.match(source, /setAgentModel\(''\)/)
  })

  it('heals dirty persistent store by resetting to empty string for obsolete models', async () => {
    const { OBSOLETE_MODEL_IDS } = await loadRuntimeModule()
    const dirtyModels = ['gpt-4o', 'o1', 'o3-mini', 'gpt-4.5-preview', 'kimi-latest']
    
    for (const dirtyModel of dirtyModels) {
      let stateModel = dirtyModel
      let scopeModel = dirtyModel
      const fakeScope = {
        set: async (key, val) => {
          if (key === 'runtimeAgentModel') scopeModel = val
        },
      }

      // Simulate the self-healing logic from AgentPanel
      const rawVal = typeof scopeModel === 'string' ? scopeModel.trim() : ''
      const rawState = typeof stateModel === 'string' ? stateModel.trim() : ''
      const isValObsolete = rawVal !== '' && OBSOLETE_MODEL_IDS.has(rawVal)
      const isStateObsolete = rawState !== '' && OBSOLETE_MODEL_IDS.has(rawState)

      if (isValObsolete || isStateObsolete) {
        stateModel = ''
        await fakeScope.set('runtimeAgentModel', '')
      }

      assert.equal(stateModel, '', `State must be reset to empty for ${dirtyModel}`)
      assert.equal(scopeModel, '', `Scope must be reset to empty for ${dirtyModel}`)
    }
  })

  it('preserves valid modern models without accidental reset', async () => {
    const { OBSOLETE_MODEL_IDS } = await loadRuntimeModule()
    const validModels = ['gpt-6-astra', 'gpt-6-sol', 'gpt-5.6-sol', 'kimi-code/k3', '']
    
    for (const validModel of validModels) {
      let stateModel = validModel
      let scopeModel = validModel
      const fakeScope = {
        set: async (key, val) => {
          if (key === 'runtimeAgentModel') scopeModel = val
        },
      }

      const rawVal = typeof scopeModel === 'string' ? scopeModel.trim() : ''
      const rawState = typeof stateModel === 'string' ? stateModel.trim() : ''
      const isValObsolete = rawVal !== '' && OBSOLETE_MODEL_IDS.has(rawVal)
      const isStateObsolete = rawState !== '' && OBSOLETE_MODEL_IDS.has(rawState)

      if (isValObsolete || isStateObsolete) {
        stateModel = ''
        await fakeScope.set('runtimeAgentModel', '')
      }

      assert.equal(stateModel, validModel, `State must be preserved for ${validModel}`)
      assert.equal(scopeModel, validModel, `Scope must be preserved for ${validModel}`)
    }
  })
})
