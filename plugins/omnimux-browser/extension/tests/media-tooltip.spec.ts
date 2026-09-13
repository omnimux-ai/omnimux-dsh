// @vitest-environment jsdom
/**
 * Overlay structure and tooltip geometry.
 *
 * The first block is the architectural invariant this feature exists for: the
 * white tooltip must be a SIBLING of the capsule under the shadow root, because
 * a media card with `overflow: hidden` would clip anything nested inside it.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { MediaCapsule } from '../src/content/media-hover/capsule.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { CAPSULE_SPEC, TOOLTIP_SPEC } from '../src/content/media-hover/messages.ts'
import { MediaTooltip, placeTooltip } from '../src/content/media-hover/tooltip.ts'
import type { AnchorRect, HoveredMedia, ViewportBox } from '../src/content/media-hover/types.ts'

const VIEWPORT: ViewportBox = { width: 1000, height: 800, margin: TOOLTIP_SPEC.viewportMargin }

function anchor(left: number, top: number, size = 30): AnchorRect {
  return { left, top, right: left + size, bottom: top + size, width: size, height: size }
}

/** Minimal payload for the capsule's per-media reset. */
function payload(id: string): HoveredMedia {
  return {
    id,
    type: 'image',
    src: `https://cdn.example.com/${id}.png`,
    previewSrc: `https://cdn.example.com/${id}.png`,
    pageUrl: 'https://page.example.com/post/1',
    pageTitle: '示例页面',
    width: 480,
    height: 320,
    naturalWidth: 960,
    naturalHeight: 640,
    alt: '示例图片',
    capturedAt: 1_700_000_000_000,
  }
}

describe('tooltip placement', () => {
  const metrics = { width: 120, height: TOOLTIP_SPEC.fontSize + 12 }

  it('centres the tooltip above the icon it describes', () => {
    const placement = placeTooltip(anchor(400, 400), VIEWPORT, metrics)
    expect(placement.side).toBe('above')
    expect(placement.flipped).toBe(false)
    expect(placement.left).toBe(400 + 15 - 60)
    expect(placement.top).toBe(400 - TOOLTIP_SPEC.offsetY - metrics.height)
  })

  it('flips below the icon when the viewport top has no room', () => {
    const placement = placeTooltip(anchor(400, 4), VIEWPORT, metrics)
    expect(placement.side).toBe('below')
    expect(placement.flipped).toBe(true)
    expect(placement.top).toBe(4 + 30 + TOOLTIP_SPEC.offsetY + TOOLTIP_SPEC.arrow.size)
  })

  it('clamps against the left edge instead of overflowing', () => {
    const placement = placeTooltip(anchor(0, 400), VIEWPORT, metrics)
    expect(placement.left).toBe(VIEWPORT.margin)
  })

  it('clamps against the right edge instead of overflowing', () => {
    const placement = placeTooltip(anchor(VIEWPORT.width - 30, 400), VIEWPORT, metrics)
    expect(placement.left).toBe(VIEWPORT.width - metrics.width - VIEWPORT.margin)
  })

  it('keeps the tooltip inside the viewport on all four sides', () => {
    const corners = [
      anchor(0, 0),
      anchor(VIEWPORT.width - 30, 0),
      anchor(0, VIEWPORT.height - 30),
      anchor(VIEWPORT.width - 30, VIEWPORT.height - 30),
    ]
    for (const corner of corners) {
      const placement = placeTooltip(corner, VIEWPORT, metrics)
      expect(placement.left).toBeGreaterThanOrEqual(VIEWPORT.margin)
      expect(placement.left + metrics.width).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT.margin)
      expect(placement.top).toBeGreaterThanOrEqual(VIEWPORT.margin)
      expect(placement.top + metrics.height).toBeLessThanOrEqual(VIEWPORT.height - VIEWPORT.margin)
    }
  })
})

describe('overlay structure', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('mounts the tooltip as a sibling of the capsule, never as its child', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })

    const capsule = MediaCapsule.create(hoverCopy('zh'))
    const tooltip = MediaTooltip.create(() => 120)

    shadow.appendChild(capsule.element)
    shadow.appendChild(tooltip.element)

    expect(tooltip.element.classList.contains('white-tooltip')).toBe(true)
    expect(capsule.element.classList.contains('omnimux-capsule-bar')).toBe(true)
    expect(tooltip.element.parentNode).toBe(capsule.element.parentNode)
    expect(capsule.element.contains(tooltip.element)).toBe(false)
    expect(tooltip.element.parentNode).toBe(shadow)
  })

  it('renders the two-stage capsule: brand trigger, then the three action icons', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    const layers = [...capsule.element.children].map((child) => child.className)
    expect(layers).toEqual(['omnimux-capsule-brand', 'omnimux-capsule-actions'])

    const actions = [...capsule.element.querySelectorAll('[data-action]')]
      .map((node) => node.getAttribute('data-action'))
    expect(actions).toEqual(['inspiration', 'copy', 'attach'])
    expect(capsule.element.querySelectorAll('.omnimux-capsule-icon')).toHaveLength(3)

    // The decorative divider and "+" affordance stayed out; the brand mark is the
    // stage-one trigger, not a fourth action slot.
    expect(capsule.element.querySelector('.omnimux-capsule-split')).toBeNull()
    expect(capsule.element.querySelector('.omnimux-capsule-plus')).toBeNull()
    expect(capsule.brandElement().querySelector('svg')).not.toBeNull()
    expect(capsule.brandElement().getAttribute('aria-label')).toBe('OmniMux')
  })

  it('opens at stage one and swaps stages through the class contract', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    const actions = capsule.element.querySelector('.omnimux-capsule-actions')
    const buttons = [...capsule.element.querySelectorAll('.omnimux-capsule-actions [data-action]')]

    expect(capsule.stage).toBe('collapsed')
    expect(capsule.element.classList.contains('is-collapsed')).toBe(true)
    expect(capsule.element.classList.contains('is-expanded')).toBe(false)
    expect(capsule.element.getAttribute('aria-expanded')).toBe('false')

    // Stage two is out of reach while it is off screen: not a tab stop and not
    // an accessibility node, so a folded capsule cannot offer a shortcut.
    expect(buttons).toHaveLength(3)
    expect(actions?.getAttribute('aria-hidden')).toBe('true')
    expect(buttons.map((button) => button.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1'])

    capsule.expand()
    expect(capsule.stage).toBe('expanded')
    expect(capsule.element.classList.contains('is-expanded')).toBe(true)
    expect(capsule.element.classList.contains('is-collapsed')).toBe(false)
    expect(capsule.element.getAttribute('aria-expanded')).toBe('true')

    expect(actions?.getAttribute('aria-hidden')).toBe('false')
    expect(buttons.some((button) => button.hasAttribute('tabindex'))).toBe(false)

    capsule.collapse()
    expect(capsule.stage).toBe('collapsed')
    expect(capsule.element.classList.contains('is-collapsed')).toBe(true)
    expect(capsule.element.classList.contains('is-expanded')).toBe(false)
    expect(capsule.element.getAttribute('aria-expanded')).toBe('false')

    // The fold-back restores the stage-one reachability contract exactly.
    expect(actions?.getAttribute('aria-hidden')).toBe('true')
    expect(buttons.map((button) => button.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1'])
  })

  it('hands focus back to stage one instead of stranding it in the retired row', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    document.body.appendChild(capsule.element)
    capsule.show('left')
    capsule.expand()

    const copy = capsule.buttonElement('copy')
    copy?.focus()
    expect(document.activeElement).toBe(copy)

    capsule.collapse()
    expect(document.activeElement).toBe(capsule.brandElement())
    capsule.destroy()
  })

  it('folds back to stage one whenever the capsule is hidden, shown or re-targeted', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))

    capsule.expand()
    capsule.hide()
    expect(capsule.stage).toBe('collapsed')

    capsule.expand()
    capsule.show('left')
    expect(capsule.stage).toBe('collapsed')

    capsule.expand()
    capsule.render(payload('next'))
    expect(capsule.stage).toBe('collapsed')
  })

  it('uses inline vector icons only: no emoji or glyph characters', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    for (const svg of capsule.element.querySelectorAll('svg')) {
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.querySelectorAll('path, rect').length).toBeGreaterThan(0)
    }
    // No pictographic characters anywhere in the capsule markup.
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(capsule.element.innerHTML)).toBe(false)
  })

  it('swaps the lightbulb for a filled star once the media is saved', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    const inspiration = capsule.buttonElement('inspiration')
    expect(inspiration?.classList.contains('is-saved')).toBe(false)
    capsule.setState({ saved: true })
    expect(inspiration?.classList.contains('is-saved')).toBe(true)
    expect(inspiration?.getAttribute('aria-pressed')).toBe('true')
  })

  it('marks the copied icon done and restores it on the next patch', () => {
    const capsule = MediaCapsule.create(hoverCopy('zh'))
    const copy = capsule.buttonElement('copy')
    capsule.setState({ copied: true })
    expect(copy?.classList.contains('is-done')).toBe(true)
    capsule.setState({ copied: false })
    expect(copy?.classList.contains('is-done')).toBe(false)
  })

  it('hides the tooltip without unmounting it', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const tooltip = MediaTooltip.create(() => 120)
    shadow.appendChild(tooltip.element)

    tooltip.show('已加入灵感库', anchor(400, 400), VIEWPORT)
    expect(tooltip.visible).toBe(true)
    expect(tooltip.element.querySelector('.white-tooltip-text')?.textContent).toBe('已加入灵感库')

    tooltip.hide()
    expect(tooltip.visible).toBe(false)
    expect(tooltip.element.isConnected).toBe(true)
  })

  it('points the tail at the icon centre on the side that has room', () => {
    const tooltip = MediaTooltip.create(() => 120)
    tooltip.show('复制素材链接', anchor(400, 400), VIEWPORT)
    expect(tooltip.element.getAttribute('data-side')).toBe('above')
    expect(tooltip.element.style.left).not.toBe('')

    tooltip.show('复制素材链接', anchor(400, 2), VIEWPORT)
    expect(tooltip.element.getAttribute('data-side')).toBe('below')
  })

  it('clamps a very long label instead of overflowing the viewport', () => {
    const tooltip = MediaTooltip.create(() => 120)
    tooltip.show('x'.repeat(400), anchor(2, 400), VIEWPORT)
    const left = Number.parseFloat(tooltip.element.style.left)
    expect(left).toBeGreaterThanOrEqual(VIEWPORT.margin)
    expect(left + 120).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT.margin)
  })

  it('exposes the two-stage capsule geometry from the single spec source', () => {
    expect(CAPSULE_SPEC.borderRadius).toBe(18)
    expect(CAPSULE_SPEC.height).toBe(36)
    expect(CAPSULE_SPEC.inset).toBe(10)
    // Stage one: a 36px circle. Stage two: 3 × 30px icons + 2 × 4px gaps +
    // 2 × 6px padding + 2 × 1px border.
    expect(CAPSULE_SPEC.collapsedWidth).toBe(36)
    expect(CAPSULE_SPEC.width).toBe(112)
    expect(CAPSULE_SPEC.collapsedWidth).toBe(CAPSULE_SPEC.height)
    expect(CAPSULE_SPEC.width).toBe(
      2 * CAPSULE_SPEC.paddingX + 3 * CAPSULE_SPEC.iconSize + 2 * CAPSULE_SPEC.iconGap + 2,
    )
    expect(TOOLTIP_SPEC.background).toBe('#FFFFFF')
    expect(TOOLTIP_SPEC.offsetY).toBe(8)
  })
})
