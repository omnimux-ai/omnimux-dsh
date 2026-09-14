// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PaperclipIcon } from '../src/panel/components/icons.tsx'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('输入框附件图标与发送按钮重塑与防覆盖修复 (#1727, #1740)', () => {
  it('PaperclipIcon 渲染正确的推特原生高清晰度单线矢量曲别针路径', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(PaperclipIcon, { size: 19 }))
    })

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.getAttribute('width')).toBe('19')
    expect(svg?.getAttribute('height')).toBe('19')
    expect(svg?.getAttribute('fill')).toBe('none')
    expect(svg?.getAttribute('stroke')).toBe('currentColor')

    const path = svg?.querySelector('path')
    expect(path).not.toBeNull()
    const d = path?.getAttribute('d')
    expect(d).toContain('m21.44 11.05')

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

  it('styles.css 中高特异性复合选择器锁定发送按钮 50% 纯圆与曲别针独立清晰样式', () => {
    const stylesPath = resolve(__dirname, '../src/panel/styles.css')
    const styles = readFileSync(stylesPath, 'utf8')

    // 检查发送按钮尺寸为 36px/34px 纯圆，并使用 !important 破除 8px 特异性覆盖
    expect(styles).toContain('.composer-actions button.clean-send-btn')
    expect(styles).toContain('border-radius: 50% !important')

    // 检查深色激活态为纯白圆底黑字
    expect(styles).toContain(':root[data-theme="dark"] .composer-actions button.clean-send-btn.active:not(:disabled)')
    expect(styles).toContain('background: #ffffff !important')
    expect(styles).toContain('color: #09090b !important')

    // 检查曲别针 svg 独立尺寸与描边，排除全局 .composer-actions button svg 污染
    expect(styles).toContain('.composer-actions button.clean-add-btn svg')
    expect(styles).toContain('width: 19px !important')
    expect(styles).toContain('stroke-width: 2 !important')
  })
})
