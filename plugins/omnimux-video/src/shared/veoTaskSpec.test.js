import test from 'node:test'
import assert from 'node:assert/strict'
import { validateVeoTaskRequest } from '../contracts/veoContracts.js'
import {
  buildVidsRequest,
  formatVidsParamSummary,
  resolveVeoMode,
  VIDS_ERROR_CODES,
  VIDS_MODE_IDS,
  VIDS_MODES,
  VIDS_OPERATION_BY_MODE,
  VIDS_PARAM_SPEC,
  VEO_MODE_IDS,
  VEO_TASK_SPEC,
} from './veoTaskSpec.js'

test('四模式真源导出 id / 官方中文标签 / 中枢操作映射', () => {
  assert.deepEqual([...VIDS_MODE_IDS], ['create', 'animate', 'modify', 'extend'])
  assert.deepEqual([...VEO_MODE_IDS], ['create', 'animate', 'modify', 'extend'])
  assert.deepEqual(
    VIDS_MODES.map((m) => m.label),
    ['创建', '动画', '修改', '延续'],
  )
  assert.deepEqual(
    VIDS_MODES.map((m) => m.operation),
    ['text_to_video', 'first_frame', 'video_edit', 'video_extend'],
  )
  assert.deepEqual(
    { ...VIDS_OPERATION_BY_MODE },
    {
      create: 'text_to_video',
      animate: 'first_frame',
      modify: 'video_edit',
      extend: 'video_extend',
    },
  )
})

test('四模式提交按钮文案与必需输入标志', () => {
  assert.deepEqual(
    VIDS_MODES.map((m) => m.submitLabel),
    ['生成', '生成', '生成', '提交提示'],
  )
  assert.deepEqual(
    VIDS_MODES.map((m) => ({
      id: m.id,
      requiresImage: m.requiresImage,
      requiresVideo: m.requiresVideo,
      imageOptional: m.imageOptional,
    })),
    [
      { id: 'create', requiresImage: false, requiresVideo: false, imageOptional: false },
      { id: 'animate', requiresImage: true, requiresVideo: false, imageOptional: false },
      { id: 'modify', requiresImage: false, requiresVideo: true, imageOptional: true },
      { id: 'extend', requiresImage: false, requiresVideo: true, imageOptional: false },
    ],
  )
})

test('VEO_TASK_SPEC 兼容层从四模式真源派生（时长域 4–12）', () => {
  assert.deepEqual(
    VEO_TASK_SPEC.modes.map((m) => m.label),
    ['创建', '动画', '修改', '延续'],
  )
  assert.equal(VEO_TASK_SPEC.defaultMode, 'create')
  assert.equal(VEO_TASK_SPEC.paramCapsule, '720p · 16:9 · 10s')
  assert.deepEqual({ ...VEO_TASK_SPEC.durationSec }, { min: 4, max: 12, fallback: 10 })
  assert.equal(VEO_TASK_SPEC.resolution, '720p')
  assert.equal(VEO_TASK_SPEC.aspectRatio, 'landscape')
  assert.equal(VEO_TASK_SPEC.editorGatePlaceholder, '请先在右侧创建或打开剪辑工程...')
})

test('VIDS_PARAM_SPEC 参数域与默认值', () => {
  assert.deepEqual({ ...VIDS_PARAM_SPEC.seconds }, { min: 4, max: 12, step: 1, fallback: 10 })
  assert.deepEqual([...VIDS_PARAM_SPEC.resolution.values], ['720p', '1080p', '4k'])
  assert.equal(VIDS_PARAM_SPEC.resolution.fallback, '720p')
  assert.deepEqual([...VIDS_PARAM_SPEC.aspectRatio.values], ['landscape', 'portrait'])
  assert.equal(VIDS_PARAM_SPEC.aspectRatio.fallback, 'landscape')
  assert.deepEqual({ ...VIDS_PARAM_SPEC.aspectRatio.labels }, { landscape: '横向', portrait: '纵向' })
  assert.deepEqual({ ...VIDS_PARAM_SPEC.aspectRatio.ratioLabels }, { landscape: '16:9', portrait: '9:16' })
})

test('formatVidsParamSummary 默认渲染 720p · 16:9 · 10s', () => {
  assert.equal(formatVidsParamSummary(), '720p · 16:9 · 10s')
  assert.equal(formatVidsParamSummary({}), '720p · 16:9 · 10s')
  assert.equal(formatVidsParamSummary({ seconds: 4, resolution: '1080p', aspectRatio: 'portrait' }), '1080p · 9:16 · 4s')
  assert.equal(formatVidsParamSummary({ seconds: 12, resolution: '4k' }), '4k · 16:9 · 12s')
})

test('resolveVeoMode falls back to create', () => {
  assert.equal(resolveVeoMode('animate').label, '动画')
  assert.equal(resolveVeoMode('nope').id, 'create')
  assert.equal(resolveVeoMode(null).placeholder, VEO_TASK_SPEC.modes[0].placeholder)
})

test('buildVidsRequest 四模式返回规范化请求', () => {
  assert.deepEqual(buildVidsRequest({ mode: 'create', prompt: '一只猫' }), {
    ok: true,
    request: {
      operation: 'text_to_video',
      mode: 'create',
      prompt: '一只猫',
      seconds: 10,
      resolution: '720p',
      aspect_ratio: 'landscape',
    },
  })
  assert.deepEqual(
    buildVidsRequest({ mode: 'animate', prompt: '动起来', imageUrl: 'https://cdn.example.com/a.png' }),
    {
      ok: true,
      request: {
        operation: 'first_frame',
        mode: 'animate',
        prompt: '动起来',
        seconds: 10,
        resolution: '720p',
        aspect_ratio: 'landscape',
        image_url: 'https://cdn.example.com/a.png',
      },
    },
  )
  assert.deepEqual(
    buildVidsRequest({
      mode: 'modify',
      prompt: '换成红衣',
      videoId: 'v1',
      imageUrl: 'https://cdn.example.com/b.png',
      seconds: 8,
      resolution: '1080p',
      aspectRatio: 'portrait',
    }),
    {
      ok: true,
      request: {
        operation: 'video_edit',
        mode: 'modify',
        prompt: '换成红衣',
        seconds: 8,
        resolution: '1080p',
        aspect_ratio: 'portrait',
        image_url: 'https://cdn.example.com/b.png',
        video_id: 'v1',
      },
    },
  )
  assert.deepEqual(buildVidsRequest({ mode: 'extend', prompt: '继续', videoId: 'v1' }), {
    ok: true,
    request: {
      operation: 'video_extend',
      mode: 'extend',
      prompt: '继续',
      seconds: 10,
      resolution: '720p',
      aspect_ratio: 'landscape',
      video_id: 'v1',
    },
  })
})

test('buildVidsRequest 逐模式失败返回稳定错误码与可读原因', () => {
  assert.deepEqual(buildVidsRequest({ mode: 'create', prompt: '   ' }), {
    ok: false,
    code: VIDS_ERROR_CODES.emptyPrompt,
    message: '请先填写提示词',
  })
  assert.deepEqual(buildVidsRequest({ mode: 'animate', prompt: '动起来' }), {
    ok: false,
    code: VIDS_ERROR_CODES.missingImage,
    message: '添加动画需要先添加一张图片',
  })
  assert.deepEqual(buildVidsRequest({ mode: 'modify', prompt: '改一下' }), {
    ok: false,
    code: VIDS_ERROR_CODES.missingVideo,
    message: '修改需要先选择一个源视频片段',
  })
  assert.deepEqual(buildVidsRequest({ mode: 'extend', prompt: '继续' }), {
    ok: false,
    code: VIDS_ERROR_CODES.missingVideo,
    message: '延续需要先选择一个源视频片段',
  })
  assert.deepEqual(buildVidsRequest({ mode: 'nope', prompt: '一只猫' }), {
    ok: false,
    code: VIDS_ERROR_CODES.unknownMode,
    message: '不支持的生成模式：nope',
  })
  assert.deepEqual(buildVidsRequest(null), {
    ok: false,
    code: VIDS_ERROR_CODES.invalidPayload,
    message: '生成请求必须为有效对象',
  })
})

test('buildVidsRequest 越界秒数 / 分辨率 / 画面比例一律拒绝', () => {
  const badSeconds = {
    ok: false,
    code: VIDS_ERROR_CODES.badSeconds,
    message: '时长需为 4 到 12 秒之间的整数',
  }
  assert.deepEqual(buildVidsRequest({ mode: 'create', prompt: '一只猫', seconds: 3 }), badSeconds)
  assert.deepEqual(buildVidsRequest({ mode: 'create', prompt: '一只猫', seconds: 13 }), badSeconds)
  assert.deepEqual(buildVidsRequest({ mode: 'create', prompt: '一只猫', seconds: 4.5 }), badSeconds)
  assert.deepEqual(buildVidsRequest({ mode: 'create', prompt: '一只猫', resolution: '480p' }), {
    ok: false,
    code: VIDS_ERROR_CODES.badResolution,
    message: '分辨率仅支持 720p / 1080p / 4k',
  })
  assert.deepEqual(buildVidsRequest({ mode: 'create', prompt: '一只猫', aspectRatio: 'square' }), {
    ok: false,
    code: VIDS_ERROR_CODES.badAspectRatio,
    message: '画面比例仅支持 横向 / 纵向',
  })
})

test('validateVeoTaskRequest 兼容旧契约并沿用真源时长域', () => {
  assert.deepEqual(validateVeoTaskRequest({ prompt: '   ' }), {
    valid: false,
    code: VIDS_ERROR_CODES.emptyPrompt,
    error: '请先填写提示词',
  })
  assert.deepEqual(validateVeoTaskRequest({ prompt: 'hello', mode: 'invalid_mode' }), {
    valid: false,
    code: VIDS_ERROR_CODES.unknownMode,
    error: '不支持的视频生成模式: invalid_mode',
  })
  assert.deepEqual(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 2 } }), {
    valid: false,
    code: VIDS_ERROR_CODES.badSeconds,
    error: '时长需为 4 到 12 秒之间的整数',
  })
  assert.deepEqual(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 15 } }), {
    valid: false,
    code: VIDS_ERROR_CODES.badSeconds,
    error: '时长需为 4 到 12 秒之间的整数',
  })
  assert.deepEqual(validateVeoTaskRequest({ prompt: 'hello', mode: 'extend', parameters: { durationSec: 10 } }), {
    valid: false,
    code: VIDS_ERROR_CODES.missingVideo,
    error: '延续需要先选择一个源视频片段',
  })
  assert.deepEqual(
    validateVeoTaskRequest({
      prompt: 'hello',
      mode: 'extend',
      parameters: { durationSec: 10 },
      video_id: 'video_1',
    }),
    {
      valid: true,
      request: {
        operation: 'video_extend',
        mode: 'extend',
        prompt: 'hello',
        seconds: 10,
        resolution: '720p',
        aspect_ratio: 'landscape',
        video_id: 'video_1',
      },
    },
  )
})
