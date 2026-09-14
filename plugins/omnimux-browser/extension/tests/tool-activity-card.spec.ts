// @vitest-environment jsdom
import React, { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
