import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PI_AI_NAMESPACE,
  OMNIMUX_PROVIDER,
  createComposerListSync,
  findDescriptor,
  providerModels,
} from './composer-sync.js'

/** The composition layer `cordis.patch.yml` writes. */
function baseLayer(models) {
  return {
    providers: {
      [OMNIMUX_PROVIDER]: {
        apiKeyEnv: 'OMNIMUX_API_KEY',
        baseURL: 'https://api.omnimux.ai/v1',
        api: 'openai-completions',
        models,
      },
    },
  }
}

function hub(...ids) {
  return ids.map((id) => ({ id, label: `Label ${id}` }))
}

/**
 * A settings provider double that records writes and serves descriptors.
 * @param {{ base?: unknown, user?: unknown, revision?: number, update?: Function, describe?: Function }} [options]
 */
function fakeSettings(options = {}) {
  const state = {
    base: options.base ?? baseLayer([{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }]),
    user: options.user,
    revision: options.revision ?? 3,
  }
  const writes = []
  return {
    state,
    writes,
    describe: options.describe ?? (() => [{
      ns: PI_AI_NAMESPACE,
      base: state.base,
      ...state.user === undefined ? {} : { user: state.user },
      revision: state.revision,
      value: {},
    }]),
    update: options.update ?? (async (ns, patch, revision) => {
      writes.push({ ns, patch, revision })
      state.user = patch
    }),
  }
}

describe('findDescriptor', () => {
  it('finds by namespace and tolerates junk', () => {
    const descriptors = [null, { ns: 'other' }, { ns: PI_AI_NAMESPACE, revision: 1 }]
    assert.equal(findDescriptor(descriptors, PI_AI_NAMESPACE).revision, 1)
    assert.equal(findDescriptor(descriptors, 'missing'), null)
    assert.equal(findDescriptor(undefined, PI_AI_NAMESPACE), null)
  })
})

describe('providerModels', () => {
  it('reads a provider route list, and reports [] for anything else', () => {
    assert.deepEqual(providerModels(baseLayer([{ id: 'a' }])).map((row) => row.id), ['a'])
    assert.deepEqual(providerModels(undefined), [])
    assert.deepEqual(providerModels({ providers: {} }), [])
    assert.deepEqual(providerModels({ providers: { omnimux: { models: 'nope' } } }), [])
  })
})

describe('createComposerListSync', () => {
  it('writes the composed list under the omnimux route', async () => {
    const settings = fakeSettings()
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('beta') })

    assert.equal(result.written, true)
    assert.equal(result.reason, 'written')
    assert.deepEqual(result.modelIds, ['beta'])
    assert.equal(settings.writes.length, 1)
    assert.equal(settings.writes[0].ns, PI_AI_NAMESPACE)
    assert.equal(settings.writes[0].revision, 3)
    // Only the model list is written: the route's credential, address and wire
    // protocol are never re-declared by this sync.
    assert.deepEqual(settings.writes[0].patch, { providers: { omnimux: { models: [{ id: 'beta', name: 'Beta' }] } } })
  })

  it('does not rewrite an already-matching list', async () => {
    const settings = fakeSettings()
    const sync = createComposerListSync({ settings })
    await sync.sync({ hubText: hub('alpha', 'beta') })
    const before = settings.writes.length
    const second = await sync.sync({ hubText: hub('alpha', 'beta') })

    assert.equal(second.written, false)
    assert.equal(second.reason, 'unchanged')
    assert.equal(settings.writes.length, before)
  })

  it('keeps the last accepted list when the hub bucket is empty', async () => {
    const settings = fakeSettings()
    const sync = createComposerListSync({ settings })
    for (const hubText of [[], undefined, null, [{ id: '  ' }]]) {
      const result = await sync.sync({ hubText })
      assert.equal(result.written, false)
      assert.equal(result.reason, 'hub-empty')
    }
    assert.equal(settings.writes.length, 0)
  })

  it('refuses to write an empty list when the user hid every hub-listed model', async () => {
    const settings = fakeSettings()
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('alpha', 'beta'), hiddenIds: ['alpha', 'beta'] })
    assert.equal(result.written, false)
    assert.equal(result.reason, 'hidden-all')
    assert.equal(settings.writes.length, 0)
  })

  it('reports an absent namespace instead of inventing one', async () => {
    const settings = fakeSettings({ describe: () => [{ ns: 'other', revision: 1 }] })
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('alpha') })
    assert.equal(result.written, false)
    assert.equal(result.reason, 'namespace-absent')
  })

  it('never throws out of sync when the settings surface is unusable', async () => {
    for (const settings of [undefined, {}, { describe: () => [] }]) {
      const sync = createComposerListSync({ settings })
      const result = await sync.sync({ hubText: hub('alpha') })
      assert.equal(result.written, false)
      assert.equal(result.reason, 'settings-unavailable')
    }
  })

  it('reports a describe failure without writing', async () => {
    const settings = fakeSettings({ describe: () => { throw new Error('boom') } })
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('alpha') })
    assert.equal(result.written, false)
    assert.equal(result.reason, 'describe-failed')
  })

  it('re-reads and recomposes once when the revision moved under it', async () => {
    let attempt = 0
    const settings = fakeSettings({
      update: async () => {
        attempt += 1
        if (attempt === 1) {
          const error = new Error('settings namespace moved')
          error.code = 'SETTINGS_CONFLICT'
          throw error
        }
      },
    })
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('alpha') })
    assert.equal(attempt, 2)
    assert.equal(result.written, true)
    assert.equal(result.reason, 'written')
  })

  it('gives up after a repeated conflict and leaves the list serving', async () => {
    const settings = fakeSettings({
      update: async () => {
        const error = new Error('settings namespace moved')
        error.code = 'SETTINGS_CONFLICT'
        throw error
      },
    })
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('alpha') })
    assert.equal(result.written, false)
    assert.equal(result.reason, 'conflict')
  })

  it('reports a refused write without retrying a smaller list', async () => {
    const attempts = []
    const settings = fakeSettings({
      update: async () => {
        attempts.push(1)
        throw new Error('settings provider is read-only')
      },
    })
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('alpha', 'beta') })
    assert.equal(result.written, false)
    assert.equal(result.reason, 'write-failed')
    assert.equal(attempts.length, 1)
  })

  it('applies the user hidden set on top of the hub bucket', async () => {
    const settings = fakeSettings()
    const sync = createComposerListSync({ settings })
    const result = await sync.sync({ hubText: hub('alpha', 'beta'), hiddenIds: ['alpha'] })
    assert.deepEqual(result.modelIds, ['beta'])
  })

  it('logs a write and a refusal, and stays silent otherwise', async () => {
    const events = []
    const ok = fakeSettings()
    await createComposerListSync({ settings: ok, log: (event) => events.push(event) }).sync({ hubText: hub('alpha') })
    assert.deepEqual(events, ['composer-list-written'])

    events.length = 0
    await createComposerListSync({ settings: fakeSettings(), log: (event) => events.push(event) }).sync({ hubText: [] })
    assert.deepEqual(events, [])
  })
})
