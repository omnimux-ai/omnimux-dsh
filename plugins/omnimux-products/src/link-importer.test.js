import assert from 'node:assert/strict'
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
  markdownBullets,
  normalizeImportUrl,
  parseHtmlDocument,
  parseReaderMarkdown,
  promotionFromText,
  resolveReaderBaseUrl,
} from './link-importer.js'

const PAGE_URL = 'https://shop.example.com/p/aurora-mug'

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

const READER_MARKDOWN = `Title: Aurora Mug 350ml
URL Source: https://shop.example.com/p/aurora-mug
Markdown Content:
# Aurora Mug 350ml

## Highlights
- 6 小时长效保温
- 防滑硅胶底座
- 单手开合杯盖

![aurora mug](https://cdn.example.com/aurora-3.jpg)
`

/**
 * Route stub fetcher: reader gateway POST vs page GET.
 * @param {{ reader?: unknown, page?: unknown, readerStatus?: number, pageStatus?: number }} plan
 */
function stubFetcher(plan) {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body })
    if (String(url).endsWith('/reader')) {
      const status = plan.readerStatus ?? 200
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => String(plan.reader ?? ''),
        headers: { get: () => 'text/plain' },
      }
    }
    const status = plan.pageStatus ?? 200
    if (plan.page instanceof Error) throw plan.page
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => String(plan.page ?? ''),
      headers: { get: () => 'text/html' },
    }
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

  it('keeps a real path and query untouched', () => {
    assert.equal(normalizeImportUrl('https://shop.example.com/p/1?a=1'), 'https://shop.example.com/p/1?a=1')
  })

  it('refuses non-http schemes, credentials, and private hosts', () => {
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x', '']) {
      assert.throws(() => normalizeImportUrl(bad), (error) => {
        assert.equal(error.code, 'invalid-url')
        return true
      })
    }
    assert.throws(() => normalizeImportUrl('https://user:pw@shop.example.com/p/1'), /credentials/)
    for (const privateHost of ['http://127.0.0.1:8080/p', 'http://localhost/p', 'http://10.0.0.5/p', 'http://192.168.1.9/p']) {
      assert.throws(() => normalizeImportUrl(privateHost), (error) => error.code === 'invalid-url')
    }
  })

  it('resolveReaderBaseUrl keeps one /v1 suffix', () => {
    assert.equal(resolveReaderBaseUrl(undefined), 'https://api.omnimux.ai/v1')
    assert.equal(resolveReaderBaseUrl('https://gw.example.com/v1/'), 'https://gw.example.com/v1')
    assert.equal(resolveReaderBaseUrl('https://gw.example.com'), 'https://gw.example.com/v1')
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

  it('parseReaderMarkdown keeps the Title header and the markdown body', () => {
    const parsed = parseReaderMarkdown(READER_MARKDOWN)
    assert.equal(parsed.title, 'Aurora Mug 350ml')
    assert.match(parsed.markdown, /# Aurora Mug 350ml/)
    assert.match(parsed.markdown, /## Highlights/)
  })

  it('decodes entities and skips navigation bullets', () => {
    assert.equal(decodeEntities('Mug &amp; Lid &#215; 2'), 'Mug & Lid × 2')
    assert.deepEqual(markdownBullets(READER_MARKDOWN), ['6 小时长效保温', '防滑硅胶底座', '单手开合杯盖'])
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

describe('link importer · field mapping', () => {
  it('maps both tracks into the canonical Gxgen field set', () => {
    const reader = parseReaderMarkdown(READER_MARKDOWN)
    const page = parseHtmlDocument(PRODUCT_HTML, PAGE_URL)
    const fields = buildProductFields({ url: PAGE_URL, reader, page })

    assert.deepEqual(Object.keys(fields), [...IMPORT_FIELD_KEYS])
    assert.equal(fields.name, 'Aurora Mug 350ml')
    assert.equal(fields.brand, 'Aurora')
    assert.equal(fields.sku, 'AM-350')
    assert.equal(fields.price, '24.9')
    assert.equal(fields.target_audience, 'Coffee lovers')
    assert.equal(fields.link, PAGE_URL)
    // Reader highlights come first, page bullets join in, duplicates drop out.
    assert.equal(fields.selling_points, '6 小时长效保温，防滑硅胶底座，单手开合杯盖，Dishwasher safe')
    assert.equal(fields.selling_points.split('6 小时长效保温').length - 1, 1)
    // Spec pairs outrank prose for features; bullets feed the selling points.
    assert.equal(fields.features, '容量: 350ml，材质: 双层陶瓷')
    assert.match(fields.promotion, /free shipping/i)
    assert.deepEqual(fields.categories, ['Home & Kitchen', 'Drinkware', 'Mugs'])
    assert.equal(fields.images[0], 'https://cdn.example.com/aurora-1.jpg')
    assert.ok(fields.images.includes('https://shop.example.com/img/aurora-1.jpg'))
    assert.ok(fields.images.includes('https://cdn.example.com/aurora-3.jpg'))
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
})

describe('link importer · importProductFromUrl', () => {
  it('runs the reader gateway then the direct page track', async () => {
    const { fetcher, calls } = stubFetcher({ reader: READER_MARKDOWN, page: PRODUCT_HTML })
    const fields = await importProductFromUrl({
      url: PAGE_URL,
      env: { OMNIMUX_API_KEY: 'test-key', OMNIMUX_BASE_URL: 'https://gw.example.com' },
      fetcher,
    })
    assert.equal(fields.name, 'Aurora Mug 350ml')
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url, 'https://gw.example.com/v1/reader')
    assert.deepEqual(JSON.parse(calls[0].body), { model: 'jina-reader-v1', url: PAGE_URL })
    assert.equal(calls[1].url, PAGE_URL)
  })

  it('skips the reader when no key is configured and still fills the form', async () => {
    const { fetcher, calls } = stubFetcher({ page: PRODUCT_HTML })
    const fields = await importProductFromUrl({ url: PAGE_URL, env: {}, fetcher })
    assert.equal(calls.length, 1)
    assert.equal(fields.brand, 'Aurora')
    assert.equal(fields.price, '24.9')
  })

  it('falls back to the page when the reader gateway errors', async () => {
    const { fetcher } = stubFetcher({ reader: '', readerStatus: 502, page: PRODUCT_HTML })
    const fields = await importProductFromUrl({ url: PAGE_URL, env: { OMNIMUX_API_KEY: 'k' }, fetcher })
    assert.equal(fields.name, 'Aurora Mug 350ml')
  })

  it('falls back to the reader when the direct page fetch fails', async () => {
    const { fetcher } = stubFetcher({ reader: READER_MARKDOWN, pageStatus: 403 })
    const fields = await importProductFromUrl({ url: PAGE_URL, env: { OMNIMUX_API_KEY: 'k' }, fetcher })
    assert.equal(fields.name, 'Aurora Mug 350ml')
    assert.equal(fields.selling_points, '6 小时长效保温，防滑硅胶底座，单手开合杯盖')
  })

  it('reports link-import-failed when neither track can read the page', async () => {
    const { fetcher } = stubFetcher({ pageStatus: 500 })
    await assert.rejects(
      () => importProductFromUrl({ url: PAGE_URL, env: {}, fetcher }),
      (error) => {
        assert.ok(error instanceof LinkImportError)
        assert.equal(error.code, 'link-import-failed')
        return true
      },
    )
  })

  it('reports link-import-empty when the page carries no product information', async () => {
    const { fetcher } = stubFetcher({ page: '<html><head></head><body><div id="app"></div></body></html>' })
    await assert.rejects(
      () => importProductFromUrl({ url: PAGE_URL, fetcher }),
      (error) => error.code === 'link-import-empty',
    )
  })

  it('rejects an invalid link before any network call', async () => {
    const { fetcher, calls } = stubFetcher({ page: PRODUCT_HTML })
    await assert.rejects(
      () => importProductFromUrl({ url: 'localhost:3000/p', fetcher }),
      (error) => error.code === 'invalid-url',
    )
    assert.equal(calls.length, 0)
  })

  it('extractMetaTags keeps repeated keys in document order', () => {
    const meta = extractMetaTags('<meta content="a" property="og:image"><meta property="og:image" content="b">')
    assert.deepEqual(meta['og:image'], ['a', 'b'])
  })
})
