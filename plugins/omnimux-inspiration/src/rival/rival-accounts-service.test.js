import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRivalAccountsService } from './rival-accounts-service.js'

function makeService() {
  const calls = []
  const service = createRivalAccountsService({
    store: { getAccount: (id) => ({ id }) },
    remote: {},
    scheduler: {
      refreshAccount(id, opts) { calls.push({ id, opts }); return { status: 'queued', queued: true } },
      refreshAll(opts) { calls.push({ opts }); return { queued: [], skipped: [] } },
    },
  })
  return { service, calls }
}

describe('service budget overrun boundary', () => {
  it('forwards explicit manual consent and never invents it from default manual behavior', () => {
    const { service, calls } = makeService()
    service.refreshAccount('riv_a', { manual: true, allowBudgetOverrun: true })
    assert.equal(calls[0].opts.manual, true)
    assert.equal(calls[0].opts.allowBudgetOverrun, true)
    service.refreshAccount('riv_a')
    assert.notEqual(calls[1].opts.allowBudgetOverrun, true)
  })

  it('rejects invalid and automatic consent before the scheduler is reached', () => {
    const { service, calls } = makeService()
    for (const allowBudgetOverrun of [undefined, null, 1, 'true', {}, []]) {
      assert.throws(() => service.refreshAccount('riv_a', { manual: true, allowBudgetOverrun }), { code: 'invalid-budget-overrun', status: 400 })
    }
    for (const opts of [{}, { manual: false }, { manual: 1 }]) {
      assert.throws(() => service.refreshAccount('riv_a', { ...opts, allowBudgetOverrun: true }), { code: 'invalid-budget-overrun', status: 400 })
    }
    for (const allowBudgetOverrun of [true, false]) {
      assert.throws(() => service.refreshAll({ manual: true, allowBudgetOverrun }), { code: 'invalid-budget-overrun', status: 400 })
    }
    assert.equal(calls.length, 0)
  })
})
