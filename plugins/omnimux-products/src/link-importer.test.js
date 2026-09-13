import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'
import {
  IMPORT_FIELD_KEYS,
  LinkImportError,
  buildProductFields,
  cleanTitle,
  decodeEntities,
  extractMetaTags,
  extractPrice,
  importProductFromUrl,
  isNavigationText,
  isPrivateHost,
  isUsableImport,
  normalizeHostname,
  normalizeImportUrl,
  parseHtmlDocument,
  promotionFromText,
} from './link-importer.js'

const PAGE_URL = 'https://shop.example.com/p/aurora-mug'
const INTERNAL_MARKER = 'INTERNAL ADMIN SECRET'

const PRODUCT_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Aurora Mug 350ml | Example Store</title>
  <meta name="description" content="Double-wall ceramic mug that keeps coffee hot for 6 hours. Dishwasher safe.">
  <meta property="og:title" content="Aurora Mug 350ml">
  <meta property="og:description" content="Double-wall ceramic mug that keeps coffee hot for 6 hours.">
  <meta property="og:image" content="/img/aurora-1.jpg">
  <meta property="og:image" content="https://cdn.example.com/aurora-2.jpg">
  <meta property="og:site_name" content="Example Store">
  <meta property="product:price:amount" content="29.90">
  <meta property="product:brand" content="Example Store">
  <link rel="canonical" href="https://shop.example.com/p/aurora-mug">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Aurora Mug 350ml",
    "sku": "AM-350",
    "brand": { "@type": "Brand", "name": "Aurora" },
    "category": "Home & Kitchen > Drinkware > Mugs",
    "audience": { "@type": "PeopleAudience", "audienceType": "Coffee lovers" },
    "image": ["https://cdn.example.com/aurora-1.jpg"],
    "additionalProperty": [
      { "@type": "PropertyValue", "name": "容量", "value": "350ml" },
      { "@type": "PropertyValue", "name": "材质", "value": "双层陶瓷" }
    ],
    "offers": {
      "@type": "Offer",
      "price": "24.90",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    }
  }
  </script>
</head>
<body>
  <ul>
    <li>6 小时长效保温</li>
    <li>Dishwasher safe</li>
  </ul>
  <p>Checkout today and enjoy free shipping on every order.</p>
</body>
</html>`

/**
 * Response stub: `{ html }`, `{ status }`, `{ redirect }` or an Error to throw.
 * @param {number} status
 * @param {string} body
 * @param {Record<string, string>} [headers]
 */
function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => body,
  }
}

/**
 * @param {Record<string, { html?: string, status?: number, redirect?: string } | Error>} pages
 */
function stubFetcher(pages) {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', redirect: init.redirect })
    const entry = pages[String(url)]
    if (entry === undefined) return response(404, '')
    if (entry instanceof Error) throw entry
    if (entry.redirect) return response(entry.status ?? 302, '', { location: entry.redirect })
    return response(entry.status ?? 200, String(entry.html ?? ''))
  }
  return { fetcher, calls }
}

describe('link importer · url normalization', () => {
  it('upgrades a bare host, drops the hash and tracking params', () => {
    assert.equal(
      normalizeImportUrl('shop.example.com/p/1?utm_source=x&color=red#reviews'),
      'https://shop.example.com/p/1?color=red',
    )
  })

  it('keeps a real path and query untouched, and normalizes the trailing-dot host', () => {
    assert.equal(normalizeImportUrl('https://shop.example.com/p/1?a=1'), 'https://shop.example.com/p/1?a=1')
    assert.equal(normalizeImportUrl('https://shop.example.com./p/1'), 'https://shop.example.com./p/1')
    assert.equal(isPrivateHost('shop.example.com.'), false)
  })

  it('refuses non-http schemes, credentials, and empty input', () => {
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x', '']) {
      assert.throws(() => normalizeImportUrl(bad), (error) => {
        assert.equal(error.code, 'invalid-url')
        return true
      })
    }
    assert.throws(() => normalizeImportUrl('https://user:pw@shop.example.com/p/1'), /credentials/)
  })

  it('refuses every spelling of a loopback, private or metadata address', () => {
    const blocked = [
      'http://127.0.0.1:8080/p',
      'http://localhost/p',
      'http://localhost.:8080/p',
      'http://localhost.localdomain/p',
      'http://[::1]/p',
      'http://[::ffff:127.0.0.1]:8080/p',
      'http://[::ffff:7f00:1]:8080/p',
      'http://[0:0:0:0:0:ffff:169.254.169.254]/p',
      'http://2130706433/p',
      'http://0x7f000001/p',
      'http://0177.0.0.1/p',
      'http://127.1/p',
      'http://0.0.0.0/p',
      'http://10.0.0.5/p',
      'http://172.16.0.1/p',
      'http://172.31.255.254/p',
      'http://192.168.1.9/p',
      'http://169.254.169.254/p',
      'http://100.64.0.1/p',
      'http://224.0.0.1/p',
      'http://[fc00::1]/p',
      'http://[fe80::1]/p',
      'http://[64:ff9b::7f00:1]/p',
      'http://metadata.google.internal/p',
      'http://router.local/p',
    ]
    for (const url of blocked) {
      assert.throws(() => normalizeImportUrl(url), (error) => {
        assert.equal(error.code, 'invalid-url', `expected a refusal for ${url}`)
        return true
      }, `expected a refusal for ${url}`)
    }
  })

  it('still allows ordinary public hosts', () => {
    for (const url of [
      'https://shop.example.com/p/1',
      'http://8.8.8.8/p/1',
      'https://172.32.0.1/p/1',
      'https://[2606:4700:4700::1111]/p/1',
    ]) {
      assert.equal(normalizeImportUrl(url), url)
    }
  })

  it('normalizeHostname folds the spellings of one host together', () => {
    assert.equal(normalizeHostname('LOCALHOST.'), 'localhost')
    assert.equal(normalizeHostname('[::1]'), '::1')
    assert.equal(normalizeHostname('[::ffff:7f00:1]'), '::ffff:7f00:1')
    assert.equal(normalizeHostname('shop.example.com.'), 'shop.example.com')
    assert.equal(normalizeHostname(''), '')
  })

  it('isPrivateHost covers RFC1918, loopback, link-local, CGNAT and IPv6 local scopes', () => {
    for (const host of ['10.1.2.3', '172.20.0.1', '192.168.0.1', '169.254.1.1', '100.100.0.1', '::1', 'fd00::1', 'fe80::2', '::ffff:a9fe:a9fe']) {
      assert.equal(isPrivateHost(host), true, host)
    }
    for (const host of ['example.com', '8.8.4.4', '172.15.0.1', '172.32.0.1', '2606:4700::1111']) {
      assert.equal(isPrivateHost(host), false, host)
    }
  })
})

describe('link importer · page parsing', () => {
  it('reads title, meta, OpenGraph and JSON-LD from one document', () => {
    const page = parseHtmlDocument(PRODUCT_HTML, PAGE_URL)
    assert.equal(page.title, 'Aurora Mug 350ml | Example Store')
    assert.equal(page.meta['og:title'][0], 'Aurora Mug 350ml')
    assert.deepEqual(page.meta['og:image'], ['/img/aurora-1.jpg', 'https://cdn.example.com/aurora-2.jpg'])
    assert.equal(page.canonical, 'https://shop.example.com/p/aurora-mug')
    const product = page.nodes.find((node) => node['@type'] === 'Product')
    assert.equal(product.sku, 'AM-350')
    assert.equal(product.offers.price, '24.90')
  })

  it('survives a JSON-LD block that is not valid JSON', () => {
    const html = '<script type="application/ld+json">{ "@type": "Product", }</script><meta property="og:title" content="T">'
    const page = parseHtmlDocument(html, PAGE_URL)
    assert.equal(page.nodes[0]['@type'], 'Product')
  })

  it('decodes entities and keeps real list rows', () => {
    assert.equal(decodeEntities('Mug &amp; Lid &#215; 2'), 'Mug & Lid × 2')
    const page = parseHtmlDocument(PRODUCT_HTML, PAGE_URL)
    assert.deepEqual(page.bullets, ['6 小时长效保温', 'Dishwasher safe'])
  })

  it('extractMetaTags keeps repeated keys in document order', () => {
    const meta = extractMetaTags('<meta content="a" property="og:image"><meta property="og:image" content="b">')
    assert.deepEqual(meta['og:image'], ['a', 'b'])
  })

  it('cleanTitle splits product name from site name', () => {
    assert.deepEqual(cleanTitle('Aurora Mug 350ml | Example Store'), {
      name: 'Aurora Mug 350ml',
      siteName: 'Example Store',
    })
    assert.equal(cleanTitle(' “Aurora Mug” ').name, 'Aurora Mug')
  })

  it('extractPrice prefers the lowest structured price and ignores bare numbers', () => {
    const page = parseHtmlDocument(PRODUCT_HTML, PAGE_URL)
    assert.equal(extractPrice(page.nodes, page.meta, page.text), '24.9')
    assert.equal(extractPrice([], {}, 'Order in 2024, no price here'), '')
    assert.equal(extractPrice([], {}, 'Now ¥199 起'), '199')
  })

  it('promotionFromText cuts a short line around the promo keyword', () => {
    assert.equal(
      promotionFromText('Aurora Mug 350ml | Example Store Dishwasher safe Checkout today and enjoy free shipping on every order.'),
      'Checkout today and enjoy free shipping on every order.',
    )
    assert.equal(promotionFromText('限时立减 50 元，先到先得'), '限时立减 50 元')
    assert.equal(promotionFromText('A plain product paragraph without offers.'), '')
  })
})

describe('link importer · real e-commerce title cleaning', () => {
  it('strips whole marketing prefixes instead of leaving a dangling bracket', () => {
    const cases = [
      ['【官方旗舰】轻氧羽绒服 90白鸭绒 户外防风 | 山谷户外官方商城', '轻氧羽绒服 90白鸭绒 户外防风', '山谷户外官方商城'],
      ['【新品】Aurora Mug 350ml | Example Store', 'Aurora Mug 350ml', 'Example Store'],
      ['【正品保证】机械键盘 87键 | 数码专营店', '机械键盘 87键', '数码专营店'],
      ['[Official] Aurora Mug | Example Store', 'Aurora Mug', 'Example Store'],
      ['（天猫推荐）轻氧羽绒服 户外防风', '轻氧羽绒服 户外防风', ''],
      ['【官方旗舰】轻氧羽绒服', '轻氧羽绒服', ''],
    ]
    for (const [raw, name, siteName] of cases) {
      const parsed = cleanTitle(raw)
      assert.equal(parsed.name, name, raw)
      assert.equal(parsed.siteName, siteName, raw)
      assert.doesNotMatch(parsed.name, /[】\])）]/, `a dangling bracket survived ${raw}`)
    }
  })

  it('keeps a decoration that is part of the product name', () => {
    assert.equal(cleanTitle('【轻氧羽绒服】户外防风').name, '【轻氧羽绒服】户外防风')
    assert.equal(cleanTitle('[3-pack] Aurora Socks').name, '[3-pack] Aurora Socks')
  })

  it('treats a nav label as no name at all', () => {
    assert.equal(cleanTitle('首页 | Example Store').name, '')
    assert.equal(cleanTitle('Home | Example Store').name, '')
  })
})

describe('link importer · navigation filtering', () => {
  it('recognizes bare and separator-joined navigation rows', () => {
    for (const row of ['首页', '登录', '注册', '购物车', '我的', '全部商品', '菜单', '搜索', '客服', '分类', 'Home', 'Login', 'Cart', 'Menu', 'Sign in / Register', '首页 / 登录']) {
      assert.equal(isNavigationText(row), true, row)
    }
    for (const row of ['6 小时长效保温', 'Dishwasher safe', '650+ 蓬松度，轻至 420g', '']) {
      assert.equal(isNavigationText(row), row === '')
    }
  })

  it('drops navigation rows out of the HTML list instead of calling them selling points', () => {
    const html = `<head><title>Aurora Mug | Store</title></head><body><ul>
<li>首页</li><li>登录</li><li>购物车</li>
<li>6 小时长效保温</li></ul></body>`
    const page = parseHtmlDocument(html, PAGE_URL)
    assert.deepEqual(page.bullets, ['6 小时长效保温'])
    const fields = buildProductFields({ url: PAGE_URL, page })
    assert.equal(fields.selling_points, '6 小时长效保温')
    // The site-name tail must never come back as the brand.
    assert.equal(fields.brand, '')
  })

  it('refuses a page whose whole content was site chrome', () => {
    const html = `<head><title>Aurora Mug | Store</title></head><body><ul>
<li>首页</li><li>登录</li><li>注册</li><li>购物车</li><li>菜单</li>
<li>我的</li><li>全部商品</li><li>搜索</li><li>客服</li></ul></body>`
    const page = parseHtmlDocument(html, PAGE_URL)
    const fields = buildProductFields({ url: PAGE_URL, page })
    assert.equal(fields.selling_points, '')
    assert.equal(fields.features, '')
    assert.equal(fields.brand, '')
    assert.equal(isUsableImport(fields), false)
  })

  it('never reads a nav-only page as a successful import', async () => {
    const html = `<head><title>Aurora Mug | Store</title></head><body><ul>
<li>首页</li><li>登录</li><li>购物车</li></ul></body>`
    const { fetcher } = stubFetcher({ [PAGE_URL]: { html } })
    await assert.rejects(
      () => importProductFromUrl({ url: PAGE_URL, fetcher }),
      (error) => error.code === 'link-import-empty',
    )
  })
})

describe('link importer · field mapping', () => {
  it('maps one parsed page into the canonical field set', () => {
    const page = parseHtmlDocument(PRODUCT_HTML, PAGE_URL)
    const fields = buildProductFields({ url: PAGE_URL, page })

    assert.deepEqual(Object.keys(fields), [...IMPORT_FIELD_KEYS])
    assert.equal(fields.name, 'Aurora Mug 350ml')
    assert.equal(fields.brand, 'Aurora')
    assert.equal(fields.sku, 'AM-350')
    assert.equal(fields.price, '24.9')
    assert.equal(fields.target_audience, 'Coffee lovers')
    assert.equal(fields.link, PAGE_URL)
    assert.equal(fields.selling_points, '6 小时长效保温，Dishwasher safe')
    // Spec pairs outrank prose for features; bullets feed the selling points.
    assert.equal(fields.features, '容量: 350ml，材质: 双层陶瓷')
    assert.match(fields.promotion, /free shipping/i)
    assert.deepEqual(fields.categories, ['Home & Kitchen', 'Drinkware', 'Mugs'])
    assert.equal(fields.images[0], 'https://cdn.example.com/aurora-1.jpg')
    assert.ok(fields.images.includes('https://shop.example.com/img/aurora-1.jpg'))
    assert.ok(fields.images.length <= 8)
  })

  it('never fills price / sku / promotion for a digital offering', () => {
    const page = parseHtmlDocument(PRODUCT_HTML, PAGE_URL)
    const fields = buildProductFields({ url: PAGE_URL, kind: 'digital', page })
    assert.equal(fields.price, '')
    assert.equal(fields.sku, '')
    assert.equal(fields.promotion, '')
    assert.equal(fields.name, 'Aurora Mug 350ml')
  })

  it('reads a Chinese landing page end to end', () => {
    const html = `<!doctype html><html lang="zh-CN"><head>
<title>【官方旗舰】轻氧羽绒服 90白鸭绒 户外防风 | 山谷户外官方商城</title>
<meta name="description" content="90白鹅绒填充，蓬松度650+，防泼水面料，适合冬季通勤与露营。">
<meta property="og:title" content="轻氧羽绒服 90白鸭绒">
<meta property="og:image" content="//cdn.example.cn/img/down-1.jpg">
<meta property="product:price:amount" content="899">
<meta property="product:brand" content="山谷户外">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"首页"},
  {"@type":"ListItem","position":2,"name":"男装"},{"@type":"ListItem","position":3,"name":"羽绒服"}]},
 {"@type":"Product","name":"轻氧羽绒服 90白鸭绒","sku":"SD-DOWN-001","brand":{"@type":"Brand","name":"山谷户外"},
  "category":"服饰 > 男装 > 羽绒服","audience":{"@type":"PeopleAudience","audienceType":"通勤族 / 露营爱好者"},
  "additionalProperty":[{"@type":"PropertyValue","name":"填充物","value":"90% 白鸭绒"},{"@type":"PropertyValue","name":"蓬松度","value":"650+"}],
  "offers":{"@type":"AggregateOffer","lowPrice":"899","highPrice":"1299","priceCurrency":"CNY"}}]}
</script></head><body>
<h2>核心卖点</h2><ul>
<li>650+ 蓬松度，轻至 420g</li>
<li>防泼水面料，雨雪天也能穿</li>
<li>可收纳设计，通勤出差都方便</li>
<li>首页</li></ul>
<p>限时立减 200 元，下单再送收纳袋，全国包邮。</p>
<p>适合冬季通勤与周末露营，日常穿着也很百搭。</p>
</body></html>`
    const page = parseHtmlDocument(html, 'https://shop.example.cn/p/down-jacket')
    const fields = buildProductFields({ url: 'https://shop.example.cn/p/down-jacket', page })
    assert.equal(fields.name, '轻氧羽绒服 90白鸭绒 户外防风')
    assert.equal(fields.brand, '山谷户外')
    assert.equal(fields.sku, 'SD-DOWN-001')
    assert.equal(fields.price, '899')
    assert.equal(fields.target_audience, '通勤族 / 露营爱好者')
    assert.match(fields.selling_points, /650\+ 蓬松度/)
    assert.doesNotMatch(fields.selling_points, /首页/)
    assert.match(fields.promotion, /限时立减|包邮/)
    // Breadcrumb segments first, then the JSON-LD category chain; the
    // breadcrumb root 「首页」 is chrome and never becomes a category.
    assert.deepEqual(fields.categories, ['男装', '羽绒服', '服饰'])
    assert.doesNotMatch(fields.categories.join('，'), /首页/)
    assert.equal(fields.images[0], 'https://cdn.example.cn/img/down-1.jpg')
  })
})

describe('link importer · importProductFromUrl', () => {
  it('fetches the page once, by hand-rolled redirect control', async () => {
    const { fetcher, calls } = stubFetcher({ [PAGE_URL]: { html: PRODUCT_HTML } })
    const fields = await importProductFromUrl({ url: PAGE_URL, fetcher })
    assert.equal(fields.name, 'Aurora Mug 350ml')
    assert.equal(fields.brand, 'Aurora')
    assert.equal(fields.price, '24.9')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, PAGE_URL)
    assert.equal(calls[0].method, 'GET')
    assert.equal(calls[0].redirect, 'manual')
  })

  it('follows a public redirect chain and parses the destination', async () => {
    const hop = 'https://shop.example.com/go'
    const final = 'https://shop.example.com/p/aurora-mug?v=2'
    const { fetcher, calls } = stubFetcher({
      [hop]: { status: 301, redirect: final },
      [final]: { html: PRODUCT_HTML },
    })
    const fields = await importProductFromUrl({ url: hop, fetcher })
    assert.equal(fields.name, 'Aurora Mug 350ml')
    assert.deepEqual(calls.map((call) => call.url), [hop, final])
    assert.equal(fields.link, hop)
  })

  it('refuses a redirect into a private host without reading it', async () => {
    for (const target of [
      'http://127.0.0.1:8080/internal',
      'http://localhost.:8080/internal',
      'http://[::ffff:7f00:1]:8080/internal',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      const { fetcher, calls } = stubFetcher({
        [PAGE_URL]: { status: 302, redirect: target },
        [target]: { html: `<title>${INTERNAL_MARKER}</title>` },
      })
      await assert.rejects(
        () => importProductFromUrl({ url: PAGE_URL, fetcher }),
        (error) => {
          assert.ok(error instanceof LinkImportError, `expected a LinkImportError for ${target}`)
          assert.equal(error.code, 'invalid-url')
          return true
        },
        `expected a refusal for ${target}`,
      )
      assert.deepEqual(calls.map((call) => call.url), [PAGE_URL], `a request reached ${target}`)
    }
  })

  it('refuses a redirect loop and an endless chain', async () => {
    const a = 'https://shop.example.com/a'
    const b = 'https://shop.example.com/b'
    const loop = stubFetcher({
      [a]: { status: 302, redirect: b },
      [b]: { status: 302, redirect: a },
    })
    await assert.rejects(
      () => importProductFromUrl({ url: a, fetcher: loop.fetcher }),
      (error) => error.code === 'link-import-failed',
    )

    const chain = {}
    for (let index = 0; index < 9; index += 1) {
      chain[`https://shop.example.com/h${String(index)}`] = {
        status: 302,
        redirect: `https://shop.example.com/h${String(index + 1)}`,
      }
    }
    const endless = stubFetcher(chain)
    await assert.rejects(
      () => importProductFromUrl({ url: 'https://shop.example.com/h0', fetcher: endless.fetcher }),
      (error) => error.code === 'link-import-failed',
    )
  })

  it('reports link-import-failed when the page refuses to serve', async () => {
    for (const plan of [
      { [PAGE_URL]: { status: 500 } },
      { [PAGE_URL]: { status: 403 } },
      { [PAGE_URL]: new Error('socket hang up') },
      { [PAGE_URL]: { status: 302 } },
    ]) {
      const { fetcher } = stubFetcher(plan)
      await assert.rejects(
        () => importProductFromUrl({ url: PAGE_URL, fetcher }),
        (error) => {
          assert.ok(error instanceof LinkImportError)
          assert.equal(error.code, 'link-import-failed')
          return true
        },
      )
    }
  })

  it('reports link-import-empty for an empty body and for a page with no product information', async () => {
    for (const html of ['', '   ', '<html><head></head><body><div id="app"></div></body></html>']) {
      const { fetcher } = stubFetcher({ [PAGE_URL]: { html } })
      await assert.rejects(
        () => importProductFromUrl({ url: PAGE_URL, fetcher }),
        (error) => error.code === 'link-import-empty',
      )
    }
  })

  it('rejects an invalid link before any network call', async () => {
    const { fetcher, calls } = stubFetcher({ [PAGE_URL]: { html: PRODUCT_HTML } })
    await assert.rejects(
      () => importProductFromUrl({ url: 'localhost:3000/p', fetcher }),
      (error) => error.code === 'invalid-url',
    )
    assert.equal(calls.length, 0)
  })

  it('never reads a real loopback server, in any spelling', async () => {
    let hits = 0
    const server = createServer((req, res) => {
      hits += 1
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<!doctype html><html><head><title>${INTERNAL_MARKER}</title></head><body>internal only</body></html>`)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    try {
      for (const url of [
        `http://127.0.0.1:${String(port)}/internal`,
        `http://localhost:${String(port)}/internal`,
        `http://localhost.:${String(port)}/internal`,
        `http://[::ffff:127.0.0.1]:${String(port)}/internal`,
        `http://[::ffff:7f00:1]:${String(port)}/internal`,
        `http://2130706433:${String(port)}/internal`,
      ]) {
        await assert.rejects(
          () => importProductFromUrl({ url, fetcher: fetch, timeoutMs: 3000 }),
          (error) => {
            assert.ok(error instanceof LinkImportError, `expected a guard, got ${String(error)} for ${url}`)
            assert.equal(error.code, 'invalid-url')
            return true
          },
          `expected a refusal for ${url}`,
        )
      }
      assert.equal(hits, 0, 'the loopback server must never be reached')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
