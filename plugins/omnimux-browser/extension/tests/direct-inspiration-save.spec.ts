// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Direct Inspiration Save & System Dark Mode Suite (#1613)', () => {
  const appPath = resolve(__dirname, '../src/panel/App.tsx')
  const appCode = readFileSync(appPath, 'utf8')

  const stylesPath = resolve(__dirname, '../src/panel/styles.css')
  const styles = readFileSync(stylesPath, 'utf8')

  it('triggers HTTP endpoint directly on save instead of dispatching user prompt to Agent', () => {
    // 确认 handleSaveToInspiration 直接调用 /omnimux/inspiration/local/import-url
    expect(appCode).toContain('/omnimux/inspiration/local/import-url')
    expect(appCode).toContain('saveInspirationStatus')

    // 核心安全契约：严禁在 handleSaveToInspiration 中使用 send 往会话框注入长 URL 指令
    const handleSaveBlock = appCode.slice(
      appCode.indexOf('const handleSaveToInspiration'),
      appCode.indexOf('const updateThemeSetting'),
    )
    expect(handleSaveBlock).not.toContain('void send(')
    expect(handleSaveBlock).not.toContain('send(`请将当前页面')
  })

  it('synchronizes themeSetting to documentElement data-theme attribute', () => {
    expect(appCode).toContain("document.documentElement.setAttribute('data-theme', 'dark')")
    expect(appCode).toContain("document.documentElement.setAttribute('data-theme', 'light')")
    expect(appCode).toContain("document.documentElement.removeAttribute('data-theme')")
  })

  it('provides double-guard media query for dark mode user bubble in system auto mode', () => {
    expect(styles).toContain('@media (prefers-color-scheme: dark)')
    expect(styles).toContain(':root:not([data-theme="light"]) .row.user .body')
    expect(styles).toContain(':root:not([data-theme="light"]) .row .body.md code')
  })

  it('renders success state for save buttons and delivers toast feedback', () => {
    expect(appCode).toContain('hero-action-pill-btn')
    expect(appCode).toContain('omnimux-toast-pill')
    expect(styles).toContain('.hero-action-pill-btn.success')
    expect(styles).toContain('.omnimux-toast-pill')
  })
})
