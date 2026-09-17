import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { ASSETS_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const stageJsx = readFileSync(join(here, 'AssetsStage.jsx'), 'utf8')
const productsViewJsx = readFileSync(join(here, 'ProductsView.jsx'), 'utf8')

describe('Product library integration into Assets stage', () => {
  it('declares 3 first-level tabs including product in AssetsFilterBar', () => {
    assert.match(stageJsx, /\{ id: 'local', label: t\('source\.local'\) \}/)
    assert.match(stageJsx, /\{ id: 'cloud', label: t\('source\.cloud'\) \}/)
    assert.match(stageJsx, /\{ id: 'product', label: t\('source\.product'\) \|\| '产品库' \}/)
  })

  it('contains valid i18n locales for product integration in both zh and en', () => {
    assert.equal(zh['source.product'], '产品库')
    assert.equal(en['source.product'], 'Products')
    assert.equal(zh['product.create'], '添加产品')
    assert.equal(en['product.create'], 'Add Product')
    assert.equal(zh['product.chatButton'], '对话中添加')
    assert.equal(en['product.chatButton'], 'Add in Chat')
    assert.equal(zh['product.all'], '全部')
    assert.equal(zh['product.physical'], '实物产品')
    assert.equal(zh['product.digital'], '数字产品')
  })

  it('switches action row buttons dynamically when sourceTab is product', () => {
    assert.match(stageJsx, /if \(sourceTab === 'product'\)/)
    assert.match(stageJsx, /<CreateProductMenu\b/)
    assert.match(stageJsx, /\{t\('product\.chatButton'\) \|\| '对话中添加'\}/)
    assert.match(stageJsx, /\{t\('add\.button'\)\}/)
    assert.match(stageJsx, /\{t\('import\.button'\)\}/)
  })

  it('mounts ProductsView under AssetsBody when sourceTab is product', () => {
    assert.match(stageJsx, /if \(sourceTab === 'product'\) \{\s*return \(\s*<div className="omnimux-assets-body">\s*<div className="omnimux-assets-main">\s*<ProductsView/)
  })

  it('mounts ProductCategoryNav under AssetsFilterBar when sourceTab is product', () => {
    assert.match(stageJsx, /\{sourceTab === 'product' \? \(\s*<ProductCategoryNav\b/)
  })

  it('ProductsView conforms to design tokens and provides category pills and empty card', () => {
    assert.match(productsViewJsx, /t\('product\.all'\) \|\| '全部'/)
    assert.match(productsViewJsx, /t\('product\.physical'\) \|\| '实物产品'/)
    assert.match(productsViewJsx, /t\('product\.digital'\) \|\| '数字产品'/)
    assert.match(productsViewJsx, /className="omnimux-assets-cloud-chip"/)
    assert.match(productsViewJsx, /className="omnimux-products-list-view"/)
    assert.match(productsViewJsx, /className="omnimux-products-empty"/)
    assert.match(productsViewJsx, /className="omnimux-products-grid"/)
    assert.match(ASSETS_CSS, /\.omnimux-products-grid/)
    assert.match(ASSETS_CSS, /\.omnimux-products-empty/)
  })

  it('ProductsView cards omit copyCite actions row and keep only title and sub description', () => {
    assert.doesNotMatch(productsViewJsx, /omnimux-products-card-actions/)
    assert.doesNotMatch(productsViewJsx, /handleCopyCite/)
    assert.doesNotMatch(productsViewJsx, /copiedId/)
    assert.match(productsViewJsx, /className="omnimux-products-card-name"/)
    assert.match(productsViewJsx, /className="omnimux-products-card-sub"/)
  })
})
