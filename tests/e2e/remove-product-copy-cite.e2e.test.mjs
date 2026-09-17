import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 验证产品库卡片彻底移除「复制引用」整行操作栏并仅保留标题与描述', () => {
  const productsViewPath = path.join(root, 'plugins/omnimux-assets/src/client/ProductsView.jsx')
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')

  const productsViewContent = fs.readFileSync(productsViewPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证彻底移除复制引用操作行节点及相关状态
  assert.ok(
    !productsViewContent.includes('omnimux-products-card-actions'),
    'ProductsView 中不得包含 omnimux-products-card-actions 操作栏容器'
  )
  assert.ok(
    !productsViewContent.includes('handleCopyCite'),
    'ProductsView 中不得残留 handleCopyCite 复制触发函数'
  )
  assert.ok(
    !productsViewContent.includes('copiedId'),
    'ProductsView 中不得残留 copiedId 状态'
  )
  assert.ok(
    !productsViewContent.includes('CheckIcon'),
    'ProductsView 中不得残留 CheckIcon 引用'
  )

  // 2. 验证卡片完整保留标题与副描述/价格
  assert.ok(
    productsViewContent.includes('className="omnimux-products-card-name"'),
    '卡片必须完整保留标题类名 omnimux-products-card-name'
  )
  assert.ok(
    productsViewContent.includes('className="omnimux-products-card-sub"'),
    '卡片必须完整保留描述类名 omnimux-products-card-sub'
  )

  // 3. 验证 styles.js 中无残留无用的操作行样式
  assert.ok(
    !stylesContent.includes('.omnimux-products-card-actions'),
    'styles.js 中必须移除已弃用的 .omnimux-products-card-actions 规则'
  )
})
