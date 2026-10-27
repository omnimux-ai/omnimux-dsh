import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8')

test('E2E: 验证产品库卡片彻底移除「复制引用」整行操作栏并仅保留标题与描述', () => {
  const productGrid = read('plugins/omnimux-products/src/client/ProductGrid.jsx')
  const productsStyles = read('plugins/omnimux-products/src/client/styles.js')
  const assetsStyles = read('plugins/omnimux-assets/src/client/styles.js')

  // 1. 复制引用操作行节点、触发函数与状态彻底移除
  assert.ok(
    !productGrid.includes('omnimux-products-card-actions'),
    'ProductGrid 中不得包含 omnimux-products-card-actions 操作栏容器',
  )
  assert.ok(
    !productGrid.includes('handleCopyCite') && !productGrid.includes('onCopy'),
    'ProductGrid 中不得残留复制引用触发函数或其 props',
  )
  assert.ok(
    !productGrid.includes('copiedId'),
    'ProductGrid 中不得残留 copiedId 状态',
  )

  // 2. 卡片完整保留标题与副描述
  assert.ok(
    productGrid.includes('className="omnimux-products-card-title"'),
    '卡片必须完整保留标题类名',
  )
  assert.ok(
    productGrid.includes('className="omnimux-products-card-desc"'),
    '卡片必须完整保留描述类名',
  )

  // 3. 两份样式表都不得残留操作行规则
  assert.ok(
    !productsStyles.includes('.omnimux-products-card-actions'),
    '产品插件样式表必须移除已弃用的操作行规则',
  )
  assert.ok(
    !assetsStyles.includes('.omnimux-products-card-actions'),
    '资产库样式表不得再出现产品操作行规则',
  )
})
