import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const stylesPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/styles.js')
const panelPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/TaskDetailPanel.jsx')

test('E2E: 定时任务详情页同分类分组卡片样式契约验证', () => {
  const stylesContent = readFileSync(stylesPath, 'utf8')
  const panelContent = readFileSync(panelPath, 'utf8')

  // 1. 面板中详情分组与频率分组必须使用 .dsh-st-md-group-card 包裹
  const cardCount = (panelContent.match(/className="dsh-st-md-group-card"/g) || []).length
  assert.ok(cardCount >= 2, `分组卡片容器数量必须不少于 2 个（当前检测到 ${cardCount} 个）`)

  // 2. 分组卡片容器必须声明深色背景、圆角与细边框
  assert.match(stylesContent, /\.dsh-st-md-group-card\{[^}]*background:var\(--dsw-alias-bg-layer-2\)/, '卡片容器必须使用深色分层背景')
  assert.match(stylesContent, /\.dsh-st-md-group-card\{[^}]*border:1px solid var\(--dsw-alias-border-l1\)/, '卡片容器必须具有轻量微边框')
  assert.match(stylesContent, /\.dsh-st-md-group-card\{[^}]*border-radius:10px/, '卡片容器圆角必须为 10px')

  // 3. 卡片内字段行必须有内边距与相邻内联底边线
  assert.match(stylesContent, /\.dsh-st-md-group-card \.dsh-st-md-field\{[^}]*border-bottom:1px solid var\(--dsw-alias-border-l1\)/, '卡片内字段行必须有内联分隔线')
  assert.match(stylesContent, /\.dsh-st-md-group-card \.dsh-st-md-field:last-child\{border-bottom:0\}/, '卡片最后一项必须移除内联底边线')
})
