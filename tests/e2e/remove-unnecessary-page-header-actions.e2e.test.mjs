import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

function extractPageHeader(content) {
  const match = content.match(/<PageHeader[\s\S]*?\/>/)
  return match ? match[0] : ''
}

test('E2E: 全局所有一级插件页面右上角彻底移除非必要的刷新与关闭按钮', () => {
  // 1. 资产中心 AssetsStage
  const assetsStagePath = path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx')
  const assetsHeader = extractPageHeader(fs.readFileSync(assetsStagePath, 'utf-8'))
  assert.ok(assetsHeader, 'AssetsStage 必须存在 PageHeader')
  assert.ok(!assetsHeader.includes('onRefresh'), 'AssetsStage PageHeader 严禁传递 onRefresh')
  assert.ok(!assetsHeader.includes('refreshTitle'), 'AssetsStage PageHeader 严禁传递 refreshTitle')
  assert.ok(!assetsHeader.includes('onClose'), 'AssetsStage PageHeader 严禁传递 onClose')
  assert.ok(!assetsHeader.includes('closeTitle'), 'AssetsStage PageHeader 严禁传递 closeTitle')

  // 2. 产品中心主列表 ProductsStage
  const productsStagePath = path.join(root, 'plugins/omnimux-products/src/client/ProductsStage.jsx')
  const productsHeader = extractPageHeader(fs.readFileSync(productsStagePath, 'utf-8'))
  assert.ok(productsHeader, 'ProductsStage 必须存在 PageHeader')
  assert.ok(!productsHeader.includes('onRefresh'), 'ProductsStage PageHeader 严禁传递 onRefresh')
  assert.ok(!productsHeader.includes('onClose'), 'ProductsStage PageHeader 严禁传递 onClose')

  // 3. 数据分析看板 AnalyticsStage
  const analyticsStagePath = path.join(root, 'plugins/omnimux-analytics/src/client/AnalyticsStage.jsx')
  const analyticsHeader = extractPageHeader(fs.readFileSync(analyticsStagePath, 'utf-8'))
  assert.ok(analyticsHeader, 'AnalyticsStage 必须存在 PageHeader')
  assert.ok(!analyticsHeader.includes('onRefresh'), 'AnalyticsStage PageHeader 严禁传递 onRefresh')
  assert.ok(!analyticsHeader.includes('onClose'), 'AnalyticsStage PageHeader 严禁传递 onClose')
  assert.ok(analyticsHeader.includes('trailingAction'), 'AnalyticsStage PageHeader 必须保留导出数据表格必要操作')

  // 4. 发布分发中心 PublishStage
  const publishStagePath = path.join(root, 'plugins/omnimux-publish/src/client/PublishStage.jsx')
  const publishHeader = extractPageHeader(fs.readFileSync(publishStagePath, 'utf-8'))
  assert.ok(publishHeader, 'PublishStage 必须存在 PageHeader')
  assert.ok(!publishHeader.includes('onRefresh'), 'PublishStage PageHeader 严禁传递 onRefresh')
  assert.ok(!publishHeader.includes('onClose'), 'PublishStage PageHeader 严禁传递 onClose')

  // 5. 灵感创意中心 InspirationStage
  const inspirationStagePath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationStage.jsx')
  const inspirationHeader = extractPageHeader(fs.readFileSync(inspirationStagePath, 'utf-8'))
  assert.ok(inspirationHeader, 'InspirationStage 必须存在 PageHeader')
  assert.ok(!inspirationHeader.includes('onClose'), 'InspirationStage PageHeader 严禁传递 onClose')

  // 6. 创作项目库与画布 WorkflowStage & ProjectLibraryPage
  const projectLibPath = path.join(root, 'plugins/omnimux-workflow/src/client/projects/ProjectLibraryPage.jsx')
  const projectLibHeader = extractPageHeader(fs.readFileSync(projectLibPath, 'utf-8'))
  assert.ok(projectLibHeader, 'ProjectLibraryPage 必须存在 PageHeader')
  assert.ok(!projectLibHeader.includes('onRefresh'), 'ProjectLibraryPage PageHeader 严禁传递 onRefresh')
  assert.ok(!projectLibHeader.includes('onClose'), 'ProjectLibraryPage PageHeader 严禁传递 onClose')

  const workflowStagePath = path.join(root, 'plugins/omnimux-workflow/src/client/WorkflowStage.jsx')
  const workflowHeader = extractPageHeader(fs.readFileSync(workflowStagePath, 'utf-8'))
  assert.ok(workflowHeader, 'WorkflowStage 必须存在 PageHeader')
  assert.ok(!workflowHeader.includes('onClose'), 'WorkflowStage PageHeader 严禁传递 onClose')

  // 7. 账号管理中心 AccountsStage & AccountsSection
  const accountsStagePath = path.join(root, 'plugins/omnimux-accounts/src/client/AccountsStage.jsx')
  const accountsStageHeader = extractPageHeader(fs.readFileSync(accountsStagePath, 'utf-8'))
  assert.ok(accountsStageHeader, 'AccountsStage 必须存在 PageHeader')
  assert.ok(!accountsStageHeader.includes('onClose'), 'AccountsStage PageHeader 严禁传递 onClose')

  const accountsSectionPath = path.join(root, 'plugins/omnimux-accounts/src/client/AccountsSection.jsx')
  const accountsSectionHeader = extractPageHeader(fs.readFileSync(accountsSectionPath, 'utf-8'))
  assert.ok(accountsSectionHeader, 'AccountsSection 必须存在 PageHeader')
  assert.ok(!accountsSectionHeader.includes('onClose'), 'AccountsSection PageHeader 严禁传递 onClose')

  // 8. 应用广场 AppsStage
  const appsStagePath = path.join(root, 'plugins/omnimux/src/client/AppsStage.jsx')
  const appsHeader = extractPageHeader(fs.readFileSync(appsStagePath, 'utf-8'))
  assert.ok(appsHeader, 'AppsStage 必须存在 PageHeader')
  assert.ok(!appsHeader.includes('onClose'), 'AppsStage PageHeader 严禁传递 onClose')
})
