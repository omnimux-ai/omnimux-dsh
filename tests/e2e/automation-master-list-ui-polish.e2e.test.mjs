import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const stylesPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/styles.js')
const masterListPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/TaskMasterList.jsx')

test('E2E: 定时任务记录栏 1:1 风格复刻契约验证', () => {
  const stylesContent = readFileSync(stylesPath, 'utf8')
  const masterListContent = readFileSync(masterListPath, 'utf8')

  // 1. 顶栏第一行必须并排包含胶囊和创建按钮，大标题隐藏
  assert.match(stylesContent, /\.dsh-st-md-heading\{display:none\}/, '记录栏大标题必须在视觉上隐藏')
  assert.match(stylesContent, /\.dsh-st-md-head\{[^}]*justify-content:space-between/, '顶栏必须为两端对齐布局')
  assert.match(stylesContent, /\.dsh-st-md-capsule-count\{display:none\}/, '胶囊数字徽标必须在视觉上隐藏')

  // 2. 搜索输入框必须为全圆角胶囊药丸设计
  assert.match(stylesContent, /\.dsh-st-md-search\{[^}]*border-radius:999px/, '搜索栏必须采用全圆角胶囊药丸设计')

  // 3. 任务列表项卡片流与选中圆角卡片
  assert.match(stylesContent, /\.dsh-st-md-row\{[^}]*border:0/, '任务项行之间不得有底部水平横线')
  assert.match(stylesContent, /\.dsh-st-md-row\.is-selected::before\{display:none\}/, '选中项不得有生硬左侧蓝色竖条')
  assert.match(stylesContent, /\.dsh-st-md-row\.is-selected\{[^}]*background:var\(--dsw-alias-interactive-bg-active\)/, '选中项必须具备独立卡片微高亮背景')
})
