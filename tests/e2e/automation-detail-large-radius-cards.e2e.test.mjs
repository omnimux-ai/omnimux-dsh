import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const stylesPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/styles.js')

test('E2E: 定时任务详情分组卡片与指令卡片 16px 标准大圆角契约验证', () => {
  const stylesContent = readFileSync(stylesPath, 'utf8')

  // 1. 分组卡片必须声明 16px 标准大圆角
  assert.match(stylesContent, /\.dsh-st-md-group-card\{[^}]*border-radius:16px/, '分组卡片必须使用 16px 标准大圆角')

  // 2. 指令卡片必须声明 16px 标准大圆角
  assert.match(stylesContent, /\.dsh-st-md-prompt\{[^}]*border-radius:16px/, '指令卡片必须使用 16px 标准大圆角')
  assert.match(stylesContent, /\.dsh-st-md-prompt-input\{[^}]*border-radius:16px/, '指令编辑文本域必须使用 16px 标准大圆角')

  // 3. 内边距与舒适行距
  assert.match(stylesContent, /\.dsh-st-md-group-card \.dsh-st-md-field\{[^}]*padding:10px 16px/, '分组卡片字段行内边距必须舒展对齐')
})
