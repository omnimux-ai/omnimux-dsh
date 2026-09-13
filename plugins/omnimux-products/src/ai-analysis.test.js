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
import { parseHtmlDocument } from './link-importer.js'

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
    assert.equal(isDigitalLandingPage({ page: page({ text: '我们的控制台很好用' }) }), false)
    assert.equal(isDigitalLandingPage({ page: page({ text: '开发者文档齐备，支持免费试用' }) }), true)
  })

  it('reads a platform word in the title as a software site, without the page text', () => {
    assert.equal(isDigitalLandingPage({ page: page({ title: 'MiniMax 开放平台' }) }), true)
    assert.equal(isDigitalLandingPage({ page: page({ title: 'Acme API documentation' }) }), true)
    // One marker is still not enough on its own.
    assert.equal(isDigitalLandingPage({ page: page({ title: 'Acme AI' }) }), false)
    assert.equal(isDigitalLandingPage({ page: page({ text: '我们的 ai 助手很好用' }) }), false)
    // `ai`, `cloud`, `bot`, `docs` and `platform` are shop vocabulary too, so
    // they were dropped from the marker list and no longer decide anything.
    assert.equal(isDigitalLandingPage({ page: page({ text: '我们的 ai 助手，支持云端工作流' }) }), false)
  })

  it('reads a developer host as a software site even when the form said physical', () => {
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://www.minimax.ai/' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://docs.tiktok.com/x' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://api.example.com/v1' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://console.example.com' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://developer.example.com' }), true)
    // A scheme-less host the user typed by hand reaches the classifier raw.
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'www.OmniMux.ai' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'omnimux.ai/docs/getting-started' }), true)
    // The page's own canonical URL counts when the caller passes none.
    assert.equal(isDigitalLandingPage({ page: page({ canonical: 'https://console.example.ai/' }) }), true)
    // A shop host is not a developer host.
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://shop.example.com/p/1' }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'not a url' }), false)
  })

  it('does not let a bare app. or portal. subdomain decide the playbook', () => {
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://app.example.com/' }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://portal.example.com/' }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://dashboard.example.com/' }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://platform.example.com/' }), false)
    // …and the same again through the page's canonical URL.
    assert.equal(isDigitalLandingPage({ page: page({ canonical: 'https://app.example.com/' }) }), false)
    // Such a page still routes digital on software copy of its own — the marker
    // rule is what decides now, not the subdomain.
    const console = page({ text: '控制台：按量计费，开发者文档与 API 文档齐备' })
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://app.example.com/', page: console }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://portal.example.com/', page: console }), true)
  })

  it('lets the page overrule a defaulted physical kind, but never a shop listing', () => {
    const software = page({ text: '一站式多模态模型服务，开发者文档与 API 齐备' })
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: software }), true)
    const shop = page({ nodes: [{ '@type': 'Product' }], text: '一站式多模态模型服务，开发者文档与 API 齐备' })
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: shop }), false)
  })

  it('never guesses without a page', () => {
    assert.equal(isDigitalLandingPage({}), false)
    assert.equal(isDigitalLandingPage({ page: null }), false)
  })
})

describe('ai-analysis · e-commerce outranks every software signal', () => {
  /**
   * A page that is a shop *and* reads like a software site: the exact shape
   * that regressed. Copy, title and host all point at software; only the
   * shopping signals say listing.
   *
   * @param {{ title?: string, text?: string, nodes?: object[], meta?: object }} over
   * @returns {object}
   */
  function shopPage(over = {}) {
    return page({
      title: 'AI 智能助手 云端工作流 控制台 开发者文档 开放平台 按量计费',
      text: '免费试用，API 文档齐备，支持 SDK 与 MCP。',
      ...over,
    })
  }

  it('keeps a marketplace result page physical, whatever the copy says', () => {
    // The Amazon result page QA captured: a footer navigation bar carrying `AI`
    // and `cloud`, and thousands of product cards carrying cart controls and
    // prices. No Product schema at all.
    const amazonSearch = shopPage({
      title: 'Amazon.com : ceramic mug',
      text: [
        'Amazon Basics Sell Home Improvement Pet Supplies Health AI Medical Care',
        '1-48 of over 70,000 results for "ceramic mug"',
        'Nordic Ceramic Mug, 350ml',
        '$10.99',
        'Add to Cart',
      ].join('\n'),
    })
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: amazonSearch }), false)
    assert.equal(isDigitalLandingPage({ url: 'https://www.amazon.com/s?k=ceramic+mug', page: amazonSearch }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://amazon.com/s?k=mug', page: amazonSearch }), false)
  })

  it('keeps a listing physical on every shopping control the copy can carry', () => {
    const controls = [
      'Add to Cart',
      'Add to Bag',
      'Buy Now',
      '立即购买',
      '加入购物车',
      'In Stock',
      'Sold by Amazon.com',
      '4.5 out of 5 stars · 1,204 Customer Reviews',
      'Free shipping on orders over $25',
      '全场包邮',
    ]
    for (const control of controls) {
      assert.equal(
        isDigitalLandingPage({ kind: 'physical', page: shopPage({ text: control }) }),
        false,
        `expected a listing for ${JSON.stringify(control)}`,
      )
    }
  })

  it('needs two price or size signals, so a single price never vetoes a software page', () => {
    // Two price / size signals is the shape a listing has.
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: shopPage({ text: '￥199.00 350ml' }) }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: shopPage({ text: '$10.99 · $27.99' }) }), false)
    // One price is what a SaaS pricing line looks like: it settles nothing, so
    // the page's own markers still decide — digital here, physical there.
    for (const price of ['$10.99', '￥199.00', '199 元', '199元']) {
      assert.equal(
        isDigitalLandingPage({ kind: 'physical', page: shopPage({ text: price }) }),
        true,
        `a software page keeps its own reading for ${JSON.stringify(price)}`,
      )
      assert.equal(
        isDigitalLandingPage({ kind: 'physical', page: page({ title: 'Aurora 保温杯', text: price }) }),
        false,
        `a plain goods page stays a listing for ${JSON.stringify(price)}`,
      )
    }
    assert.equal(
      isDigitalLandingPage({
        kind: 'physical',
        url: 'https://acme.com/pricing',
        page: page({ title: 'Acme 控制台 按量计费', text: '按量计费，Starting at $10 per month.' }),
      }),
      true,
    )
    assert.equal(
      isDigitalLandingPage({ kind: 'physical', url: 'https://acmecorp.com/docs', page: page({ text: 'API documentation，按量计费。' }) }),
      true,
    )
  })

  it('keeps a listing physical on a developer host', () => {
    const listing = shopPage({ text: '加入购物车 ￥199.00' })
    for (const url of [
      'https://www.amazon.com/dp/B08N5WRWNW',
      'https://omnimux.myshopify.ai/products/mug',
      'https://api.example.com/products/1',
      'https://console.example.com/products/1',
      'https://shop.ecommercemug.ai/products/mug',
    ]) {
      assert.equal(isDigitalLandingPage({ kind: 'physical', url, page: listing }), false, `expected a listing for ${url}`)
    }
  })

  it('keeps a .ai shop physical when only the copy decides', () => {
    const dtc = page({
      title: 'Aurora 保温杯 350ml',
      text: '双层陶瓷保温杯，保温 6 小时。加入购物车',
    })
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://shop.ecommercemug.ai/products/mug', page: dtc }), false)
  })

  it('lets a shop subdomain take back the .ai TLD, but not a developer subdomain', () => {
    const bare = page({ title: 'Aurora Mug', text: '$24.90' })
    for (const url of [
      'https://shop.ecommercemug.ai/products/mug',
      'https://store.ecommercemug.ai/products/mug',
      'https://cart.ecommercemug.ai/',
      'https://checkout.ecommercemug.ai/',
    ]) {
      assert.equal(isDigitalLandingPage({ kind: 'physical', url, page: bare }), false, `expected a listing for ${url}`)
    }
    // The same TLD without a shop subdomain still reads as a software host.
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://omnimux.ai/', page: bare }), true)
    // A developer subdomain is documentation whatever the TLD is.
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://docs.ecommercemug.ai/getting-started', page: bare }), true)
  })

  it('still reads a software page with no shopping signal as digital', () => {
    // The live www.OmniMux.ai landing page, verbatim: docs / API / console
    // addresses in the footer, and no cart, price or stock badge anywhere.
    const omnimux = page({
      title: 'OmniMux | Create and Scale TikTok Commerce Videos',
      text: [
        'OmniMux | Create and Scale TikTok Commerce Videos OmniMux · omnimux.ai Home · Pricing · About · Docs · API · llms.txt',
        'Discover, recreate, and scale viral TikTok commerce videos',
        'Start with a popular video, a creative idea, a script, or your own assets.',
        'Pay per call, no subscription.',
        'For sellers, brands, and creators',
        'Console: https://omnimux.ai/ OpenAI-compatible API base: https://api.omnimux.ai/v1 Documentation: https://docs.omnimux.ai/',
      ].join('\n'),
    })
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'https://www.OmniMux.ai/', page: omnimux }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'www.OmniMux.ai', page: omnimux }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', page: omnimux }), true)
  })

  it('never overrules an explicit digital choice', () => {
    assert.equal(isDigitalLandingPage({ kind: 'digital', url: 'https://www.amazon.com/s?k=mug', page: shopPage({ text: 'Add to Cart $10.99' }) }), true)
  })
})

/**
 * Fixed samples. Each one is the real section that decided the routing on the
 * page it came from — a marketplace result grid, a marketplace landing page, a
 * storefront product page and a product/brand site — trimmed to those elements,
 * so the classifier is measured against the page that regressed rather than
 * against a summary of it.
 */
const AMAZON_SEARCH_HTML = `<!doctype html><html lang="en-us"><head>
<meta charset="utf-8">
<title>Amazon.com : ceramic mug</title>
<meta name="description" content="Amazon.com : ceramic mug">
<link rel="canonical" href="https://www.amazon.com/s?k=ceramic+mug">
</head><body>
<div id="nav-main"><ul><li>Amazon Basics</li><li>Sell</li><li>Home Improvement</li><li>Pet Supplies</li><li>Health</li><li>AI Medical Care</li></ul></div>
<span>1-48 of over 70,000 results for "ceramic mug"</span>
<div data-component-type="s-search-result"><a href="/dp/B08N5WRWNW"><span class="a-text-normal">Nordic Ceramic Mug, 350 ml, Matte Glaze</span></a>
<span class="a-price"><span class="a-offscreen">$10.99</span></span>
<span class="a-icon-alt">4.5 out of 5 stars</span><span>1,204</span><button name="submit.add-to-cart">Add to Cart</button></div>
<div data-component-type="s-search-result"><a href="/dp/B07YTFX4NK"><span class="a-text-normal">Insulated Travel Mug 500 ml</span></a>
<span class="a-price"><span class="a-offscreen">$27.99</span></span><button name="submit.add-to-cart">Add to Cart</button></div>
<footer><ul><li>Careers</li><li>Amazon Science</li><li>Alexa</li></ul></footer>
</body></html>`

const AMAZON_LANDING_HTML = `<!doctype html><html lang="en-us"><head>
<meta charset="utf-8">
<title>Amazon.com. Spend less. Smile more.</title>
<meta name="description" content="Free delivery on millions of items with Prime. Low prices across earth's biggest selection of books, music, DVDs, electronics, computers, software, apparel, furniture, food, toys and more.">
</head><body><h1>Amazon.com</h1></body></html>`

const SHOPIFY_PRODUCT_HTML = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8">
<title>Aurora 保温杯 350ml 双层陶瓷 | Example Store</title>
<meta name="description" content="双层陶瓷保温杯，保温 6 小时，限时包邮。">
</head><body>
<h1>Aurora 保温杯 350ml</h1>
<p>容量 350ml，材质双层陶瓷。</p>
<div class="price">￥199.00</div>
<button name="add">加入购物车</button>
</body></html>`

const OMNIMUX_HTML = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>OmniMux | Create and Scale TikTok Commerce Videos</title>
<meta name="description" content="An AI content platform for TikTok commerce: create sales-driven images, videos, and audio, discover viral content, and publish directly through official APIs.">
<meta property="og:type" content="website">
<link rel="canonical" href="https://omnimux.ai/">
</head><body>
<p>OmniMux · omnimux.ai Home · Pricing · About · Docs · API · llms.txt</p>
<h1>Discover, recreate, and scale viral TikTok commerce videos</h1>
<p>An AI content platform for TikTok commerce: create sales-driven images, videos, and audio, discover viral content, and publish directly through official APIs.</p>
<p>Start with a popular video, a creative idea, a script, or your own assets.</p>
<p>OmniMux is an AI content platform for TikTok commerce, helping sellers, brands, affiliate creators, and content teams discover ideas, create original videos, recreate formats, and produce variations. Create images and voiceovers, publish through official APIs, and analyze content performance. Pay per call, no subscription.</p>
<p>For sellers, brands, and creators</p>
<p>Console: https://omnimux.ai/ OpenAI-compatible API base: https://api.omnimux.ai/v1 Documentation: https://docs.omnimux.ai/</p>
</body></html>`

describe('ai-analysis · captured pages, end to end', () => {
  /**
   * Classify a page exactly the way the importer does: parse the HTML, then let
   * the page and its URL decide while the form sits on the physical default.
   *
   * @param {string} html
   * @param {string} url
   * @returns {boolean}
   */
  function routesDigital(html, url) {
    const page = parseHtmlDocument(html, url)
    return isDigitalLandingPage({ kind: 'physical', page, url })
  }

  it('compares the host case-insensitively and without a scheme', () => {
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'HTTPS://WWW.OmniMux.AI/' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'www.OmniMux.ai' }), true)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'www.amazon.com/s?k=mug' }), false)
    // Junk is junk, not a host `new URL` can bend into one.
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: 'not a url' }), false)
    assert.equal(isDigitalLandingPage({ kind: 'physical', url: '忽略我' }), false)
  })

  it('keeps the captured Amazon result page physical', () => {
    const url = 'https://www.amazon.com/s?k=ceramic+mug'
    // The footer navigation carries `AI`; the result grid carries `Add to Cart`
    // and prices. The page ships no Product schema at all.
    assert.equal(routesDigital(AMAZON_SEARCH_HTML, url), false)
    assert.equal(routesDigital(AMAZON_SEARCH_HTML, 'https://www.amazon.com/s?k=books'), false)
  })

  it('keeps the captured Amazon landing page physical', () => {
    assert.equal(routesDigital(AMAZON_LANDING_HTML, 'https://www.amazon.com/'), false)
  })

  it('keeps the captured storefront product page physical, schema or not', () => {
    assert.equal(routesDigital(SHOPIFY_PRODUCT_HTML, 'https://shop.example.com/products/aurora-mug'), false)
    assert.equal(routesDigital(SHOPIFY_PRODUCT_HTML, 'https://shop.ecommercemug.ai/products/mug'), false)
  })

  it('still routes the captured OmniMux landing page digital', () => {
    assert.equal(routesDigital(OMNIMUX_HTML, 'https://omnimux.ai/'), true)
    assert.equal(routesDigital(OMNIMUX_HTML, 'https://www.OmniMux.ai/'), true)
    // The form's own value: a bare host the user typed reaches the classifier raw.
    assert.equal(routesDigital(OMNIMUX_HTML, 'www.OmniMux.ai'), true)
    assert.equal(routesDigital(OMNIMUX_HTML, 'https://omnimux.ai/docs/getting-started'), true)
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
