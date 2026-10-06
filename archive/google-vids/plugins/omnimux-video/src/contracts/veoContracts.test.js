/**
 * 服务端请求契约测试（Issue #3181）：`validateVeoTaskRequest` 必须同时接受
 * 四模式新契约与旧契约（`{ prompt, parameters: { durationSec } }`），
 * 且参数域与必需输入全部派生自 `src/shared/veoTaskSpec.js`。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { validateVeoTaskRequest } from './veoContracts.js'
import { VEO_TASK_SPEC, VIDS_ERROR_CODES } from '../shared/veoTaskSpec.js'

const PROMPT = '一只猫在草地上奔跑'
const IMAGE_URL = 'https://cdn.example.com/ref.png'
const VIDEO_ID = 'video_7'

/**
 * 四模式必需输入表。模式顺序与真源 `VEO_TASK_SPEC.modeIds` 一致；
 * 缺必需输入时的错误码取自真源 `VIDS_ERROR_CODES`。
 */
const MODE_CASES = [
  { mode: 'create', operation: 'text_to_video', required: {}, missingCode: null, missingError: null },
  {
    mode: 'animate',
    operation: 'first_frame',
    required: { image_url: IMAGE_URL },
    missingCode: VIDS_ERROR_CODES.missingImage,
    missingError: '添加动画需要先添加一张图片',
  },
  {
    mode: 'modify',
    operation: 'video_edit',
    required: { video_id: VIDEO_ID },
    missingCode: VIDS_ERROR_CODES.missingVideo,
    missingError: '修改需要先选择一个源视频片段',
  },
  {
    mode: 'extend',
    operation: 'video_extend',
    required: { video_id: VIDEO_ID },
    missingCode: VIDS_ERROR_CODES.missingVideo,
    missingError: '延续需要先选择一个源视频片段',
  },
]

test('四模式表与真源 modeIds 完全一致', () => {
  assert.deepEqual(
    MODE_CASES.map((c) => c.mode),
    [...VEO_TASK_SPEC.modeIds],
  )
})

for (const testCase of MODE_CASES) {
  test(`新契约：${testCase.mode} 带必需输入通过校验`, () => {
    const input = {
      mode: testCase.mode,
      operation: testCase.operation,
      prompt: PROMPT,
      seconds: 8,
      resolution: '1080p',
      aspect_ratio: 'portrait',
      ...testCase.required,
    }
    assert.deepEqual(validateVeoTaskRequest(input), {
      valid: true,
      request: {
        operation: testCase.operation,
        mode: testCase.mode,
        prompt: PROMPT,
        seconds: 8,
        resolution: '1080p',
        aspect_ratio: 'portrait',
        ...testCase.required,
      },
    })
  })

  if (testCase.missingCode) {
    test(`新契约：${testCase.mode} 缺必需输入被拒绝`, () => {
      const input = {
        mode: testCase.mode,
        operation: testCase.operation,
        prompt: PROMPT,
        seconds: 8,
        resolution: '1080p',
        aspect_ratio: 'portrait',
      }
      assert.deepEqual(validateVeoTaskRequest(input), {
        valid: false,
        code: testCase.missingCode,
        error: testCase.missingError,
      })
    })
  }
}

test('新契约：修改模式接受可选替换图', () => {
  assert.deepEqual(
    validateVeoTaskRequest({
      mode: 'modify',
      operation: 'video_edit',
      prompt: PROMPT,
      seconds: 4,
      resolution: '4k',
      aspect_ratio: 'landscape',
      image_url: IMAGE_URL,
      video_id: VIDEO_ID,
    }),
    {
      valid: true,
      request: {
        operation: 'video_edit',
        mode: 'modify',
        prompt: PROMPT,
        seconds: 4,
        resolution: '4k',
        aspect_ratio: 'landscape',
        image_url: IMAGE_URL,
        video_id: VIDEO_ID,
      },
    },
  )
})

test('新契约：省略参数时取真源默认值', () => {
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT }), {
    valid: true,
    request: {
      operation: 'text_to_video',
      mode: 'create',
      prompt: PROMPT,
      seconds: 10,
      resolution: '720p',
      aspect_ratio: 'landscape',
    },
  })
})

test('旧契约：parameters.durationSec 形状仍然有效', () => {
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, parameters: { durationSec: 10 } }), {
    valid: true,
    request: {
      operation: 'text_to_video',
      mode: 'create',
      prompt: PROMPT,
      seconds: 10,
      resolution: '720p',
      aspect_ratio: 'landscape',
    },
  })
})

test('旧契约：顶层 durationSec 形状仍然有效（路由历史入参）', () => {
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, mode: 'create', durationSec: 12 }), {
    valid: true,
    request: {
      operation: 'text_to_video',
      mode: 'create',
      prompt: PROMPT,
      seconds: 12,
      resolution: '720p',
      aspect_ratio: 'landscape',
    },
  })
})

test('旧契约：动画模式仍需图片素材', () => {
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, mode: 'animate', parameters: { durationSec: 8 } }), {
    valid: false,
    code: VIDS_ERROR_CODES.missingImage,
    error: '添加动画需要先添加一张图片',
  })
  assert.equal(
    validateVeoTaskRequest({
      prompt: PROMPT,
      mode: 'animate',
      parameters: { durationSec: 8 },
      image_url: IMAGE_URL,
    }).valid,
    true,
  )
})

test('越界秒数被拒绝而不是静默钳制', () => {
  const expected = {
    valid: false,
    code: VIDS_ERROR_CODES.badSeconds,
    error: '时长需为 4 到 12 秒之间的整数',
  }
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, seconds: 3 }), expected)
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, seconds: 13 }), expected)
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, parameters: { durationSec: 3 } }), expected)
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, durationSec: 13 }), expected)
})

test('未知分辨率与未知画面比例被拒绝并给出可读取值域', () => {
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, resolution: '480p' }), {
    valid: false,
    code: VIDS_ERROR_CODES.badResolution,
    error: '分辨率仅支持 720p / 1080p / 4k',
  })
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, aspect_ratio: 'square' }), {
    valid: false,
    code: VIDS_ERROR_CODES.badAspectRatio,
    error: '画面比例仅支持 横向 / 纵向',
  })
})

test('未知模式 / 空提示词 / 非法载荷返回稳定错误码', () => {
  assert.deepEqual(validateVeoTaskRequest({ prompt: PROMPT, mode: 'nope' }), {
    valid: false,
    code: VIDS_ERROR_CODES.unknownMode,
    error: '不支持的视频生成模式: nope',
  })
  assert.deepEqual(validateVeoTaskRequest({ prompt: '   ' }), {
    valid: false,
    code: VIDS_ERROR_CODES.emptyPrompt,
    error: '请先填写提示词',
  })
  assert.deepEqual(validateVeoTaskRequest(null), {
    valid: false,
    code: VIDS_ERROR_CODES.invalidPayload,
    error: '任务请求载荷必须为有效对象',
  })
})

test('operation 与模式不匹配时报错而不是静默改写', () => {
  assert.deepEqual(
    validateVeoTaskRequest({ prompt: PROMPT, mode: 'create', operation: 'video_edit' }),
    {
      valid: false,
      code: VIDS_ERROR_CODES.invalidPayload,
      error: '生成模式「创建」对应的操作应为 text_to_video，收到 video_edit',
    },
  )
})
