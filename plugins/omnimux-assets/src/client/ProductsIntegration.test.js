import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { ASSETS_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const stageJsx = readFileSync(join(here, 'AssetsStage.jsx'), 'utf8')
const productTabJsx = readFileSync(join(here, 'ProductTab.jsx'), 'utf8')
const categoryNavJsx = readFileSync(join(here, 'ProductCategoryNav.jsx'), 'utf8')
const productsRoot = join(here, '..', '..', '..', 'omnimux-products', 'src', 'client')
const productGridJsx = readFileSync(join(productsRoot, 'ProductGrid.jsx'), 'utf8')
const productsStylesJs = readFileSync(join(productsRoot, 'styles.js'), 'utf8')

describe('Product library integration into Assets stage', () => {
  it('declares 4 first-level tabs including product in AssetsFilterBar', () => {
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

  it('mounts ProductTab under AssetsBody when sourceTab is product', () => {
    assert.match(stageJsx, /if \(sourceTab === 'product'\) \{\s*return \(\s*<div className="omnimux-assets-body">\s*<div className="omnimux-assets-main">\s*<ProductTab/)
  })

  it('mounts ProductCategoryNav under AssetsFilterBar when sourceTab is product', () => {
    assert.match(stageJsx, /\{sourceTab === 'product' \? \(\s*<ProductCategoryNav\b/)
  })

  it('renders the product list through the products plugin single source of truth', () => {
    // 卡片不再由资产库自绘：ProductGrid 与样式都来自 omnimux-products/ui。
    // 通过包级公共出口消费，不走跨插件私有相对路径。
    assert.match(productTabJsx, /from 'omnimux-products\/ui'/)
    assert.match(productTabJsx, /<ProductGrid\b/)
    assert.match(productTabJsx, /injectProductsStyles\(\)/)
    // 资产库不再保留同名产品样式，避免两份同名不同值。
    assert.doesNotMatch(ASSETS_CSS, /\.omnimux-products-grid/)
    assert.doesNotMatch(ASSETS_CSS, /\.omnimux-products-card\b/)
    assert.match(productsStylesJs, /\.omnimux-products-grid/)
  })

  it('opens the product form in place instead of switching workbench tabs', () => {
    // 旧链路会 open 另一个 Tab，导致「返回」落回旧页面的列表。
    assert.doesNotMatch(stageJsx, /api\.open\(\{ tabId: 'omnimux-products:library' \}\)/)
    assert.doesNotMatch(stageJsx, /api\.openWorkbench\(\{ tabId: 'omnimux-products:library' \}\)/)
    assert.match(stageJsx, /setSourceTab\('product'\)/)
    assert.match(stageJsx, /setProductIntent\(\{/)
    // 二级页是同一 Tab 内的覆盖层，挂在 Stage 根上铺满区域（与旧产品页同几何）。
    assert.match(stageJsx, /<ProductFormPage\b/)
    assert.match(stageJsx, /productView\.name === 'form'/)
    // ProductTab 只上报视图，不自己渲染表单——否则覆盖层会被 main 的内边距缩进。
    assert.doesNotMatch(productTabJsx, /<ProductFormPage\b/)
    assert.match(productTabJsx, /onViewChange\(view\.name === 'form'/)
  })

  it('product category pills come from the assets vocabulary', () => {
    assert.match(categoryNavJsx, /t\('product\.all'\) \|\| '全部'/)
    assert.match(categoryNavJsx, /t\('product\.physical'\) \|\| '实物产品'/)
    assert.match(categoryNavJsx, /t\('product\.digital'\) \|\| '数字产品'/)
    assert.match(categoryNavJsx, /className="omnimux-assets-cloud-chip"/)
  })

  it('product cards omit the copy-cite actions row and keep only title and sub description', () => {
    assert.doesNotMatch(productGridJsx, /omnimux-products-card-actions/)
    assert.doesNotMatch(productGridJsx, /handleCopyCite/)
    assert.doesNotMatch(productGridJsx, /copiedId/)
    assert.match(productGridJsx, /omnimux-products-card-title/)
    assert.match(productGridJsx, /omnimux-products-card-desc/)
  })
})
