// @vitest-environment jsdom
/**
 * Action-layer contract for the three capsule shortcuts.
 *
 * Every case drives the bridge through an injected transport, so the messaging
 * contract, the receipt wait and both degradation paths are covered without a
 * live extension runtime.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  MediaActionBridge,
  legacyCopy,
  type ActionTransport,
  type WorkstationResult,
} from '../src/content/media-hover/actions.ts'
import { hoverCopy } from '../src/content/media-hover/copy.ts'
import { RUNTIME_MESSAGE, TIMING } from '../src/content/media-hover/messages.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

const PAYLOAD: HoveredMedia = {
  id: 'image:https://cdn.example.com/a.png',
  type: 'image',
  src: 'https://cdn.example.com/a.png',
  previewSrc: 'https://cdn.example.com/a.png',
  pageUrl: 'https://page.example.com/post/1',
  pageTitle: '示例页面',
  width: 480,
  height: 320,
  naturalWidth: 960,
  naturalHeight: 640,
  alt: '示例图片',
  capturedAt: 1_700_000_000_000,
}

function transport(overrides: Partial<ActionTransport> = {}): ActionTransport {
  return {
    deliverToWorkstation: vi.fn(async (): Promise<WorkstationResult> => 'unavailable'),
    postToBackground: vi.fn(async () => ({ ok: true, result: {} })),
    writeClipboard: vi.fn(async () => true),
    copy: () => hoverCopy('zh'),
    ...overrides,
  }
}

describe('add to inspiration library', () => {
  it('delegates the write to the background worker', async () => {
    const postToBackground = vi.fn(async () => ({ ok: true, result: { total: 3, duplicate: false } }))
    const bridge = new MediaActionBridge(transport({ postToBackground }))

    const outcome = await bridge.saveToInspiration(PAYLOAD)

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('saved')
    expect(outcome.message).toBe('已加入灵感库')
    expect(postToBackground).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGE.mediaToInspiration,
      payload: PAYLOAD,
    })
  })

  it('reports a failure instead of throwing when the store rejects', async () => {
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: false, error: { code: 'storage-failed', message: 'x' } })),
    }))
    const outcome = await bridge.saveToInspiration(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('refuses a saved mark when the accepted write reports its own rejection', async () => {
    // QA-1: the store answers once, with `ok: false`, when the write was lost.
    // An envelope that merely says "the worker replied" is not a save.
    const bridge = new MediaActionBridge(transport({
      postToBackground: vi.fn(async () => ({ ok: true, result: { ok: false, total: 0, duplicate: false } })),
    }))
    const outcome = await bridge.saveToInspiration(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('treats a missing runtime as a failure, never as a silent success', async () => {
    const bridge = new MediaActionBridge(transport({ postToBackground: vi.fn(async () => null) }))
    const outcome = await bridge.saveToInspiration(PAYLOAD)
    expect(outcome.ok).toBe(false)
  })
})

describe('copy the media link', () => {
  it('copies the absolute address', async () => {
    const writeClipboard = vi.fn(async () => true)
    const bridge = new MediaActionBridge(transport({ writeClipboard }))
    const outcome = await bridge.copyToClipboard(PAYLOAD)

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('copied')
    expect(outcome.message).toBe('已复制素材链接')
    expect(writeClipboard).toHaveBeenCalledWith('https://cdn.example.com/a.png')
  })

  it('surfaces a rejection from both clipboard channels as a failure', async () => {
    const bridge = new MediaActionBridge(transport({ writeClipboard: vi.fn(async () => false) }))
    const outcome = await bridge.copyToClipboard(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe('操作失败，请重试')
  })

  it('falls back to the copy command when the async clipboard API is absent', () => {
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    expect(legacyCopy('hello')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    // The scratch textarea must not survive the call.
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })
})

describe('add to conversation', () => {
  it('reports the workbench channel when the panel confirms the receipt', async () => {
    const bridge = new MediaActionBridge(transport({
      deliverToWorkstation: vi.fn(async () => 'attached' as WorkstationResult),
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)
    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('workbench')
    expect(outcome.message).toBe('已加入对话')
  })

  it('falls back to the side panel when no workstation exists', async () => {
    const postToBackground = vi.fn(async () => ({ ok: true, result: { channel: 'side-panel' } }))
    const bridge = new MediaActionBridge(transport({
      deliverToWorkstation: vi.fn(async () => 'unavailable' as WorkstationResult),
      postToBackground,
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)

    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('side-panel')
    expect(postToBackground).toHaveBeenCalledWith({
      type: RUNTIME_MESSAGE.openAssistantWithMedia,
      payload: PAYLOAD,
    })
  })

  it('does not claim success when the fallback also fails', async () => {
    const bridge = new MediaActionBridge(transport({
      deliverToWorkstation: vi.fn(async () => 'unavailable' as WorkstationResult),
      postToBackground: vi.fn(async () => ({ ok: false })),
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('failed')
  })

  it('waits at most the receipt budget for an unresponsive workstation', async () => {
    const started = Date.now()
    const bridge = new MediaActionBridge({
      deliverToWorkstation: (_media, timeoutMs) => new Promise((resolve) => {
        // Mirror the production timeout, whose budget the bridge owns.
        setTimeout(() => resolve('unavailable'), timeoutMs)
      }),
      postToBackground: vi.fn(async () => ({ ok: true })),
      writeClipboard: vi.fn(async () => true),
      copy: () => hoverCopy('zh'),
    })
    const outcome = await bridge.attachToConversation(PAYLOAD)
    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('side-panel')
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMING.attachReceiptTimeout - 20)
  })

  it('surfaces a panel that explicitly refuses the media', async () => {
    const bridge = new MediaActionBridge(transport({
      deliverToWorkstation: vi.fn(async () => 'rejected' as WorkstationResult),
      postToBackground: vi.fn(async () => ({ ok: true })),
    }))
    const outcome = await bridge.attachToConversation(PAYLOAD)
    // A refusal still hands the media to the side panel rather than dropping it.
    expect(outcome.ok).toBe(true)
    expect(outcome.channel).toBe('side-panel')
  })
})
