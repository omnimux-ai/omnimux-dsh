import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { YamlMiniError, fencedBlocks, parseYamlMini, stripCodeFence } from './yaml-mini.js'

/** The shape the brand-strategy v2 playbook answers with. */
const REPORT = `brand_basic_info:
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
  unique_advantage:
    - "超长上下文"

market_and_competition:
  customer_segments:
    - name: "AI 应用开发者"
      percentage: 60
  competitors:
    - name: "OpenAI"
      website: "https://openai.com"
`

describe('yaml-mini · fenced blocks', () => {
  it('lists every fenced block with its language, skipping empty ones', () => {
    const text = '前言\n```yaml\na: 1\n```\n中间\n```json\n{"b":2}\n```\n```\n```\n'
    assert.deepEqual(fencedBlocks(text), [
      { lang: 'yaml', body: 'a: 1' },
      { lang: 'json', body: '{"b":2}' },
    ])
  })

  it('strips the preferred fence, falls back to the whole text', () => {
    assert.equal(stripCodeFence('```yaml\na: 1\n```', ['yaml']), 'a: 1')
    assert.equal(stripCodeFence('```json\n{}\n```', ['yaml']), '{}')
    assert.equal(stripCodeFence('a: 1', ['yaml']), 'a: 1')
    assert.equal(stripCodeFence('', ['yaml']), '')
  })
})

describe('yaml-mini · report parsing', () => {
  it('reads nested maps, scalar lists and lists of maps', () => {
    const value = parseYamlMini(REPORT)
    assert.equal(value.brand_basic_info.company.name, 'MiniMax')
    assert.equal(value.brand_basic_info.product.category, 'AI 平台')
    assert.deepEqual(value.tone_and_voice.dos, ['用数据说话'])
    assert.equal(value.content_angles.length, 1)
    assert.equal(value.content_angles[0].priority, 1)
    assert.equal(value.content_angles[0].target_audience, 'AI 应用开发者')
    assert.deepEqual(value.market_and_competition.customer_segments, [{ name: 'AI 应用开发者', percentage: 60 }])
    assert.deepEqual(value.market_and_competition.competitors, [{ name: 'OpenAI', website: 'https://openai.com' }])
  })

  it('reads a top-level list, including a nested block under a bare dash', () => {
    const value = parseYamlMini('rows:\n  -\n    name: a\n  -\n    name: b\n')
    assert.deepEqual(value, { rows: [{ name: 'a' }, { name: 'b' }] })
  })

  it('reads a sequence written at the same indent as its key', () => {
    assert.deepEqual(parseYamlMini('dos:\n- "一"\n- "二"\n'), { dos: ['一', '二'] })
  })

  it('handles quoted colons, inline collections, comments and document markers', () => {
    const value = parseYamlMini([
      '---',
      'title: "a: b"',
      'tags: [alpha, beta]',
      'locale: \'cn\'',
      'empty:',
      'nothing: null',
      'flag: true',
      'note: "有 # 号的值" # 真正的注释',
      'plain: value # 真正的注释',
      'sizes: { w: 1, h: 2 }',
    ].join('\n'))
    assert.equal(value.title, 'a: b')
    assert.deepEqual(value.tags, ['alpha', 'beta'])
    assert.equal(value.locale, 'cn')
    assert.equal(value.empty, null)
    assert.equal(value.nothing, null)
    assert.equal(value.flag, true)
    assert.equal(value.note, '有 # 号的值')
    assert.equal(value.plain, 'value')
    assert.deepEqual(value.sizes, { w: 1, h: 2 })
  })

  it('keeps a bare hash inside a word', () => {
    assert.deepEqual(parseYamlMini('issue: C#7'), { issue: 'C#7' })
  })

  it('answers null for nothing to read', () => {
    assert.equal(parseYamlMini(''), null)
    assert.equal(parseYamlMini('\n\n# only a comment\n'), null)
  })

  it('refuses an input outside the supported subset instead of guessing', () => {
    assert.throws(() => parseYamlMini('a: 1\n   b: 2\n'), YamlMiniError)
    assert.throws(() => parseYamlMini('a: 1\nnot a key line\n'), YamlMiniError)
  })
})
