// 爆款复刻：拆解流水线与提交体。用 stub seam 驱动，不发任何真实模型请求。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAvatarPaths } from './paths.js'
import { createAvatarStore } from './store.js'
import { createMotion, probeDuration } from './motion.js'
import { createRecreate, clampDuration, framePlan, parseAnalysis } from './recreate.js'
import { registerAvatarRoutes } from './http.js'

const CATALOG = {
  video: [{
    id: 'video-test',
    operations: [{
      id: 'video_multi_ref', listed: true, output: { type: 'video' },
      inputs: [
        { type: 'image', role: 'reference', slot: 'reference_images', max: 30 },
        { type: 'video', role: 'reference', slot: 'reference_videos', max: 1 },
      ],
      parameters: { resolution: { options: ['480p', '720p'] }, aspectRatio: { options: ['16:9', '9:16'] }, duration: { range: { min: 4, max: 30 } } },
    }],
    channelGroups: [{ id: 'active', wireGroup: 'wire-active', enabled: true }],
  }],
}

const ANALYSIS_JSON = JSON.stringify({
  shots: [
    { shot_id: 's1', start_s: 0, end_s: 2.4, shot_size: '近景', narrative_job: '开场钩子' },
    { shot_id: 's2', start_s: 2.4, end_s: 6, shot_size: '中景', narrative_job: '演示产品' },
  ],
  hook: { mechanism: ['前三秒给出反差', '直视镜头'], why_it_stops_scroll: '反常识开场' },
})

const COMPOSED = '镜头1：image 1 主体直视镜头，画面干净、无字幕、无水印。'

/** 只记录调用、绝不发真实请求的上下文；frames=false 表示宿主没装抽帧能力。 */
function makeCtx({ frames = true, breakdown = ANALYSIS_JSON, composed = COMPOSED } = {}) {
  const calls = { videoProcess: [], textComplete: [], videoGenerate: [] }
  const ctx = {
    get(name) {
      if (name === 'modelCatalog') return { list: () => CATALOG }
      if (name === 'videoProcess' && frames) return {
        async execute(request) {
          calls.videoProcess.push(request)
          // 尾部时间点取不到帧是正常情况（长镜头关键帧对齐）：最后一段时间故意不给文件。
          if (request.input.timeSeconds > 5.5) return { mode: 'live', files: [] }
          await writeFile(request.dest, 'jpeg-bytes')
          return { mode: 'live', files: [{ path: request.dest, kind: 'image', meta: { timeSeconds: request.input.timeSeconds } }] }
        },
      }
      if (name === 'textComplete') return {
        async execute(request) {
          calls.textComplete.push(request)
          return { mode: 'live', model: 'text-test', text: calls.textComplete.length === 1 ? breakdown : composed }
        },
      }
      if (name === 'videoGenerate') return {
        async execute(request) { calls.videoGenerate.push(request); return { mode: 'submitted', taskRef: 'accepted-video' } },
      }
      if (name === 'assetLibrary') return { findBySource: () => null, async saveTypedAsset() {} }
      return undefined
    },
  }
  return { ctx, calls }
}

async function boot(t) {
  const home = await mkdtemp(join(tmpdir(), 'avatar-recreate-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const paths = resolveAvatarPaths({ homeDir: home })
  const store = createAvatarStore({ paths })
  const avatar = store.create({ name: '复刻角色' })
  // 参考视频 6.5 秒、9:16；withVideo=false 时资产里不会出现 video 条目。
  const resolveAssets = async (input, { withVideo = true } = {}) => ({
    duration: 6.5,
    aspectRatio: '9:16',
    species: '',
    assets: [
      ...input.images.map((_, index) => ({ type: 'image', role: 'reference', targetSlot: 'reference_images', pathOrUrl: `/owned/image-${index + 1}.png` })),
      ...(withVideo ? [{ type: 'video', role: 'reference', targetSlot: 'reference_videos', pathOrUrl: '/owned/reference.mp4' }] : []),
    ],
  })
  return { paths, store, avatar, resolveAssets }
}

const reference = index => ({ materialId: `00000000-0000-0000-0000-00000000000${index}` })

test('等距抽帧：无剪切点的长镜头也必须抽到帧，不用场景检测', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  const result = await recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9), prompt: '换成我的产品' })
  // 回归钉子：一旦有人改回场景检测，这里立刻红。
  assert.ok(calls.videoProcess.length >= 6, '至少按 6 个时间点抽帧')
  assert.ok(calls.videoProcess.every(call => call.capability === 'video_thumbnail_extract'), '只用等距抽帧能力')
  assert.ok(calls.videoProcess.every(call => call.input.extractFrames === undefined), '不传场景检测专用参数')
  assert.ok(calls.videoProcess.every(call => call.input.maxEdge === 512), '抽帧长边 512')
  assert.ok(calls.videoProcess.every(call => call.dest.endsWith('.jpg')), 'dest 是单文件路径而不是目录')
  assert.deepEqual(calls.videoProcess.map(call => call.input.timeSeconds), framePlan(6.5), '时间点按片长等距')
  assert.equal(result.durationSec, 7)
  assert.equal(result.shots.length, 2)
  assert.equal(result.shots[0].shot_id, 's1')
  assert.equal(result.shots[0].shot_size, '近景')
  assert.match(result.hook, /反差/)
  assert.match(result.prompt, /无字幕/)
})

test('抽帧尾部缺失按实际拿到的帧继续，一帧都没有才失败', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  // 片长 30 秒时最后一个时间点超时，仍必须能拆解成功。
  const longResolve = async (input, { withVideo = true } = {}) => ({ ...(await resolveAssets(input, { withVideo })), duration: 30 })
  const long = createRecreate({ ctx, store, paths, resolveAssets: longResolve })
  const result = await long.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9) })
  assert.equal(calls.videoProcess.length, 12)
  assert.equal(result.shots.length, 2)

  const emptyCtx = makeCtx()
  const broken = { get: name => (name === 'videoProcess' ? { execute: async () => ({ mode: 'live', files: [] }) } : emptyCtx.ctx.get(name)) }
  const none = createRecreate({ ctx: broken, store, paths, resolveAssets })
  await assert.rejects(
    none.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9) }),
    error => error.code === 'needs-analysis' && /关键帧提取失败/.test(error.message),
  )
  assert.equal(recreate === undefined, false)
})

test('参考视频只作拆解材料：提交给 videoGenerate 的 references 只有 image', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  const analysis = await recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1), reference(2)], video: reference(9) })
  const result = await recreate.submit({
    avatarId: avatar.id, mode: 'recreate', images: [reference(1), reference(2)], video: reference(9),
    resolution: '480p', aspectRatio: '9:16', recreate: analysis,
  })
  assert.equal(calls.videoGenerate.length, 1)
  const payload = calls.videoGenerate[0]
  assert.equal(payload.operation, 'video_multi_ref')
  assert.deepEqual(payload.references.map(row => row.type), ['image', 'image'])
  assert.ok(payload.references.every(row => !String(row.pathOrUrl).endsWith('.mp4')), '提交体里没有参考视频')
  assert.ok(payload.references.every(row => row.targetSlot === 'reference_images'))
  assert.equal(payload.prompt, analysis.prompt, '提交的是编译后的提示词')
  assert.equal(payload.duration, 7)
  assert.equal(result.task.kind, 'motion')
  const stored = store.findTask(avatar.id, result.task.taskId)
  assert.equal(stored.input.mode, 'recreate')
  assert.equal(stored.input.recreate.prompt, analysis.prompt)
  assert.equal(stored.input.recreate.shots.length, 2)
  assert.equal(stored.input.recreate.hook, analysis.hook)
})

test('拆解两轮都不带参考视频，编译轮只留参考图', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  await recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9) })
  assert.equal(calls.textComplete.length, 2, '结构化拆解 + 编译提示词两轮')
  const breakdown = calls.textComplete[0]
  const compose = calls.textComplete[1]
  assert.equal(breakdown.reason, 'avatar-recreate-breakdown')
  assert.equal(compose.reason, 'avatar-recreate-compose')
  assert.ok(breakdown.references.some(row => String(row.pathOrUrl).endsWith('.jpg')), '拆解轮带关键帧')
  assert.ok(breakdown.references.every(row => row.type === 'image'))
  assert.ok(compose.references.every(row => row.type === 'image' && !String(row.pathOrUrl).endsWith('.jpg')), '编译轮不带关键帧')
  assert.equal(compose.references.length, 1)
})

test('缺 videoProcess 报 needs-analysis，中文消息，不静默降级', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx({ frames: false })
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  await assert.rejects(
    recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9) }),
    error => error.code === 'needs-analysis' && /视频分析能力未就绪/.test(error.message),
  )
  assert.equal(calls.textComplete.length, 0, '缺能力时不发文本请求')
})

test('缺 textComplete 报 needs-analysis，中文消息', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx } = makeCtx()
  const broken = { get: name => (name === 'textComplete' ? undefined : ctx.get(name)) }
  const recreate = createRecreate({ ctx: broken, store, paths, resolveAssets })
  await assert.rejects(
    recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9) }),
    error => error.code === 'needs-analysis' && /文本能力未就绪/.test(error.message),
  )
})

test('参考图为空或超过 30 张被拒', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  await assert.rejects(recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: [], video: reference(9) }), error => error.code === 'invalid_request')
  await assert.rejects(recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: Array.from({ length: 31 }, (_, index) => reference(index % 10)), video: reference(9) }), error => error.code === 'invalid_request')
  await assert.rejects(recreate.submit({ avatarId: avatar.id, mode: 'recreate', images: [], recreate: { prompt: 'p', durationSec: 6 } }), error => error.code === 'invalid_request')
  assert.equal(calls.textComplete.length, 0)
  assert.equal(calls.videoGenerate.length, 0)
})

test('时长夹取 4–30', () => {
  assert.equal(clampDuration(1), 4)
  assert.equal(clampDuration(4), 4)
  assert.equal(clampDuration(6.5), 7)
  assert.equal(clampDuration(30), 30)
  assert.equal(clampDuration(99), 30)
  assert.throws(() => clampDuration('abc'), error => error.code === 'invalid_request')
})

test('提交时长取拆解结果并夹在 4–30', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  await recreate.submit({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9), resolution: '480p', aspectRatio: '9:16', recreate: { prompt: COMPOSED, durationSec: 99 } })
  assert.equal(calls.videoGenerate[0].duration, 30)
  await recreate.submit({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9), resolution: '480p', aspectRatio: '9:16', recreate: { prompt: COMPOSED, durationSec: 1 } })
  assert.equal(calls.videoGenerate[1].duration, 4)
})

test('拆解结果无法解析时报 needs-analysis，不当成可用提示词', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx } = makeCtx({ breakdown: '这是一段散文，不是 JSON' })
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  await assert.rejects(
    recreate.analyze({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9) }),
    error => error.code === 'needs-analysis' && /无法解析/.test(error.message),
  )
  assert.throws(() => parseAnalysis('{"shots":[]}'), error => error.code === 'needs-analysis')
  assert.throws(() => parseAnalysis(''), error => error.code === 'needs-analysis')
})

test('framePlan：帧数 6–12、从 0 开始、不超出片长', () => {
  assert.equal(framePlan(4).length, 6)
  assert.equal(framePlan(6.5).length, 6)
  assert.equal(framePlan(12).length, 10)
  assert.equal(framePlan(30).length, 12)
  assert.equal(framePlan(4)[0], 0)
  assert.ok(framePlan(30).every(time => time < 30))
  assert.deepEqual(framePlan(0), [])
})

test('motion.submit 接受 mode:recreate 并走同一候选与 seam', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  const motion = createMotion({ ctx, store, paths, resolveAssets, recreate })
  const result = await motion.submit({
    avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9),
    resolution: '480p', aspectRatio: '9:16',
    recreate: { prompt: COMPOSED, durationSec: 7, shots: [{ shot_id: 's1' }], hook: '反差', analysisJson: '{}' },
  })
  assert.equal(calls.videoGenerate.length, 1)
  assert.equal(calls.videoGenerate[0].operation, 'video_multi_ref')
  assert.deepEqual(calls.videoGenerate[0].references.map(row => row.type), ['image'])
  assert.equal(calls.videoGenerate[0].group, 'active')
  assert.equal(result.task.kind, 'motion')
  assert.equal(store.findTask(avatar.id, result.task.taskId).input.mode, 'recreate')
})

test('没装配复刻能力时 mode:recreate 明确报错，不静默降级', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const motion = createMotion({ ctx, store, paths, resolveAssets })
  await assert.rejects(
    motion.submit({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)], recreate: { prompt: COMPOSED, durationSec: 7 } }),
    error => error.code === 'needs-analysis' && /爆款复刻能力未装配/.test(error.message),
  )
  assert.equal(calls.videoGenerate.length, 0)
})

test('POST /recreate/analyze 回 success + data，失败时错误码不被吞掉', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  let handler
  registerAvatarRoutes(
    { register(route) { handler = route.handler; return () => {} } },
    { store, paths, recreate, ctx: { get: name => (name === 'connection' ? { requestRejection: () => undefined } : undefined) } },
  )
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = (path, body) => fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })

  const ok = await post('/api/omnimux/avatar/recreate/analyze', { avatarId: avatar.id, mode: 'recreate', images: [reference(1)], video: reference(9) })
  assert.equal(ok.status, 200)
  const body = await ok.json()
  assert.equal(body.success, true)
  assert.equal(body.data.shots.length, 2)
  assert.equal(body.data.durationSec, 7)
  assert.equal(typeof body.data.prompt, 'string')

  const rejected = await post('/api/omnimux/avatar/recreate/analyze', { avatarId: avatar.id, mode: 'recreate', images: [], video: reference(9) })
  assert.equal(rejected.status, 400)
  const failure = await rejected.json()
  assert.equal(failure.success, false)
  assert.equal(failure.error.code, 'invalid_request')

  const crossSite = await fetch(`${origin}/api/omnimux/avatar/recreate/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({ avatarId: avatar.id, images: [reference(1)], video: reference(9) }),
  })
  assert.equal(crossSite.status, 403)
  assert.equal((await crossSite.json()).error.code, 'cross-site')
})

test('客户端用 intent 字段传意图，服务端照样读得到', async t => {
  const { paths, store, avatar, resolveAssets } = await boot(t)
  const { ctx, calls } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets })
  await recreate.analyze({ avatarId: avatar.id, images: [reference(1)], video: reference(9), intent: '换成我的护肤品' })
  assert.match(calls.textComplete[0].prompt, /换成我的护肤品/)
  const { ctx: ctx2, calls: calls2 } = makeCtx()
  const second = createRecreate({ ctx: ctx2, store, paths, resolveAssets })
  await second.analyze({ avatarId: avatar.id, images: [reference(1)], video: reference(9), prompt: '换成我的杯子' })
  assert.match(calls2.textComplete[0].prompt, /换成我的杯子/)
})

test('复刻的 /motion/options 只回清晰度、固定 9:16，参考视频不进候选', async t => {
  const { paths, store, avatar } = await boot(t)
  const { ctx } = makeCtx()
  // 记录 resolveAssets 收到的 withVideo，确认复刻选项评估不带参考视频。
  const seen = []
  const resolveAssets = async (input, options = {}) => {
    seen.push(options.withVideo)
    return {
      duration: 6.5, aspectRatio: '16:9', species: '',
      assets: input.images.map((_, index) => ({ type: 'image', role: 'reference', targetSlot: 'reference_images', pathOrUrl: `/owned/image-${index + 1}.png` })),
    }
  }
  const motion = createMotion({ ctx, store, paths, resolveAssets })
  const result = await motion.options({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)] })
  assert.deepEqual(seen, [false], '复刻选项不解析参考视频')
  assert.ok(result.supported.every(row => row.aspectRatio === '9:16'), '复刻固定 9:16')
  assert.ok(result.supported.length > 0, '至少有一个可用清晰度')
  assert.equal(result.duration, 6.5)
})

test('复刻无参考视频时时长不能算成 0：按钮不得永久不可点', async t => {
  const { paths, store, avatar } = await boot(t)
  const { ctx } = makeCtx()
  // 复刻模式的真实场景：客户端提交体不含 video，resolveAssets 拿不到实测时长。
  const resolveAssets = async (input) => ({
    duration: null, aspectRatio: null, species: '',
    assets: input.images.map((_, index) => ({ type: 'image', role: 'reference', targetSlot: 'reference_images', pathOrUrl: `/owned/image-${index + 1}.png` })),
  })
  const motion = createMotion({ ctx, store, paths, resolveAssets })
  const result = await motion.options({ avatarId: avatar.id, mode: 'recreate', images: [reference(1)] })
  // 阻断级回归：没有真实时长时也不能拿 0 去评估，supported 必须非空。
  assert.ok(result.supported.length > 0, '复刻按钮不能因为缺时长而永久不可点')
  assert.ok(result.supported.every(row => row.aspectRatio === '9:16'))
  // 探测时长取候选声明的最小合法值，而不是 Math.round(null) 得到的 0。
  assert.equal(result.duration, 4)
  assert.notEqual(result.duration, 0)
})

test('probeDuration 绝不把缺失值当 0', () => {
  const candidates = [{ definitions: { duration: { range: { min: 4, max: 30 } } } }]
  assert.equal(probeDuration(undefined, null, candidates), 4, '缺时长时取候选最小合法值')
  assert.equal(probeDuration(0, null, candidates), 4, '0 不是合法时长，继续找候选下限')
  assert.equal(probeDuration(undefined, 7, candidates), 7, '实测时长优先于候选下限')
  assert.equal(probeDuration(9, 7, candidates), 9, '客户端声明优先于实测')
  assert.equal(probeDuration(undefined, null, []), null, '无从推断时返回 null 而不是 0')
})

test('拆解路由的请求体上限放宽到 256KB，仍拒绝超大请求', async t => {
  const { paths, store, avatar } = await boot(t)
  const { ctx } = makeCtx()
  const recreate = createRecreate({ ctx, store, paths, resolveAssets: async () => { throw new Error('不应被调用') } })
  let handler
  registerAvatarRoutes(
    { register(route) { handler = route.handler; return () => {} } },
    { store, paths, recreate, ctx: { get: name => (name === 'connection' ? { requestRejection: () => undefined } : undefined) } },
  )
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = body => fetch(`${origin}/api/omnimux/avatar/recreate/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
  // 100KB 的意图文本超过普通 64KB 门，但仍在拆解路由的 256KB 内。
  const allowed = await post({ avatarId: avatar.id, images: [reference(1)], video: reference(9), prompt: 'x'.repeat(100 * 1024) })
  assert.notEqual(allowed.status, 413)
  const huge = await post({ avatarId: avatar.id, images: [reference(1)], video: reference(9), prompt: 'x'.repeat(300 * 1024) })
  assert.equal(huge.status, 413)
  assert.equal((await huge.json()).error.code, 'body-too-large')
})
