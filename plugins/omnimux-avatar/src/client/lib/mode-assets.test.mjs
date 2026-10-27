// 视频三模式的素材隔离：每个模式各自持有参考视频、参考图与提示词草稿。
//
// 这些断言挑的是「改错了也不会被别处发现」的契约：
// 模式之间不互相污染、在途上传落在发起它的模式、参考图有上限且保序、
// 再次选中同一条视频即取消。纯函数，不需要 DOM。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_IMAGES,
  MODES,
  appendImage,
  applyUpload,
  assetsOf,
  createSnapshot,
  emptyAssets,
  isMode,
  removeImageAt,
  selectVideo,
  withAssets,
  withPrompt,
} from './mode-assets.js'

const video = (id) => ({ id, name: id, type: 'video', reference: { materialId: id } })
const image = (id) => ({ id, name: id, type: 'image', reference: { materialId: id } })

test('三个模式各自保存参考视频与参考图，切换后互不污染且能恢复', () => {
  assert.deepEqual([...MODES], ['motion', 'replace', 'recreate'])

  let snapshot = createSnapshot()
  snapshot = selectVideo(snapshot, 'motion', video('m-video'))
  snapshot = appendImage(snapshot, 'motion', image('m-image'))
  snapshot = selectVideo(snapshot, 'replace', video('r-video'))
  snapshot = appendImage(snapshot, 'replace', image('r-image'))
  snapshot = selectVideo(snapshot, 'recreate', video('c-video'))
  snapshot = appendImage(snapshot, 'recreate', image('c-image'))

  // 切到任意模式都只看到自己那一份
  assert.equal(assetsOf(snapshot, 'motion').video.id, 'm-video')
  assert.deepEqual(assetsOf(snapshot, 'motion').images.map((row) => row.id), ['m-image'])
  assert.equal(assetsOf(snapshot, 'replace').video.id, 'r-video')
  assert.deepEqual(assetsOf(snapshot, 'replace').images.map((row) => row.id), ['r-image'])
  assert.equal(assetsOf(snapshot, 'recreate').video.id, 'c-video')
  assert.deepEqual(assetsOf(snapshot, 'recreate').images.map((row) => row.id), ['c-image'])

  // 在复刻里加图，动作复刻与角色替换的已选素材原样保留
  const grown = appendImage(snapshot, 'recreate', image('c-image-2'))
  assert.deepEqual(assetsOf(grown, 'recreate').images.map((row) => row.id), ['c-image', 'c-image-2'])
  assert.deepEqual(assetsOf(grown, 'motion').images.map((row) => row.id), ['m-image'])
  assert.deepEqual(assetsOf(grown, 'replace').images.map((row) => row.id), ['r-image'])
})

test('在途上传落在发起它的模式，当前模式已经切走也不改落点', () => {
  let snapshot = createSnapshot()
  // 用户在动作复刻里发起上传，等待期间切到了爆款复刻
  const originMode = 'motion'
  const currentMode = 'recreate'
  snapshot = selectVideo(snapshot, currentMode, video('c-video'))

  snapshot = applyUpload(snapshot, originMode, image('late-image'))
  assert.deepEqual(assetsOf(snapshot, originMode).images.map((row) => row.id), ['late-image'])
  assert.deepEqual(assetsOf(snapshot, currentMode).images, [])

  // 视频上传同理，落在发起模式而不是当前模式
  snapshot = applyUpload(snapshot, originMode, video('late-video'))
  assert.equal(assetsOf(snapshot, originMode).video.id, 'late-video')
  assert.equal(assetsOf(snapshot, currentMode).video.id, 'c-video')

  // 上传结果为空时不改任何模式
  assert.deepEqual(applyUpload(snapshot, originMode, null), snapshot)
})

test('参考图按发起顺序落位，同 id 不重复且最多 30 张', () => {
  let snapshot = createSnapshot()
  for (let index = 1; index <= MAX_IMAGES + 5; index += 1) {
    snapshot = appendImage(snapshot, 'recreate', image(`i${index}`))
  }
  const images = assetsOf(snapshot, 'recreate').images
  assert.equal(images.length, MAX_IMAGES)
  assert.equal(images[0].id, 'i1')
  assert.equal(images.at(-1).id, `i${MAX_IMAGES}`)

  const again = appendImage(snapshot, 'recreate', image('i3'))
  assert.equal(assetsOf(again, 'recreate').images.length, MAX_IMAGES)
  assert.equal(again, snapshot, '重复图片应当原样返回，不产生新快照')
})

test('再次选中同一条参考视频即取消，其它模式的视频不受影响', () => {
  let snapshot = createSnapshot()
  snapshot = selectVideo(snapshot, 'motion', video('same'))
  snapshot = selectVideo(snapshot, 'replace', video('same'))
  const cancelled = selectVideo(snapshot, 'motion', video('same'))
  assert.equal(assetsOf(cancelled, 'motion').video, null)
  assert.equal(assetsOf(cancelled, 'replace').video.id, 'same')
})

test('提示词草稿与开关按模式各自保存，切换模式不改写另一份', () => {
  let snapshot = createSnapshot()
  snapshot = withPrompt(snapshot, 'motion', '动作说明')
  snapshot = withPrompt(snapshot, 'recreate', '复刻意图')
  snapshot = withAssets(snapshot, 'recreate', { promptOn: true })

  assert.equal(assetsOf(snapshot, 'motion').prompt, '动作说明')
  assert.equal(assetsOf(snapshot, 'motion').promptOn, false)
  assert.equal(assetsOf(snapshot, 'recreate').prompt, '复刻意图')
  assert.equal(assetsOf(snapshot, 'recreate').promptOn, true)

  // 清空一个模式的草稿不影响另一个
  const cleared = withPrompt(snapshot, 'recreate', '')
  assert.equal(assetsOf(cleared, 'recreate').prompt, '')
  assert.equal(assetsOf(cleared, 'motion').prompt, '动作说明')
})

test('按序号移除参考图只动目标模式，越界时不产生新快照', () => {
  let snapshot = createSnapshot()
  snapshot = appendImage(snapshot, 'motion', image('a'))
  snapshot = appendImage(snapshot, 'motion', image('b'))
  snapshot = appendImage(snapshot, 'replace', image('c'))

  const removed = removeImageAt(snapshot, 'motion', 0)
  assert.deepEqual(assetsOf(removed, 'motion').images.map((row) => row.id), ['b'])
  assert.deepEqual(assetsOf(removed, 'replace').images.map((row) => row.id), ['c'])
  assert.equal(removeImageAt(snapshot, 'motion', 9), snapshot)
})

test('未知模式与脏快照退化为空槽，渲染路径不抛错', () => {
  assert.equal(isMode('recreate'), true)
  assert.equal(isMode('unknown'), false)
  assert.deepEqual(assetsOf(null, 'motion'), emptyAssets())
  assert.deepEqual(assetsOf({ motion: 'broken' }, 'motion'), emptyAssets())
  assert.deepEqual(assetsOf(createSnapshot(), 'unknown'), emptyAssets())
  // 空快照的每个模式都互相独立，改一个不会带上另一个
  const snapshot = withAssets(createSnapshot(), 'replace', { video: video('only') })
  assert.equal(assetsOf(snapshot, 'motion').video, null)
})
