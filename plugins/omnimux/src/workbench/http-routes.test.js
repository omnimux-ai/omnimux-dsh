import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLocalRequest, registerWorkbenchHttpRoutes } from './http-routes.js'
import { createHubEventBus } from '../events/hub-event-bus.js'
import { createWorkbenchMailbox } from './mailbox.js'

describe('Workbench HTTP Routes', () => {
  it('isLocalRequest validates origin / referer / sec-fetch-site', () => {
    assert.equal(isLocalRequest({ headers: {} }), true)
    assert.equal(isLocalRequest({ headers: { origin: 'http://127.0.0.1:45120' } }), true)
    assert.equal(isLocalRequest({ headers: { origin: 'http://localhost:45120' } }), true)
    assert.equal(isLocalRequest({ headers: { origin: 'https://evil.com' } }), false)
    assert.equal(isLocalRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), false)
  })

  it('routes register on webServer.register', () => {
    const routes = []
    const fakeServer = {
      register: (route) => {
        routes.push(route)
        return () => {}
      },
    }

    const bus = createHubEventBus()
    const mailbox = createWorkbenchMailbox({ hubEvents: bus })

    const dispose = registerWorkbenchHttpRoutes(fakeServer, { hubEvents: bus, mailbox })

    assert.equal(routes.length, 2)
    const paths = routes.map((r) => r.path)
    assert.equal(paths.includes('/omnimux/events/stream'), false, 'event feed must not hold an HTTP request open')
    assert.ok(paths.includes('/omnimux/workbench/viewport'))
    assert.ok(paths.includes('/omnimux/workbench/rpc/ack'))
    dispose()
  })
})
