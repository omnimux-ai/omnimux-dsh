// 规则引擎契约测试：移植 service/influencer/rules_test.go 与 multiview_test.go 的断言。
import test from 'node:test'
import assert from 'node:assert/strict'

import { Fragment } from './taxonomy.js'
import {
  BuildMultiViewPrompt,
  BuildPrompt,
  MULTIVIEW_SIZE,
  NormalizeSelection,
  SHEET_SIZE,
  ValidateSelection,
  ValidationError,
  conflictMessage,
  tierLead,
} from './rules.js'

function caught(fn) {
  try {
    fn()
  } catch (err) {
    return err
  }
  return null
}

test('未知分类 / 未知选项 / 非法档位都要抛 ValidationError', () => {
  const catErr = caught(() => NormalizeSelection('normal', { nope: ['x'] }))
  assert.ok(catErr instanceof ValidationError)
  assert.equal(catErr.field, 'nope')
  assert.equal(catErr.message, 'unknown category "nope"')

  const optErr = caught(() => NormalizeSelection('normal', { gender: ['nope'] }))
  assert.ok(optErr instanceof ValidationError)
  assert.equal(optErr.field, 'gender')
  assert.equal(optErr.message, 'unknown option "nope"')

  const tierErr = caught(() => NormalizeSelection('notatier', { gender: ['female'] }))
  assert.ok(tierErr instanceof ValidationError)
  assert.equal(tierErr.field, 'tier')
  assert.equal(tierErr.message, 'invalid tier')
})

test('档位不可见的选项被静默丢弃', () => {
  // pr_egg 与 head_tiny 在 normal 档位不可见。
  const norm = NormalizeSelection('normal', {
    proportions: ['pr_egg', 'pr_shoulders'],
    freak_head: ['head_tiny'],
  })
  assert.ok(!(norm.proportions ?? []).includes('pr_egg'))
  assert.ok((norm.proportions ?? []).includes('pr_shoulders'))
  assert.ok(!Object.hasOwn(norm, 'freak_head'))
})

test('acc_none 双向互斥', () => {
  const after = NormalizeSelection('total', { accessory: ['acc_glasses', 'acc_none'] })
  assert.deepEqual(after.accessory, ['acc_none'])

  const before = NormalizeSelection('total', { accessory: ['acc_none', 'acc_glasses'] })
  assert.deepEqual(before.accessory, ['acc_glasses'])
})

test('同槽位选项后者胜出', () => {
  const norm = NormalizeSelection('total', {
    freak_face: ['fn_fulllips', 'ff_lips_3', 'fn_freckles'],
  })
  const got = norm.freak_face
  assert.ok(!got.includes('fn_fulllips'))
  assert.ok(got.includes('ff_lips_3'))
  assert.ok(got.includes('fn_freckles'))
})

test('上限保留最后被接受的选项，替换型选择不被上限挤掉', () => {
  // fn_eyebags(eyes) fn_mole(marks) fn_cheekbones(cheeks) fn_fulllips(lips)
  // 是 4 个不同槽位；fn_widemouth(lips) 既替换 lips 又是第 5 次选择，超出 max=4。
  const norm = NormalizeSelection('total', {
    freak_face: ['fn_eyebags', 'fn_mole', 'fn_cheekbones', 'fn_fulllips', 'fn_widemouth'],
  })
  const got = norm.freak_face
  assert.equal(got.length, 4)
  assert.equal(got[0], 'fn_eyebags')
  assert.equal(got[3], 'fn_widemouth')
  assert.ok(!got.includes('fn_fulllips'))
})

test('空分类从结果中省略，绝不产出空数组', () => {
  const norm = NormalizeSelection('normal', { freak_head: ['head_tiny'], gender: ['male'] })
  assert.ok(!Object.hasOwn(norm, 'freak_head'))
  assert.deepEqual(norm.gender, ['male'])
  assert.deepEqual(NormalizeSelection('normal', {}), {})
})

test('四条冲突提示文案逐字精确', () => {
  assert.equal(
    conflictMessage('normal', { body_type: ['body_heavy'], height: ['h_tall'] }),
    'Heavy build cannot be combined with Tall or Very tall.'
  )
  assert.equal(
    conflictMessage('freak', { body_type: ['body_heavy'], proportions: ['pr_shortlegs'] }),
    'This build cannot be combined with Short legs or Long limbs in this mode.'
  )
  assert.equal(
    conflictMessage('total', { body_type: ['body_ultra'], freak_neck: ['neck_long'] }),
    'Extreme muscular build cannot be combined with Long neck.'
  )
  assert.equal(
    conflictMessage('total', { freak_neck: ['neck_long'], freak_face: ['ff_teeth_11'] }),
    'Long neck cannot be combined with Buck teeth.'
  )
  assert.equal(conflictMessage('normal', { gender: ['male'] }), '')
})

test('ValidateSelection 覆盖 Go 端的冲突用例表', () => {
  const cases = [
    ['heavy+tall', 'normal', { body_type: ['body_heavy'], height: ['h_tall'] }, 'Heavy build'],
    ['heavy+very_tall', 'normal', { body_type: ['body_heavy'], height: ['h_very_tall'] }, 'Heavy build'],
    ['heavy+shortlegs freak', 'freak', { body_type: ['body_heavy'], proportions: ['pr_shortlegs'] }, 'Short legs'],
    ['muscular+longlimbs total', 'total', { body_type: ['body_muscular'], proportions: ['pr_longlimbs'] }, 'Long limbs'],
    ['heavy+shortlegs normal ok', 'normal', { body_type: ['body_heavy'], proportions: ['pr_shortlegs'] }, ''],
    ['ultra+longneck', 'total', { body_type: ['body_ultra'], freak_neck: ['neck_long'] }, 'Long neck'],
    ['longneck+buckteeth', 'total', { freak_neck: ['neck_long'], freak_face: ['ff_teeth_11'] }, 'Buck teeth'],
    ['happy path', 'total', { gender: ['male'], body_type: ['body_muscular'], height: ['h_tall'] }, ''],
  ]
  for (const [name, tier, sel, want] of cases) {
    const err = caught(() => ValidateSelection(tier, sel))
    if (want === '') {
      assert.equal(err, null, `${name}: 不应报错，实际 ${err && err.message}`)
      continue
    }
    assert.ok(err instanceof ValidationError, `${name}: 期望 ValidationError`)
    assert.equal(err.field, 'selection', `${name}: 字段应为 selection`)
    assert.ok(err.message.includes(want), `${name}: 期望包含 ${want}，实际 ${err.message}`)
  }
})

test('冲突判定发生在归一化之后', () => {
  // normal 档位下 pr_shortlegs 可见但规则不生效；freak 档位下同样组合必须报错。
  assert.equal(caught(() => ValidateSelection('normal', { body_type: ['body_heavy'], proportions: ['pr_shortlegs'] })), null)
  assert.ok(caught(() => ValidateSelection('freak', { body_type: ['body_heavy'], proportions: ['pr_shortlegs'] })))
})

test('tierLead 三条引导语逐字精确', () => {
  assert.equal(tierLead('total'), 'Extreme caricature, exaggerated proportions, full-body character portrait of a')
  assert.equal(tierLead('freak'), 'Stylized, slightly exaggerated, full-body character portrait of a')
  assert.equal(tierLead('normal'), 'Natural, realistic, full-body character portrait of a')
  assert.equal(tierLead('whatever'), 'Natural, realistic, full-body character portrait of a')
})

test('BuildPrompt 前缀 / 片段 / 后缀与 brief 拼接', () => {
  const p = BuildPrompt('total', { gender: ['male'], hair: ['hair_afro'], skin_tone: ['st_deep'] }, '')
  assert.ok(p.startsWith('Extreme caricature, exaggerated proportions, full-body character portrait of a'))
  for (const frag of ['Male', 'afro', 'deep brown skin']) {
    assert.ok(p.includes(frag), `缺少片段 ${frag}: ${p}`)
  }
  assert.ok(p.endsWith('Studio background, full-body shot, 9:16 composition, high detail, clean lighting.'))
  // 片段顺序遵循 promptOrder：skin_tone 先于 hair。
  assert.ok(p.indexOf('deep brown skin') < p.indexOf('afro'))

  const p2 = BuildPrompt('normal', { gender: ['female'] }, '  freckles, smiling  ')
  assert.ok(p2.includes('. freckles, smiling.'))
  assert.ok(!p2.includes('  freckles'))

  // 无片段时 brief 前没有多余分隔符。
  const p3 = BuildPrompt('normal', {}, 'solo brief')
  assert.ok(p3.startsWith('Natural, realistic, full-body character portrait of a. solo brief.'))
})

test('BuildMultiViewPrompt 保留全部面板、CHARACTER 段与质量段', () => {
  const prompt = BuildMultiViewPrompt({ gender: ['female'], hair: ['hair_bowl'] }, '')

  for (const want of [
    'Front view',
    'Three-quarter front view',
    'Side profile view',
    'Three-quarter back view',
    'Back view',
    'Front headshot, eyes gently closed',
    'Three-quarter headshot, eyes half-open',
    'Front headshot, eyes open looking straight into the lens',
    '16:9',
    'must match reference image exactly in every panel',
  ]) {
    assert.ok(prompt.includes(want), `缺少 ${want}`)
  }

  assert.ok(prompt.startsWith('Create a professional character reference sheet'))
  assert.ok(prompt.includes('\n\nCHARACTER (must match reference image exactly in every panel):\n'))
  assert.ok(prompt.includes('\n\nQUALITY: shot on a full-frame camera with an 85mm lens'))
  assert.ok(prompt.endsWith('Clean white dividing lines between panels, no text, no logos.'))
  assert.equal(MULTIVIEW_SIZE, '16:9')
  assert.equal(SHEET_SIZE, '1024x1536')
})

test('BuildMultiViewPrompt 携带角色片段与 brief', () => {
  const prompt = BuildMultiViewPrompt({ gender: ['female'] }, 'matching the client brief')
  assert.ok(prompt.includes(Fragment('gender', 'female')))
  assert.ok(prompt.includes('matching the client brief'))
  assert.ok(prompt.includes(`${Fragment('gender', 'female')}. matching the client brief`))
})

test('BuildMultiViewPrompt 在无角色细节时回退', () => {
  assert.ok(BuildMultiViewPrompt({}, '  brief only  ').includes('brief only'))
  assert.ok(BuildMultiViewPrompt({}, '   ').includes('the exact character'))
  assert.ok(BuildMultiViewPrompt({}, '').includes('the exact character'))
})

test('BuildMultiViewPrompt 刻意不含档位引导语', () => {
  const prompt = BuildMultiViewPrompt({ gender: ['female'] }, '')
  assert.ok(!prompt.includes(tierLead('total')))
  assert.ok(!prompt.includes(tierLead('freak')))
  assert.ok(!prompt.includes(tierLead('normal')))
})
