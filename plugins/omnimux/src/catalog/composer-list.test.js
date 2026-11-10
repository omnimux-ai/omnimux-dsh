import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { composeComposerModels, hiddenIdSet, sameModelList } from './composer-list.js'

/** Shipped rows: what the profile says each model looks like. */
function shipped() {
  return [
    { id: 'alpha', name: 'Alpha', contextWindow: 1000000, input: ['text', 'image'] },
    { id: 'beta', name: 'Beta', contextWindow: 500000 },
    { id: 'gamma', name: 'Gamma' },
  ]
}

/** Hub rows: what the execution hub currently serves. */
function hub(...ids) {
  return ids.map((id) => ({ id, label: `Label ${id}` }))
}

describe('composeComposerModels', () => {
  it('keeps the shipped rows for hub-listed ids, in shipped order', () => {
    const out = composeComposerModels({ hubText: hub('gamma', 'alpha'), shippedModels: shipped() })
    assert.deepEqual(out.map((row) => row.id), ['alpha', 'gamma'])
    assert.equal(out[0].contextWindow, 1000000)
    assert.deepEqual(out[0].input, ['text', 'image'])
  })

  it('drops a model the hub no longer lists', () => {
    const out = composeComposerModels({ hubText: hub('alpha', 'gamma'), shippedModels: shipped() })
    assert.deepEqual(out.map((row) => row.id), ['alpha', 'gamma'])
    assert.ok(!out.some((row) => row.id === 'beta'))
  })

  it('subtracts the user hidden set', () => {
    const out = composeComposerModels({
      hubText: hub('alpha', 'beta', 'gamma'),
      shippedModels: shipped(),
      hiddenIds: ['beta'],
    })
    assert.deepEqual(out.map((row) => row.id), ['alpha', 'gamma'])
  })

  it('cannot add a model the hub does not list, however configured', () => {
    // `beta` is shipped and not hidden, but the hub dropped it: membership wins.
    const out = composeComposerModels({
      hubText: hub('alpha'),
      shippedModels: shipped(),
      hiddenIds: [],
    })
    assert.deepEqual(out.map((row) => row.id), ['alpha'])
  })

  it('appends hub-only ids after shipped rows and carries a declared execution profile', () => {
    const out = composeComposerModels({
      hubText: [
        { id: 'delta', label: 'Label delta', executionProfile: {
          contextWindowTokens: 12345,
          maxOutputTokens: 678,
          inputModalities: ['text', 'image', 'video'],
          reasoningEfforts: { low: 'low', high: 'high' },
        } },
        hub('alpha')[0],
      ],
      shippedModels: shipped(),
    })
    assert.deepEqual(out.map((row) => row.id), ['alpha', 'delta'])
    const added = out.find((row) => row.id === 'delta')
    assert.deepEqual(added, {
      id: 'delta',
      name: 'Label delta',
      contextWindow: 12345,
      maxTokens: 678,
      input: ['text', 'image'],
      reasoningEfforts: { low: 'low', high: 'high' },
    })
    // Values the gateway does not declare are not guessed.
    assert.equal('promptCaching' in added, false)
  })

  it('lets the gateway profile update a shipped row without dropping its display name', () => {
    const out = composeComposerModels({
      hubText: [{ id: 'alpha', label: 'Gateway Alpha', executionProfile: {
        contextWindowTokens: 999,
        maxOutputTokens: 111,
        inputModalities: ['text'],
      } }],
      shippedModels: shipped(),
    })
    assert.equal(out[0].name, 'Alpha')
    assert.equal(out[0].contextWindow, 999)
    assert.equal(out[0].maxTokens, 111)
    assert.deepEqual(out[0].input, ['text'])
  })

  it('keeps only id and label when the hub has no execution profile', () => {
    const out = composeComposerModels({ hubText: hub('delta'), shippedModels: shipped() })
    assert.deepEqual(out.find((row) => row.id === 'delta'), { id: 'delta', name: 'Label delta' })
  })

  it('falls back to the id as the label when the hub states none', () => {
    const out = composeComposerModels({ hubText: [{ id: 'epsilon' }], shippedModels: shipped() })
    assert.deepEqual(out, [{ id: 'epsilon', name: 'epsilon' }])
  })

  it('returns an empty list for an empty hub bucket, leaving the caller to gate', () => {
    assert.deepEqual(composeComposerModels({ hubText: [], shippedModels: shipped() }), [])
  })

  it('ignores hidden ids that reference nothing', () => {
    const out = composeComposerModels({
      hubText: hub('alpha'),
      shippedModels: shipped(),
      hiddenIds: ['ghost'],
    })
    assert.deepEqual(out.map((row) => row.id), ['alpha'])
  })

  it('de-duplicates repeated hub and hidden entries', () => {
    const out = composeComposerModels({
      hubText: hub('alpha', 'alpha'),
      shippedModels: [...shipped(), { id: 'alpha', name: 'Alpha again' }],
      hiddenIds: ['ghost', 'ghost'],
    })
    assert.deepEqual(out.map((row) => row.id), ['alpha'])
    assert.equal(out[0].name, 'Alpha')
  })

  it('does not mutate its inputs', () => {
    const hubRows = hub('alpha')
    const shippedRows = shipped()
    const out = composeComposerModels({ hubText: hubRows, shippedModels: shippedRows })
    out[0].name = 'mutated'
    assert.equal(shippedRows[0].name, 'Alpha')
    assert.equal(hubRows[0].id, 'alpha')
  })

  it('survives absent or malformed input', () => {
    assert.deepEqual(composeComposerModels({}), [])
    assert.deepEqual(composeComposerModels(undefined), [])
    assert.deepEqual(composeComposerModels({ hubText: [null, 7, { id: '  ' }], shippedModels: [null, 'x'] }), [])
  })
})

describe('hiddenIdSet', () => {
  it('trims, drops blanks, and ignores non-strings', () => {
    assert.deepEqual([...hiddenIdSet([' a ', '', 'b', 7, null])], ['a', 'b'])
    assert.deepEqual([...hiddenIdSet('a,b')], [])
    assert.deepEqual([...hiddenIdSet(undefined)], [])
  })
})

describe('sameModelList', () => {
  it('is order- and key-order-sensitive only where a reader would see it', () => {
    assert.equal(sameModelList([{ id: 'a', name: 'A' }], [{ name: 'A', id: 'a' }]), true)
    assert.equal(sameModelList([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }]), false)
    assert.equal(sameModelList([{ id: 'a' }], [{ id: 'a', name: 'A' }]), false)
  })

  it('treats non-arrays as empty', () => {
    assert.equal(sameModelList(undefined, []), true)
    assert.equal(sameModelList(null, []), true)
  })
})
