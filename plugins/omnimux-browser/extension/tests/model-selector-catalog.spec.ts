// @ts-nocheck
// @vitest-environment jsdom
/**
 * Live model catalog → settings groups: the settings dropdown must show the
 * running instance's models, not the hardcoded subscription snapshot.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { catalogToModelGroups } from '../src/panel/components/ModelSelector.tsx'

describe('catalogToModelGroups', () => {
  it('maps live catalog groups and carries reasoning metadata through', () => {
    const groups = catalogToModelGroups({
      groups: [
        {
          id: 'deepseek-official',
          name: 'DeepSeek',
          models: [
            {
              id: 'deepseek-flash',
              name: 'DeepSeek-V41-Flash',
              reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' },
            },
          ],
        },
        { id: 'codex', name: 'ChatGPT', models: [{ id: 'gpt-6-astra' }] },
      ],
    })
    assert.equal(groups.length, 2)
    assert.equal(groups[0].group, 'DeepSeek')
    assert.equal(groups[0].models[0].id, 'deepseek-flash')
    assert.equal(groups[0].models[0].reasoning.defaultEffort, 'high')
    assert.equal(groups[1].models[0].name, 'gpt-6-astra')
  })

  it('drops malformed groups and empty model rows', () => {
    assert.deepEqual(catalogToModelGroups(null), [])
    assert.deepEqual(catalogToModelGroups({ groups: 'nope' }), [])
    assert.deepEqual(catalogToModelGroups({ groups: [{ models: [] }, { name: 'x' }] }), [])
  })
})
