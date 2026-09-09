import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, cp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { copyExamples } from '../scripts/copy-examples.mjs'

test('draft routes enforce origin, optimistic revision and self-contained media ranges', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'forms-http-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const installed = join(directory, 'installed')
  await mkdir(join(installed, 'src'), { recursive: true })
  await writeFile(join(installed, 'package.json'), '{"type":"module"}')
  await cp(new URL('./index.js', import.meta.url), join(installed, 'src/index.js'))
  await cp(new URL('./store.js', import.meta.url), join(installed, 'src/store.js'))
  await copyExamples(new URL('../../../packages/form-contract/examples', import.meta.url), join(installed, 'assets/examples'))
  const { apply } = await import(pathToFileURL(join(installed, 'src/index.js')).href)
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = directory
  let handler
  const services = { connection: { requestRejection: req => req.headers.cookie === 'session=authorized' ? undefined : 401 }, workspaceRegistry: { get: id => id === 'w' ? { id } : undefined } }
  try { apply({ get: name => services[name], webServer: { register(route) { handler = route.handler; return () => {} } } }) }
  finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous }
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`, path = `${origin}/api/omnimux/forms/draft`
  const query = new URLSearchParams({ workspaceId: 'w', templateId: 't', templateVersion: '1.0.0' })
  assert.equal((await fetch(`${path}?${query}`)).status, 401)
  assert.equal((await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' })).status, 401)
  const connection = services.connection
  services.connection = undefined
  assert.equal((await fetch(`${path}?${query}`)).status, 503)
  services.connection = connection
  const body = { workspaceId: 'w', templateId: 't', templateVersion: '1.0.0', expectedRevision: 0, values: { title: '用户草稿' } }
  assert.equal((await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://attacker.test', Cookie: 'session=authorized' }, body: JSON.stringify(body) })).status, 403)
  const headers = { 'Content-Type': 'application/json', Origin: origin, Cookie: 'session=authorized' }
  assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify(body) })).status, 200)
  assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify(body) })).status, 409)
  assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify({ ...body, workspaceId: 'unknown' }) })).status, 404)
  assert.equal((await fetch(`${path}?${new URLSearchParams({ ...Object.fromEntries(query), workspaceId: 'unknown' })}`, { headers })).status, 404)
  const registry = services.workspaceRegistry
  services.workspaceRegistry = undefined
  assert.equal((await fetch(`${path}?${query}`, { headers })).status, 503)
  services.workspaceRegistry = registry
  const result = await (await fetch(`${path}?${new URLSearchParams({ workspaceId: 'w', templateId: 't', templateVersion: '1.0.0' })}`, { headers })).json()
  assert.equal(result.draft.values.title, '用户草稿')
  const media = await fetch(`${origin}/api/omnimux/forms/examples/replication-demo.mp4`, { headers: { ...headers, Range: 'bytes=0-99' } })
  assert.equal(media.status, 206); assert.equal(media.headers.get('content-type'), 'video/mp4'); assert.equal((await media.arrayBuffer()).byteLength, 100)
  assert.equal((await fetch(`${origin}/api/omnimux/forms/examples/missing.mp4`, { headers })).status, 404)
})
