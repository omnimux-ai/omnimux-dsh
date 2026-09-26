import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 验证左侧侧边栏非核心及内测插件收敛至探索菜单且探索位于最下方', async () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.ok(fs.existsSync(coordinatorPath), 'sidebar-coordinator.js 必须存在')
  const coordinatorContent = fs.readFileSync(coordinatorPath, 'utf8')

  // 1. 验证探索行常驻定义与 Rank 7.2（排在最下方，位于灵感社区之后）
  assert.ok(
    coordinatorContent.includes("rank: 7.2"),
    '探索行必须设置 rank: 7.2，排在最下方'
  )
  assert.ok(
    coordinatorContent.includes("omnimux-explore-entry"),
    '必须包含常驻探索行 ID omnimux-explore-entry'
  )

  // 2. 验证核心常驻排除名单：项目、技能专家、资产库、灵感社区
  assert.ok(
    coordinatorContent.includes("omnimux-workflow") &&
    coordinatorContent.includes("omnimux-market") &&
    coordinatorContent.includes("omnimux-assets") &&
    coordinatorContent.includes("omnimux-inspiration"),
    '必须严格排除项目、技能专家、资产库、灵感社区并保持常驻'
  )

  // 3. 验证 11 项白名单与 SVG 矢量图标定义（UI04 门禁）
  const expectedLabels = [
    '应用',
    '视频剪辑',
    'Google Vids',
    '产品库',
    '发布',
    '账号',
    '手机管理',
    '数据分析',
    '自动化',
    '任务表单',
    '社交采收',
  ]
  for (const label of expectedLabels) {
    assert.ok(
      coordinatorContent.includes(`label: '${label}'`),
      `探索菜单必须包含白名单锁定项: ${label}`
    )
  }

  // 4. 验证严格零 Emoji 规则（UI04）
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
  assert.equal(
    emojiRegex.test(coordinatorContent),
    false,
    'UI04 门禁硬拦截：探索菜单代码中严禁包含任何 Emoji'
  )

  // 5. 验证浮动菜单几何定位算法与事件清理
  assert.ok(
    coordinatorContent.includes('computeExploreMenuPosition'),
    '必须提供带视口防溢出的探索菜单几何计算函数'
  )
  assert.ok(
    coordinatorContent.includes('closeExploreMenu'),
    '必须提供完整的浮动菜单销毁与事件注销函数'
  )

  // 6. 验证契约文档已同步
  const contractPath = path.join(root, 'docs/contracts/sidebar-extra-entries.md')
  const contractContent = fs.readFileSync(contractPath, 'utf8')
  assert.ok(
    contractContent.includes('data-omnimux-explore-entry'),
    'sidebar-extra-entries.md 必须登记探索行契约'
  )
})
