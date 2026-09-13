import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractStructuredPayload } from './ai-analysis.js'
import {
  emptyBrandStrategy,
  isDigitalProduct,
  isPlainStrategy,
  normalizeBrandStrategy,
} from './brand-strategy.js'
import { ProductsError } from './errors.js'

/** A complete v2 report, exactly as the playbook asks the model for it. */
const REPORT = {
  brand_basic_info: {
    company: { name: 'MiniMax', website: 'https://platform.example.com', locale: 'cn' },
    product: { name: 'MiniMax 开放平台', category: 'AI 平台' },
  },
  content_angles: [
    {
      id: 'cost_01',
      title: '成本焦虑',
      description: '按量付费，无需自建 GPU',
      target_audience: 'AI 应用开发者',
      priority: 1,
    },
  ],
  tone_and_voice: { dos: ['用数据说话'], donts: ['夸大效果'] },
  identity_and_product: {
    core_identity: '一站式多模态模型服务',
    product_offering: ['文本模型 API', '语音模型 API'],
    unique_advantage: ['超长上下文'],
    problems_solved: ['多模型拼接成本高'],
    solutions: ['一个接口接入多模态'],
  },
  mission_and_positioning: {
    mission: '让智能触手可及',
    differentiation: ['性价比'],
    ownable_space: { statement: '多模态入口', category: 'AI 平台', is_not: ['通用云'] },
  },
  market_and_competition: {
    customer_segments: [{ name: 'AI 应用开发者', percentage: 60 }],
    competitors: [{ name: 'OpenAI', website: 'https://openai.com' }],
  },
}

/** @returns {typeof REPORT} */
function report() {
  return JSON.parse(JSON.stringify(REPORT))
}

const BARE = normalizeBrandStrategy(report())

/** The report wrapped in the namespace a model put it under. */
const WRAPPED_YAML = `\`\`\`yaml
brand_strategy:
  brand_basic_info:
    company:
      name: "MiniMax"
      website: "https://platform.example.com"
      locale: "cn"
    product:
      name: "MiniMax 开放平台"
      category: "AI 平台"
  identity_and_product:
    core_identity: "一站式多模态模型服务"
    unique_advantage:
      - "超长上下文"
  mission_and_positioning:
    mission: "让智能触手可及"
  market_and_competition:
    customer_segments:
      - name: "AI 应用开发者"
        percentage: 60
\`\`\``

describe('brand-strategy · shape guards', () => {
  it('reads an empty or absent strategy as null', () => {
    assert.equal(normalizeBrandStrategy(null), null)
    assert.equal(normalizeBrandStrategy(undefined), null)
    assert.equal(normalizeBrandStrategy(''), null)
    assert.equal(normalizeBrandStrategy(emptyBrandStrategy()), null)
  })

  it('refuses a payload that is not a map', () => {
    for (const value of [[], 'brand_basic_info: x', 3, true]) {
      assert.throws(
        () => normalizeBrandStrategy(value),
        (error) => error instanceof ProductsError && error.code === 'brand-strategy-invalid',
      )
    }
  })

  it('keeps the plain-object rule the storage path relies on', () => {
    assert.equal(isPlainStrategy({}), true)
    assert.equal(isPlainStrategy(Object.create(null)), true)
    assert.equal(isPlainStrategy([]), false)
    assert.equal(isPlainStrategy(new Map()), false)
  })
})

describe('brand-strategy · the six modules', () => {
  it('normalizes a bare report into the persisted shape', () => {
    assert.deepEqual(Object.keys(BARE), [
      'brand_basic_info',
      'content_angles',
      'tone_and_voice',
      'identity_and_product',
      'mission_and_positioning',
      'market_and_competition',
    ])
    assert.equal(BARE.brand_basic_info.company.name, 'MiniMax')
    assert.equal(BARE.brand_basic_info.product.name, 'MiniMax 开放平台')
    assert.equal(BARE.identity_and_product.core_identity, '一站式多模态模型服务')
    assert.deepEqual(BARE.market_and_competition.customer_segments, [
      { name: 'AI 应用开发者', percentage: 60 },
    ])
  })

  it('marks a digital product once the strategy survives normalization', () => {
    assert.equal(isDigitalProduct({ kind: 'digital', brand_strategy: BARE }), true)
    assert.equal(isDigitalProduct({ kind: 'digital', brand_strategy: null }), false)
    assert.equal(isDigitalProduct({ kind: 'physical', brand_strategy: BARE }), false)
  })
})

describe('brand-strategy · a report the model namespaced', () => {
  it('unwraps every namespace the playbook answer has arrived in', () => {
    for (const wrapper of ['brand_strategy', 'brand_report', 'strategy', 'data']) {
      const wrapped = { [wrapper]: report() }
      const out = normalizeBrandStrategy(wrapped)
      assert.deepEqual(out, BARE, `${wrapper} must be peeled`)
      assert.equal(out.brand_basic_info.product.name, 'MiniMax 开放平台')
    }
  })

  it('unwraps the product name a model keys the report by', () => {
    const out = normalizeBrandStrategy({ 'MiniMax 开放平台': report() })
    assert.deepEqual(out, BARE)
  })

  it('unwraps a chain of namespaces', () => {
    const out = normalizeBrandStrategy({ data: { brand_strategy: report() } })
    assert.deepEqual(out, BARE)
  })

  it('keeps report modules that arrived beside a namespace', () => {
    const out = normalizeBrandStrategy({ content_angles: report().content_angles, brand_strategy: report() })
    assert.deepEqual(out.brand_basic_info, BARE.brand_basic_info)
  })

  it('never buries a complete report under a foreign sibling', () => {
    const out = normalizeBrandStrategy({
      ...report(),
      data: { brand_basic_info: { company: { name: '别家' } } },
    })
    assert.equal(out.brand_basic_info.company.name, 'MiniMax')
  })

  it('still reads an empty namespace as an empty report', () => {
    assert.equal(normalizeBrandStrategy({ brand_strategy: {} }), null)
    assert.equal(normalizeBrandStrategy({ brand_strategy: { brand_basic_info: { company: { name: '' } } } }), null)
    assert.equal(normalizeBrandStrategy({ 报告: '见下' }), null)
    assert.equal(normalizeBrandStrategy({ a: { b: { c: { d: report() } } } }), null)
  })

  it('reads a wrapped report out of a real model answer, end to end', () => {
    const payload = extractStructuredPayload(WRAPPED_YAML)
    // The bug needed the wrapper to be the only thing at the top level.
    assert.deepEqual(Object.keys(payload), ['brand_strategy'])

    const out = normalizeBrandStrategy(payload)
    assert.ok(out, 'a wrapped report must not read as an empty one')
    assert.equal(out.brand_basic_info.company.name, 'MiniMax')
    assert.equal(out.brand_basic_info.product.name, 'MiniMax 开放平台')
    assert.equal(out.identity_and_product.core_identity, '一站式多模态模型服务')
    assert.deepEqual(out.identity_and_product.unique_advantage, ['超长上下文'])
    assert.deepEqual(out.market_and_competition.customer_segments, [
      { name: 'AI 应用开发者', percentage: 60 },
    ])
  })
})
