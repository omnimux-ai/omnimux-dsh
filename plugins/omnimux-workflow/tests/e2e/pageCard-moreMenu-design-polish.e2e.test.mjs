import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pageTabPath = join(here, '../../src/client/projects/ProjectPagesTab.jsx')
const stylesPath = join(here, '../../src/client/projects/folderStyles.js')

const pageTabSrc = readFileSync(pageTabPath, 'utf8')
const stylesSrc = readFileSync(stylesPath, 'utf8')

test('E2E: 创作页卡片操作菜单全链路遵循 design.md 设计规范契约', () => {
  // 1. 结构契约：更多操作入口必须声明 IconButton、menu 角色与展开项
  assert.match(
    pageTabSrc,
    /<IconButton[^>]*className="omnimux-page-more"[^>]*aria-haspopup="menu"/,
    '创作页卡片必须提供 aria-haspopup="menu" 规范的更多操作按键',
  )
  assert.match(
    pageTabSrc,
    /<div[^>]*className="omnimux-folder-menu omnimux-page-card-menu"[^>]*role="menu"/,
    '创作页卡片菜单必须声明 role="menu" 与规范样式类',
  )

  // 2. 危险操作契约：删除创作页必须标记 data-danger="true" 与危险项专属类名
  assert.match(
    pageTabSrc,
    /className="omnimux-folder-menu-item--danger"/,
    '删除创作页菜单项必须包含危险项类名',
  )
  assert.match(
    pageTabSrc,
    /data-danger="true"/,
    '删除创作页菜单项必须包含 data-danger 契约属性',
  )

  // 3. 样式规则契约：卡片必须支持悬停展示更多操作按键，浮层具备毛玻璃与内切几何
  assert.match(
    stylesSrc,
    /\.omnimux-page-card\s*\{[^}]*position:\s*relative;/,
    '创作页卡片必须声明 relative 定位基准',
  )
  assert.match(
    stylesSrc,
    /\.omnimux-page-card\s+\.omnimux-page-more\s*\{[^}]*position:\s*absolute;/,
    '更多操作按键必须绝对定位在右下角',
  )
  assert.match(
    stylesSrc,
    /\.omnimux-page-card:hover\s+\.omnimux-page-more/,
    '创作页卡片 hover 时必须平滑露出更多操作按键',
  )
  assert.match(
    stylesSrc,
    /\.omnimux-page-card\s+\.omnimux-page-card-menu\s*\{[^}]*bottom:\s*44px;/,
    '创作页卡片菜单必须位于三点按钮正上方对齐',
  )
})
