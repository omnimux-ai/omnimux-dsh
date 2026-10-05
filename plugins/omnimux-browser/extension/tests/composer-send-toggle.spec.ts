// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('会话栏单按钮状态互斥与回车排队规范 (#3085)', () => {
  const appPath = resolve(__dirname, '../src/panel/App.tsx')
  const appCode = readFileSync(appPath, 'utf8')

  it('停止/发送按钮按 queueSendReady 互斥渲染，不共存', () => {
    // 排队态（working）且有可发送内容时切回发送按钮，其余情况才是停止按钮；
    // 杜绝同一次渲染里同时出现 stop-button (SquareIcon) 与 clean-send-btn (ArrowUpIcon)。
    expect(appCode).toMatch(/\{working && !queueSendReady \?\s*\(\s*<button[\s\S]*?className="stop-button clean-send-btn"[\s\S]*?<SquareIcon[\s\S]*?\)\s*:\s*\(\s*<button[\s\S]*?className=\{`clean-send-btn[\s\S]*?<ArrowUpIcon/)
    expect(appCode).toContain('const queueSendReady = working && composerHasContent && !sendDisabled')
    expect(appCode).toContain('const composerHasContent = input.trim().length > 0 || draftImages.length > 0')
  })

  it('Enter 键在未组词状态下直接调用 send() 发送入队', () => {
    expect(appCode).toContain("e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing")
    expect(appCode).toContain('void send()')
  })

  it('send() 函数发送 prompt 时声明 mode: "queue" 支持流式回答期间直接排队', () => {
    expect(appCode).toContain("mode: 'queue'")
  })
})
