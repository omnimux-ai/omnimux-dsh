// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MediaSnifferBar, type SniffedMediaItem } from './components/MediaSnifferBar.tsx'
import type { InspirationSaveTask } from '../shared/inspiration-save.ts'
import type { PageSceneInfo } from './components/SceneBadge.tsx'

const scene: PageSceneInfo = { url: 'https://www.youtube.com/watch?v=abcdefghijk', platform: 'generic', title: 'Post', pageType: 'detail' }
const media: SniffedMediaItem = { id: 'direct-video', type: 'video', src: 'https://cdn.example/video.mp4', previewSrc: '', sourceKind: 'direct', videoSrc: 'https://cdn.example/video.mp4' }
let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => { await act(async () => root?.unmount()); container?.remove() })

describe('actual non-X preview save-state rendering', () => {
  it.each([
    ['saving', '保存中', true, ''],
    ['partial', '部分保存', false, '素材未齐'],
    ['failed', '保存失败', false, '保存被拒绝'],
    ['saved', '已保存', false, ''],
  ] as const)('renders %s from the same host receipt used by the save request', async (state, label, disabled, reason) => {
    const task: InspirationSaveTask = { taskId: 'bound-task', host: 'http://127.0.0.1:43120', sourceUrl: 'https://youtu.be/abcdefghijk?si=share', state, detail: reason, updatedAt: 1 }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => { root!.render(createElement(MediaSnifferBar, { scene, items: [media], inspirationTasks: [task] })) })
    await act(async () => { container!.querySelector('.media-item-chip')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const button = container.querySelector<HTMLButtonElement>('.float-preview-save-btn')!
    expect(button.textContent).toContain(label)
    expect(button.disabled).toBe(disabled)
    if (reason) expect(container.querySelector('[role="status"]')?.textContent).toContain(reason)
  })
})
