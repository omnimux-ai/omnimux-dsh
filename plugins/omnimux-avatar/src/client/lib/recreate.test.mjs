// 爆款复刻的客户端逻辑：拆解结果缓存、提交体组装、有界计时进度。
//
// 这里挑的都是「一旦改错就会二次付费或伪造进度」的契约：
// 输入变化即失效、提交失败仍保留拆解、提交体不含参考视频、
// 进度封顶 92% 且不倒退。纯函数，不需要 DOM。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ANALYSIS_STEPS,
  PROGRESS_CEILING,
  analysisKey,
  analysisValid,
  emptyAnalysis,
  forgetAnalysis,
  progressAt,
  recreateBody,
  rememberAnalysis,
  stepAt,
} from './recreate.js'

const here = dirname(fileURLToPath(import.meta.url))
const readComponent = (name) => readFileSync(join(here, '..', 'components', name), 'utf8')

/** 去掉注释后再扫描：注释里解释「为什么不给画幅选择」是说明文字，不是控件。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const video = (id) => ({ id, name: id, type: 'video', reference: { materialId: id } })
const image = (id) => ({ id, name: id, type: 'image', reference: { materialId: id } })

const analysis = { prompt: '编译后的提示词', durationSec: 12, shots: [{ index: 1 }], hook: '开场钩子', analysisJson: { ok: true } }

test('拆解结果按参考视频、参考图与意图指纹缓存，任一变化即失效', () => {
  const base = { video: video('v1'), images: [image('i1'), image('i2')], intent: '保留节奏' }
  const record = rememberAnalysis(emptyAnalysis(), base, analysis)
  assert.equal(analysisValid(record, base), true)

  // 换参考视频
  assert.equal(analysisValid(record, { ...base, video: video('v2') }), false)
  // 换参考图（顺序也算变化）
  assert.equal(analysisValid(record, { ...base, images: [image('i2'), image('i1')] }), false)
  assert.equal(analysisValid(record, { ...base, images: [image('i1')] }), false)
  // 改意图
  assert.equal(analysisValid(record, { ...base, intent: '换个钩子' }), false)
  // 只改空白不算变化
  assert.equal(analysisValid(record, { ...base, intent: ' 保留节奏 ' }), true)

  // 指纹本身可比较，且不同输入指纹不同
  assert.equal(analysisKey(base), analysisKey({ ...base, intent: ' 保留节奏 ' }))
  assert.notEqual(analysisKey(base), analysisKey({ ...base, video: video('v2') }))
})

test('提交失败保留拆解，重试不再重新拆解', () => {
  const input = { video: video('v1'), images: [image('i1')], intent: '' }
  const record = rememberAnalysis(emptyAnalysis(), input, analysis)

  // 提交失败时只报错，缓存不动
  const afterFailure = record
  assert.equal(analysisValid(afterFailure, input), true, '提交失败后拆解必须仍然有效')
  assert.equal(recreateBody({ avatarId: 'a', images: input.images, resolution: '480p', aspectRatio: '16:9', analysis: afterFailure.analysis }).recreate.prompt, '编译后的提示词')

  // 显式丢弃才失效（换输入 / 手动清空）
  assert.equal(analysisValid(forgetAnalysis(), input), false)
  assert.equal(analysisValid(rememberAnalysis(emptyAnalysis(), input, { prompt: '' }), input), false)
})

test('复刻提交体只含参考图与编译后的提示词，不含参考视频', () => {
  const body = recreateBody({
    avatarId: 'avatar-1',
    images: [image('i1'), image('i2')],
    resolution: '720p',
    aspectRatio: '16:9',
    analysis,
  })

  assert.equal(body.mode, 'recreate')
  assert.deepEqual(body.images, [{ materialId: 'i1' }, { materialId: 'i2' }])
  assert.equal('video' in body, false, '提交体不得携带参考视频')
  assert.equal(body.recreate.prompt, '编译后的提示词')
  assert.equal(body.recreate.durationSec, 12)
  assert.deepEqual(body.recreate.shots, analysis.shots)
  assert.equal(body.recreate.hook, '开场钩子')
  // 参考视频的 id 不能以任何形式漏进提交体
  assert.ok(!JSON.stringify(body).includes('v1'))
  // 没有拆解结果时不组装提交体，也不伪造空提示词
  assert.throws(() => recreateBody({ avatarId: 'a', images: [], resolution: '480p', aspectRatio: '16:9', analysis: null }))
})

test('有界计时进度封顶 92%，单调不倒退，永不伪造到 100%', () => {
  assert.equal(PROGRESS_CEILING, 92)
  const samples = [0, 500, 1500, 3000, 6000, 9000, 20000, 600000]
  let previous = -1
  for (const elapsed of samples) {
    const value = progressAt(elapsed)
    assert.ok(value >= previous, `进度不得倒退：${elapsed}ms 得到 ${value}`)
    assert.ok(value <= PROGRESS_CEILING, `进度不得超过 ${PROGRESS_CEILING}%：${elapsed}ms 得到 ${value}`)
    assert.ok(Number.isInteger(value))
    previous = value
  }
  // 长尾也停在 92，不会自己跑到 100
  assert.equal(progressAt(600000), PROGRESS_CEILING)
  // 负数与脏输入退化为 0，不抛错
  assert.equal(progressAt(-100), 0)
  assert.equal(progressAt(Number.NaN), 0)
})

test('分步文案按计时推进，末段停在编译提示词', () => {
  assert.deepEqual(ANALYSIS_STEPS.map((step) => step.label), ['提取镜头关键帧', '理解你的参考图', '拆解叙事与爆款逻辑', '编译生成提示词'])
  assert.equal(stepAt(0).id, ANALYSIS_STEPS[0].id)
  assert.equal(stepAt(600000).id, ANALYSIS_STEPS.at(-1).id)
  let previous = -1
  for (const elapsed of [0, 1000, 4000, 9000, 60000]) {
    const index = ANALYSIS_STEPS.indexOf(stepAt(elapsed))
    assert.ok(index >= previous, '步骤不得回退')
    previous = index
  }
  // 未知时间退化为第一步，而不是 undefined
  assert.equal(stepAt(Number.NaN).id, ANALYSIS_STEPS[0].id)
})

test('三模式与单动作 CTA：源码契约', () => {
  const motionPanel = stripComments(readComponent('MotionPanel.jsx'))
  const form = stripComments(readComponent('RecreateForm.jsx'))
  const progress = stripComments(readComponent('RecreateProgress.jsx'))

  // 三个模式都在分段控件里，且分段控件不换行
  for (const label of ['动作复刻', '角色替换', '爆款复刻']) {
    assert.ok(motionPanel.includes(label), `缺少模式 ${label}`)
  }
  assert.match(motionPanel, /omx-avatar-seg-no-wrap/)
  // 复刻走独立表单，动作/角色替换仍用原表单
  assert.match(motionPanel, /<RecreateForm/)
  // 参数卡只留清晰度：复刻里不出现画幅选择与参考时长文案
  assert.doesNotMatch(form, /画幅/)
  assert.doesNotMatch(form, /参考时长/)
  assert.match(form, /清晰度/)
  // 生成按钮是唯一动作：没有第二个分析按钮
  assert.doesNotMatch(form, /分析视频|开始分析|确认拆解/)
  assert.match(motionPanel, /生成视频/)
  // 进度组件只显示分步文案与有界进度，不写死百分比
  assert.match(progress, /ANALYSIS_STEPS|step\.label/)
  assert.match(progress, /progressAt/)
  assert.doesNotMatch(progress, /width:\s*['"]?\d+%/)
  // 复刻表单不复用动作/角色替换的「视觉风格」块（那是另一套参数）
  assert.doesNotMatch(form, /视觉风格/)
})
