import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 验证产品库支持批量选择与删除（对齐本地 Tab 规范）', () => {
  const productsViewPath = path.join(root, 'plugins/omnimux-assets/src/client/ProductsView.jsx')
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')
  const localesPath = path.join(root, 'plugins/omnimux-assets/src/client/locales.js')

  const productsViewContent = fs.readFileSync(productsViewPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
  const localesContent = fs.readFileSync(localesPath, 'utf-8')

  // 1. 验证卡片多选状态与勾选框节点挂载
  assert.ok(
    productsViewContent.includes('className="omnimux-assets-check"') &&
    productsViewContent.includes('toggleSelect(product.id, e)'),
    'ProductsView 中必须在缩略图内挂载带有 toggleSelect 的 omnimux-assets-check 勾选按钮'
  )
  assert.ok(
    productsViewContent.includes('omnimux-assets-focusable'),
    '卡片外层容器必须包含 omnimux-assets-focusable 类名以支持悬停勾选框显现'
  )

  // 2. 验证多选操作栏渲染
  assert.ok(
    productsViewContent.includes('className="omnimux-assets-selection"') &&
    productsViewContent.includes("t('select.count')") &&
    productsViewContent.includes("t('select.clear')") &&
    productsViewContent.includes("t('select.delete')"),
    'ProductsView 必须在有已选项目时呈现带有计数、取消和删除按钮的 omnimux-assets-selection 操作栏'
  )

  // 3. 验证删除确认弹窗与批量删除链路
  assert.ok(
    productsViewContent.includes('<ConfirmModal') &&
    productsViewContent.includes('handleConfirmDelete') &&
    productsViewContent.includes("fetch(`/omnimux/products/${encodeURIComponent(id)}`, { method: 'DELETE' })"),
    'ProductsView 必须挂载 ConfirmModal 对话框并通过 DELETE 接口执行删除'
  )

  // 4. 验证样式中勾选框与右上角徽标规范
  assert.ok(
    stylesContent.includes('.omnimux-products-card-thumb .omnimux-assets-check') &&
    stylesContent.includes('.omnimux-products-badge {\n  position: absolute;\n  top: 8px;\n  right: 8px;'),
    'styles.js 必须将卡片角标定位在右上角，并为产品缩略图配置 .omnimux-assets-check 样式'
  )

  // 5. 验证中英文多语言词条
  assert.ok(
    localesContent.includes("'product.removeTitle'") &&
    localesContent.includes("'product.removeBatchTitle'") &&
    localesContent.includes("'product.removeHint'"),
    'locales.js 必须包含产品移除相关的专用提示文案'
  )
})
