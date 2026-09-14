// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FormDraftCard } from '../src/panel/components/FormDraftCard.tsx'
import type { DraftDocument } from '../src/shared/draft.ts'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setNativeValue(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set
  const prototype = Object.getPrototypeOf(element)
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter?.call(element, value)
  } else {
    valueSetter?.call(element, value)
  }
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('FormDraftCard', () => {
  const singleDraft: DraftDocument = {
    version: 1,
    title: '推文二创草稿',
    variants: [
      {
        id: 'v1',
        label: '标准版',
        fields: [{ id: 'body', label: '正文', value: '第一行推文\n第二行内容' }],
      },
    ],
  }

  const multiDraft: DraftDocument = {
    version: 1,
    title: '多版本草稿',
    variants: [
      {
        id: 'v1',
        label: '幽默风',
        fields: [{ id: 'body', label: '正文', value: '幽默版内容' }],
      },
      {
        id: 'v2',
        label: '专业风',
        fields: [{ id: 'body', label: '正文', value: '专业版内容' }],
      },
    ],
  }

  it('renders single draft without tabs and allows editing and filling current edited value', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const onFill = vi.fn().mockResolvedValue({ ok: true, message: '已填写' })

    await act(async () => {
      root.render(React.createElement(FormDraftCard, { draft: singleDraft, onFill }))
    })

    // No tabs should be rendered for single variant
    expect(container.querySelectorAll('.draft-tab').length).toBe(0)

    // Title
    expect(container.querySelector('.draft-title')?.textContent).toContain('推文二创草稿')

    // Textarea is editable
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).not.toBeNull()
    expect(textarea.value).toBe('第一行推文\n第二行内容')

    // Edit textarea
    await act(async () => {
      setNativeValue(textarea, '修改后的推文')
    })
    expect(textarea.value).toBe('修改后的推文')

    // Fill button has exact label "一键填写"
    const fillBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('一键填写'),
    )
    expect(fillBtn).toBeDefined()

    await act(async () => {
      fillBtn!.click()
    })

    expect(onFill).toHaveBeenCalledTimes(1)
    expect(onFill).toHaveBeenCalledWith([
      { id: 'body', label: '正文', value: '修改后的推文' },
    ])

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders tabs for multi-variant draft and keeps independent edits across tabs', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const onFill = vi.fn().mockResolvedValue({ ok: true, message: '已填写' })

    await act(async () => {
      root.render(React.createElement(FormDraftCard, { draft: multiDraft, onFill }))
    })

    const tabs = Array.from(container.querySelectorAll('.draft-tab')) as HTMLElement[]
    expect(tabs.length).toBe(2)
    expect(tabs[0]?.textContent).toContain('幽默风')
    expect(tabs[1]?.textContent).toContain('专业风')

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('幽默版内容')

    // Edit tab 1
    await act(async () => {
      setNativeValue(textarea, '编辑后的幽默版')
    })

    // Switch to tab 2
    await act(async () => {
      tabs[1]?.click()
    })

    expect(textarea.value).toBe('专业版内容')

    // Edit tab 2
    await act(async () => {
      setNativeValue(textarea, '编辑后的专业版')
    })

    // Switch back to tab 1, should keep edited value
    await act(async () => {
      tabs[0]?.click()
    })
    expect(textarea.value).toBe('编辑后的幽默版')

    // Fill from tab 1
    const fillBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('一键填写'),
    )
    await act(async () => {
      fillBtn!.click()
    })

    expect(onFill).toHaveBeenCalledWith([
      { id: 'body', label: '正文', value: '编辑后的幽默版' },
    ])

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
