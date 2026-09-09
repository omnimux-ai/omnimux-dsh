import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFormAttachmentService } from './form-attachments.js'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6KyUAAAAASUVORK5CYII=', 'base64')
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'form-attachments-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cwd = join(root, 'workspace'); await mkdir(cwd)
  const service = createFormAttachmentService({ root: join(root, 'refs'), getWorkspaceRegistry: () => ({ get: id => id === 'ws' ? { path: cwd } : undefined }), getSessionQuery: () => ({ observeSession: async id => ({ header: { cwd: id === 's' ? cwd : root } }) }) })
  const file = () => service.importFile({ workspaceId: 'ws', name: 'real.png', mimeType: 'image/png', bytes: png })
  return { root, cwd, service, file }
}
test('imports real immutable bytes and resolves across service reads without exposing paths', async t => {
  const f = await fixture(t); const file = await f.file()
  assert.equal(file.sizeBytes, png.length); assert.equal(file.mimeType, 'image/png'); assert.ok(file.assetId)
  assert.equal('path' in file, false)
  assert.deepEqual(await f.service.resolveFiles({ workspaceId: 'ws', assetIds: [file.assetId] }), [file])
  await assert.rejects(f.service.resolveFiles({ workspaceId: 'other', assetIds: [file.assetId] }), /workspace/)
  await writeFile(join(f.root, 'refs', file.assetId, 'bytes'), Buffer.alloc(png.length))
  await assert.rejects(f.service.resolveFiles({ workspaceId: 'ws', assetIds: [file.assetId] }), /reference-changed/)
})
test('rejects forged MIME, missing refs and path traversal', async t => {
  const f = await fixture(t)
  await assert.rejects(f.service.importFile({ workspaceId: 'ws', name: 'a.mp4', mimeType: 'video/mp4', bytes: png }))
  await assert.rejects(f.service.resolveFiles({ workspaceId: 'ws', assetIds: ['../../outside'] }), /invalid-reference/)
  await assert.rejects(f.service.resolveFiles({ workspaceId: 'ws', assetIds: ['missing'] }))
})
test('materializes through composer into verified session workspace and reuses a durable receipt', async t => {
  const f = await fixture(t); const file = await f.file()
  const input = { workspaceId: 'ws', requestId: 'r', sessionId: 's', assetIds: [file.assetId] }
  const [a, b] = await Promise.all([f.service.materialize(input), f.service.materialize(input)])
  assert.deepEqual(a, b)
  assert.deepEqual(await readFile(join(f.cwd, a[0].relativePath)), png)
  assert.deepEqual(await f.service.materialize(input), a)
  assert.equal((await readdir(join(f.cwd, 'assets/imported'))).length, 1)
  await assert.rejects(f.service.materialize({ ...input, sessionId: 'other', requestId: 'r2' }), /workspace-mismatch/)
})

test('receipt retry rebuilds changed bytes under a new name and preserves user edits', async t => {
  const f = await fixture(t); const file = await f.file()
  const input = { workspaceId: 'ws', requestId: 'r', sessionId: 's', assetIds: [file.assetId] }
  const first = (await f.service.materialize(input))[0]
  const previous = join(f.cwd, first.relativePath)
  const changed = Buffer.alloc(png.length, 42)
  await writeFile(previous, changed)
  const next = (await f.service.materialize(input))[0]
  assert.notEqual(next.relativePath, first.relativePath)
  assert.deepEqual(await readFile(previous), changed)
  assert.deepEqual(await readFile(join(f.cwd, next.relativePath)), png)
})
test('receipt retry rebuilds deleted file and rejects symlinks without touching their targets', async t => {
  const { symlink, lstat } = await import('node:fs/promises')
  const f = await fixture(t); const file = await f.file()
  const input = { workspaceId: 'ws', requestId: 'r', sessionId: 's', assetIds: [file.assetId] }
  const first = (await f.service.materialize(input))[0]
  await rm(join(f.cwd, first.relativePath))
  const second = (await f.service.materialize(input))[0]
  assert.notEqual(second.relativePath, first.relativePath)
  const external = join(f.root, 'outside.png'); await writeFile(external, png)
  const previous = join(f.cwd, second.relativePath)
  await rm(previous); await symlink(external, previous)
  const third = (await f.service.materialize(input))[0]
  assert.notEqual(third.relativePath, second.relativePath)
  assert.equal((await lstat(previous)).isSymbolicLink(), true)
  assert.deepEqual(await readFile(external), png)
  assert.deepEqual(await readFile(join(f.cwd, third.relativePath)), png)
})
test('materialization refuses symlink import directories before writing outside workspace', async t => {
  const { symlink } = await import('node:fs/promises')
  const f = await fixture(t); const file = await f.file()
  const outside = join(f.root, 'outside'); await mkdir(outside)
  await symlink(outside, join(f.cwd, 'assets'))
  await assert.rejects(f.service.materialize({ workspaceId: 'ws', requestId: 'r', sessionId: 's', assetIds: [file.assetId] }), /import-directory-invalid/)
  assert.deepEqual(await readdir(outside), [])
})
