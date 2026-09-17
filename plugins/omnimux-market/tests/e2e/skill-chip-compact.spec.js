/**
 * E2E 契约：会话栏技能胶囊缩小自适应为仅图标与交互优化（Issue #2181）。
 * 覆盖：
 *  1. 紧凑状态自适应为 28px 仅图标圆形胶囊，隐藏文本与常驻叉号；
 *  2. 悬停手感优化：图标切换为移除小叉号，点击一键清除技能；
 *  3. 宽屏状态下超长名称安全限宽与省略截断；
 *  4. 源码结构与 Token 符合设计规范。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const cssSrc = readFileSync(join(root, 'src/client/css.js'), 'utf8')
const skillPickerSrc = readFileSync(join(root, 'src/client/skill-picker.js'), 'utf8')

test('E2E 会话底栏紧凑密度下技能胶囊自适应收敛为 28px 仅图标并隐藏文本与关闭按钮', () => {
  // 紧凑模式宽度为 28px，与模型选择器、添加按钮完全齐平
  assert.match(cssSrc, /html:is\(\[data-omnimux-composer-density='short'\],\[data-omnimux-composer-density='icon'\]\) \.sh-active-skill-chip\{width:28px !important/)
  assert.match(cssSrc, /html:is\(\[data-omnimux-composer-density='short'\],\[data-omnimux-composer-density='icon'\]\) \.sh-active-skill-chip\{[^}]*justify-content:center !important/)

  // 隐藏名称文本与常驻关闭按钮
  assert.match(cssSrc, /html:is\(\[data-omnimux-composer-density='short'\],\[data-omnimux-composer-density='icon'\]\) \.sh-active-skill-chip \.sh-chip-label,[\s\S]*?display:none !important/)
})

test('E2E 紧凑状态悬停手感优化：图标切换为移除叉号并提供直观反馈', () => {
  // 正常态显示主图标，悬停态隐藏主图标并展示清除图标
  assert.match(cssSrc, /\.sh-active-skill-chip \.sh-chip-icon\{display:block/)
  assert.match(cssSrc, /\.sh-active-skill-chip \.sh-chip-icon-hover\{display:none/)
  assert.match(cssSrc, /html:is\(\[data-omnimux-composer-density='short'\],\[data-omnimux-composer-density='icon'\]\) \.sh-active-skill-chip:hover \.sh-chip-icon\{display:none !important\}/)
  assert.match(cssSrc, /html:is\(\[data-omnimux-composer-density='short'\],\[data-omnimux-composer-density='icon'\]\) \.sh-active-skill-chip:hover \.sh-chip-icon-hover\{display:block !important\}/)

  // 悬停反馈使用规范 Token，不使用未定义裸色
  assert.match(cssSrc, /html:is\(\[data-omnimux-composer-density='short'\],\[data-omnimux-composer-density='icon'\]\) \.sh-active-skill-chip:hover\{[^}]*var\(--dsw-alias-label-danger/)
})

test('E2E 组件结构具备双图标与紧凑模式一键移除逻辑', () => {
  // 结构声明了主图标与悬停切换图标
  assert.match(skillPickerSrc, /className:\s*"sh-chip-icon"/)
  assert.match(skillPickerSrc, /className:\s*"sh-chip-icon-hover"/)
  assert.match(skillPickerSrc, /className:\s*"sh-chip-label"/)

  // 点击胶囊在紧凑状态下快速清空挂载技能
  assert.match(skillPickerSrc, /density === "icon" \|\| density === "short"/)
  assert.match(skillPickerSrc, /clearActiveSkill\(\)/)

  // 悬停提示包含技能全称与点击移除提示
  assert.match(skillPickerSrc, /点击可移除/)
})

test('E2E 宽屏状态下技能名称具备文本限宽与省略截断防护，防止超长名挤压右侧操作区', () => {
  assert.match(cssSrc, /\.sh-active-skill-chip \.sh-chip-label\{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/)
})
