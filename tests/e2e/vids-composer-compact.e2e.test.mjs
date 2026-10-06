/**
 * @file tests/e2e/vids-composer-compact.e2e.test.mjs
 * @description 生成面板「紧凑合成器卡片」端到端契约（Issue #3203）。
 *
 * 真机证据：`node scripts/worktree-app-qa.mjs --journey=scripts/qa/vids-composer-compact.mjs`
 * 在任务工作树内起完整应用并逐态取证（默认收起 / 点箭头展开 / 点输入框展开 / 再点收起 / 胶囊展开参数），
 * 29 项断言全绿并留存 4 张截图。本文件把该旅程依赖的 DOM 契约固化为可回归断言。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const stageSrc = readFileSync(
  new URL('../../plugins/omnimux-video/src/client/GoogleVidsStage.jsx', import.meta.url),
  'utf8',
)
const journeySrc = readFileSync(new URL('../../scripts/qa/vids-composer-compact.mjs', import.meta.url), 'utf8')

test('E2E-AC-1/2: 紧凑合成器具备收起/展开双态与两个展开触发器', () => {
  for (const hook of [
    "data-vids-composer={composerExpanded ? 'expanded' : 'collapsed'}",
    'data-vids-composer-toggle',
    'data-vids-composer-clear',
    'data-vids-composer-extra',
  ]) {
    assert.equal(stageSrc.includes(hook), true, `缺少紧凑卡片钩子: ${hook}`)
  }
  // 默认收起：状态初值为 false；两个展开触发器分别是指针点击输入框与箭头按钮。
  assert.match(
    stageSrc,
    /const \[composerExpanded, setComposerExpanded\] = useState\(false\)/,
    '展开状态必须默认收起',
  )
  assert.match(stageSrc, /onFocus=\{\(\) => setComposerExpanded\(true\)\}/, '点击/聚焦输入框必须能展开')
  assert.match(stageSrc, /onClick=\{\(\) => setComposerExpanded\(\(v\) => !v\)\}/, '展开箭头必须能展开与收起')
})

test('E2E-AC-3: 展开态包含提示词输入、附件区、参数胶囊与清除/发送', () => {
  for (const hook of [
    'className="gvids-input-area"',
    'className="gvids-attach-row"',
    'data-vids-param-summary',
    'data-vids-param="seconds"',
    'data-vids-param="resolution"',
    'data-vids-param="aspectRatio"',
    'data-vids-submit',
  ]) {
    assert.equal(stageSrc.includes(hook), true, `展开态缺少元素: ${hook}`)
  }
  assert.match(stageSrc, /gvids-param-popover/, '参数选择器必须收进弹层')
  assert.match(stageSrc, /paramPopoverOpen \? 'true' : 'false'/, '参数弹层必须有开合状态')
})

test('E2E-AC-4: 非必要元素已移除但能力钩子保留', () => {
  assert.doesNotMatch(stageSrc, /className="gvids-mode-strip"/, '模式说明行必须移除')
  assert.doesNotMatch(stageSrc, /className="gvids-params"/, '独立成行的参数行必须移除')
  assert.doesNotMatch(stageSrc, /className="gvids-drawer-bottom"/, '大号生成按钮所在底栏必须移除')
  assert.doesNotMatch(stageSrc, /className="gvids-submit-reason"/, '常驻校验提示行必须移除')
  for (const kept of [
    'data-vids-mode=',
    'data-vids-mode-hint',
    'data-vids-attach=',
    'data-vids-submit',
    'data-vids-submit-reason',
    'data-vids-action="recreate"',
    'data-vids-action="edit-prompt"',
  ]) {
    assert.equal(stageSrc.includes(kept), true, `能力钩子被误删: ${kept}`)
  }
  assert.match(stageSrc, /生成记录/, '生成记录入口必须保留')
})

test('E2E-AC-7: 真机旅程覆盖双态取证', () => {
  assert.match(journeySrc, /01-composer-collapsed/, '必须留存收起态截图')
  assert.match(journeySrc, /02-composer-expanded/, '必须留存展开态截图')
  for (const probe of [
    'ac1-default-collapsed',
    'ac2-toggle-expands',
    'ac2-input-focus-expands',
    'ac4-toggle-recollapses',
    'ac4-mode-strip-removed',
  ]) {
    assert.equal(journeySrc.includes(probe), true, `真机旅程缺少断言: ${probe}`)
  }
})
