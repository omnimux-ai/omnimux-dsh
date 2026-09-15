import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const stylesPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/styles.js')
const panelPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/TaskDetailPanel.jsx')

test('E2E: 定时任务详情页现代极简深色 UI 风格契约验证', () => {
  const stylesContent = readFileSync(stylesPath, 'utf8')
  const panelContent = readFileSync(panelPath, 'utf8')

  // 1. 标题区域：去除“名称”标签，大号主标题无生硬粗框一体化
  assert.match(stylesContent, /\.dsh-st-md-title-label\{display:none\}/, '标题上方“名称”标签必须在视觉上隐藏')
  assert.match(stylesContent, /\.dsh-st-md-title-input\{[^}]*font-size:16px/, '主标题输入框字阶必须合规为 16px')
  assert.match(stylesContent, /\.dsh-st-md-title-input\{[^}]*border:1px solid transparent/, '主标题默认必须为无边框透明纯净样式')

  // 2. 任务指令区域：去除“任务指令”小标题，卡片化深色容器
  assert.match(panelContent, /className="dsh-st-md-block dsh-st-md-block--prompt"/, '任务指令区块必须携带专用卡片类名')
  assert.match(stylesContent, /\.dsh-st-md-block--prompt \.dsh-st-md-block-title[^{]*\{display:none\}/, '任务指令小标题必须在视觉上隐藏')
  assert.match(stylesContent, /\.dsh-st-md-prompt\{[^}]*border:1px solid var\(--dsw-alias-border-l1\)/, '指令卡片必须具有深层细微边框')
  assert.match(stylesContent, /\.dsh-st-md-prompt\{[^}]*line-height:22px/, '指令卡片文本行高必须舒展自然')

  // 3. 字段行：左右两端对齐现代排版
  assert.match(stylesContent, /\.dsh-st-md-field\{[^}]*justify-content:space-between/, '字段行必须为两端对齐排版')
  assert.match(stylesContent, /\.dsh-st-md-field-body\{[^}]*justify-content:flex-end/, '字段控件主体必须靠右对齐排列')

  // 4. 分组副标题：内敛次级浅灰与适度留白
  assert.match(stylesContent, /\.dsh-st-md-block-title\{[^}]*color:var\(--dsw-alias-label-tertiary\)/, '分组小标题必须使用次级文字色')
})
