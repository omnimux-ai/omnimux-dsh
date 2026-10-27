import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 资产库一级 Tab 整合产品库及操作按钮动态联动验证', () => {
  const stageContent = fs.readFileSync(path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx'), 'utf-8')
  const localesContent = fs.readFileSync(path.join(root, 'plugins/omnimux-assets/src/client/locales.js'), 'utf-8')
  const productTabContent = fs.readFileSync(path.join(root, 'plugins/omnimux-assets/src/client/ProductTab.jsx'), 'utf-8')
  const categoryNavContent = fs.readFileSync(path.join(root, 'plugins/omnimux-assets/src/client/ProductCategoryNav.jsx'), 'utf-8')
  const assetsStyles = fs.readFileSync(path.join(root, 'plugins/omnimux-assets/src/client/styles.js'), 'utf-8')
  const productsStyles = fs.readFileSync(path.join(root, 'plugins/omnimux-products/src/client/styles.js'), 'utf-8')

  // 1. 验证一级选项卡扩充为「本地、云端、产品库」
  assert.ok(
    stageContent.includes("{ id: 'local', label: t('source.local') }") &&
    stageContent.includes("{ id: 'cloud', label: t('source.cloud') }") &&
    stageContent.includes("{ id: 'product', label: t('source.product') || '产品库' }"),
    'AssetsFilterBar 必须包含 local、cloud、product 三项一级选项卡',
  )

  // 2. 验证多语言词条包含产品库及其操作项
  assert.ok(
    localesContent.includes("'source.product': '产品库'") &&
    localesContent.includes("'source.product': 'Products'") &&
    localesContent.includes("'product.create': '添加产品'") &&
    localesContent.includes("'product.chatButton': '对话中添加'"),
    'locales.js 必须包含中英文产品库及按钮动作词条',
  )

  // 3. 验证进入产品库后一级按钮动态切换为带下拉分流菜单的「添加产品」
  assert.ok(
    stageContent.includes("if (sourceTab === 'product')") &&
    stageContent.includes('<CreateProductMenu') &&
    stageContent.includes("{t('product.chatButton') || '对话中添加'}") &&
    stageContent.includes("{t('add.button')}") &&
    stageContent.includes("{t('import.button')}"),
    'AssetsActionRow 必须在 sourceTab 为 product 时切换为主操作 CreateProductMenu 菜单，其他 Tab 保持「添加资产」',
  )

  // 4. 产品库二级分类平级挂载；列表与二级页都由 ProductTab 就地承载
  assert.ok(
    stageContent.includes("{sourceTab === 'product' ? (") &&
    stageContent.includes('<ProductCategoryNav') &&
    stageContent.includes('<ProductTab'),
    'AssetsStage 必须将 ProductCategoryNav 平级挂载于 FilterBar 下方，并由 ProductTab 就地承载列表与二级页',
  )

  assert.ok(
    categoryNavContent.includes('omnimux-assets-cloud-chip') &&
    productTabContent.includes('omnimux-products-list-view'),
    '产品分类胶囊复用资产库胶囊样式，列表根节点沿用产品库列表视图类名',
  )

  // 5. 产品样式收敛为单一真源：资产库不再重复定义，产品插件提供
  assert.ok(
    !assetsStyles.includes('.omnimux-products-card') &&
    !assetsStyles.includes('.omnimux-products-empty') &&
    productsStyles.includes('.omnimux-products-card') &&
    productsStyles.includes('.omnimux-products-empty'),
    '产品卡片与空状态样式必须只在产品插件里定义一次，避免两份同名不同值',
  )

  // 6. 产品插件不再注册独立侧边栏入口与工作台 Tab
  assert.equal(
    fs.existsSync(path.join(root, 'plugins/omnimux-products/src/client/index.js')),
    false,
    'omnimux-products 不再有客户端插件入口，因此不可能注册独立侧边栏或工作台 Tab',
  )
})
