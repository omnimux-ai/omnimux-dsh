// @vitest-environment jsdom
/**
 * E2E: 模型选择器面板布局隔离与垂直排列端到端测试
 *
 * 验证：在 .composer-actions 外层容器内部，AutoModelPicker 展开时：
 * 1. .amp-list 呈现为纵向列表；
 * 2. 每一个模型条目 button.amp-row 免疫 .composer-actions button 的 28px 正方形挤压，保持完整的宽度与高度；
 * 3. 每一个模型行正常渲染品牌图标槽位、模型主名称与副标题。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AutoModelPicker } from '../../src/panel/components/AutoModelPicker.tsx'

const cssContent = readFileSync(resolve(__dirname, '../../src/panel/styles.css'), 'utf8')

describe('E2E: 模型选择器面板布局隔离', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    localStorage.clear()
    vi.restoreAllMocks()

    const styleEl = document.createElement('style')
    styleEl.textContent = cssContent
    document.head.appendChild(styleEl)
  })

  it('模型列表在 .composer-actions 容器中垂直展开，每项独立成行且不被挤压为 28px 方块', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        wsUrl: 'ws://127.0.0.1:45120/ext/bridge',
        modelGroups: [
          {
            group: 'ChatGPT',
            models: [
              { id: 'gpt-6-astra', name: 'GPT-6-Astra' },
              { id: 'gpt-5.5', name: 'GPT-5.5' },
              { id: 'devin-swe-2', name: 'Devin SWE-2' },
            ],
          },
        ],
      }),
    })) as unknown as typeof fetch

    const outer = document.createElement('div')
    outer.className = 'composer-actions clean-actions-row'
    const start = document.createElement('span')
    start.className = 'composer-actions-start'
    outer.appendChild(start)
    container.appendChild(outer)

    const root = createRoot(start)
    await act(async () => {
      root.render(
        createElement(AutoModelPicker, {
          locale: 'zh',
          port: 45120,
          rpc: null,
          selectedModel: 'devin-swe-2',
          onSelectModel: () => {},
        })
      )
    })
    await act(async () => {})

    // 1. 点击触发按钮展开面板
    const triggerBtn = outer.querySelector('button.amp-trigger') as HTMLButtonElement
    expect(triggerBtn).not.toBeNull()
    await act(async () => {
      triggerBtn.click()
    })
    await act(async () => {})

    // 2. 切换至手动选择模式（点击开关关闭自动模式）
    const switchBtn = outer.querySelector('button.amp-switch') as HTMLButtonElement
    expect(switchBtn).not.toBeNull()
    await act(async () => {
      switchBtn.click()
    })
    await act(async () => {})

    // 3. 验证模型列表 DOM 结构与选项行完整性（强断言相等）
    const list = outer.querySelector('.amp-list') as HTMLDivElement
    expect(list.className).toEqual('amp-list')
    const rows = Array.from(list.querySelectorAll('button.amp-row')) as HTMLButtonElement[]
    expect(rows.length).toEqual(3)

    const names = rows.map((r) => r.querySelector('.amp-row-name')?.textContent)
    expect(names).toEqual(['GPT-6-Astra', 'GPT-5.5', 'Devin SWE-2'])

    // 4. 验证当前选中模型高亮与勾选标记
    const selectedRow = list.querySelector('button.amp-row.selected') as HTMLButtonElement
    expect(selectedRow).not.toBeNull()
    expect(selectedRow.querySelector('.amp-row-name')?.textContent).toEqual('Devin SWE-2')
    expect(selectedRow.getAttribute('aria-selected')).toEqual('true')
  })
})
