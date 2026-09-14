// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Session Header & Search Box UI Polish Suite (#1642)', () => {
  const appPath = resolve(__dirname, '../src/panel/App.tsx')
  const appCode = readFileSync(appPath, 'utf8')

  const stylesPath = resolve(__dirname, '../src/panel/styles.css')
  const styles = readFileSync(stylesPath, 'utf8')

  it('updates default session menu title from "新建项目" to "新会话" / "New Chat"', () => {
    expect(appCode).toContain("const sessionMenuTitle = sessionTitle ?? (locale === 'en' ? 'New Chat' : '新会话')")
    expect(appCode).not.toContain("const sessionMenuTitle = sessionTitle ?? (locale === 'en' ? 'New Project' : '新建项目')")
  })

  it('replaces BinocularsIcon with MessageSquareIcon on session-menu-trigger', () => {
    // 确认顶栏触发器使用的是气泡对话图标
    expect(appCode).toContain('<MessageSquareIcon size={15} className="session-trigger-chat-icon" />')
    expect(appCode).not.toContain('<BinocularsIcon size={17} className="session-trigger-binoculars" />')
  })

  it('completely removes internal border and outline on .session-search-input', () => {
    // 确认内层 input 声明了无边框、无轮廓线
    expect(styles).toContain('.session-search-input')
    expect(styles).toContain('border: none !important')
    expect(styles).toContain('outline: none !important')
    expect(styles).toContain('box-shadow: none !important')
  })
})
