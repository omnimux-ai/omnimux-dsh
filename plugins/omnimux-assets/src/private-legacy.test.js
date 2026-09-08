import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { apply } from './index.js'

test('no PATH Python: legacy schema uses registered tools and HTTP preview through restart', async (t) => {
  const home = mkdtempSync(new URL('./.private-legacy-', import.meta.url).pathname)
  const env = { ...process.env }
  Object.assign(process.env, { DSH_HOME: home, PATH: '/nonexistent-assets-python', PYTHONHOME: '/untrusted', PYTHONPATH: '/untrusted', DYLD_INSERT_LIBRARIES: '/untrusted/dylib' })
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); rmSync(home, { recursive: true, force: true }) })
  const root = join(home, 'omnimux/assets'); mkdirSync(root, { recursive: true })
  const original = join(home, 'original.png'); writeFileSync(original, 'original media')
  writeFileSync(join(root, 'legacy.png'), 'legacy bytes')
  writeFileSync(join(root, 'library.json'), JSON.stringify({ schema: 2, revision: 1, migrated_mappings: true, assets: [{ id: 'old', name: 'Legacy', type: 'custom', description: 'keep', tags: ['old'], cover_file_id: 'old-file', files: [{ id: 'old-file', relative_path: 'legacy.png' }] }] }))
  writeFileSync(join(root, 'artifacts.json'), JSON.stringify({ schema: 1, revision: 0, artifacts: [] }))
  writeFileSync(join(root, 'mappings.json'), JSON.stringify({ schema: 1, revision: 0, mappings: [] }))
  let handler = null
  const tools = new Map(); const cleanup = []
  let dispose = apply({ tools: { register: (tool) => tools.set(tool.name, tool) }, webServer: { register: (route) => { handler = route.handler; return () => {} } }, effect: (fn) => { const done = fn(); if (typeof done === 'function') cleanup.push(done) } })
  const server = createServer((req, res) => { void handler(req, res) }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { dispose(); for (const done of cleanup) done(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) })
  const base = `http://127.0.0.1:${server.address().port}/omnimux/assets`
  const old = await tools.get('assets_get').execute({ id: 'old' }); assert.equal(old.asset.description, 'keep')
  const preview = await fetch(`${base}/library/preview?id=old&file=old-file`); assert.equal(preview.status, 200); assert.equal(await preview.text(), 'legacy bytes')
  const created = await tools.get('assets_create').execute({ name: 'Imported', files: [original], tags: ['copy'] }); assert.equal(created.ok, true)
  await tools.get('assets_update').execute({ id: created.asset.id, description: 'updated' })
  assert.equal((await tools.get('assets_search').execute({ query: 'Imported' })).assets.length, 1)
  assert.equal(readFileSync(original, 'utf8'), 'original media')
  const state = await fetch(`${base}/state`); assert.equal(state.status, 200)
  await tools.get('assets_delete').execute({ id: created.asset.id, confirm: true })
  assert.equal(readFileSync(original, 'utf8'), 'original media')
  dispose(); for (const done of cleanup.splice(0)) done()
  // The old helper releases flock on EOF; bounded retries only wait for that release.
  let restarted = false
  for (let attempt = 0; attempt < 20 && !restarted; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    dispose = apply({ tools: { register: (tool) => tools.set(tool.name, tool) } })
    try { assert.equal((await tools.get('assets_get').execute({ id: 'old' })).asset.name, 'Legacy'); restarted = true }
    catch (error) { dispose(); if (error.code !== 'storage-busy') throw error }
  }
  assert.equal(restarted, true)
})
