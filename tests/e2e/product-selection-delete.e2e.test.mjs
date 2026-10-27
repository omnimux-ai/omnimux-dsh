import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8')

test('E2E: 验证产品库支持批量选择与删除（对齐本地 Tab 规范）', () => {
  const productTab = read('plugins/omnimux-assets/src/client/ProductTab.jsx')
  const productGrid = read('plugins/omnimux-products/src/client/ProductGrid.jsx')
  const productsStyles = read('plugins/omnimux-products/src/client/styles.js')
  const assetsStyles = read('plugins/omnimux-assets/src/client/styles.js')
  const productsLocales = read('plugins/omnimux-products/src/client/locales.js')

  // 1. 卡片多选：勾选框挂在缩略图内，选中态由宿主传入
  assert.ok(
    productGrid.includes('className="omnimux-products-check"') &&
    productGrid.includes('onToggleSelect(product)') &&
    productGrid.includes('data-selected={selected ?'),
    'ProductGrid 必须在缩略图内挂载带选中态的勾选框',
  )
  assert.ok(
    productGrid.includes('omnimux-products-focusable'),
    '卡片外层容器必须包含 omnimux-products-focusable 类名以支持悬停勾选框显现',
  )

  // 2. 多选操作栏由资产库宿主渲染
  assert.ok(
    productTab.includes('className="omnimux-products-selection"') &&
    productTab.includes("t('select.count')") &&
    productTab.includes("t('select.clear')") &&
    productTab.includes("t('select.delete')"),
    'ProductTab 必须在有已选项目时呈现计数、取消与删除操作栏',
  )

  // 3. 删除确认弹窗与批量删除链路
  assert.ok(
    productTab.includes('<ConfirmModal') &&
    productTab.includes('handleConfirmDelete') &&
    productTab.includes('deleteProduct(id)'),
    'ProductTab 必须挂载 ConfirmModal 并通过产品接口执行删除',
  )

  // 4. 勾选框样式在产品插件里定义一次，资产库不再重复
  assert.ok(
    productsStyles.includes('.omnimux-products-card-thumb .omnimux-products-check'),
    '勾选框定位样式必须在产品插件样式表中定义',
  )
  assert.ok(
    !assetsStyles.includes('.omnimux-products-check'),
    '资产库不得再重复定义产品勾选框样式',
  )

  // 5. 中英文移除提示词条属于产品库命名空间
  assert.ok(
    productsLocales.includes("'select.removeTitle'") &&
    productsLocales.includes("'remove.title'") &&
    productsLocales.includes("'remove.hint'"),
    '产品库词典必须包含单项与批量移除的提示文案',
  )
})
