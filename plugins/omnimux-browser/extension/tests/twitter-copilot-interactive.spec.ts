// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaSnifferBar, type SniffedMediaItem } from '../src/panel/components/MediaSnifferBar.tsx'
import { PresetChips } from '../src/panel/components/PresetChips.tsx'
import { DomFillButton } from '../src/panel/components/DomFillButton.tsx'

describe('Twitter Copilot Interactive Suite', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    container = document.querySelector('#root')!
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('MediaSnifferBar component', () => {
    const sampleItems: SniffedMediaItem[] = [
      { id: 'm1', type: 'video', src: 'https://example.com/video.mp4', previewSrc: 'https://example.com/poster.jpg', alt: '推特主视频原片' },
      { id: 'm2', type: 'image', src: 'https://example.com/img.jpg', previewSrc: 'https://example.com/img.jpg', alt: '推特封面图' }
    ]

    it('renders inactive dashed chips by default without floating preview', async () => {
      await act(async () => {
        root.render(createElement(MediaSnifferBar, { items: sampleItems }))
      })
      const chips = container.querySelectorAll('.media-item-chip')
      expect(chips.length).toBe(2)
      expect(chips[0].classList.contains('active')).toBe(false)
      expect(chips[1].classList.contains('active')).toBe(false)
      expect(container.querySelector('.media-float-preview-card')).toBeNull()
    })

    it('toggles item to active and shows floating preview on click, then deactivates on second click', async () => {
      const onActiveChange = vi.fn()
      await act(async () => {
        root.render(createElement(MediaSnifferBar, { items: sampleItems, onActiveChange }))
      })

      // First click: activate m1
      await act(async () => {
        container.querySelectorAll('.media-item-chip')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(container.querySelectorAll('.media-item-chip')[0].classList.contains('active')).toBe(true)
      expect(onActiveChange).toHaveBeenCalledWith([sampleItems[0]])
      expect(container.querySelector('.media-float-preview-card')).not.toBeNull()

      // Second click: deactivate m1
      await act(async () => {
        container.querySelectorAll('.media-item-chip')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(container.querySelectorAll('.media-item-chip')[0].classList.contains('active')).toBe(false)
      expect(onActiveChange).toHaveBeenCalledWith([])
      expect(container.querySelector('.media-float-preview-card')).toBeNull()
    })

    it('shows floating preview when hovering over an already active chip and closes on mouse leave', async () => {
      vi.useFakeTimers()
      await act(async () => {
        root.render(createElement(MediaSnifferBar, { items: sampleItems }))
      })

      // Activate m2
      await act(async () => {
        container.querySelectorAll('.media-item-chip')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(container.querySelector('.media-float-preview-card')).not.toBeNull()

      // Close preview manually via close button
      const closeBtn = container.querySelector<HTMLButtonElement>('.float-preview-close')!
      await act(async () => {
        closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(container.querySelector('.media-float-preview-card')).toBeNull()

      // Hover over m2 -> preview reappears
      await act(async () => {
        container.querySelectorAll('.media-item-chip')[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      })
      expect(container.querySelector('.media-float-preview-card')).not.toBeNull()

      // Mouse leave shelf -> closes after debounce (React synthesizes onMouseLeave from mouseout with relatedTarget outside)
      const shelf = container.querySelector('.media-sniffer-shelf')!
      await act(async () => {
        shelf.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
      })
      await act(async () => {
        vi.advanceTimersByTime(350)
      })
      expect(container.querySelector('.media-float-preview-card')).toBeNull()
    })
  })

  describe('PresetChips component', () => {
    it('renders clean concise labels for twitter status without emojis', async () => {
      const onSelectPrompt = vi.fn()
      const scene = {
        url: 'https://x.com/user/status/123',
        title: 'Tweet title',
        platform: 'twitter' as const,
        pageType: 'status' as const,
        selectedText: ''
      }
      await act(async () => {
        root.render(createElement(PresetChips, { scene, onSelectPrompt }))
      })
      const buttons = container.querySelectorAll('.preset-chip-btn')
      expect(buttons.length).toBe(4)

      const text = container.textContent || ''
      expect(text).toContain('高赞神评')
      expect(text).toContain('干货洞察')
      expect(text).toContain('洗帖二创')
      expect(text).toContain('引用转推')

      // Emojis must be zero
      expect(/[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(text)).toBe(false)
    })
  })

  describe('DomFillButton component', () => {
    it('renders clean label without emoji and triggers fill', async () => {
      await act(async () => {
        root.render(createElement(DomFillButton, { textToFill: '测试回复文案', locale: 'zh' }))
      })
      const btn = container.querySelector('.dom-fill-btn')
      expect(btn).not.toBeNull()
      expect(btn?.getAttribute('data-label')).toBe('填入输入框')
    })
  })

  describe('Pure Black & White design tokens & layout in styles.css', () => {
    const styles = readFileSync(`${process.cwd()}/src/panel/styles.css`, 'utf8')

    it('eradicates tinted blue/slate values (#0c0f17 and #151a26) in dark theme', () => {
      expect(styles.includes('#0c0f17')).toBe(false)
      expect(styles.includes('#151a26')).toBe(false)
      expect(styles.includes('rgba(12, 15, 23')).toBe(false)
    })

    it('removes topbar bottom border for seamless layout', () => {
      expect(styles).toMatch(/\.topbar\s*\{[^}]*border-bottom:\s*none;/)
    })

    it('defines sticky-top-page-bar and media-float-preview-card positioned above previewed chip with width 206px', () => {
      expect(styles.includes('.sticky-top-page-bar')).toBe(true)
      expect(styles.includes('.media-float-preview-card')).toBe(true)
      expect(styles).toMatch(/\.media-float-preview-card\s*\{[^}]*width:\s*206px;/)
      expect(styles).toMatch(/\.media-float-preview-card\s*\{[^}]*position:\s*absolute;/)
    })

    it('ensures hero-action-pill-btn and float-preview-save-btn strictly follow pure black and white theme without #0f172a', () => {
      expect(styles).toMatch(/\.hero-action-pill-btn\s*\{[^}]*background:\s*var\(--ink-strong\)\s*!important;/)
      expect(styles.includes('background: #0f172a')).toBe(false)
      expect(styles).toMatch(/\.float-preview-save-btn\s*\{[^}]*background:\s*var\(--ink-strong\);/)
    })

    it('removes focus borders, outlines, and box-shadows from composer textarea', () => {
      expect(styles).toMatch(/\.composer textarea:focus-visible[^}]*border:\s*0\s*!important;/)
      expect(styles).toMatch(/\.composer textarea:focus-visible[^}]*outline:\s*none\s*!important;/)
      expect(styles).toMatch(/\.composer textarea:focus-visible[^}]*box-shadow:\s*none\s*!important;/)
    })

    it('implements stacked cards layout, hero cover box, and platform row matching YouMind style', () => {
      expect(styles.includes('.hero-card-stack-wrapper')).toBe(true)
      expect(styles.includes('.hero-card-stack-underlay')).toBe(true)
      expect(styles.includes('.hero-card-cover-box')).toBe(true)
      expect(styles.includes('.hero-platform-row')).toBe(true)
      expect(styles.includes('.hero-card-title')).toBe(true)
      expect(styles.includes('.hero-square-badge')).toBe(true)
    })
  })
})
