import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8')

test('E2E: 资产库「添加产品」就地展开二级表单，不再跳转独立产品页', () => {
  const assetsStage = read('plugins/omnimux-assets/src/client/AssetsStage.jsx')
  const productTab = read('plugins/omnimux-assets/src/client/ProductTab.jsx')

  // 1. 严禁调用未定义的 api.openTab（历史缺陷：点击被静默吞掉）
  assert.ok(
    !assetsStage.includes('api.openTab'),
    'AssetsStage 严禁调用未定义的 api.openTab，防止点击被静默吞掉',
  )

  // 2. 严禁再跳去独立产品页 —— 跨 Tab 跳转正是「返回」落回旧页面列表的根因
  assert.ok(
    !assetsStage.includes("api.open({ tabId: 'omnimux-products:library' })") &&
    !assetsStage.includes("api.openWorkbench({ tabId: 'omnimux-products:library' })"),
    '资产库不得再把产品交互移交给独立的 omnimux-products:library Tab',
  )

  // 3. 改为在同一 Tab 内切到产品库并下发意图
  assert.ok(
    assetsStage.includes("setSourceTab('product')") &&
    assetsStage.includes('setProductIntent({'),
    '点击卡片/添加产品必须切到产品库 Tab 并下发就地展开意图',
  )

  // 4. 意图由产品库 Tab 自己消费：创建走 handleCreate，编辑走 handleOpenProduct
  assert.ok(
    productTab.includes("if (intent.mode === 'create')") &&
    productTab.includes('handleCreate(intent.kind)') &&
    productTab.includes('void handleOpenProduct('),
    'ProductTab 必须消费就地展开意图，覆盖创建与编辑两条路径',
  )

  // 5. 二级页挂在同一 Tab 的 Stage 根上（铺满整个区域），返回即回本列表
  assert.ok(
    assetsStage.includes('<ProductFormPage') &&
    assetsStage.includes("productView.name === 'form'") &&
    productTab.includes("onViewChange(view.name === 'form'") &&
    productTab.includes('setView(LIST_VIEW)'),
    '二级页必须挂在资产库 Stage 根上就地覆盖，且返回落回本页列表',
  )
})

test('E2E: 旧独立产品页已下架，资产库产品库成为唯一入口', () => {
  const legacyFiles = [
    'plugins/omnimux-products/src/client/ProductsStage.jsx',
    'plugins/omnimux-products/src/client/index.js',
    'plugins/omnimux-products/src/client/sidebar-entry.js',
    'plugins/omnimux-assets/src/client/ProductsView.jsx',
  ]
  for (const rel of legacyFiles) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} 应已删除`)
  }

  const manifest = JSON.parse(read('plugins/omnimux-products/dsh.manifest.json'))
  assert.deepEqual(manifest.capabilities.slots, [], '产品插件不得再声明 sidebar.extra / shell.overlay slot')

  const pkg = JSON.parse(read('plugins/omnimux-products/package.json'))
  assert.equal(pkg.exports['./ui'], './src/client/ui.js', '产品插件必须以 ./ui 暴露浏览器安全 UI 源库')
  assert.equal(pkg.exports['./client'], undefined, '产品插件不再提供客户端插件入口')
  assert.equal(pkg.dsh.client, undefined, '产品插件不再声明 dsh.client')
})
