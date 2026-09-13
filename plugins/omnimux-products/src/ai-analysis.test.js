import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ANALYSIS_MODES,
  DEFAULT_TEXT_MODEL,
  analyzeLandingPage,
  composePageContent,
  extractModelText,
  extractStructuredPayload,
  isDigitalLandingPage,
  mapBrandStrategyToDraft,
  mapPhysicalPayloadToDraft,
  normalizeHub,
} from './ai-analysis.js'
import { normalizeBrandStrategy } from './brand-strategy.js'

const DIGITAL_URL = 'https://platform.example.com'
const PHYSICAL_URL = 'https://shop.example.com/p/aurora-mug'

/** A brand-strategy v2 answer, exactly as the playbook asks for it. */
const BRAND_YAML = `\`\`\`yaml
brand_basic_info:
  company:
    name: "MiniMax"
    website: "https://platform.example.com"
    locale: "cn"
  product:
    name: "MiniMax 开放平台"
    category: "AI 平台"

content_angles:
  - id: "cost_01"
    title: "成本焦虑"
    description: "按量付费，无需自建 GPU"
    target_audience: "AI 应用开发者"
    priority: 1

tone_and_voice:
  dos:
    - "用数据说话"
  donts:
    - "夸大效果"

identity_and_product:
  core_identity: "一站式多模态模型服务"
  product_offering:
    - "文本模型 API"
    - "语音模型 API"
  unique_advantage:
    - "超长上下文"
  problems_solved:
    - "多模型拼接成本高"
  solutions:
    - "一个接口接入多模态"

mission_and_positioning:
  mission: "让智能触手可及"
  differentiation:
    - "性价比"
  ownable_space:
    statement: "多模态入口"
    category: "AI 平台"
    is_not:
      - "通用云"

market_and_competition:
  customer_segments:
    - name: "AI 应用开发者"
      percentage: 60
  competitors:
    - name: "OpenAI"
      website: "https://openai.com"
\`\`\``

const PHYSICAL_JSON = JSON.stringify({
  name: 'Aurora Mug 350ml',
  description: '双层陶瓷保温杯，保温 6 小时。',
  features: '容量: 350ml,材质: 双层陶瓷',
  sellingPoints: '6 小时长效保温,防滑硅胶底座',
  brand: 'Aurora',
  targetAudience: '咖啡爱好者',
  price: 24.9,
  promotion: '限时包邮',
  category: 'physicalproduct,home,drinkware',
})

/** @param {{ nodes?: object[], text?: string, title?: string, meta?: object }} over */
function page(over = {}) {
  return {
    title: 'Example',
    canonical: '',
    meta: {},
    nodes: [],
    images: [],
    bullets: [],
    text: '',
    ...over,
  }
}

describe('ai-analysis · hub shape', () => {
  it('keeps only the callable seams', () => {
    assert.equal(normalizeHub(undefined), null)
    assert.equal(normalizeHub({}), null)
    const textComplete = async () => ({ text: 'x' })
    assert.deepEqual(Object.keys(normalizeHub({ textComplete, pageFetch: 'nope' })), ['textComplete'])
  })
})

describe('ai-analysis · which playbook reads the page', () => {
  it('takes an explicit kind as the answer', () => {
    assert.equal(isDigitalLandingPage({ kind: 'digital', page: page() }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: page() }), false)
  })

  it('reads commercial structured data as a listing, whatever the copy says', () => {
    const shop = page({
      nodes: [{ '@type': 'Product' }, { '@type': 'Offer' }],
      text: '免费试用我们的 SaaS API 平台，预约演示',
    })
    assert.equal(isDigitalLandingPage({ page: shop }), false)
    assert.equal(isDigitalLandingPage({ kind: 'digital', page: shop }), true)
  })

  it('reads a software schema type as a software site', () => {
    assert.equal(isDigitalLandingPage({ page: page({ nodes: [{ '@type': 'SoftwareApplication' }] }) }), true)
    assert.equal(isDigitalLandingPage({ page: page({ nodes: [{ '@type': 'WebApplication' }] }) }), true)
  })

  it('needs more than one software marker in the copy', () => {
    assert.equal(isDigitalLandingPage({ page: page({ text: '我们的 API 很好用' }) }), false)
    assert.equal(isDigitalLandingPage({ page: page({ text: '开发者文档齐备，支持免费试用' }) }), true)
  })

  it('reads a platform word in the title as a software site, without the page text', () => {
    assert.equal(isDigitalLandingPage({ page: page({ title: 'MiniMax 开放平台' }) }), true)
    assert.equal(isDigitalLandingPage({ page: page({ title: 'Acme API documentation' }) }), true)
    // One soft platform word is still not enough on its own.
    assert.equal(isDigitalLandingPage({ page: page({ title: 'Acme AI' }) }), false)
    assert.equal(isDigitalLandingPage({ page: page({ text: '我们的 ai 助手很好用' }) }), false)
    assert.equal(isDigitalLandingPage({ page: page({ text: '我们的 ai 助手，支持云端工作流' }) }), true)
  })

  it('reads a software host as a software site even when the form said physical', () => {
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://www.minimax.ai/' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://docs.tiktok.com/x' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://api.example.com/v1' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://app.example.com/' }), true)
    // The page's own canonical URL counts when the caller passes none.
    assert.equal(isDigitalLandingPage({ page: page({ canonical: 'https://console.example.ai/' }) }), true)
    // An ordinary shop host is untouched.
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://shop.example.com/p/1' }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'not a url' }), false)
  })

  it('lets the page overrule a defaulted physical kind, but never a shop listing', () => {
    const software = page({ text: '一站式多模态模型服务，控制台与开发者文档齐备' })
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: software }), true)
    const shop = page({ nodes: [{ '@type': 'Product' }], text: '一站式多模态模型服务，控制台与开发者文档齐备' })
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: shop }), false)
  })

  it('never guesses without a page', () => {
    assert.equal(isDigitalLandingPage({}), false)
    assert.equal(isDigitalLandingPage({ page: null }), false)
  })
})

describe('ai-analysis · model input and answer shapes', () => {
  it('composes heading, summary and the cleanest body it has', () => {
    const text = composePageContent({
      title: 'MiniMax 开放平台',
      markdown: '# 正文\n\n多模态模型服务',
      page: page({
        title: 'ignored',
        meta: { description: ['一句话简介'] },
        text: 'HTML 抽出的正文',
      }),
    })
    assert.match(text, /^# MiniMax 开放平台/)
    assert.match(text, /一句话简介/)
    assert.match(text, /多模态模型服务/)
    assert.doesNotMatch(text, /HTML 抽出的正文/)
  })

  it('falls back to the extracted text when the hub read produced nothing', () => {
    const text = composePageContent({ markdown: '', page: page({ title: 'A', text: 'B' }) })
    assert.equal(text, '# A\n\nB')
  })

  it('caps the input it hands the model', () => {
    const text = composePageContent({ markdown: 'x'.repeat(40000) })
    assert.equal(text.length, 24000)
  })

  it('unwraps every answer shape the hub may return', () => {
    assert.equal(extractModelText('  hi  '), 'hi')
    assert.equal(extractModelText({ text: ' a ' }), 'a')
    assert.equal(extractModelText({ content: 'b' }), 'b')
    assert.equal(extractModelText({ choices: [{ message: { content: 'c' } }] }), 'c')
    assert.equal(extractModelText({}), '')
    assert.equal(extractModelText(null), '')
  })

  it('parses a fenced report, bare JSON, and refuses prose', () => {
    assert.equal(extractStructuredPayload(BRAND_YAML).brand_basic_info.company.name, 'MiniMax')
    assert.deepEqual(extractStructuredPayload('```json\n{"a":1}\n```'), { a: 1 })
    assert.deepEqual(extractStructuredPayload('{"a":1}'), { a: 1 })
    assert.deepEqual(extractStructuredPayload('好的，以下是报告：\n没有结构'), null)
    assert.equal(extractStructuredPayload(''), null)
  })

  it('reads the prose-shaped report a chatty model answers with', () => {
    const answer = [
      '```yaml',
      'brand_basic_info:',
      '  company:',
      '    name: MiniMax',
      '  product:',
      '    name: "MiniMax 开放平台"',
      '',
      'content_angles:',
      '  - {id: cost_01, title: "成本: 焦虑", description: "按量付费，无需自建 GPU", priority: 1}',
      '',
      'identity_and_product:',
      '  core_identity: >',
      '    一站式多模态模型服务，',
      '    支持免费试用',
      '  unique_advantage:',
      '    - 超长上下文',
      '```',
    ].join('\n')
    // A block scalar and an inline collection must not cost the whole report.
    const payload = extractStructuredPayload(answer)
    assert.ok(payload, 'the report must survive its own formatting')
    const strategy = normalizeBrandStrategy(payload)
    assert.equal(strategy.identity_and_product.core_identity, '一站式多模态模型服务， 支持免费试用\n')
    assert.deepEqual(strategy.identity_and_product.unique_advantage, ['超长上下文'])
    assert.equal(strategy.content_angles[0].title, '成本: 焦虑')

    const draft = mapBrandStrategyToDraft(strategy)
    assert.equal(draft.name, 'MiniMax 开放平台')
    assert.equal(draft.selling_points, '一站式多模态模型服务， 支持免费试用，超长上下文')
  })
})

describe('ai-analysis · field mapping', () => {
  it('turns the six modules into the flat draft fields', () => {
    const strategy = normalizeBrandStrategy(extractStructuredPayload(BRAND_YAML))
    const draft = mapBrandStrategyToDraft(strategy)
    assert.equal(draft.name, 'MiniMax 开放平台')
    assert.equal(draft.brand, 'MiniMax')
    assert.equal(draft.selling_points, '一站式多模态模型服务，超长上下文')
    assert.equal(draft.features, '文本模型 API，语音模型 API，一个接口接入多模态')
    assert.equal(draft.target_audience, 'AI 应用开发者')
    assert.deepEqual(draft.categories, ['AI 平台'])
  })

  it('reads both spellings of the v9 answer and normalizes the price', () => {
    const draft = mapPhysicalPayloadToDraft(JSON.parse(PHYSICAL_JSON))
    assert.equal(draft.name, 'Aurora Mug 350ml')
    assert.equal(draft.selling_points, '6 小时长效保温,防滑硅胶底座')
    assert.equal(draft.features, '容量: 350ml,材质: 双层陶瓷')
    assert.equal(draft.target_audience, '咖啡爱好者')
    assert.equal(draft.brand, 'Aurora')
    assert.equal(draft.price, '24.9')
    assert.equal(draft.promotion, '限时包邮')
    assert.deepEqual(draft.categories, ['physicalproduct', 'home', 'drinkware'])

    const snake = mapPhysicalPayloadToDraft({
      selling_points: 'a',
      target_audience: 'b',
      price: '¥1,299.00',
      category: 'beauty,fashion,lifestyle,health,home,toys',
    })
    assert.equal(snake.selling_points, 'a')
    assert.equal(snake.target_audience, 'b')
    assert.equal(snake.price, '1299')
    assert.equal(snake.categories.length, 5)
    assert.deepEqual(snake.categories, ['beauty', 'fashion', 'lifestyle', 'health', 'home'])
  })

  it('uses the description as feature copy only when no features came back', () => {
    assert.equal(mapPhysicalPayloadToDraft({ description: '一段描述' }).features, '一段描述')
    assert.equal(mapPhysicalPayloadToDraft({ description: '一段描述', features: '卖点' }).features, '卖点')
    assert.equal(mapPhysicalPayloadToDraft({ price: '面议' }).price, '')
  })
})

describe('ai-analysis · one import through the model', () => {
  it('degrades with a reason when the host offers no model channel', async () => {
    const result = await analyzeLandingPage({ hub: null, kind: 'physical', page: page({ text: 'x' }) })
    assert.equal(result.mode, ANALYSIS_MODES.HEURISTIC)
    assert.equal(result.model, null)
    assert.match(result.reason, /大模型通道/)
    assert.equal(result.fields, null)
    assert.equal(result.brand_strategy, null)
  })

  it('degrades when there is no page text to send', async () => {
    const result = await analyzeLandingPage({
      hub: { textComplete: async () => ({ text: BRAND_YAML }) },
      kind: 'digital',
      page: page({ title: '', text: '' }),
    })
    assert.equal(result.mode, ANALYSIS_MODES.HEURISTIC)
    assert.match(result.reason, /正文为空/)
  })

  it('reads a digital page with the v2 playbook and the default model', async () => {
    const calls = []
    const result = await analyzeLandingPage({
      hub: {
        textComplete: async (request) => {
          calls.push(request)
          return { text: BRAND_YAML, model: request.model }
        },
      },
      kind: 'digital',
      url: DIGITAL_URL,
      page: page({ title: 'MiniMax 开放平台', text: '一站式多模态模型服务' }),
    })

    assert.equal(result.mode, ANALYSIS_MODES.MODEL)
    assert.equal(result.model, DEFAULT_TEXT_MODEL)
    assert.equal(result.kind, 'digital')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].model, 'gemini-3.8-flash')
    // The v2 playbook is the prompt, with its slots really filled.
    assert.match(calls[0].prompt, /品牌战略专家/)
    assert.match(calls[0].prompt, /一站式多模态模型服务/)
    assert.match(calls[0].prompt, /字段值用 中文 填写/)
    assert.doesNotMatch(calls[0].prompt, /\{\{pageContent\}\}/)
    assert.match(calls[0].reason, /omnimux-products/)

    // Six modules, normalized, plus the flat fields mapped off them.
    assert.deepEqual(Object.keys(result.brand_strategy), [
      'brand_basic_info',
      'content_angles',
      'tone_and_voice',
      'identity_and_product',
      'mission_and_positioning',
      'market_and_competition',
    ])
    assert.equal(result.fields.name, 'MiniMax 开放平台')
    assert.equal(result.fields.selling_points, '一站式多模态模型服务，超长上下文')
  })

  it('honours a pinned model and reads a physical listing with the v9 playbook', async () => {
    const calls = []
    const result = await analyzeLandingPage({
      hub: {
        textComplete: async (request) => {
          calls.push(request)
          return { text: PHYSICAL_JSON }
        },
      },
      kind: 'physical',
      url: PHYSICAL_URL,
      model: 'gpt-5.6-sol',
      page: page({ title: 'Aurora Mug', text: 'Double-wall ceramic mug' }),
    })

    assert.equal(result.mode, ANALYSIS_MODES.MODEL)
    assert.equal(result.model, 'gpt-5.6-sol')
    assert.equal(result.kind, 'physical')
    assert.equal(result.brand_strategy, null)
    assert.match(calls[0].prompt, /产品信息调研专家/)
    assert.match(calls[0].prompt, new RegExp(PHYSICAL_URL))
    assert.equal(result.fields.name, 'Aurora Mug 350ml')
    assert.equal(result.fields.price, '24.9')
  })

  it('never throws: a failing seam, an empty answer and a broken report all degrade', async () => {
    const cases = [
      { textComplete: async () => { throw new Error('no key configured') }, reason: /大模型调用失败/ },
      { textComplete: async () => ({ text: '' }), reason: /未返回可用内容/ },
      { textComplete: async () => ({ text: '抱歉，我无法完成' }), reason: /未包含可解析/ },
    ]
    for (const row of cases) {
      const result = await analyzeLandingPage({
        hub: { textComplete: row.textComplete },
        kind: 'digital',
        page: page({ text: '有正文' }),
      })
      assert.equal(result.mode, ANALYSIS_MODES.HEURISTIC)
      assert.match(result.reason, row.reason)
      assert.equal(result.brand_strategy, null)
    }
  })

  it('reports an empty brand report as a degraded read, not a crash', async () => {
    const result = await analyzeLandingPage({
      hub: { textComplete: async () => ({ text: '```yaml\nbrand_basic_info:\n  company:\n    name: ""\n```' }) },
      kind: 'digital',
      page: page({ text: '有正文' }),
    })
    assert.equal(result.mode, ANALYSIS_MODES.HEURISTIC)
    assert.match(result.reason, /战略模块/)
  })
})
