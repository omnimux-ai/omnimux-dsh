// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMediaGrants, isOwnFloatingPanel } from '../src/background/media-grants.ts'
const panelUrl = 'chrome-extension://ours/panel/index.html'
const content = { id: 'ours', tab: { id: 7 }, frameId: 0, url: 'https://example.com/' }
const panel = { id: 'ours', tab: { id: 7 }, frameId: 4, url: `${panelUrl}?mode=float` }
const media = { id: 'chosen', type: 'image', src: 'https://example.com/chosen.png' }
afterEach(() => vi.useRealTimers())
describe('floating panel isolated-runtime media authority', () => {
  it('delivers the user-selected payload once to the same tab panel', () => {
    const grants = createMediaGrants('ours', panelUrl)
    const id = grants.issue(content, media)
    expect(typeof id).toBe('string')
    expect(grants.take(panel, id)).toEqual(media)
    expect(grants.take(panel, id)).toBeNull()
  })
  it('rejects unrelated extension, page, subframe and other-tab senders', () => {
    const grants = createMediaGrants('ours', panelUrl)
    expect(grants.issue({ ...content, id: 'other' }, media)).toBeNull()
    expect(grants.issue({ ...content, frameId: 5 }, media)).toBeNull()
    expect(grants.issue(panel, media)).toBeNull()
    const id = grants.issue(content, media)
    for (const sender of [content, { ...panel, id: 'other' }, { ...panel, tab: { id: 8 } }, { ...panel, url: 'https://example.com/panel/index.html' }]) {
      expect(grants.take(sender, id)).toBeNull()
      expect(isOwnFloatingPanel(sender, 'ours', panelUrl)).toBe(sender === content ? false : sender.tab.id === 8)
    }
    expect(grants.take(panel, id)).toEqual(media)
  })
  it('refuses fabricated and expired grants, with no caller-selected payload fallback', () => {
    vi.useFakeTimers()
    const grants = createMediaGrants('ours', panelUrl)
    expect(grants.take(panel, 'forged')).toBeNull()
    const id = grants.issue(content, media)
    vi.advanceTimersByTime(15_001)
    expect(grants.take(panel, id)).toBeNull()
  })
})
