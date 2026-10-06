import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  HUB_VIDS_MODEL_ID,
  HUB_VIDS_PROGRESS_STAGES,
  buildHubVidsRequest,
  createHubVidsGenerator,
  resolveHubVidsDuration,
  resolveHubVidsOperation,
} from './hubVidsGenerator.js'

function tempMediaDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hub-vids-'))
}

/**
 * 记录每次中枢调用的假缝：写出一份成片字节并回上游任务号与取片地址。
 * @param {{ taskId?: string, url?: string, onExecute?: Function }} [opts]
 */
function recordingSeam(opts = {}) {
  const calls = []
  const taskId = opts.taskId ?? '0123456789abcdef01234567'
  const url = opts.url ?? `http://127.0.0.1:8080/videos/${taskId}/content`
  return {
    calls,
    async execute(request) {
      calls.push(request)
      if (opts.onExecute) return opts.onExecute(request)
      fs.writeFileSync(request.dest, Buffer.alloc(2048, 7))
      return { mode: 'live', model: HUB_VIDS_MODEL_ID, taskId, url, dest: request.dest }
    },
  }
}

test('resolveHubVidsOperation 由模式派生四种操作，未知模式不猜', () => {
  assert.equal(resolveHubVidsOperation({ mode: 'create' }), 'text_to_video')
  assert.equal(resolveHubVidsOperation({ mode: 'animate' }), 'first_frame')
  assert.equal(resolveHubVidsOperation({ mode: 'modify' }), 'video_edit')
  assert.equal(resolveHubVidsOperation({ mode: 'extend' }), 'video_extend')
  assert.equal(resolveHubVidsOperation({ operation: 'video_extend', mode: 'create' }), 'video_extend')
  assert.throws(() => resolveHubVidsOperation({ operation: '__bogus__' }), /不支持操作/)
  assert.throws(() => resolveHubVidsOperation({ mode: '__bogus__' }), /无法确定/)
})

test('resolveHubVidsDuration 把 seconds 映射成中枢 duration', () => {
  assert.equal(resolveHubVidsDuration({ seconds: 8 }), 8)
  assert.equal(resolveHubVidsDuration({ durationSec: 12 }), 12)
  assert.equal(resolveHubVidsDuration({ duration: 4 }), 4)
  assert.equal(resolveHubVidsDuration({}), 10)
})

test('buildHubVidsRequest 逐模式构造中枢请求体', () => {
  assert.deepEqual(
    buildHubVidsRequest({
      dest: '/tmp/a.mp4',
      operation: 'text_to_video',
      prompt: '一只猫在草地上奔跑',
      duration: 10,
      resolution: '1080p',
      aspectRatio: 'landscape',
      image: 'http://127.0.0.1/x.png',
      sourceVideo: 'http://127.0.0.1/v.mp4',
    }),
    {
      dest: '/tmp/a.mp4',
      model: HUB_VIDS_MODEL_ID,
      operation: 'text_to_video',
      prompt: '一只猫在草地上奔跑',
      duration: 10,
      resolution: '1080p',
      aspectRatio: 'landscape',
    },
  )

  assert.deepEqual(
    buildHubVidsRequest({
      dest: '/tmp/b.mp4',
      operation: 'first_frame',
      prompt: '让海浪动起来',
      duration: 6,
      image: 'http://127.0.0.1:43120/omnimux-video/api/veo/media/vids_upload_1.png',
    }),
    {
      dest: '/tmp/b.mp4',
      model: HUB_VIDS_MODEL_ID,
      operation: 'first_frame',
      prompt: '让海浪动起来',
      duration: 6,
      image: 'http://127.0.0.1:43120/omnimux-video/api/veo/media/vids_upload_1.png',
    },
  )

  const edit = buildHubVidsRequest({
    dest: '/tmp/c.mp4',
    operation: 'video_edit',
    prompt: '把外套换成红色',
    duration: 8,
    image: 'http://127.0.0.1:43120/omnimux-video/api/veo/media/replacement.png',
    sourceVideo: 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content',
  })
  assert.deepEqual(edit.references, [
    { type: 'video', role: 'source', pathOrUrl: 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content' },
  ])
  assert.equal(edit.image, 'http://127.0.0.1:43120/omnimux-video/api/veo/media/replacement.png')

  const extend = buildHubVidsRequest({
    dest: '/tmp/d.mp4',
    operation: 'video_extend',
    prompt: '继续向前走',
    duration: 4,
    sourceVideo: 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content',
  })
  assert.deepEqual(extend.references, [
    { type: 'video', role: 'source', pathOrUrl: 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content' },
  ])
  assert.equal('image' in extend, false)
})

test('buildHubVidsRequest 缺必需素材时报可读原因', () => {
  assert.throws(
    () => buildHubVidsRequest({ dest: '/tmp/x.mp4', operation: 'first_frame', prompt: '动起来', duration: 6 }),
    /动画模式需要一张可被本机服务抓取的图片/,
  )
  assert.throws(
    () => buildHubVidsRequest({ dest: '/tmp/x.mp4', operation: 'video_edit', prompt: '换装', duration: 6, image: 'http://x/1.png' }),
    /修改模式需要一条前序视频的取片地址/,
  )
  assert.throws(
    () => buildHubVidsRequest({ dest: '/tmp/x.mp4', operation: 'video_extend', prompt: '延续', duration: 6 }),
    /延续模式需要一条前序视频的取片地址/,
  )
  assert.throws(
    () => buildHubVidsRequest({ dest: '/tmp/x.mp4', operation: 'video_edit', prompt: '换装', duration: 6, sourceVideo: 'http://x/v.mp4' }),
    /修改模式需要一张可被本机服务抓取的替换图片/,
  )
  assert.throws(
    () => buildHubVidsRequest({ dest: '/tmp/x.mp4', operation: 'text_to_video', prompt: '  ', duration: 6 }),
    /必须提供有效的视频生成提示词/,
  )
})

test('四种模式各自映射出确切的中枢请求（create 不带多余字段）', async () => {
  const mediaDir = tempMediaDir()

  const createSeam = recordingSeam()
  const createGenerate = createHubVidsGenerator({ seam: createSeam, mediaDir })
  const createResult = await createGenerate({
    prompt: '一只猫在草地上奔跑',
    mode: 'create',
    seconds: 8,
    resolution: '1080p',
    aspectRatio: 'landscape',
    imageUrl: 'http://127.0.0.1:43120/omnimux-video/api/veo/media/ignored.png',
    videoId: 'task_veo_ignored',
  })
  const createRequest = createSeam.calls[0]
  assert.equal(createRequest.model, HUB_VIDS_MODEL_ID)
  assert.equal(createRequest.operation, 'text_to_video')
  assert.equal(createRequest.duration, 8)
  assert.equal(createRequest.resolution, '1080p')
  assert.equal(createRequest.aspectRatio, 'landscape')
  assert.equal('image' in createRequest, false)
  assert.equal('references' in createRequest, false)
  assert.equal('seconds' in createRequest, false)
  assert.equal(createRequest.dest, path.join(mediaDir, path.basename(createRequest.dest)))
  assert.equal(createResult.fileName, path.basename(createRequest.dest))
  assert.equal(createResult.localPath, createRequest.dest)
  assert.equal(createResult.fileSize, 2048)
  assert.equal(createResult.durationSec, 8)
  assert.equal(createResult.upstreamTaskId, '0123456789abcdef01234567')
  assert.equal(createResult.upstreamUrl, 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content')

  const animateSeam = recordingSeam()
  const animateGenerate = createHubVidsGenerator({ seam: animateSeam, mediaDir })
  await animateGenerate({
    prompt: '让画面里的海浪动起来',
    mode: 'animate',
    seconds: 6,
    imageUrl: 'http://127.0.0.1:43120/omnimux-video/api/veo/media/frame.png',
  })
  const animateRequest = animateSeam.calls[0]
  assert.equal(animateRequest.operation, 'first_frame')
  assert.equal(animateRequest.image, 'http://127.0.0.1:43120/omnimux-video/api/veo/media/frame.png')
  assert.equal(animateRequest.duration, 6)
  assert.equal('references' in animateRequest, false)

  const sourceUrl = 'http://127.0.0.1:8080/videos/0123456789abcdef01234567/content'
  const modifySeam = recordingSeam()
  const modifyGenerate = createHubVidsGenerator({
    seam: modifySeam,
    mediaDir,
    resolveSourceVideo: (taskId) => (taskId === 'task_veo_prev' ? sourceUrl : { url: '', reason: '没有找到该任务记录' }),
  })
  await modifyGenerate({
    prompt: '把外套换成红色',
    mode: 'modify',
    seconds: 8,
    imageUrl: 'http://127.0.0.1:43120/omnimux-video/api/veo/media/replacement.png',
    videoId: 'task_veo_prev',
  })
  const modifyRequest = modifySeam.calls[0]
  assert.equal(modifyRequest.operation, 'video_edit')
  assert.deepEqual(modifyRequest.references, [{ type: 'video', role: 'source', pathOrUrl: sourceUrl }])
  assert.equal(modifyRequest.image, 'http://127.0.0.1:43120/omnimux-video/api/veo/media/replacement.png')
  assert.equal('video_id' in modifyRequest, false)

  const extendSeam = recordingSeam()
  const extendGenerate = createHubVidsGenerator({
    seam: extendSeam,
    mediaDir,
    resolveSourceVideo: () => sourceUrl,
  })
  await extendGenerate({
    prompt: '描述这个片段结尾之后发生什么',
    mode: 'extend',
    seconds: 4,
    videoId: 'task_veo_prev',
  })
  const extendRequest = extendSeam.calls[0]
  assert.equal(extendRequest.operation, 'video_extend')
  assert.deepEqual(extendRequest.references, [{ type: 'video', role: 'source', pathOrUrl: sourceUrl }])
  assert.equal('image' in extendRequest, false)
})

test('只上报真实阶段切换，不编造百分比', async () => {
  const mediaDir = tempMediaDir()
  const seam = recordingSeam()
  const generate = createHubVidsGenerator({ seam, mediaDir })
  /** @type {{ phase: string, message: string }[]} */
  const events = []
  await generate({
    prompt: '一只猫',
    mode: 'create',
    seconds: 10,
    onProgress: (evt) => events.push(evt),
  })

  assert.deepEqual(events.map((evt) => evt.phase), [...HUB_VIDS_PROGRESS_STAGES])
  for (const evt of events) {
    assert.equal('percent' in evt, false, `阶段 ${evt.phase} 不得携带编造的百分比`)
    assert.equal(typeof evt.message, 'string')
    assert.ok(evt.message.length > 0)
  }
  // 首个阶段必须在调用中枢之前上报，最后一个在中枢返回之后。
  assert.equal(seam.calls.length, 1)
})

test('中枢缝抛出的可读原因与 code 原样透出，不吞错', async () => {
  const mediaDir = tempMediaDir()
  const failure = Object.assign(
    new Error('本机 Google Vids 通道未配置：请设置 OMNIMUX_VIDS2API_BASE_URL 指向本机 vids2api 服务地址后再试。'),
    { code: 'omnimux-unconfigured' },
  )
  const seam = recordingSeam({ onExecute: () => { throw failure } })
  const generate = createHubVidsGenerator({ seam, mediaDir })

  await assert.rejects(
    () => generate({ prompt: '一只猫', mode: 'create', seconds: 10 }),
    (err) => {
      assert.equal(err.message, failure.message)
      assert.equal(err.code, 'omnimux-unconfigured')
      return true
    },
  )
})

test('中枢缝缺失时报可读原因，不静默回退', async () => {
  const generate = createHubVidsGenerator({ seam: undefined, mediaDir: tempMediaDir() })
  await assert.rejects(
    () => generate({ prompt: '一只猫', mode: 'create', seconds: 10 }),
    /中枢通道不可用/,
  )
})

test('前序任务解析不到时响亮报错，不把插件任务号当上游任务号', async () => {
  const mediaDir = tempMediaDir()
  const seam = recordingSeam()
  const generate = createHubVidsGenerator({
    seam,
    mediaDir,
    resolveSourceVideo: () => ({ url: '', reason: '该任务没有留存上游取片地址' }),
  })

  await assert.rejects(
    () => generate({ prompt: '延续下去', mode: 'extend', seconds: 4, videoId: 'task_veo_unknown' }),
    /无法解析前序任务 task_veo_unknown 的取片地址（该任务没有留存上游取片地址）/,
  )
  assert.equal(seam.calls.length, 0)
})

test('中枢返回但没有产出文件时报可读原因', async () => {
  const mediaDir = tempMediaDir()
  const seam = recordingSeam({
    onExecute: (request) => ({ mode: 'live', model: HUB_VIDS_MODEL_ID, taskId: 'x', url: 'http://x/videos/x/content', dest: request.dest }),
  })
  const generate = createHubVidsGenerator({ seam, mediaDir })
  await assert.rejects(
    () => generate({ prompt: '一只猫', mode: 'create', seconds: 10 }),
    /未产出目标文件/,
  )
})

test('getSeam 懒解析：装载后才出现的缝同样可用', async () => {
  const mediaDir = tempMediaDir()
  const seam = recordingSeam()
  /** @type {{ execute: Function } | undefined} */
  let live
  const generate = createHubVidsGenerator({ getSeam: () => live, mediaDir })

  await assert.rejects(() => generate({ prompt: '一只猫', mode: 'create', seconds: 10 }), /中枢通道不可用/)

  live = seam
  const result = await generate({ prompt: '一只猫', mode: 'create', seconds: 10 })
  assert.equal(result.success, true)
  assert.equal(seam.calls.length, 1)
})
