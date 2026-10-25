import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

/**
 * 侧栏收敛语义 + 自绘探索入口退役契约（Issue #3785）。
 *
 * 收敛仍然成立：核心常驻项继续挂在侧栏，其余 omnimux 插件不再作为独立行渲染；
 * 收敛项的渲染面是官方「更多」菜单（seat `sidebar.panellist.actions`），点击仍走
 * `activateExploreItem` 三段委托。
 *
 * 自绘「探索」常驻行与浮动菜单已退役：本文件挡回退，不再驱动已删除的 DOM。
 * 浮动菜单原有的 DOM 旅程覆盖改由
 * `plugins/omnimux/src/client/explore-more-menu.test.js`（组件面）、
 * `scripts/verify-explore-registration-browser.mjs`（真实 Chrome，菜单内容面）与
 * 应用级 journey（真实应用，侧栏无探索行 + 官方「更多」菜单仍 10 项）承担。
 */
test('E2E: 非核心及内测插件仍收敛，核心常驻项仍不收敛', () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.ok(fs.existsSync(coordinatorPath), 'sidebar-coordinator.js 必须存在')
  const content = fs.readFileSync(coordinatorPath, 'utf8')

  // 1. 核心常驻项白名单仍必须在场（项目 / 技能专家 / 资产库 / 灵感社区）
  for (const pinned of ['omnimux-workflow', 'omnimux-market', 'omnimux-assets', 'omnimux-inspiration']) {
    assert.ok(content.includes(pinned), `核心常驻项 ${pinned} 必须仍在白名单里`)
  }
  assert.match(content, /PINNED_ENTRY_PREFIXES/, '核心常驻白名单必须仍是单一真源常量')

  // 2. 收敛与激活接缝必须保留（渲染面已改为官方「更多」菜单）
  assert.match(content, /export function isConvergedEntry/, '收敛判定函数必须保留')
  assert.match(content, /export function activateExploreItem/, '收敛项激活委托必须保留')
  assert.match(content, /registerExploreItem/, '运行时注册接缝必须保留')

  // 3. 10 项白名单与零 Emoji 规则仍锁定（UI04）
  const expectedLabels = ['应用', '视频剪辑', '产品库', '发布', '账号', '手机管理', '数据分析', '自动化', '任务表单', '社交采收']
  for (const label of expectedLabels) {
    assert.ok(content.includes(`label: '${label}'`), `入口清单必须包含白名单锁定项: ${label}`)
  }
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
  assert.equal(emojiRegex.test(content), false, 'UI04 门禁硬拦截：入口清单代码中严禁包含任何 Emoji')
})

test('E2E: 自绘探索行与浮动菜单已退役，合同改登记官方「更多」菜单', () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  const content = fs.readFileSync(coordinatorPath, 'utf8')

  // 1. 退役面：行 ID、菜单 ID、浮层样式、几何定位、悬停接线、销毁函数都不得回流
  for (const gone of [
    'omnimux-explore-entry',
    'omnimux-explore-menu',
    'EXPLORE_STYLES',
    'computeExploreMenuPosition',
    'openExploreMenu',
    'closeExploreMenu',
    'EXPLORE_HOVER_',
  ]) {
    assert.equal(content.includes(gone), false, `自绘探索入口已退役，不得残留 ${gone}`)
  }

  // 2. 合同：不再登记探索行，改登记官方「更多」菜单 seat
  const contractPath = path.join(root, 'docs/contracts/sidebar-extra-entries.md')
  const contract = fs.readFileSync(contractPath, 'utf8')
  assert.equal(
    contract.includes('data-omnimux-explore-entry'),
    false,
    '合同不得再登记已退役的探索行'
  )
  assert.ok(
    contract.includes('sidebar.panellist.actions'),
    '合同必须登记官方「更多」菜单 seat（sidebar.panellist.actions）'
  )
})
