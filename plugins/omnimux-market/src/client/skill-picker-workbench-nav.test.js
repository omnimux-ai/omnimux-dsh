import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PLAZA_WORKBENCH_TAB_ID, buildPlazaWorkbenchOpenOptions } from './skill-picker-logic.js'

/**
 * Issue #3867：输入框技能面板的「探索更多」必须把技能/专家工作台以 **分栏** 打开。
 *
 * 工作台 Tab 的默认 focus 是 `gui`（右栏吃满视口、压掉中间会话栏）。会话内入口只有
 * 显式传 `focus: "split"` 才能「在当前页面状态下激活右侧边栏、把会话栏留在原地」。
 */
const pickerSource = readFileSync(new URL('./skill-picker.js', import.meta.url), 'utf8')

test('「探索更多」的工作台参数显式分栏，保留中间会话栏', () => {
  assert.deepEqual(buildPlazaWorkbenchOpenOptions('技能/专家'), {
    tabId: PLAZA_WORKBENCH_TAB_ID,
    title: '技能/专家',
    focus: 'split',
  })
})

test('工作台参数始终带 split，标题缺失也不回落到默认 gui', () => {
  assert.equal(buildPlazaWorkbenchOpenOptions(undefined).focus, 'split')
  assert.equal(buildPlazaWorkbenchOpenOptions('').focus, 'split')
  assert.equal(buildPlazaWorkbenchOpenOptions(undefined).tabId, PLAZA_WORKBENCH_TAB_ID)
})

test('技能面板「探索更多」使用分栏参数，不再以默认 focus 直接打开 plaza', () => {
  assert.match(
    pickerSource,
    /onExplore[\s\S]{0,600}?wb\.open\(SkillShelf\.buildPlazaWorkbenchOpenOptions\(tr\("plaza\.title"\)\)\)/,
  )
  assert.doesNotMatch(pickerSource, /wb\.open\(\{\s*tabId:\s*"omnimux-market:plaza"/)
})
