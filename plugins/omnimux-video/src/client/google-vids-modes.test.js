import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  VIDS_ERROR_CODES,
  VIDS_MODES,
  VIDS_PARAM_SPEC,
  buildVidsRequest,
  formatVidsParamSummary,
} from '../shared/veoTaskSpec.js'
import {
  VIDS_SOURCE_HINT,
  defaultVidsParams,
  inheritVidsParams,
  modeAfterSourcePick,
  vidsAspectOptions,
  vidsAttachmentSlots,
  vidsInsertPayload,
  vidsRecreateRequest,
  vidsResolutionOptions,
  vidsSecondsOptions,
  vidsSourceClip,
  vidsSourceHint,
  vidsSubmitState,
} from './vids-mode-ui.js'

describe('模式标签与提交文案（AC-1）', () => {
  it('四模式标签与提交按钮文案来自 VIDS_MODES', () => {
    assert.deepEqual(VIDS_MODES.map((mode) => mode.label), ['创建', '动画', '修改', '延续'])
    assert.deepEqual(VIDS_MODES.map((mode) => mode.submitLabel), ['生成', '生成', '生成', '提交提示'])
  })

  it('模式条有 title + hint 可渲染', () => {
    for (const mode of VIDS_MODES) {
      assert.ok(mode.title.length > 0, `${mode.id} 缺少 title`)
      assert.ok(mode.hint.length > 0, `${mode.id} 缺少 hint`)
    }
    assert.equal(VIDS_MODES.find((mode) => mode.id === 'animate').title, '添加动画')
    assert.equal(VIDS_MODES.find((mode) => mode.id === 'extend').hint, '把已有片段向后延长')
  })
})

describe('模式附件行（AC-2）', () => {
  it('创建模式没有附件行', () => {
    assert.deepEqual(vidsAttachmentSlots('create'), [])
  })

  it('动画模式只有「添加图片」图片槽位', () => {
    const slots = vidsAttachmentSlots('animate')
    assert.deepEqual(slots.map((slot) => [slot.id, slot.label]), [['image', '添加图片']])
    assert.equal(slots[0].accept, 'image/*')
  })

  it('修改模式为「添加视频」源片段 + 可选「添加」替换图', () => {
    assert.deepEqual(
      vidsAttachmentSlots('modify').map((slot) => [slot.id, slot.label]),
      [['source', '添加视频'], ['image', '添加']],
    )
  })

  it('延续模式只有源片段选择器', () => {
    assert.deepEqual(
      vidsAttachmentSlots('extend').map((slot) => [slot.id, slot.label]),
      [['source', '添加视频']],
    )
  })

  it('未知模式退回创建（无附件）', () => {
    assert.deepEqual(vidsAttachmentSlots('nope'), [])
    assert.deepEqual(vidsAttachmentSlots(undefined), [])
  })

  it('缺源片段时给出「从下方结果中选择一个片段」', () => {
    assert.equal(VIDS_SOURCE_HINT, '从下方结果中选择一个片段')
    assert.equal(vidsSourceHint('modify', false), VIDS_SOURCE_HINT)
    assert.equal(vidsSourceHint('extend', false), VIDS_SOURCE_HINT)
    assert.equal(vidsSourceHint('extend', true), '')
    assert.equal(vidsSourceHint('create', false), '')
    assert.equal(vidsSourceHint('animate', false), '')
  })
})

describe('提交门禁（AC-2 / AC-4）', () => {
  const params = defaultVidsParams()

  it('创建：空提示词被拒，错误码稳定可断言', () => {
    const state = vidsSubmitState({ mode: 'create', prompt: '   ', params })
    assert.equal(state.ok, false)
    assert.equal(state.code, VIDS_ERROR_CODES.emptyPrompt)
    assert.equal(state.reason, '请先填写提示词')
    assert.equal(state.request, null)
  })

  it('创建：有提示词即可提交，且不携带 image_url / video_id', () => {
    const state = vidsSubmitState({
      mode: 'create',
      prompt: '一只狗在日落时分的意大利驾驶着赛车飞驰',
      params,
    })
    assert.equal(state.ok, true)
    assert.equal(state.request.operation, 'text_to_video')
    assert.equal('image_url' in state.request, false)
    assert.equal('video_id' in state.request, false)
  })

  it('动画：缺图片被拒', () => {
    const state = vidsSubmitState({ mode: 'animate', prompt: '这只狗自然地四处走动', params })
    assert.equal(state.ok, false)
    assert.equal(state.code, VIDS_ERROR_CODES.missingImage)
    assert.match(state.reason, /添加一张图片/)
  })

  it('动画：带图片通过并附 image_url', () => {
    const state = vidsSubmitState({
      mode: 'animate',
      prompt: '这只狗自然地四处走动',
      imageUrl: 'blob:http://localhost/abc',
      params,
    })
    assert.equal(state.ok, true)
    assert.equal(state.request.operation, 'first_frame')
    assert.equal(state.request.image_url, 'blob:http://localhost/abc')
  })

  it('修改：缺源片段被拒', () => {
    const state = vidsSubmitState({ mode: 'modify', prompt: '换成黑色礼服', params })
    assert.equal(state.ok, false)
    assert.equal(state.code, VIDS_ERROR_CODES.missingVideo)
    assert.match(state.reason, /选择一个源视频片段/)
  })

  it('修改：源片段必填、替换图可选', () => {
    const withoutImage = vidsSubmitState({
      mode: 'modify',
      prompt: '换成黑色礼服',
      videoId: 'task_1',
      params,
    })
    assert.equal(withoutImage.ok, true)
    assert.equal(withoutImage.request.operation, 'video_edit')
    assert.equal(withoutImage.request.video_id, 'task_1')
    assert.equal('image_url' in withoutImage.request, false)

    const withImage = vidsSubmitState({
      mode: 'modify',
      prompt: '换成黑色礼服',
      videoId: 'task_1',
      imageUrl: 'blob:http://localhost/replacement',
      params,
    })
    assert.equal(withImage.ok, true)
    assert.equal(withImage.request.image_url, 'blob:http://localhost/replacement')
  })

  it('延续：缺源片段被拒', () => {
    const state = vidsSubmitState({ mode: 'extend', prompt: '然后猫走到外面。', params })
    assert.equal(state.ok, false)
    assert.equal(state.code, VIDS_ERROR_CODES.missingVideo)
  })

  it('延续：带源片段通过并附 video_id', () => {
    const state = vidsSubmitState({
      mode: 'extend',
      prompt: '然后猫走到外面。',
      videoId: 'task_1',
      params,
    })
    assert.equal(state.ok, true)
    assert.equal(state.request.operation, 'video_extend')
    assert.equal(state.request.video_id, 'task_1')
  })

  it('越界秒数被拒而不是静默钳制', () => {
    for (const seconds of [3, 13, 4.5, Number.NaN]) {
      const state = vidsSubmitState({
        mode: 'create',
        prompt: '一只狗在日落时分的意大利驾驶着赛车飞驰',
        params: { ...params, seconds },
      })
      assert.equal(state.ok, false, `${seconds} 应被拒绝`)
      assert.equal(state.code, VIDS_ERROR_CODES.badSeconds)
    }
  })

  it('未知分辨率与画面比例被拒', () => {
    const resolution = vidsSubmitState({
      mode: 'create',
      prompt: '镜头推进',
      params: { ...params, resolution: '8k' },
    })
    assert.equal(resolution.ok, false)
    assert.equal(resolution.code, VIDS_ERROR_CODES.badResolution)

    const aspect = vidsSubmitState({
      mode: 'create',
      prompt: '镜头推进',
      params: { ...params, aspectRatio: 'square' },
    })
    assert.equal(aspect.ok, false)
    assert.equal(aspect.code, VIDS_ERROR_CODES.badAspectRatio)
  })

  it('UI 门禁与 buildVidsRequest 同源同判', () => {
    const viaUi = vidsSubmitState({
      mode: 'modify',
      prompt: '换成黑色礼服',
      videoId: 'task_1',
      params: { seconds: 9, resolution: '4k', aspectRatio: 'portrait' },
    })
    const viaSpec = buildVidsRequest({
      mode: 'modify',
      prompt: '换成黑色礼服',
      videoId: 'task_1',
      seconds: 9,
      resolution: '4k',
      aspectRatio: 'portrait',
    })
    assert.equal(viaUi.ok, true)
    assert.deepEqual(viaUi.request, viaSpec.request)
  })
})

describe('参数控件取值域（AC-3）', () => {
  it('时长选项覆盖契约域内每个整数并标注 N 秒', () => {
    const options = vidsSecondsOptions()
    assert.deepEqual(
      options.map((option) => option.value),
      [4, 5, 6, 7, 8, 9, 10, 11, 12],
    )
    assert.deepEqual(
      options.map((option) => option.label),
      ['4 秒', '5 秒', '6 秒', '7 秒', '8 秒', '9 秒', '10 秒', '11 秒', '12 秒'],
    )
    assert.equal(options.some((option) => option.value === 3), false, 'UI 不得提供 3 秒')
    assert.equal(VIDS_PARAM_SPEC.seconds.fallback, 10)
  })

  it('分辨率选项等于契约域', () => {
    assert.deepEqual(
      vidsResolutionOptions().map((option) => option.value),
      [...VIDS_PARAM_SPEC.resolution.values],
    )
  })

  it('画面比例选项用官方中文标签', () => {
    assert.deepEqual(vidsAspectOptions(), [
      { value: 'landscape', label: '横向' },
      { value: 'portrait', label: '纵向' },
    ])
  })

  it('摘要行由 formatVidsParamSummary 渲染默认值', () => {
    assert.deepEqual(defaultVidsParams(), { seconds: 10, resolution: '720p', aspectRatio: 'landscape' })
    assert.equal(formatVidsParamSummary(defaultVidsParams()), '720p · 16:9 · 10s')
  })
})

describe('延续/修改继承源片段参数（AC-3）', () => {
  it('继承契约域内的取值', () => {
    const next = inheritVidsParams(
      { durationSec: 6, resolution: '1080p', aspect_ratio: 'portrait' },
      defaultVidsParams(),
    )
    assert.deepEqual(next, { seconds: 6, resolution: '1080p', aspectRatio: 'portrait' })
  })

  it('域外取值既不继承也不钳制', () => {
    const next = inheritVidsParams(
      { durationSec: 30, resolution: '8k', aspect_ratio: 'square' },
      defaultVidsParams(),
    )
    assert.deepEqual(next, defaultVidsParams())
  })

  it('缺字段时保留当前可见取值', () => {
    const current = { seconds: 8, resolution: '4k', aspectRatio: 'portrait' }
    assert.deepEqual(inheritVidsParams({ durationSec: 5 }, current), { ...current, seconds: 5 })
    assert.deepEqual(inheritVidsParams(null, current), current)
  })
})

describe('源片段选择（AC-2）', () => {
  it('videoId 取任务 id，缺 id 时退回视频地址', () => {
    assert.deepEqual(vidsSourceClip({ id: 'task_1', videoUrl: 'blob:x' }), {
      videoId: 'task_1',
      title: '',
    })
    assert.equal(vidsSourceClip({ videoUrl: 'https://cdn.example/x.mp4' }).videoId, 'https://cdn.example/x.mp4')
    assert.equal(vidsSourceClip({}), null)
  })

  it('源片段标题优先 title，退回 prompt', () => {
    assert.equal(vidsSourceClip({ id: 't', title: '成片' }).title, '成片')
    assert.equal(vidsSourceClip({ id: 't', prompt: '一只狗在赛车' }).title, '一只狗在赛车')
  })

  it('设为源片段时：已需要源片段的模式保持，其余切到延续', () => {
    assert.equal(modeAfterSourcePick('modify'), 'modify')
    assert.equal(modeAfterSourcePick('extend'), 'extend')
    assert.equal(modeAfterSourcePick('create'), 'extend')
    assert.equal(modeAfterSourcePick('animate'), 'extend')
  })
})

describe('结果动作行载荷（AC-5）', () => {
  it('插入载荷固定为 url / videoUrl / title / durationSec / resolution', () => {
    const payload = vidsInsertPayload({
      videoUrl: 'https://cdn.example/x.mp4',
      title: '韩国极简防晒美学成片',
      durationSec: 8,
      resolution: '1080p',
    })
    assert.deepEqual(payload, {
      url: 'https://cdn.example/x.mp4',
      videoUrl: 'https://cdn.example/x.mp4',
      title: '韩国极简防晒美学成片',
      durationSec: 8,
      resolution: '1080p',
    })
    assert.deepEqual(
      Object.keys(payload).sort(),
      ['durationSec', 'resolution', 'title', 'url', 'videoUrl'],
    )
  })

  it('缺字段时回落到契约默认值', () => {
    assert.deepEqual(vidsInsertPayload({ videoUrl: 'https://cdn.example/x.mp4' }), {
      url: 'https://cdn.example/x.mp4',
      videoUrl: 'https://cdn.example/x.mp4',
      title: '',
      durationSec: 10,
      resolution: '720p',
    })
  })

  it('重新创建优先复用任务留存的原请求', () => {
    const request = {
      operation: 'video_extend',
      mode: 'extend',
      prompt: '然后猫走到外面。',
      seconds: 8,
      resolution: '1080p',
      aspect_ratio: 'portrait',
      video_id: 'task_1',
    }
    const rebuilt = vidsRecreateRequest({ id: 'task_2', request })
    assert.equal(rebuilt.ok, true)
    assert.deepEqual(rebuilt.request, request)
  })

  it('没有留存请求时从任务字段重建', () => {
    const rebuilt = vidsRecreateRequest({
      id: 'task_1',
      mode: 'extend',
      prompt: '然后猫走到外面。',
      durationSec: 6,
      resolution: '1080p',
      aspect_ratio: 'portrait',
      video_id: 'task_0',
    })
    assert.equal(rebuilt.ok, true)
    assert.equal(rebuilt.request.operation, 'video_extend')
    assert.equal(rebuilt.request.seconds, 6)
    assert.equal(rebuilt.request.video_id, 'task_0')
  })

  it('无法构造时给出可读原因', () => {
    const rebuilt = vidsRecreateRequest({ id: 'task_1' })
    assert.equal(rebuilt.ok, false)
    assert.equal(rebuilt.reason, '请先填写提示词')
  })
})
