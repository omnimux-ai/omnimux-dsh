/**
 * tests/e2e/google-vids-four-modes.e2e.test.mjs
 *
 * Google Vids 四生成模式（创建 / 动画 / 修改 / 延续）端到端契约验收（Issue #3181）。
 *
 * 验收目标：
 *  1. 四模式与中枢操作的映射与官方中文标签（AC-1）
 *  2. 参数域来自上游服务契约，UI 不得提供会被静默改写的取值（AC-3）
 *  3. 请求构造逐模式的必需输入与规范化结果（AC-4）
 *  4. 服务端路由校验接受同一份契约，且不做静默钳制（AC-4）
 *  5. 结果卡「插入」跨插件载荷契约与剪辑器未就绪时的可读原因（AC-5）
 *
 * 真实浏览器逐模式走查见 docs/evidence/google-vids-four-modes-3181/report.md。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  VIDS_MODES,
  VIDS_MODE_IDS,
  VIDS_PARAM_SPEC,
  VIDS_OPERATION_BY_MODE,
  VIDS_ERROR_CODES,
  buildVidsRequest,
  formatVidsParamSummary,
} from '../../plugins/omnimux-video/src/shared/veoTaskSpec.js'
import { validateVeoTaskRequest } from '../../plugins/omnimux-video/src/contracts/veoContracts.js'
import {
  vidsAttachmentSlots,
  vidsInsertPayload,
  vidsSecondsOptions,
} from '../../plugins/omnimux-video/src/client/vids-mode-ui.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')
const stageSrc = fs.readFileSync(
  path.join(root, 'plugins/omnimux-video/src/client/GoogleVidsStage.jsx'),
  'utf8',
)

test('E2E: Google Vids 四生成模式交互与请求契约验收（#3181）', async (t) => {

  await t.test('E2E-AC-1: 四模式标签为官方中文，且逐模式映射到中枢操作', () => {
    assert.deepEqual([...VIDS_MODE_IDS], ['create', 'animate', 'modify', 'extend'])
    assert.deepEqual(VIDS_MODES.map((m) => m.label), ['创建', '动画', '修改', '延续'])
    assert.deepEqual(VIDS_MODES.map((m) => m.operation), [
      'text_to_video',
      'first_frame',
      'video_edit',
      'video_extend',
    ])
    assert.deepEqual(VIDS_OPERATION_BY_MODE, {
      create: 'text_to_video',
      animate: 'first_frame',
      modify: 'video_edit',
      extend: 'video_extend',
    })
    // 提交键文案：延续用官方「提交提示」，其余用「生成」。
    assert.deepEqual(VIDS_MODES.map((m) => m.submitLabel), ['生成', '生成', '生成', '提交提示'])
    // 必需输入：动画要图片，修改/延续要源片段。
    assert.deepEqual(VIDS_MODES.map((m) => m.requiresImage), [false, true, false, false])
    assert.deepEqual(VIDS_MODES.map((m) => m.requiresVideo), [false, false, true, true])
    assert.equal(VIDS_MODES[2].imageOptional, true, '修改模式的替换图必须为可选')
  })

  await t.test('E2E-AC-2: 各模式附件槽位与官方输入一一对应', () => {
    assert.deepEqual(vidsAttachmentSlots('create'), [])
    assert.deepEqual(vidsAttachmentSlots('animate').map((s) => s.label), ['添加图片'])
    assert.deepEqual(vidsAttachmentSlots('modify').map((s) => s.label), ['添加视频', '添加'])
    assert.deepEqual(vidsAttachmentSlots('extend').map((s) => s.label), ['添加视频'])
    assert.equal(vidsAttachmentSlots('animate')[0].accept, 'image/*')
  })

  await t.test('E2E-AC-3: 参数域跟随上游服务契约，不得提供会被静默改写的取值', () => {
    assert.equal(VIDS_PARAM_SPEC.seconds.min, 4)
    assert.equal(VIDS_PARAM_SPEC.seconds.max, 12)
    assert.equal(VIDS_PARAM_SPEC.seconds.fallback, 10)
    assert.deepEqual([...VIDS_PARAM_SPEC.resolution.values], ['720p', '1080p', '4k'])
    assert.deepEqual([...VIDS_PARAM_SPEC.aspectRatio.values], ['landscape', 'portrait'])
    assert.deepEqual(VIDS_PARAM_SPEC.aspectRatio.labels, { landscape: '横向', portrait: '纵向' })

    const seconds = vidsSecondsOptions().map((o) => o.value)
    assert.deepEqual(seconds, [4, 5, 6, 7, 8, 9, 10, 11, 12])
    assert.equal(seconds.includes(3), false, '官方文档的 3 秒会被服务端钳到 4 秒，UI 不得提供')
    assert.deepEqual(vidsSecondsOptions().map((o) => o.label)[0], '4 秒')
    assert.equal(formatVidsParamSummary(), '720p · 16:9 · 10s')
  })

  await t.test('E2E-AC-4: 请求构造逐模式规范化，越界一律报错而非钳制', () => {
    const created = buildVidsRequest({ mode: 'create', prompt: '海边日落', seconds: 8, resolution: '1080p', aspectRatio: 'portrait' })
    assert.equal(created.ok, true)
    assert.deepEqual(created.request, {
      operation: 'text_to_video',
      mode: 'create',
      prompt: '海边日落',
      seconds: 8,
      resolution: '1080p',
      aspect_ratio: 'portrait',
    })

    const animated = buildVidsRequest({ mode: 'animate', prompt: '镜头缓慢推近', imageUrl: 'https://example.com/a.png' })
    assert.equal(animated.ok, true)
    assert.equal(animated.request.operation, 'first_frame')
    assert.equal(animated.request.image_url, 'https://example.com/a.png')
    assert.equal(animated.request.seconds, 10, '省略参数必须取契约默认值')

    const modified = buildVidsRequest({ mode: 'modify', prompt: '换成蓝色外套', videoId: 'task_1', imageUrl: 'https://example.com/b.png' })
    assert.equal(modified.ok, true)
    assert.equal(modified.request.operation, 'video_edit')
    assert.equal(modified.request.video_id, 'task_1')
    assert.equal(modified.request.image_url, 'https://example.com/b.png')

    const extended = buildVidsRequest({ mode: 'extend', prompt: '她转身走向门口', videoId: 'task_1' })
    assert.equal(extended.ok, true)
    assert.equal(extended.request.operation, 'video_extend')
    assert.equal(extended.request.video_id, 'task_1')

    // 失败面：稳定错误码 + 不静默
    const failures = [
      [{ mode: 'create', prompt: '   ' }, VIDS_ERROR_CODES.emptyPrompt],
      [{ mode: 'animate', prompt: '动起来' }, VIDS_ERROR_CODES.missingImage],
      [{ mode: 'modify', prompt: '改一下' }, VIDS_ERROR_CODES.missingVideo],
      [{ mode: 'extend', prompt: '继续' }, VIDS_ERROR_CODES.missingVideo],
      [{ mode: 'create', prompt: 'x', seconds: 3 }, VIDS_ERROR_CODES.badSeconds],
      [{ mode: 'create', prompt: 'x', seconds: 13 }, VIDS_ERROR_CODES.badSeconds],
      [{ mode: 'create', prompt: 'x', seconds: 8.5 }, VIDS_ERROR_CODES.badSeconds],
      [{ mode: 'create', prompt: 'x', resolution: '480p' }, VIDS_ERROR_CODES.badResolution],
      [{ mode: 'create', prompt: 'x', aspectRatio: '16:9' }, VIDS_ERROR_CODES.badAspectRatio],
      [{ mode: 'nope', prompt: 'x' }, VIDS_ERROR_CODES.unknownMode],
    ]
    for (const [input, code] of failures) {
      const result = buildVidsRequest(input)
      assert.equal(result.ok, false, `必须拒绝: ${JSON.stringify(input)}`)
      assert.equal(result.code, code)
      assert.equal(typeof result.message, 'string')
      assert.ok(result.message.length > 0, '必须给出可读原因')
    }
  })

  await t.test('E2E-AC-4b: 服务端路由校验复用同一契约（四模式通过 / 缺输入失败 / 不钳制）', () => {
    const accepted = [
      { prompt: '海边日落', mode: 'create' },
      { prompt: '镜头推近', mode: 'animate', image_url: 'https://example.com/a.png' },
      { prompt: '换成蓝色外套', mode: 'modify', video_id: 'task_1' },
      { prompt: '她转身走向门口', mode: 'extend', video_id: 'task_1' },
    ]
    for (const body of accepted) {
      const result = validateVeoTaskRequest(body)
      assert.equal(result.valid, true, `必须接受: ${JSON.stringify(body)}`)
      assert.equal(result.request.operation, VIDS_OPERATION_BY_MODE[body.mode])
    }

    const rejected = [
      [{ prompt: '镜头推近', mode: 'animate' }, VIDS_ERROR_CODES.missingImage],
      [{ prompt: '换装', mode: 'modify' }, VIDS_ERROR_CODES.missingVideo],
      [{ prompt: '继续', mode: 'extend' }, VIDS_ERROR_CODES.missingVideo],
      [{ prompt: 'x', mode: 'create', seconds: 3 }, VIDS_ERROR_CODES.badSeconds],
      [{ prompt: 'x', mode: 'create', resolution: '480p' }, VIDS_ERROR_CODES.badResolution],
      [{ prompt: 'x', mode: 'create', aspect_ratio: '16:9' }, VIDS_ERROR_CODES.badAspectRatio],
    ]
    for (const [body, code] of rejected) {
      const result = validateVeoTaskRequest(body)
      assert.equal(result.valid, false, `必须拒绝: ${JSON.stringify(body)}`)
      assert.equal(result.code, code)
    }
    // 旧形状（parameters.durationSec）保持可用，避免既有调用方回归。
    assert.equal(validateVeoTaskRequest({ prompt: 'x', mode: 'create', parameters: { durationSec: 10 } }).valid, true)
    assert.equal(validateVeoTaskRequest({ prompt: 'x', mode: 'create', parameters: { durationSec: 3 } }).valid, false)
  })

  await t.test('E2E-AC-5: 插入载荷契约固定五字段，剪辑器未就绪时给出可读原因', () => {
    const payload = vidsInsertPayload({
      id: 'task_9',
      videoUrl: 'https://example.com/v.mp4',
      title: '韩国极简防晒美学成片',
      durationSec: 10,
      resolution: '1080p',
    })
    assert.deepEqual(Object.keys(payload).sort(), ['durationSec', 'resolution', 'title', 'url', 'videoUrl'])
    assert.equal(payload.videoUrl, 'https://example.com/v.mp4')
    assert.equal(payload.url, 'https://example.com/v.mp4')
    assert.equal(payload.durationSec, 10)

    // 生产端仍按既有跨插件事件契约投递（消费端在 omnimux-clip）。
    assert.match(stageSrc, /omnimux-clip:insert/, '必须投递 omnimux-clip:insert 事件')
    assert.match(stageSrc, /data-vids-action="insert"/, '插入动作必须有稳定标识')
    assert.match(stageSrc, /剪辑器未就绪|editorGatePlaceholder/, '剪辑器未就绪时必须给可读原因而非静默失败')
  })

  await t.test('E2E-AC-6: 页面不再出现已删除的假进度能力，且四模式交互钩子齐全', () => {
    assert.doesNotMatch(stageSrc, /handleUpscale/, '升频假进度必须删除')
    assert.doesNotMatch(stageSrc, /正在升频/, '不得保留升频文案')
    for (const hook of [
      'data-vids-mode=',
      'data-vids-mode-hint',
      'data-vids-attach=',
      'data-vids-param="seconds"',
      'data-vids-param="resolution"',
      'data-vids-param="aspectRatio"',
      'data-vids-submit',
      'data-vids-submit-reason',
      'data-vids-action="recreate"',
      'data-vids-action="edit-prompt"',
    ]) {
      assert.equal(stageSrc.includes(hook), true, `缺少交互钩子: ${hook}`)
    }
  })

})
