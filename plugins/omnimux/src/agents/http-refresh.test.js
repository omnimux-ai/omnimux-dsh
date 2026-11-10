import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Readable } from 'node:stream'

import { registerAgentRoutes } from './http.js'

function fakeRes() {
  return {
    status: 0,
    text: '',
    writeHead(status) { this.status = status },
    end(text) { this.text = text },
    body() { return JSON.parse(this.text) },
  }
}

function fakeReq(method, body, headers = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  stream.method = method
  stream.headers = headers
  return stream
}

function withUrl(req, url) {
  req.url = url
  return req
}

function register(deps) {
  const handlers = new Map()
  registerAgentRoutes({
    register(route) {
      handlers.set(route.path, route.handler)
      return () => handlers.delete(route.path)
    },
  }, Object.assign({ authProbe: async () => ({ state: 'unknown', method: 'none' }) }, deps))
  return handlers
}

const ROW = {
  id: 'codex',
  name: 'Codex CLI',
  installed: true,
  version: 'codex-cli 0.167.0',
  models: ['gpt-live'],
  modelsSource: 'live',
}

describe('agent routes · live model provenance', () => {
  it('keeps modelsSource on every scanned row', async () => {
    const handlers = register({ scan: async () => [ROW] })
    const res = fakeRes()
    await handlers.get('/omnimux/agents')(withUrl(fakeReq('GET'), '/omnimux/agents'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().agents[0].modelsSource, 'live')
    assert.deepEqual(res.body().agents[0].models, ['gpt-live'])
  })

  it('scans without a cache bypass and forwards refresh only for ?refresh=1', async () => {
    const calls = []
    const handlers = register({
      scan: async (options) => {
        calls.push(options)
        return [ROW]
      },
    })
    const watched = handlers.get('/omnimux/agents')
    await watched(withUrl(fakeReq('GET'), '/omnimux/agents'), fakeRes())
    await watched(withUrl(fakeReq('GET'), '/omnimux/agents?refresh=1'), fakeRes())
    assert.deepEqual(calls, [{ refresh: false }, { refresh: true }])
  })

  it('does not let the update check read a stale scan', async () => {
    const scans = []
    const handlers = register({
      scan: async (options) => {
        scans.push(options)
        return [ROW]
      },
      updateCheck: async () => ({ checkedAt: 1, updates: {} }),
    })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/updates')(withUrl(fakeReq('GET'), '/omnimux/agents/updates?refresh=1'), res)
    assert.equal(res.status, 200)
    assert.deepEqual(scans, [{ refresh: true }])
  })
})