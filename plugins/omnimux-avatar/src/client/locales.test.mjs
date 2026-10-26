// 文案字典的完整性回归：中英键集同步、本轮新词条齐备、英文侧不残留中文。
//
// 这里挑选的都是「改错了不会被其它测试发现」的契约：
// TEXT_KEYS 里漏一行会让中英键数错位（英文界面里冒出中文），
// 新词条漏登记则组件按中文键取值时只能回落到键本身。
//
// 与 taxonomy.test.mjs 同一口径：英文侧按 label_en 登记恒等词条，
// 中文侧同时登记中文原文键与英文原文键，所以两侧键数必须相等。

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createT, en, zh } from './locales.js'

/** 本轮（爆款复刻第三模式）必须补进 TEXT_KEYS 的词条：中文原文 → 英文原文。 */
const RECREATE_KEYS = [
  ['爆款复刻', 'Viral recreate'],
  ['正在拆解参考视频', 'Analyzing reference video'],
  ['拆解参考视频失败', 'Could not analyze the reference video. Please try again.'],
  ['提取镜头关键帧', 'Extract shot frames'],
  ['理解你的参考图', 'Understand your references'],
  ['拆解叙事与爆款逻辑', 'Decompose narrative and viral logic'],
  ['编译生成提示词', 'Compile the generation prompt'],
  [
    '参考视频仅用于拆解，不会提交给视频模型',
    'The reference video is only used for analysis and is never sent to the video model',
  ],
  ['上传中', 'Uploading…'],
  ['上传失败', 'Upload failed'],
  ['重试上传', 'Retry upload'],
  ['查看失败原因', 'Details'],
  ['分镜拆解', 'Shot breakdown'],
  ['分析未完成', 'Analysis not finished'],
]

/** 爆款复刻表单的界面文案（client-modes 使用的那批）。 */
const RECREATE_FORM_KEYS = [
  [
    '拆解参考片的镜头、节奏与叙事，用你的角色重拍一条。',
    "Break down the reference's shots, pacing and narrative, then reshoot it with your character.",
  ],
  ['添加参考视频，拆解爆款结构', 'Add a reference video to break down its structure'],
  ['更换参考视频', 'Replace reference video'],
  ['补充说明', 'Additional notes'],
  ['补充说明：已开启', 'Additional notes: on'],
  ['补充说明：关闭', 'Additional notes: off'],
  ['说明这次复刻要保留什么、换成什么', 'Describe what to keep and what to replace'],
  ['参数', 'Parameters'],
  ['拆解进度', 'Analysis progress'],
  ['拆解没有返回可用的提示词，请重试', 'Analysis returned no usable prompt. Please try again.'],
  ['缺少拆解结果，请先生成一次', 'No analysis result yet. Generate once first.'],
  ['请先选择参考图片', 'Select reference images first'],
  ['提交中', 'Submitting'],
]

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

describe('locales · 中英键集同步', () => {
  it('keeps zh and en key sets at the same size', () => {
    assert.equal(Object.keys(zh.translation).length, Object.keys(en.translation).length)
  })

  it('registers the same key names on both sides', () => {
    assert.deepEqual(
      Object.keys(zh.translation).sort(),
      Object.keys(en.translation).sort(),
    )
  })
})

describe('locales · 爆款复刻新词条', () => {
  it('中文侧按中文原文取到中文原文', () => {
    const t = createT('zh')
    for (const [key] of RECREATE_KEYS) assert.equal(t(key), key, key)
  })

  it('英文侧按中文原文取到英文原文', () => {
    const t = createT('en')
    for (const [key, expected] of RECREATE_KEYS) assert.equal(t(key), expected, key)
  })

  it('英文侧按英文原文同样取到英文原文（两种调用习惯都通）', () => {
    const t = createT('en')
    for (const [, english] of RECREATE_KEYS) assert.equal(t(english), english, english)
  })

  it('中文侧按英文原文取到中文原文', () => {
    const t = createT('zh')
    for (const [chinese, english] of RECREATE_KEYS) assert.equal(t(english), chinese, english)
  })

  it('每条新词条的英文值都不含中文，也不是中文原文的拷贝', () => {
    for (const [chinese, english] of RECREATE_KEYS) {
      assert.ok(CJK.test(zh.translation[chinese]), `${chinese} 的中文值应是中文`)
      assert.ok(!CJK.test(en.translation[chinese]), `${chinese} 的英文值不得含中文`)
      assert.notEqual(en.translation[chinese], chinese, `${chinese} 缺少英文原文`)
      assert.ok(english.length > 0, `${chinese} 的英文原文不得为空`)
    }
  })
})

describe('locales · 占位符两侧一致', () => {
  it('带 {{n}} 的词条在两侧都保留同一个占位符', () => {
    assert.equal(createT('zh')('共 {{n}} 个镜头', { n: 3 }), '共 3 个镜头')
    assert.equal(createT('en')('共 {{n}} 个镜头', { n: 3 }), '3 shots')
  })

  it('缺变量时占位符原样保留，便于发现漏配', () => {
    assert.equal(createT('zh')('共 {{n}} 个镜头'), '共 {{n}} 个镜头')
  })
})

describe('locales · 爆款复刻表单词条', () => {
  it('中文侧按中文原文取到中文原文', () => {
    const t = createT('zh')
    for (const [key] of RECREATE_FORM_KEYS) assert.equal(t(key), key, key)
  })

  it('英文侧按中文原文取到英文原文', () => {
    const t = createT('en')
    for (const [key, expected] of RECREATE_FORM_KEYS) assert.equal(t(key), expected, key)
  })

  it('中文侧按英文原文取到中文原文', () => {
    const t = createT('zh')
    for (const [chinese, english] of RECREATE_FORM_KEYS) assert.equal(t(english), chinese, english)
  })

  it('每条表单词条的英文值都不含中文，也不是中文原文的拷贝', () => {
    for (const [chinese] of RECREATE_FORM_KEYS) {
      assert.ok(!CJK.test(en.translation[chinese]), `${chinese} 的英文值不得含中文`)
      assert.notEqual(en.translation[chinese], chinese, `${chinese} 缺少英文原文`)
    }
  })
})

describe('locales · 不向用户暴露模型 ID', () => {
  it('提示词编译文案不钉死任何模型名', () => {
    // 复刻提交走 video_multi_ref 候选选择，实际模型由中枢目录与渠道决定；
    // 文案里写死模型名等于向用户承诺一个我们不保证的模型。
    assert.equal(createT('en')('编译生成提示词'), 'Compile the generation prompt')
    for (const [, english] of [...RECREATE_KEYS, ...RECREATE_FORM_KEYS]) {
      assert.doesNotMatch(english, /seedance|bytedance/i, `文案不得出现模型名：${english}`)
    }
  })
})
