import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const panelPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/TaskDetailPanel.jsx')
const workbenchPath = resolve(repoRoot, 'plugins/omnimux-automation/src/client/AutomationWorkbench.jsx')

test('E2E: 定时任务详情自动保存与保存按钮移除契约验证', () => {
  const panelContent = readFileSync(panelPath, 'utf8')
  const workbenchContent = readFileSync(workbenchPath, 'utf8')

  // 1. TaskDetailPanel 必须彻底移除保存按钮与取消按钮容器
  assert.equal(panelContent.includes('dsh-st-md-foot-actions'), false, '面板中不得包含底部保存操作栏')
  assert.equal(panelContent.includes("t('detail.save')"), false, '面板中不得渲染保存按钮')
  assert.equal(panelContent.includes("t('form.cancel')"), false, '面板中不得渲染取消按钮')

  // 2. 字段更新必须支持即时自动保存调用
  assert.match(panelContent, /update\(\s*\{[^}]*\}\s*,\s*true\s*\)/, '离散选项变更时必须触发即时自动保存')
  assert.match(panelContent, /onBlur=\{\(\)\s*=>\s*onSave\?\.\(draft\)\}/, '文本输入框失焦时必须自动触发保存')

  // 3. AutomationWorkbench 关闭详情与切换时不再由 dirty 拦截弹窗
  assert.doesNotMatch(workbenchContent, /if\s*\(dirty\)\s*\{\s*setDiscard/, '关闭或切换详情时不得弹窗阻断')
})
