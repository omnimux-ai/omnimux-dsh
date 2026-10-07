#!/usr/bin/env node
/**
 * scripts/verify-modality-matrix.test.mjs
 *
 * verify-modality-matrix.mjs 的断言面（规格 specs/channel-modality-matrix.spec.md M1–M6）。
 *
 * M1/M2 是双向对账的两个方向；M3 是两侧一致必须通过；M4 是路由行缺 `input` 键的等价语义；
 * M5 是反向对照——合成夹具在「单侧补上 video 声明」后必须转红，否则本门禁就是恒真门禁；
 * M6 钉住主干真实数据上必须报出的缺口清单。
 *
 * 夹具全部离线构造，不读网络、不写仓内文件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CORDIS_PATH,
  KNOWN_GAPS,
  MODALITY_ORDER,
  collectContractModalities,
  parseRouteModalities,
  reconcile,
  applyBaseline,
  verifyModalityMatrix,
} from './verify-modality-matrix.mjs'
import { loadAll } from '../plugins/omnimux/src/catalog/contract/load.js'

/* ------------------------------------------------------------------ 夹具 */

/** 合成 cordis.patch.yml：只保留 llm-pi-ai 行的模型列表，缩进与真实文件一致。 */
function cordisFixture(models) {
  const rows = models
    .map((model) => {
      const lines = [`          - id: ${model.id}`]
      if (Object.prototype.hasOwnProperty.call(model, 'input')) {
        lines.push(`            input: [${model.input.join(', ')}]`)
      }
      return lines.join('\n')
    })
    .join('\n')
  return [
    '- id: some-other-plugin',
    '  name: x',
    '- id: llm-pi-ai',
    "  name: '@deepseek-ai/dsh-llm-pi-ai'",
    '  config:',
    '    providers:',
    '      omnimux:',
    '        models:',
    rows,
    '',
  ].join('\n')
}

/** 合成契约侧模态表：{ id: [modality...] } → 与 collectContractModalities 同形状的 Map。 */
function contractFixture(spec) {
  return new Map(
    Object.entries(spec).map(([id, modalities]) => [
      id,
      { modalities: new Set(modalities), managementGroup: 'text' },
    ]),
  )
}

/** 真实主干数据上跑一次门禁（离线）。 */
function runOnRealRepo(options = {}) {
  return verifyModalityMatrix({
    cordisText: readFileSync(CORDIS_PATH, 'utf8'),
    contractModalities: collectContractModalities(loadAll()),
    ...options,
  })
}

const gapIds = (entries) => entries.map((entry) => `${entry.id} × ${entry.modality} ${entry.direction}`).sort()

/* ------------------------------------------------------------- M3 / M1 / M2 */

test('M3 两侧完全一致 → 通过', () => {
  const report = verifyModalityMatrix({
    cordisText: cordisFixture([
      { id: 'model-vision', input: ['text', 'image'] },
      { id: 'model-text-only' },
    ]),
    contractModalities: contractFixture({
      'model-vision': ['text', 'image'],
      'model-text-only': ['text'],
    }),
    baseline: [],
  })
  assert.equal(report.ok, true, '两侧一致必须通过')
  assert.deepEqual(report.mismatches, [])
  assert.equal(report.pairs.length, 2)
})

test('M1 路由声明的模态 ⊃ 契约声明的模态 → 失败并列出差异', () => {
  const report = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'model-a', input: ['text', 'image', 'video'] }]),
    contractModalities: contractFixture({ 'model-a': ['text', 'image'] }),
    baseline: [],
  })
  assert.equal(report.ok, false)
  assert.deepEqual(gapIds(report.unexpected), ['model-a × video over'])
  assert.deepEqual(report.mismatches[0].route, ['text', 'image', 'video'])
  assert.deepEqual(report.mismatches[0].contract, ['text', 'image'])
})

test('M2 路由声明的模态 ⊂ 契约声明的模态 → 失败并列出差异', () => {
  const report = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'model-b', input: ['text', 'image'] }]),
    contractModalities: contractFixture({ 'model-b': ['text', 'image', 'video'] }),
    baseline: [],
  })
  assert.equal(report.ok, false)
  assert.deepEqual(gapIds(report.unexpected), ['model-b × video under'])
})

test('两侧完全无关的模态差异逐个列出，覆盖全部 MEDIA_TYPES 枚举', () => {
  const report = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'model-c', input: ['text'] }]),
    contractModalities: contractFixture({ 'model-c': ['text', 'image', 'video', 'audio', 'document'] }),
    baseline: [],
  })
  assert.deepEqual(gapIds(report.unexpected), [
    'model-c × audio under',
    'model-c × document under',
    'model-c × image under',
    'model-c × video under',
  ])
  assert.deepEqual(MODALITY_ORDER, ['text', 'image', 'video', 'audio', 'document'])
})

/* --------------------------------------------------------------------- M4 */

test('M4 路由行没有 input 键 → 等价 [text]，不产生假阳性', () => {
  const cordisText = cordisFixture([{ id: 'model-text-only' }])
  const parsed = parseRouteModalities(cordisText)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].declaredInput, false)
  assert.deepEqual(parsed[0].input, ['text'])

  const report = verifyModalityMatrix({
    cordisText,
    contractModalities: contractFixture({ 'model-text-only': ['text'] }),
    baseline: [],
  })
  assert.equal(report.ok, true, '缺 input 键不得产生假阳性')
  assert.deepEqual(report.routeDefaulted, ['model-text-only'])
})

test('M4（真实数据）三行缺 input 键的模型等价 [text] 且不产生缺口', () => {
  const report = runOnRealRepo()
  assert.deepEqual(report.routeDefaulted, ['claude-opus-5', 'deepseek-v4-pro', 'glm-5.3'])
  for (const id of ['claude-opus-5', 'deepseek-v4-pro', 'glm-5.3']) {
    const pair = report.pairs.find((entry) => entry.id === id)
    assert.ok(pair, `${id} 必须与契约配对`)
    assert.deepEqual(pair.route, ['text'], `${id} 的路由模态必须等价为 ['text']`)
    assert.deepEqual(pair.contract, ['text'], `${id} 的契约模态必须只有 text`)
  }
  const offending = report.mismatches.filter((entry) => report.routeDefaulted.includes(entry.id))
  assert.deepEqual(offending, [], '缺 input 键的三行不得出现在缺口清单里')
})

/* --------------------------------------------------------------------- M5 */

test('M5 反向对照：给 gemini-3.8-flash 单侧补上 video 声明后必须转红', () => {
  const fixtureBefore = {
    cordisText: cordisFixture([{ id: 'gemini-3.8-flash', input: ['text', 'image'] }]),
    contractModalities: contractFixture({ 'gemini-3.8-flash': ['text', 'image'] }),
    baseline: [],
  }

  // 对照 0：补声明之前必须为绿——否则「转红」证明不了任何事（夹具自带答案）。
  const before = verifyModalityMatrix(fixtureBefore)
  assert.equal(before.ok, true, '反向对照的起点必须是绿，否则夹具失真')
  assert.deepEqual(before.mismatches, [])

  // 对照 1：路由侧补上 video（契约没有）→ over-declared，必须转红。
  const overDeclared = verifyModalityMatrix({
    ...fixtureBefore,
    cordisText: cordisFixture([{ id: 'gemini-3.8-flash', input: ['text', 'image', 'video'] }]),
  })
  assert.equal(overDeclared.ok, false, '路由侧补上 video 后必须转红')
  assert.deepEqual(gapIds(overDeclared.unexpected), ['gemini-3.8-flash × video over'])

  // 对照 2：契约侧补上 video（路由没有）→ under-declared，即本 Issue 的真实故障形态。
  const underDeclared = verifyModalityMatrix({
    ...fixtureBefore,
    contractModalities: contractFixture({ 'gemini-3.8-flash': ['text', 'image', 'video'] }),
  })
  assert.equal(underDeclared.ok, false, '契约侧补上 video 后必须转红')
  assert.deepEqual(gapIds(underDeclared.unexpected), ['gemini-3.8-flash × video under'])
})

test('M5 反向对照（真实契约 + 合成路由）：把 video 补进路由声明后缺口必须消失', () => {
  const realIndex = collectContractModalities(loadAll())
  const realModalities = [...realIndex.get('gemini-3.8-flash').modalities]

  // 合成路由行：完全按契约声明 → 缺口清零（证明缺口来自声明差异，不是门禁恒红）。
  const aligned = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'gemini-3.8-flash', input: MODALITY_ORDER.filter((m) => realModalities.includes(m)) }]),
    contractModalities: realIndex,
    baseline: [],
  })
  assert.equal(aligned.ok, true)
  assert.deepEqual(aligned.mismatches, [])

  // 同一份契约、同一份门禁，只把路由声明退回真实值 → 缺口重新出现。
  const drifted = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'gemini-3.8-flash', input: ['text', 'image'] }]),
    contractModalities: realIndex,
    baseline: [],
  })
  assert.equal(drifted.ok, false)
  assert.deepEqual(gapIds(drifted.unexpected), [
    'gemini-3.8-flash × audio under',
    'gemini-3.8-flash × document under',
    'gemini-3.8-flash × video under',
  ])
})

/* --------------------------------------------------------------------- M6 */

test('M6 主干真实数据报出预期缺口，且缺口之外没有别的分歧', () => {
  const report = runOnRealRepo()
  assert.deepEqual(gapIds(report.mismatches), [
    'gemini-3.7-flash × video under',
    'gemini-3.8-flash × audio under',
    'gemini-3.8-flash × document under',
    'gemini-3.8-flash × video under',
  ])
  assert.equal(report.ok, true, '已知缺口全部落在基线清单内，CI 不因历史缺口长红')
  assert.deepEqual(report.unexpected, [])
  assert.deepEqual(report.stale, [])
  assert.deepEqual(report.unknownModalities, [])
  assert.deepEqual(report.structural, [])
  assert.equal(report.pairs.length, 12)
  assert.deepEqual(report.unpaired.routeOnly, ['deepseek-v4-flash-vision-exp'])
  assert.deepEqual(report.unpaired.contractOnly, ['deepseek-v4-flash'])
})

test('M6 真实数据：--no-baseline 形态下同样的缺口被判定为阻断', () => {
  const report = runOnRealRepo({ useBaseline: false })
  assert.equal(report.ok, false, '不应用基线时真实缺口必须阻断')
  assert.equal(report.unexpected.length, 4)
  assert.deepEqual(report.stale, [])
})

/* ------------------------------------------------------- 基线不得静音回归 */

test('基线外的任何新缺口即失败（门禁不为新分歧放宽）', () => {
  const report = verifyModalityMatrix({
    cordisText: readFileSync(CORDIS_PATH, 'utf8'),
    contractModalities: collectContractModalities(loadAll()),
    baseline: KNOWN_GAPS,
  })
  assert.equal(report.ok, true)

  // 同一个模型上出现一个不在基线里的模态分歧 → 必须阻断。
  const withNewGap = verifyModalityMatrix({
    cordisText: cordisFixture([
      { id: 'gemini-3.8-flash', input: ['text', 'image'] },
      { id: 'claude-sonnet-4-6', input: ['text', 'image', 'video'] },
    ]),
    contractModalities: contractFixture({
      'gemini-3.8-flash': ['text', 'image', 'video', 'audio', 'document'],
      'claude-sonnet-4-6': ['text', 'image'],
    }),
    baseline: KNOWN_GAPS,
  })
  assert.equal(withNewGap.ok, false)
  assert.deepEqual(gapIds(withNewGap.unexpected), ['claude-sonnet-4-6 × video over'])
  // 基线内的三条仍被放行，未被新缺口连带放大。
  assert.deepEqual(gapIds(withNewGap.mismatches.filter((entry) => entry.id === 'gemini-3.8-flash')), [
    'gemini-3.8-flash × audio under',
    'gemini-3.8-flash × document under',
    'gemini-3.8-flash × video under',
  ])
})

test('基线条目不再复现即失败（防止基线腐化把回归静音）', () => {
  const { unexpected, stale } = applyBaseline(
    [{ id: 'gemini-3.8-flash', modality: 'video', direction: 'under' }],
    KNOWN_GAPS,
  )
  assert.deepEqual(unexpected, [])
  assert.deepEqual(
    stale.map((entry) => `${entry.id} × ${entry.modality}`).sort(),
    ['gemini-3.7-flash × video', 'gemini-3.8-flash × audio', 'gemini-3.8-flash × document'],
  )

  const report = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'gemini-3.8-flash', input: ['text', 'image'] }]),
    contractModalities: contractFixture({ 'gemini-3.8-flash': ['text', 'image'] }),
    baseline: KNOWN_GAPS,
  })
  assert.equal(report.ok, false, '缺口修好后残留的基线条目必须阻断，逼迫同批删除')
  assert.equal(report.stale.length, KNOWN_GAPS.length)
})

/* --------------------------------------------------- 结构性与枚举闭包守卫 */

test('枚举闭包：路由声明了 MEDIA_TYPES 之外的模态即失败', () => {
  const report = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'model-a', input: ['text', 'videos'] }]),
    contractModalities: contractFixture({ 'model-a': ['text'] }),
    baseline: [],
  })
  assert.equal(report.ok, false)
  assert.deepEqual(report.unknownModalities, [{ id: 'model-a', side: 'route', modality: 'videos' }])
})

test('结构性守卫：路由或契约任一侧为空即拒绝放行（不得恒真）', () => {
  assert.throws(() => parseRouteModalities('- id: llm-pi-ai\n  config:\n    providers:\n      omnimux:\n        models: []\n'), /refusing to report an empty matrix/)
  assert.throws(() => parseRouteModalities('- id: other\n  name: x\n'), /no `- id: llm-pi-ai` row/)
  assert.throws(() => parseRouteModalities('plugins: {}\n'), /no longer a top-level YAML sequence/)

  const noPairs = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'model-a', input: ['text'] }]),
    contractModalities: contractFixture({ 'model-b': ['text'] }),
    baseline: [],
  })
  assert.equal(noPairs.ok, false)
  assert.equal(noPairs.structural.length, 1)
  assert.match(noPairs.structural[0], /compared nothing/)

  const emptyContract = verifyModalityMatrix({
    cordisText: cordisFixture([{ id: 'model-a', input: ['text'] }]),
    contractModalities: new Map(),
    baseline: [],
  })
  assert.equal(emptyContract.ok, false)
  assert.match(emptyContract.structural.join(' '), /vacuous pass/)
})

/* ------------------------------------------------------- 真源读取与配对健全 */

test('真实 cordis.patch.yml 可解析，且两处真源各自独立读取', () => {
  const models = parseRouteModalities(readFileSync(CORDIS_PATH, 'utf8'))
  assert.ok(models.length >= 10, `解析出的路由模型过少: ${models.length}`)
  for (const model of models) assert.ok(model.id.length > 0)
  assert.ok(models.some((model) => model.declaredInput), '至少要有一行显式声明 input')

  // 契约侧：gemini-3.8-flash 的模态必须来自 operations[].inputs[].type 汇总。
  const contractModalities = collectContractModalities(loadAll())
  assert.deepEqual([...contractModalities.get('gemini-3.8-flash').modalities].sort(), [
    'audio',
    'document',
    'image',
    'text',
    'video',
  ])
  assert.equal(contractModalities.get('gemini-3.8-flash').managementGroup, 'text')

  // reconcile 只按 id 配对，不依赖任一侧的派生投影。
  const reconciled = reconcile({
    routeModels: models,
    contractModalities,
  })
  assert.equal(reconciled.pairs.length + reconciled.unpaired.routeOnly.length, models.length)
})
