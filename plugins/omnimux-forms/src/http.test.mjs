import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { apply } from './index.js'

test('draft routes enforce origin, optimistic revision and self-contained media ranges', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'forms-http-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = directory
  let handler
  try { apply({ webServer: { register(route) { handler = route.handler; return () => {} } } }) }
  finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous }
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  const origin = `http://127.0.0.1:${server.address().port}`, path = `${origin}/api/omnimux/forms/draft`
  const body = { workspaceId: 'w', templateId: 't', templateVersion: '1.0.0', expectedRevision: 0, values: { title: '用户草稿' } }
  assert.equal((await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://attacker.test' }, body: JSON.stringify(body) })).status, 403)
  const headers = { 'Content-Type': 'application/json', Origin: origin }
  assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify(body) })).status, 200)
  assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify(body) })).status, 409)
  const result = await (await fetch(`${path}?${new URLSearchParams({ workspaceId: 'w', templateId: 't', templateVersion: '1.0.0' })}`)).json()
  assert.equal(result.draft.values.title, '用户草稿')
  const media = await fetch(`${origin}/api/omnimux/forms/examples/replication-demo.mp4`, { headers: { Range: 'bytes=0-99' } })
  assert.equal(media.status, 206); assert.equal(media.headers.get('content-type'), 'video/mp4'); assert.equal((await media.arrayBuffer()).byteLength, 100)
  assert.equal((await fetch(`${origin}/api/omnimux/forms/examples/missing.mp4`)).status, 404)
})
