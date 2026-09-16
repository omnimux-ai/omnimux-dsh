import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const recycled = []
import { createLocalStore } from './local-store.js'
test('all row deletion paths recycle only owned ordinary media', async () => {
 const dir = mkdtempSync(join(tmpdir(), 'inspiration-boundary-'))
 try {
  const paths = { dir, libraryFile: join(dir, 'library.json'), coversDir: join(dir, 'media/covers'), videosDir: join(dir, 'media/videos'), imagesDir: join(dir, 'media/images') }
  const store = createLocalStore({ paths, recycleFile: async (path) => { recycled.push(path); return true } })
  store.add({ title: 'init' })
  const outside = join(dir, 'original.mp4'); writeFileSync(outside, 'keep')
  const sibling = join(dir, 'media/videos-evil'); mkdirSync(sibling); const siblingFile = join(sibling, 'file.mp4'); writeFileSync(siblingFile, 'keep')
  const owned = join(paths.videosDir, 'own.mp4'); writeFileSync(owned, 'owned')
  const link = join(paths.videosDir, 'link.mp4'); symlinkSync(outside, link)
  const parent = join(paths.videosDir, 'escape'); symlinkSync(sibling, parent)
  for (const path of [outside, siblingFile, link, join(parent, 'file.mp4'), paths.videosDir, owned]) {
   const row = store.add({ title: path, local_paths: { video: path } }); store.delete(row.id)
  }
  await store.settled()
  assert.deepEqual(recycled, [realpathSync(owned)])
  const row = store.add({ title: 'updated' }); store.update(row.id, { local_paths: { video: outside } }); store.deleteBatch([row.id]); await store.settled()
  assert.deepEqual(recycled, [realpathSync(owned)])
 } finally { rmSync(dir, { recursive: true, force: true }) }
})
