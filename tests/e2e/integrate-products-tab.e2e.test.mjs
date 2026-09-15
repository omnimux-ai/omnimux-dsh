import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 资产库一级 Tab 整合产品库及操作按钮动态联动验证', () => {
  const assetsStagePath = path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx')
  const localesPath = path.join(root, 'plugins/omnimux-assets/src/client/locales.js')
  const productsViewPath = path.join(root, 'plugins/omnimux-assets/src/client/ProductsView.jsx')
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')

  const stageContent = fs.readFileSync(assetsStagePath, 'utf-8')
  const localesContent = fs.readFileSync(localesPath, 'utf-8')
  const productsViewContent = fs.readFileSync(productsViewPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证一级选项卡扩充为「本地、云端、产品库」
  assert.ok(
    stageContent.includes("{ id: 'local', label: t('source.local') }") &&
    stageContent.includes("{ id: 'cloud', label: t('source.cloud') }") &&
    stageContent.includes("{ id: 'product', label: t('source.product') || '产品库' }"),
    'AssetsFilterBar 必须包含 local、cloud、product 三项一级选项卡'
  )

  // 2. 验证多语言词条包含产品库及其操作项
  assert.ok(
    localesContent.includes("'source.product': '产品库'") &&
    localesContent.includes("'source.product': 'Products'") &&
    localesContent.includes("'product.create': '添加产品'") &&
    localesContent.includes("'product.chatButton': '对话中添加'"),
    'locales.js 必须包含中英文产品库及按钮动作词条'
  )

  // 3. 验证进入产品库后一级按钮动态切换为带下拉分流菜单的「添加产品」
  assert.ok(
    stageContent.includes("if (sourceTab === 'product')") &&
    stageContent.includes("<CreateProductMenu") &&
    stageContent.includes("{t('product.chatButton') || '对话中添加'}") &&
    stageContent.includes("{t('add.button')}") &&
    stageContent.includes("{t('import.button')}"),
    'AssetsActionRow 必须在 sourceTab 为 product 时切换为主操作 CreateProductMenu 菜单，其他 Tab 保持「添加资产」'
  )

  // 4. 验证产品库二级分类 ProductCategoryNav 平级挂载与左侧对齐规范
  assert.ok(
    stageContent.includes("{sourceTab === 'product' ? (") &&
    stageContent.includes("<ProductCategoryNav") &&
    stageContent.includes("<ProductsView") &&
    productsViewContent.includes("omnimux-products-list-view") &&
    productsViewContent.includes("omnimux-assets-cloud-chip") &&
    productsViewContent.includes("omnimux-products-empty"),
    'AssetsStage 必须将 ProductCategoryNav 平级挂载于 FilterBar 下方，消除嵌套 padding 错配'
  )

  assert.ok(
    stylesContent.includes(".omnimux-products-empty") &&
    stylesContent.includes(".omnimux-products-card") &&
    stylesContent.includes(".omnimux-products-body {\n  flex: 1;\n  min-height: 0;\n  overflow: auto;\n  padding: 0;\n}") &&
    stylesContent.includes("var(--dsw-alias-border-l4)"),
    '产品库主体 padding 必须收敛为 0 以保证与顶层 24px 左对齐基准线严格吻合'
  )
})
