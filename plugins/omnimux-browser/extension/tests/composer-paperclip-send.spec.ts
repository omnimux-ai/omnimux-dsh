// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PaperclipIcon } from '../src/panel/components/icons.tsx'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('输入框附件图标与发送按钮重塑 (#1727)', () => {
  it('PaperclipIcon 渲染正确的推特原生曲别针矢量路径', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(PaperclipIcon, { size: 18 }))
    })

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.getAttribute('width')).toBe('18')
    expect(svg?.getAttribute('height')).toBe('18')

    const path = svg?.querySelector('path')
    expect(path).not.toBeNull()
    const d = path?.getAttribute('d')
    expect(d).toContain('M14 4c-1.66')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('App.tsx 中输入框已应用曲别针图标与对齐文案', () => {
    const appPath = resolve(__dirname, '../src/panel/App.tsx')
    const appCode = readFileSync(appPath, 'utf8')

    // 确认已导入 PaperclipIcon
    expect(appCode).toContain('PaperclipIcon')

    // 确认使用 PaperclipIcon 替换了原有的 PlusSvgIcon
    expect(appCode).toContain('<PaperclipIcon size={18} />')

    // 确认中文占位提示文案为“随便问点什么”
    expect(appCode).toContain("placeholder={locale === 'en' ? 'Ask anything...' : '随便问点什么'}")
  })

  it('styles.css 中发送按钮升级为 34px 纯圆白底黑箭头规范', () => {
    const stylesPath = resolve(__dirname, '../src/panel/styles.css')
    const styles = readFileSync(stylesPath, 'utf8')

    // 检查发送按钮尺寸为 34px 圆形
    expect(styles).toContain('width: 34px')
    expect(styles).toContain('height: 34px')
    expect(styles).toContain('border-radius: 50%')

    // 检查深色激活态为纯白圆底黑字
    expect(styles).toContain(':root[data-theme="dark"] .clean-send-btn.active:not(:disabled)')
    expect(styles).toContain('background: #ffffff')
    expect(styles).toContain('color: #09090b')
  })
})
