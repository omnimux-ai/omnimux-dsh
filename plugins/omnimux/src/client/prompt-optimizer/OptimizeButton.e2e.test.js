import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUTTON_PATH = resolve(HERE, 'OptimizeButton.jsx')
const STYLES_PATH = resolve(HERE, 'styles.js')

/**
 * 「点了没反应」回归的端到端契约（源码级断言）。
 * 浏览器证据见 .workbuddy/evidence/prompt-optimizer-btn/s1..s3。
 */
describe('OptimizeButton 不可点回归契约', () => {
  it('useInput 缺位时必须走 DOM 草稿订阅，空草稿判定跟随真实输入框', async () => {
    const src = await readFile(BUTTON_PATH, 'utf8')
    assert.match(src, /function useDomDraft\(\)/, '必须有 DOM 草稿订阅兜底')
    assert.match(src, /addEventListener\('input', refresh, true\)/, '必须订阅捕获段 input 事件')
    assert.match(src, /omnimux:composer:set-draft/, '必须订阅草稿回写事件')
    assert.equal(/const draft = typeof input\?\.draft === 'string' \? input\.draft : readDraft\(\)/.test(src), false, '不得再把一次快照当草稿真源')
    assert.match(src, /const draft = typeof input\?\.draft === 'string' \? input\.draft : domDraft/)
  })

  it('disabled 按钮的悬停提示必须挂外层 omx-optimize-seat', async () => {
    const src = await readFile(BUTTON_PATH, 'utf8')
    assert.match(src, /<span className="omx-optimize-seat" title=\{title\}>/, '未配置原因提示须挂在包裹层')
    const styles = await readFile(STYLES_PATH, 'utf8')
    assert.match(styles, /\.omx-optimize-seat/, '包裹层样式必须存在')
  })
})
