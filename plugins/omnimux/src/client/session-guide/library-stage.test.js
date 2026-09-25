import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('彻底废除全屏遮罩：DOM 中绝对不存在 .omnimux-library-stage 与 fixed 覆盖层', () => {
  const styles = read('./styles.js')
  const guide = read('./SessionGuide.jsx')

  // 1. styles.js 绝对不包含 .omnimux-library-stage 的 position:fixed 规则
  assert.doesNotMatch(styles, /\.omnimux-library-stage \{[^}]*position:fixed/)
  assert.doesNotMatch(styles, /#omnimux-composer-add-host:has\(\[data-omnimux-library-stage\]\)/)

  // 2. SessionGuide 中已彻底移除 LibraryBrowser 与全屏 pin 逻辑
  assert.doesNotMatch(guide, /LibraryBrowser/)
  assert.doesNotMatch(guide, /pin\(\{ id: LIBRARY_STAGE_DOCK_ID \}\)/)
  assert.doesNotMatch(guide, /documentElement\.style\.setProperty\('--omnimux-library-stage-left'/)

  // 3. 原生输入框 dock 与技能选择器保持完好
  assert.match(styles, /data-omnimux-skill-picker/)
  assert.doesNotMatch(styles, /data-omnimux-skill-picker[\s\S]{0,120}display:\s*none/)
})
