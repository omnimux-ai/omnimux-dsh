import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  CREATE_PROMPT_SECTIONS,
  buildDigitalCreatePromptText,
  buildPhysicalCreatePromptText,
  registerCreatePromptSections,
  renderPhysicalImportV9Prompt,
  sanitizeDshPromptVars,
} from './create-prompts.js'

const PROMPTS_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'prompts')

/** DSH renderPrompt 会认完整 `{{name}}`；section 文本禁止残留。 */
const DSH_MUSTACHE = /\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/

describe('sanitizeDshPromptVars', () => {
  it('rewrites complete {{name}} groups to guillemet markers', () => {
    assert.equal(
      sanitizeDshPromptVars('字段用 {{language}}；正文={{pageContent}}'),
      '字段用 «language»；正文=«pageContent»',
    )
  })

  it('leaves lone {{ without }} and already-sanitized text alone', () => {
    assert.equal(sanitizeDshPromptVars('示例 {{ 未闭合'), '示例 {{ 未闭合')
    assert.equal(sanitizeDshPromptVars('已是 «url»'), '已是 «url»')
  })
})

describe('renderPhysicalImportV9Prompt', () => {
  it('appends the page body to the playbook it was given', () => {
    const prompt = renderPhysicalImportV9Prompt({
      url: 'https://shop.example.com/p/aurora-mug',
      language: '中文',
      pageContent: 'Aurora Mug 350ml：双层陶瓷内胆，6 小时长效保温。',
    })
    // The vendored template keeps its own words …
    assert.match(prompt, /产品信息调研专家/)
    assert.match(prompt, /https:\/\/shop\.example\.com\/p\/aurora-mug/)
    // … and the body rides after it, so nothing is filled into a slot that the
    // template does not declare.
    assert.match(prompt, /以下是已提供的商品页面正文\/图文简介：/)
    assert.ok(prompt.endsWith('Aurora Mug 350ml：双层陶瓷内胆，6 小时长效保温。'))
    assert.doesNotMatch(prompt, DSH_MUSTACHE)
  })

  it('renders the playbook alone when there is no body to carry', () => {
    const prompt = renderPhysicalImportV9Prompt({ url: 'https://shop.example.com/p/aurora-mug' })
    assert.match(prompt, /产品信息调研专家/)
    assert.equal(prompt.includes('以下是已提供的商品页面正文'), false)
    assert.equal(
      renderPhysicalImportV9Prompt({ url: 'x', pageContent: '  \n\t ' }).includes('以下是已提供的商品页面正文'),
      false,
    )
  })
})

describe('create prompt sections (pure)', () => {
  it('exports CREATE_PROMPT_SECTIONS with stable name/order', () => {
    assert.deepEqual(
      CREATE_PROMPT_SECTIONS.map((s) => ({ name: s.name, order: s.order })),
      [
        { name: 'products:create:digital', order: 71 },
        { name: 'products:create:physical', order: 72 },
      ],
    )
  })

  it('digital text carries YAML anchors + CoT appendix', () => {
    const text = buildDigitalCreatePromptText()
    for (const needle of [
      'content_angles',
      'target_audience',
      'identity_and_product',
      'market_and_competition',
    ]) {
      assert.match(text, new RegExp(needle))
    }
    assert.ok(
      text.includes('Thinking Process') || text.includes('Pain Point'),
      'CoT appendix must stay resident',
    )
    assert.match(text, /Mutual exclusion/i)
    // digital 明确声明 price/SKU/promotion 不是数字货必填（互斥 / 门控）
    assert.match(text, /Do \*\*not\*\* treat price \/ SKU \/ promotion as required digital fields/)
    assert.doesNotMatch(text, /required:\s*\[.*"price"/)
  })

  it('assembled digital/physical text has no DSH-shaped Mustache', () => {
    const digital = buildDigitalCreatePromptText()
    const physical = buildPhysicalCreatePromptText()
    assert.doesNotMatch(digital, DSH_MUSTACHE)
    assert.doesNotMatch(physical, DSH_MUSTACHE)
    // 原文 fill-slot 仍可读：消毒后成 «name»
    assert.match(digital, /«language»/)
    assert.match(digital, /«pageContent»/)
    assert.match(physical, /«sourceFacts»|«url»|«pageContent»/)
  })

  it('physical text carries import / semantic / enhancement when-to-use', () => {
    const text = buildPhysicalCreatePromptText()
    assert.ok(
      text.includes('sellingPoints') || text.includes('selling_points'),
      'physical playbook must mention selling points field',
    )
    assert.ok(
      /semantic/i.test(text) && /sourceFacts/.test(text),
      'semantic enrichment + sourceFacts slots must appear',
    )
    assert.match(text, /jina-content/i)
    assert.match(text, /tiktok-enrich/i)
    assert.match(text, /detail-understanding/i)
    assert.match(text, /when to use/i)
    assert.match(text, /No fake fetch/i)
    assert.match(text, /omnimux_page_fetch/)
    assert.equal(text.includes('请访问'), false)
  })

  it('import-from-link.v9.txt itself never contains 请访问', () => {
    const raw = readFileSync(join(PROMPTS_ROOT, 'physical/import-from-link.v9.txt'), 'utf8')
    assert.equal(raw.includes('请访问'), false)
    assert.match(raw, /categories/)
    assert.match(raw, /≤5|<=5/)
  })

  it('archive fallback is on disk but never registered', () => {
    const archive = readFileSync(
      join(PROMPTS_ROOT, '_archive/import-from-link.fallback.txt'),
      'utf8',
    )
    assert.ok(archive.length > 0)
    /** @type {Array<{ name: string, text: string }>} */
    const sections = []
    registerCreatePromptSections({
      section(spec) {
        sections.push(spec)
      },
    })
    assert.equal(sections.length, 2)
    for (const s of sections) {
      assert.equal(s.text.includes(archive.slice(0, 40)), false)
    }
  })
})
