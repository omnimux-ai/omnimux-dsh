import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractShopProductId,
  extractShopRegion,
  fetchTikTokShopProductViaHub,
  isTikTokShopProductUrl,
  mapShopDetailToFields,
} from './tiktok-shop-import.js'
import { importProductFromUrl } from './link-importer.js'

const SHOP_URL = 'https://shop.tiktok.com/sg/pdp/1733226176534972037'

describe('tiktok shop import helpers', () => {
  it('detects shop product urls and ids', () => {
    assert.equal(isTikTokShopProductUrl(SHOP_URL), true)
    assert.equal(isTikTokShopProductUrl('https://www.amazon.com/dp/B0'), false)
    assert.equal(extractShopProductId(SHOP_URL), '1733226176534972037')
    assert.equal(extractShopRegion(SHOP_URL), 'SG')
  })

  it('maps detail payload into draft fields', () => {
    const fields = mapShopDetailToFields({
      product_data: {
        page_config: {
          components_map: [{
            component_data: {
              product_info: {
                product_model: {
                  name: 'Mini Perfume Bottle',
                  product_id: '1733226176534972037',
                  images: [
                    { url_list: ['https://cdn.example/a~tplv-o3syd03w52-crop-webp:1000:1000.webp'] },
                    { url_list: ['https://cdn.example/b~tplv-o3syd03w52-crop-webp:1000:1000.webp'] },
                  ],
                  description: [{ type: 'text', text: 'Brand New' }],
                },
                seller_model: { shop_name: 'Comfort Bay' },
                promotion_model: {
                  promotion_product_price: {
                    min_price: {
                      sale_price_format: '2.00',
                      origin_price_format: '5.00',
                      currency_symbol: 'S$',
                      discount_format: '60%',
                    },
                  },
                },
              },
            },
          }],
        },
      },
    }, { url: SHOP_URL, productId: '1733226176534972037', region: 'SG' })

    assert.equal(fields.name, 'Mini Perfume Bottle')
    assert.equal(fields.brand, 'Comfort Bay')
    assert.match(fields.price, /2\.00/)
    assert.equal(fields.images.length, 2)
  })

  it('fetchTikTokShopProductViaHub uses shop_product then maps fields', async () => {
    const calls = []
    const shop = await fetchTikTokShopProductViaHub({
      url: SHOP_URL,
      socialData: async (args) => {
        calls.push(args)
        assert.equal(args.capability, 'shop_product')
        return {
          data: {
            product_data: {
              page_config: {
                components_map: [{
                  component_data: {
                    product_info: {
                      product_model: {
                        name: 'Bottle',
                        images: ['https://cdn.example/x.jpg'],
                      },
                      seller_model: { shop_name: 'Shop' },
                      promotion_model: {
                        promotion_product_price: {
                          min_price: { sale_price_format: '3.20', currency_symbol: 'S$' },
                        },
                      },
                    },
                  },
                }],
              },
            },
          },
        }
      },
    })
    assert.equal(shop.productId, '1733226176534972037')
    assert.equal(shop.region, 'SG')
    assert.equal(shop.fields.name, 'Bottle')
    assert.equal(calls[0].platform, 'tiktok')
  })
})

describe('importProductFromUrl tiktok shop path', () => {
  it('uses hub.socialData for shop urls without HTML fetch', async () => {
    let fetched = false
    const draft = await importProductFromUrl({
      url: SHOP_URL,
      kind: 'physical',
      fetcher: async () => {
        fetched = true
        throw new Error('should not HTML-fetch shop')
      },
      hub: {
        socialData: async () => ({
          data: {
            product_data: {
              page_config: {
                components_map: [{
                  component_data: {
                    product_info: {
                      product_model: {
                        name: 'BUY 2 TAKE 1 Portable Mini Perfume',
                        images: [
                          'https://p16.example/img1.webp',
                          'https://p16.example/img2.webp',
                        ],
                      },
                      seller_model: { shop_name: 'Comfort Bay' },
                      promotion_model: {
                        promotion_product_price: {
                          min_price: {
                            sale_price_format: '2.00',
                            currency_symbol: 'S$',
                            origin_price_format: '5.00',
                            discount_format: '60%',
                          },
                        },
                      },
                    },
                  },
                }],
              },
            },
          },
        }),
      },
    })
    assert.equal(fetched, false)
    assert.match(draft.name, /Perfume|BUY 2/i)
    assert.ok(String(draft.price).includes('2.00'))
    assert.ok(Array.isArray(draft.images) && draft.images.length >= 1)
    assert.equal(draft.kind, 'physical')
  })
})
