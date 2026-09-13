// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createBrowserSnapshotMessage } from '../../src/browser-context.ts'

describe('Chat Bubble & Code Pill UI Polish Suite (#1612)', () => {
  const stylesPath = resolve(__dirname, '../src/panel/styles.css')
  const styles = readFileSync(stylesPath, 'utf8')

  it('provides high contrast text and modern bubble radius for user messages in dark mode', () => {
    // 默认用户消息结构
    expect(styles).toContain('.row.user .body')
    expect(styles).toContain('border-radius: 18px 18px 4px 18px')

    // 暗黑模式下用户文字必须是纯白高对比度，背景必须是质感深灰，杜绝深蓝黑死字
    expect(styles).toContain(':root[data-theme="dark"] .row.user .body')
    expect(styles).toContain('color: #ffffff')
    expect(styles).toContain('background: #27272a')
  })

  it('eliminates glaring white background for inline code in dark mode', () => {
    expect(styles).toContain('.row .body.md code')
    expect(styles).toContain(':root[data-theme="dark"] .row .body.md code')
    // 深色模式下 code 为半透明暗光背景并使用科技感蓝色高亮
    expect(styles).toContain('background: rgba(255, 255, 255, 0.08)')
    expect(styles).toContain('color: #60a5fa')
  })

  it('guides model to avoid mechanically echoing raw URLs in conversational greetings', () => {
    const msg = createBrowserSnapshotMessage('Title: X\nURL: https://x.com/user/status/123')
    expect(msg.content[0].text).toContain('Conversational guidance:')
    expect(msg.content[0].text).toContain('Do not mechanically repeat, paste, or echo the raw page URL')
  })
})
