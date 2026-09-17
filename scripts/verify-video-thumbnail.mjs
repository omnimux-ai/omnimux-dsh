import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { extractVideoPoster, videoPosterArgs } from '../plugins/omnimux-inspiration/src/media-export.js'
import { maybeEnsureVideoCover } from '../plugins/omnimux-inspiration/src/http-handlers.js'

async function runVerify() {
  console.log('--- 开始验证视频自动首帧截屏与缩略图补全功能 ---')
  const results = []

  // 验证 1: videoPosterArgs 生成的参数
  const args = videoPosterArgs('/tmp/test.mp4', '/tmp/cover.jpg')
  assert.deepEqual(args, ['-y', '-ss', '00:00:00.500', '-i', '/tmp/test.mp4', '-vframes', '1', '-q:v', '2', '/tmp/cover.jpg'])
  results.push({ name: 'ffmpeg args generation', status: 'PASS' })

  // 验证 2: 模拟视频首帧抽取（使用注入 runner）
  const tmpDir = path.resolve('/tmp/omnimux-verify-thumbnail-' + Date.now())
  fs.mkdirSync(tmpDir, { recursive: true })
  const mockVideo = path.join(tmpDir, 'mock.mp4')
  fs.writeFileSync(mockVideo, 'mock video content')

  let runnerCalled = false
  const mockRunner = async (inP, outP) => {
    runnerCalled = true
    fs.writeFileSync(outP, 'fake jpg bytes')
  }

  const generatedPoster = await extractVideoPoster(mockVideo, tmpDir, {
    prefix: 'cover_',
    runFfmpeg: mockRunner,
  })
  assert.ok(runnerCalled, 'runFfmpeg 必须被调用')
  assert.ok(fs.existsSync(generatedPoster), '截取的封面图片必须存在')
  results.push({ name: 'video poster extraction', status: 'PASS', path: generatedPoster })

  // 验证 3: maybeEnsureVideoCover 自动修复缺失封面的视频记录
  const store = {
    updated: null,
    update(id, patch) {
      this.updated = { id, patch }
      return patch
    },
    paths: { coversDir: tmpDir },
  }

  const itemWithoutCover = {
    id: 'insp_test123',
    type: 'video',
    cover_url: '',
    local_paths: { video: mockVideo },
  }

  // 此时 mockVideo 存在，并且我们将测试 targetCoverPath 预置
  const targetCover = path.join(tmpDir, 'cover_test123.jpg')
  fs.writeFileSync(targetCover, 'fake jpg bytes')

  const fixedItem = maybeEnsureVideoCover(itemWithoutCover, store, store.paths)
  assert.equal(fixedItem.cover_url, '/omnimux/inspiration/local/media/covers/cover_test123.jpg')
  assert.equal(fixedItem.local_paths.cover, targetCover)
  results.push({ name: 'auto heal missing cover in item', status: 'PASS' })

  // 清理临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true })

  const evidencePath = path.resolve('docs/evidence/inspiration-video-thumbnail-verify.json')
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8')
  console.log('✅ 验证证据已产出并保存至:', evidencePath)
}

runVerify().catch((err) => {
  console.error('❌ 验证失败:', err)
  process.exit(1)
})
