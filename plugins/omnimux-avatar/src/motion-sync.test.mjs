import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAvatarPaths } from './paths.js'
import { createAvatarStore } from './store.js'

test('视频意图使用同一中枢公共执行面并保留原任务快照', async t => {
  const { createMotion } = await import('./motion.js')
  const home = await mkdtemp(join(tmpdir(), 'avatar-motion-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  const avatar = store.create({ name: '视频角色' })
  const calls = []
  const catalog = { video: [{ id: 'video-test', operations: [{ id: 'video_multi_ref', listed: true, output: { type: 'video' }, inputs: [{ type: 'image', role: 'reference', slot: 'reference_images', max: 9 }, { type: 'video', role: 'reference', slot: 'reference_videos', max: 1 }], parameters: { resolution: { options: ['480p', '720p'] }, aspectRatio: { options: ['16:9', '9:16'] }, duration: { range: [4,30] } } }], channelGroups: [{ id: 'disabled', enabled: false }, { id: 'active', wireGroup: 'wire-active', enabled: true }] }] }
  const ctx = { get(name) {
    if (name === 'modelCatalog') return { list: () => catalog }
    if (name === 'videoGenerate') return { async execute(input) { calls.push(input); return { mode: 'submitted', taskRef: 'accepted-video' } } }
  } }
  const motion = createMotion({ ctx, store, paths })
  const result = await motion.submit({ avatarId: avatar.id, mode: 'motion', images: ['https://example.test/character.png'], video: 'https://example.test/reference.mp4', duration: 8.2, resolution: '480p', aspectRatio: '9:16', prompt: '红色外套' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].operation, 'video_multi_ref')
  assert.equal(calls[0].group, 'wire-active')
  assert.equal(calls[0].aspectRatio, '9:16')
  assert.deepEqual(calls[0].references.map(row => [row.type, row.role]), [['image','reference'],['video','reference']])
  assert.equal(result.task.kind, 'motion')
  assert.equal(result.task.status, 'generating')
  assert.equal(store.findTask(avatar.id, result.task.taskId).input.mode, 'motion')
  assert.equal(store.findTask(avatar.id, result.task.taskId).input.duration, 8.2)
  assert.match(result.dest, /\.mp4$/)
  await assert.rejects(motion.submit({ avatarId: avatar.id, mode: 'replace', images: [], video: '' }), error => error.code === 'invalid_request')
})

test('参考输入由受管文件保存，重开可取同一素材且客户端不能指定磁盘路径', async t => {
  const { createMaterials } = await import('./materials.js')
  const home = await mkdtemp(join(tmpdir(), 'avatar-material-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  const avatar = store.create({ name: '素材角色' })
  const materials = createMaterials({ paths, store, inspect: async (path, type) => ({ mime: type, sizeBytes: 8 }) })
  const saved = await materials.importFile({ avatarId: avatar.id, name: 'reference.png', type: 'image/png', bytes: Buffer.from('test-image') })
  assert.equal(materials.list(avatar.id).length, 1)
  assert.equal(saved.type, 'image')
  assert.equal((await readFile(materials.resolve(avatar.id, saved.id).path)).toString(), 'test-image')
  assert.throws(() => materials.resolve(avatar.id, '../outside'), error => error.code === 'invalid_request')
  const other = store.create({ name: '另一个角色' })
  assert.throws(() => materials.resolve(other.id, saved.id))
})
