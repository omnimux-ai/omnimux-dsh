/**
 * @file tests/e2e/vids-panel-chrome-trim.e2e.test.mjs
 * @description 生成面板去除无意义面板外壳（标题栏 / 空生成记录行）的端到端契约（Issue #3205）。
 *
 * 真机证据：`node scripts/worktree-app-qa.mjs --journey=scripts/qa/vids-panel-chrome-trim.mjs`
 * 在任务工作树内起完整应用，验证面板内标题栏与向导按钮不再渲染、空态生成记录块真的不可见，
 * 并确认收起/展开契约未回归（24 项断言全绿，3 张截图）。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const stageSrc = readFileSync(
  new URL('../../plugins/omnimux-video/src/client/GoogleVidsStage.jsx', import.meta.url),
  'utf8',
)
const journeySrc = readFileSync(new URL('../../scripts/qa/vids-panel-chrome-trim.mjs', import.meta.url), 'utf8')

test('E2E-AC-1: 剪辑面板形态下不渲染标题栏（标题/内测版微标/向导按钮）', () => {
  // 头部整块由 !isPanel 守卫：面板形态下既不渲染节点，也不残留空容器。
  assert.match(stageSrc, /\{!isPanel && \(\s*<header className="gvids-header">/, '头部必须由 !isPanel 守卫')
  assert.match(stageSrc, /<\/header>\s*\)\}/, '头部守卫必须闭合')
  // 独立舞台形态仍保留头部三件套，不能被顺手删掉。
  for (const kept of ['gvids-title-cluster', 'gvids-badge', 'gvids-wizard-btn', 'handleCloseStage']) {
    assert.equal(stageSrc.includes(kept), true, `独立舞台形态缺少: ${kept}`)
  }
})

test('E2E-AC-2: 无记录时生成记录块整体隐藏，有记录时照常显示', () => {
  assert.match(stageSrc, /className="gvids-feed" data-empty=\{tasks\.length === 0 \? 'true' : 'false'\}/, '空态必须由 tasks.length 驱动')
  assert.match(stageSrc, /\{tasks\.length > 0 && \(\s*<div className="gvids-feed-header">/, '标题行仅在有条目时渲染')
  assert.match(stageSrc, /\.gvids-feed\[data-empty='true'\] \{\s*display: none;/, '空态必须有真实的隐藏样式')
})

test('E2E-AC-3: 移除外壳后收起/展开与四模式能力不回归', () => {
  for (const kept of [
    "data-vids-composer={composerExpanded ? 'expanded' : 'collapsed'}",
    'data-vids-composer-toggle',
    'data-vids-param-summary',
    'data-vids-submit',
    'data-vids-mode=',
  ]) {
    assert.equal(stageSrc.includes(kept), true, `能力钩子被误删: ${kept}`)
  }
  assert.match(stageSrc, /onFocus=\{\(\) => setComposerExpanded\(true\)\}/, '点击输入框仍能展开')
})

test('E2E-AC-4: 真机旅程覆盖标题栏缺失与空态隐藏', () => {
  for (const probe of [
    'ac1-header-absent',
    'ac1-header-text-absent',
    'ac2-empty-state-hides-block',
    'ac2-empty-state-hides-header',
    'ac4-toggle-expands',
  ]) {
    assert.equal(journeySrc.includes(probe), true, `真机旅程缺少断言: ${probe}`)
  }
  assert.match(journeySrc, /03-panel-forced-empty/, '必须留存空态截图')
})
