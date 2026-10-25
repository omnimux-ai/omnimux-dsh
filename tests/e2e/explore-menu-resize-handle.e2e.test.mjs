import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

/**
 * 自绘探索浮层退役契约（Issue #3785，替代原 #3188 手柄提层契约）。
 *
 * 背景：`#3188` 曾要求外壳分隔线手柄（`.dshDesktopResizeHandle`，宿主 z-index 50）
 * 必须压在自绘探索浮层（`.omnimux-explore-menu`，z-index 500）之上，否则贴边弹出的
 * 菜单会盖住 8px 命中带、分割线不可拖。原实机证据见
 * `docs/evidence/explore-menu-resize-handle-3188/report.md`。
 *
 * `#3785` 把入口迁到官方「更多」菜单（seat `sidebar.panellist.actions`）后，自绘浮层
 * 与其提层补丁一并退役：两者都必须消失，否则会留下「无浮层可压」却仍改写宿主手柄的
 * 死代码。本文件锁定退役面，防止回退。
 */
test('E2E: 自绘探索浮层已退役——不得再声明浮层样式或手柄提层规则（入口在官方「更多」菜单）', () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.ok(fs.existsSync(coordinatorPath), 'sidebar-coordinator.js 必须存在')
  const content = fs.readFileSync(coordinatorPath, 'utf8')

  // 1. 浮层样式块必须消失（原先它承载 z-index 500 与深色底）
  assert.equal(
    /\.omnimux-explore-menu\s*\{/.test(content),
    false,
    'sidebar-coordinator.js 不得再定义 .omnimux-explore-menu 浮层样式（#3785 已退役）'
  )

  // 2. 为浮层提层而改写的宿主手柄规则必须一并消失
  assert.equal(
    /\.dshDesktopResizeHandle\s*\{/.test(content),
    false,
    '浮层退役后不得再为外壳分隔线手柄声明提层规则（已无浮层可压）'
  )

  // 3. 浮层实现符号整体不得回流
  for (const gone of ['EXPLORE_STYLES', 'omnimux-sidebar-explore-styles', 'computeExploreMenuPosition']) {
    assert.equal(content.includes(gone), false, `自绘浮层已退役，不得残留 ${gone}`)
  }
})
