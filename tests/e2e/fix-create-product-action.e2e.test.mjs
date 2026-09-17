import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 修复资产库「添加产品」点击无响应与二级表单唤起链路验证', () => {
  const assetsStagePath = path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx')
  const productsViewPath = path.join(root, 'plugins/omnimux-assets/src/client/ProductsView.jsx')
  const productsStagePath = path.join(root, 'plugins/omnimux-products/src/client/ProductsStage.jsx')

  const assetsStageContent = fs.readFileSync(assetsStagePath, 'utf-8')
  const productsViewContent = fs.readFileSync(productsViewPath, 'utf-8')
  const productsStageContent = fs.readFileSync(productsStagePath, 'utf-8')

  // 1. 验证 AssetsStage 中 handleOpenCreateProduct 彻底消除了不存在的 api.openTab
  assert.ok(
    !assetsStageContent.includes('api.openTab'),
    'AssetsStage 严禁调用未定义的 api.openTab，防止点击被静默吞掉'
  )

  // 2. 验证 AssetsStage 中正确调用工作台 open/openWorkbench 并通过意图/事件通信
  assert.ok(
    assetsStageContent.includes("window.__omnimuxProductsIntent = intent") &&
    assetsStageContent.includes("window.dispatchEvent(new CustomEvent('omnimux-products:open', { detail: intent }))") &&
    assetsStageContent.includes("api.open({ tabId: 'omnimux-products:library' })"),
    'AssetsStage 必须设置 __omnimuxProductsIntent 并派发 omnimux-products:open 事件，且通过 api.open 唤起工作台 Tab'
  )

  // 3. 验证 ProductsView 中卡片点击传递了 product.id
  assert.ok(
    productsViewContent.includes("handleCreate(isDigital ? 'digital' : 'physical', product.id)") &&
    productsViewContent.includes("const handleCreate = (kind, productId) =>"),
    'ProductsView 必须在点击卡片时传递 product.id 以联动编辑二级页'
  )

  // 4. 验证 ProductsStage 中接入意图消费与事件监听
  assert.ok(
    productsStageContent.includes("window.__omnimuxProductsIntent") &&
    productsStageContent.includes("window.addEventListener('omnimux-products:open'") &&
    productsStageContent.includes("handleCreate(intent.kind)") &&
    productsStageContent.includes("handleOpenProduct({ id: intent.productId })"),
    'ProductsStage 必须消费 __omnimuxProductsIntent 并监听 omnimux-products:open 事件，无缝切入创建与编辑二级页'
  )
})
