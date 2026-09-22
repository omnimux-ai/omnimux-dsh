import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('整页选素材时分类钉在顶部，输入框贴底，技能按钮不被藏起来', () => {
  const styles = read('./styles.js')
  const guide = read('./SessionGuide.jsx')
  const stage = read('./LibraryBrowser.jsx')
  const model = read('../composer-add/library-stage-model.js')
  assert.match(styles, /\.omnimux-library-stage \{[^}]*position:fixed/)
  assert.match(styles, /\.omnimux-library-stage-grid \{[^}]*overflow:auto/)
  assert.match(guide, /scrollBody/)
  assert.match(guide, /documentElement\.style\.setProperty\('--omnimux-library-stage-left'/)
  assert.doesNotMatch(styles, /\.omnimux-library-stage-tabs \{[^}]*position:sticky/)
  assert.match(styles, /data-omnimux-skill-picker/)
  assert.doesNotMatch(styles, /data-omnimux-skill-picker[\s\S]{0,120}display:\s*none/)
  assert.match(guide, /LibraryBrowser/)
  assert.match(guide, /pin\(\{ id: LIBRARY_STAGE_DOCK_ID \}\)/)
  assert.match(guide, /setAttribute\('data-omnimux-dock-open'/)
  assert.match(read('./useComposerDocking.js'), /pinnedRef\.current\) return undefined/)
  assert.match(stage, /LIBRARY_TABS/)
  assert.match(model, /精选/)
  assert.match(model, /资产库/)
  assert.match(model, /灵感库/)
  assert.match(model, /产品库/)
  assert.match(model, /爆款趋势/)
})
