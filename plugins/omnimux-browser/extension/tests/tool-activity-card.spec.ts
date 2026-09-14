// @vitest-environment jsdom
import React, { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { PANEL_COPY } from '../src/panel/strings.ts'
import { ToolActivity } from '../src/panel/App.tsx'

describe('页面操作卡片 ToolActivity 视觉与结构规范', () => {
  const copyZh = PANEL_COPY.zh
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('完成态下渲染精致的已完成微标（.tool-done-badge 与微圆点）', async () => {
    const row = {
      seq: 1,
      kind: 'tool' as const,
      text: 'skill → read → 点击元素 #3',
      status: 'complete' as const,
    }

    await act(async () => {
      root.render(createElement(ToolActivity, { row, copy: copyZh }))
    })

    const card = container.querySelector('.tool-activity')
    expect(card).not.toBeNull()
    expect(card?.classList.contains('complete')).toBe(true)

    // 状态徽标
    const badge = container.querySelector('.tool-done-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('完成')
    expect(container.querySelector('.badge-dot')).not.toBeNull()
  })

  it('多步骤文本拆分为优雅微步骤流（.tool-step-tag 与 .tool-step-arrow）', async () => {
    const row = {
      seq: 2,
      kind: 'tool' as const,
      text: 'skill -> read -> 点击元素 #3',
      status: 'complete' as const,
    }

    await act(async () => {
      root.render(createElement(ToolActivity, { row, copy: copyZh }))
    })

    const tags = container.querySelectorAll('.tool-step-tag')
    expect(tags.length).toBeGreaterThanOrEqual(1)
    const arrows = container.querySelectorAll('.tool-step-arrow')
    expect(arrows.length).toBeGreaterThanOrEqual(1)
    expect(container.textContent).toContain('点击元素 #3')
  })

  it('运行态下渲染 spinner 与 running 类，不渲染完成态徽标', async () => {
    const row = {
      seq: 3,
      kind: 'tool' as const,
      text: '正在读取页面',
      status: 'running' as const,
    }

    await act(async () => {
      root.render(createElement(ToolActivity, { row, copy: copyZh }))
    })

    const card = container.querySelector('.tool-activity')
    expect(card?.classList.contains('running')).toBe(true)
    expect(container.querySelector('.spinner')).not.toBeNull()
    expect(container.querySelector('.tool-done-badge')).toBeNull()
  })

  it.each(['zh', 'en'] as const)('已知工具按 %s 文案映射，未知名称保持原样', async (locale) => {
    const copy = PANEL_COPY[locale]
    const expected = locale === 'zh' ? ['加载技能', '读取文件'] : ['Load skill', 'Read file']
    await act(async () => {
      root.render(createElement(ToolActivity, {
        row: { seq: 4, kind: 'tool', text: 'skill -> read -> unknown_tool', status: 'complete' }, copy,
      }))
    })
    expect(Array.from(container.querySelectorAll('.tool-step-tag'), (tag) => tag.textContent)).toEqual(expected)
    expect(container.querySelector('.tool-step-text')?.textContent).toBe('unknown_tool')
    await act(async () => {
      root.render(createElement(ToolActivity, {
        row: { seq: 41, kind: 'tool', text: 'custom_hook -> skill', status: 'complete' }, copy,
      }))
    })
    expect(container.querySelector('.tool-step-tag')?.textContent).toBe('custom_hook')
    expect(container.querySelector('.tool-step-text')?.textContent).toBe(expected[0])
    await act(async () => {
      root.render(createElement(ToolActivity, {
        row: { seq: 5, kind: 'tool', text: 'read', status: 'running' }, copy,
      }))
    })
    expect(container.querySelector('.tool-summary')?.textContent).toBe(expected[1])
  })

  const css = readFileSync(resolve(__dirname, '../src/panel/styles.css'), 'utf8')
  const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split('}')[0]

  it('标题与完成文字复用可读文字 token，绿点不继承文字颜色', () => {
    expect(rule('.tool-label')).toMatch(/color: var\(--(?:ink|muted)\)/)
    expect(rule('.tool-done-badge')).toMatch(/color: var\(--(?:ink|muted)\)/)
    expect(rule('.tool-done-badge .badge-dot')).toContain('background: var(--success)')
  })

  it('窄屏保留状态，不用隐藏状态换取宽度', () => {
    expect(css).not.toMatch(/\.tool-state\s*\{[^}]*display:\s*none/)
    expect(rule('.tool-state')).toContain('flex: 0 0 auto')
  })

  it('摘要单行承载：不换行、溢出淡出，卡片高度与步骤数无关', () => {
    const summary = rule('.tool-summary')
    expect(summary).toContain('flex-wrap: nowrap')
    expect(summary).toContain('white-space: nowrap')
    expect(summary).toContain('overflow: hidden')
    expect(summary).toMatch(/mask-image/)
    for (const selector of ['.tool-step-tag', '.tool-step-text']) {
      expect(rule(selector)).toContain('min-width: 0')
      expect(rule(selector)).toContain('max-width: 100%')
      // 步骤标签不做字符级裁切（可读性契约）
      expect(rule(selector)).not.toMatch(/text-overflow:\s*ellipsis/)
    }
  })

  it('状态槽位定宽：进行中与完成两态占据同一宽度', () => {
    const state = rule('.tool-state')
    expect(state).toContain('width: 44.5px')
    expect(state).toContain('justify-content: center')
    expect(state).toContain('align-items: center')
  })

  it('卡片不做布局类过渡，只过渡颜色', () => {
    const card = rule('.tool-activity')
    expect(card).toContain('transition: border-color 0.2s ease, background-color 0.2s ease')
    expect(card).not.toMatch(/transition:\s*all/)
    expect(card).not.toMatch(/transition:[^;]*\b(width|height|padding|margin|flex)\b/)
  })

  it('步骤链超过可见容量时折叠为计数标签，最近步骤保持具名', async () => {
    const text = Array.from({ length: 7 }, (_, i) => `step_${i + 1}`).join(' → ')
    await act(async () => {
      root.render(createElement(ToolActivity, {
        row: { seq: 200, kind: 'tool', text, status: 'running' },
        copy: copyZh,
      }))
    })
    expect(container.querySelector('.tool-step-more')?.textContent).toBe('+4')
    expect(container.querySelectorAll('.tool-step-more').length).toBe(1)
    expect(Array.from(container.querySelectorAll('.tool-step-tag, .tool-step-text'), (n) => n.textContent))
      .toEqual(['step_5', 'step_6', 'step_7'])
  })

  it('折叠不损失可访问性：完整步骤链保留在状态语义中', async () => {
    const text = Array.from({ length: 7 }, (_, i) => `step_${i + 1}`).join(' → ')
    await act(async () => {
      root.render(createElement(ToolActivity, {
        row: { seq: 210, kind: 'tool', text, status: 'running' },
        copy: copyZh,
      }))
    })
    const card = container.querySelector('.tool-activity')
    expect(card?.getAttribute('role')).toBe('status')
    const label = card?.getAttribute('aria-label') ?? ''
    for (let i = 1; i <= 7; i += 1) expect(label).toContain(`step_${i}`)
  })

  it('单个超长步骤名在可视窗口内截断，完整文本仍在无障碍名称中', async () => {
    const long = 'x'.repeat(120)
    await act(async () => {
      root.render(createElement(ToolActivity, {
        row: { seq: 220, kind: 'tool', text: `read → ${long}`, status: 'complete' },
        copy: copyZh,
      }))
    })
    const text = container.querySelector('.tool-step-text')?.textContent ?? ''
    expect(text.length).toBeLessThanOrEqual(81)
    expect(text.endsWith('…')).toBe(true)
    expect(container.querySelector('.tool-activity')?.getAttribute('aria-label')).toContain(long)
  })

  it('浏览器几何证据：修复前基线已留存，且证明修复前确实抖动', () => {
    const reportDir = resolve(__dirname, '../../../../.agent-reports/tool-card-jitter')
    const baselinePath = resolve(reportDir, 'jitter-baseline.json')
    expect(existsSync(baselinePath)).toBe(true)
    const measured = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      paneWidth: number
      frames: { label: string; cardH: number }[]
    }[]
    const seq = measured.find((item) => item.paneWidth === 360)
    expect(seq).toBeDefined()
    const heights = seq?.frames.filter((f) => /^T\d|^T-/.test(f.label)).map((f) => f.cardH) ?? []
    // 修复前基线：高度随进展变化（这正是被修复的缺陷）
    expect(new Set(heights).size).toBeGreaterThan(1)
  })

  it('styles.css 中杜绝工具卡片写死浅蓝边框与刺眼亮紫竖线，全面消费主题变量', () => {
    const cssPath = resolve(__dirname, '../src/panel/styles.css')
    const css = readFileSync(cssPath, 'utf8')

    // 检查 .row.tool:before 不含有 #d5ddfb 并消费 var(--line)
    const toolLineMatch = css.match(/\.row\.tool:?:?before\s*\{[^}]*\}/)
    expect(toolLineMatch).not.toBeNull()
    expect(toolLineMatch?.[0]).not.toContain('#d5ddfb')
    expect(toolLineMatch?.[0]).toContain('var(--line)')

    // 检查 .tool-activity 不含有写死浅蓝与亮白半透
    const activityMatch = css.match(/\.tool-activity\s*\{[^}]*\}/)
    expect(activityMatch).not.toBeNull()
    expect(activityMatch?.[0]).not.toContain('#dfe5f5')
    expect(activityMatch?.[0]).not.toContain('rgba(255, 255, 255, 0.7)')

    // 验证暗色模式与极简变量接入
    expect(css).toContain('.tool-done-badge')
  })
})
