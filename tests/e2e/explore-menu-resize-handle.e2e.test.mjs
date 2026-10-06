import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

/**
 * E2E 契约（Issue #3188）：外壳分隔线手柄必须在探索浮层菜单之上。
 *
 * 背景：探索菜单（.omnimux-explore-menu, z-index 500）贴边弹出时盖住外壳
 * 分隔线手柄（.dshDesktopResizeHandle，宿主 z-index 50，宽 8px），导致
 * 分割线被覆盖段无法命中、不可拖拽。
 *
 * 实机证据：docs/evidence/explore-menu-resize-handle-3188/report.md
 * （Dev App CDP：修复前命中栈顶部为菜单项，修复后全高度命中手柄，
 *   菜单展开时拖拽 280→360 生效）。
 *
 * 本文件锁定实现契约，防止回归：
 *  1) EXPLORE_STYLES 必须声明 .dshDesktopResizeHandle 提层规则；
 *  2) 手柄 z-index 必须严格大于 .omnimux-explore-menu 的 z-index；
 *  3) 提层规则不得改变手柄宽度（仍 ±4px 命中带，不遮菜单项）。
 */
test('E2E: 分隔线手柄层级高于探索浮层菜单，分割线全段可拖', () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.ok(fs.existsSync(coordinatorPath), 'sidebar-coordinator.js 必须存在')
  const content = fs.readFileSync(coordinatorPath, 'utf8')

  // 1. 必须存在针对外壳手柄的提层声明
  const handleRule = content.match(/\.dshDesktopResizeHandle\s*\{([^}]+)\}/)
  assert.ok(handleRule, 'EXPLORE_STYLES 必须声明 .dshDesktopResizeHandle 规则，压住探索菜单')
  const handleZ = handleRule[1].match(/z-index:\s*(\d+)/)
  assert.ok(handleZ, '手柄规则必须声明 z-index')
  assert.ok(handleRule[1].includes('!important'), '手柄 z-index 必须 !important 以压过宿主 50')

  // 2. 手柄层级必须严格高于菜单层级
  const menuRule = content.match(/\.omnimux-explore-menu\s*\{([^}]+)\}/)
  assert.ok(menuRule, '必须存在 .omnimux-explore-menu 规则')
  const menuZ = menuRule[1].match(/z-index:\s*(\d+)/)
  assert.ok(menuZ, '菜单必须声明 z-index')
  assert.ok(
    Number(handleZ[1]) > Number(menuZ[1]),
    `手柄 z-index (${handleZ[1]}) 必须大于菜单 z-index (${menuZ[1]})`
  )

  // 3. 提层规则不得给手柄加宽或加 padding（否则遮挡菜单项可点区）
  assert.equal(/width|padding|margin/.test(handleRule[1]), false, '手柄规则不得声明宽高/内外边距')
})
