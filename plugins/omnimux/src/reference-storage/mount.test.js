import test from 'node:test'
import assert from 'node:assert/strict'
import { mountHubHttp } from '../host/http.js'

test('hub mounts protected reference configuration on existing server lifecycle', () => {
  const paths = new Map()
  const server = { register(route) { paths.set(route.path, route); return () => paths.delete(route.path) } }
  const disposers = []
  const ctx = { webServer: server, effect(factory) { disposers.push(factory()) } }
  mountHubHttp(ctx, { homeDir: '/tmp/reference-config-test-unused', hub: { official: {}, apps: {} }, brand: {}, appsStore: { view: () => ({ apps: [] }) }, tabsStore: { remove() {} }, getConnection: () => ({ requestRejection: () => undefined }) })
  assert.ok(paths.has('/omnimux/reference-storage/config'))
  for (const dispose of disposers) dispose()
  assert.equal(paths.has('/omnimux/reference-storage/config'), false)
})
