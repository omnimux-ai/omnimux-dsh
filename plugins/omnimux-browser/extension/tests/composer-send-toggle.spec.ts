// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('会话栏单按钮状态互斥与回车排队规范 (#3085)', () => {
  const appPath = resolve(__dirname, '../src/panel/App.tsx')
  const appCode = readFileSync(appPath, 'utf8')

  it('working 状态与发送按钮实现条件互斥，不共存', () => {
    // 确保 working 状态下只展示停止按钮，非 working 状态下才展示发送按钮
    // 杜绝 working 状态下同时渲染 clean-send-btn (ArrowUpIcon) 和 stop-button
    expect(appCode).toMatch(/\{working\s*\?\s*\(\s*<button[\s\S]*?className="stop-button clean-send-btn"[\s\S]*?<SquareIcon[\s\S]*?\)\s*:\s*\(\s*<button[\s\S]*?className=\{`clean-send-btn[\s\S]*?<ArrowUpIcon/)
  })

  it('Enter 键在未组词状态下直接调用 send() 发送入队', () => {
    expect(appCode).toContain("e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing")
    expect(appCode).toContain('void send()')
  })

  it('send() 函数发送 prompt 时声明 mode: "queue" 支持流式回答期间直接排队', () => {
    expect(appCode).toContain("mode: 'queue'")
  })
})
