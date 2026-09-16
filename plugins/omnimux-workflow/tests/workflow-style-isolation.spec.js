import assert from 'node:assert/strict'
import test from 'node:test'
import { WORKFLOW_CSS } from '../src/client/styles.js'

test('omnimux-workflow: 样式表严禁裸写 .omnimux-assets-action-row 等全局选择器，杜绝污染主资产库', () => {
  // 严禁存在裸的顶层 .omnimux-assets-action-row {
  assert.doesNotMatch(
    WORKFLOW_CSS,
    /\n\.omnimux-assets-action-row\s*\{/,
    '必须禁止裸写顶层 .omnimux-assets-action-row，避免污染 omnimux-assets 资产库'
  )

  // 必须收敛至 .omnimux-assets-tab 容器前缀下
  assert.match(
    WORKFLOW_CSS,
    /\.omnimux-assets-tab\s+\.omnimux-assets-action-row/,
    '项目内资产操作行必须带有 .omnimux-assets-tab 作用域前缀'
  )

  assert.match(
    WORKFLOW_CSS,
    /\.omnimux-assets-tab\s+\.omnimux-assets-action-card/,
    '项目内资产卡片必须带有 .omnimux-assets-tab 作用域前缀'
  )
})
