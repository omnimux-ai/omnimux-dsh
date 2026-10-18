// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.youtube.com/watch?v=abcdefghijk"}
import { beforeEach, describe, expect, it } from 'vitest'
import { sniffViewportMedia } from '../content/media-sniffer.ts'
import { pageInspirationRequest, pageInspirationTask } from './inspiration-save.ts'
import type { PageSceneInfo } from './components/SceneBadge.tsx'
import type { InspirationSaveTask } from '../shared/inspiration-save.ts'

const scene: PageSceneInfo = { url: 'https://www.youtube.com/watch?v=abcdefghijk', platform: 'generic', title: 'Video post', pageType: 'detail' }
beforeEach(() => { document.body.innerHTML = '' })
function sniff(markup: string) {
  document.body.innerHTML = `<div id="player">${markup}</div>`
  const media = document.querySelector('video')!
  media.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180, x: 0, y: 0, toJSON: () => ({}) })
  const items = sniffViewportMedia()
  expect(items).toHaveLength(1)
  return items[0]!
}

describe('non-X video preview save inputs and receipts', () => {
  it('a real direct source reaches capture when no poster was present', () => {
    const media = sniff('<video src="https://cdn.example/video.mp4"></video>')
    expect(media).toMatchObject({ sourceKind: 'direct', videoSrc: 'https://cdn.example/video.mp4', posterSrc: '' })
    expect(pageInspirationRequest(scene, media)?.capture).toMatchObject({ cover_url: '', media_items: [{ type: 'video', url: 'https://cdn.example/video.mp4' }] })
  })
  it('keeps the actual stream even when the legacy thumbnail ladder prefers its poster', () => {
    const media = sniff('<video src="https://cdn.example/video.mp4" poster="https://cdn.example/cover.jpg"></video>')
    expect(media).toMatchObject({ src: 'https://cdn.example/cover.jpg', sourceKind: 'poster', videoSrc: 'https://cdn.example/video.mp4' })
    expect(pageInspirationRequest(scene, media)?.capture).toMatchObject({ cover_url: 'https://cdn.example/cover.jpg', media_items: [{ type: 'video', url: 'https://cdn.example/video.mp4', poster_url: 'https://cdn.example/cover.jpg' }] })
  })
  it.each(['<video poster="https://cdn.example/cover.jpg"></video>', '<video src="blob:https://youtube.com/temporary"></video>'])('never calls a poster or blob a playable file: %s', (markup) => {
    const media = sniff(markup)
    expect(pageInspirationRequest(scene, media)?.capture?.media_items).toMatchObject([{ type: 'video', url: '' }])
  })
  it.each(['saving', 'partial', 'failed', 'saved'] as const)('finds %s by the exact same source resolution used for submission', (state) => {
    const media = sniff('<video src="https://cdn.example/video.mp4"></video>')
    expect(media.inspirationUrl).toBeUndefined()
    const task: InspirationSaveTask = { taskId: 'bound', host: 'http://127.0.0.1:43120', sourceUrl: 'https://youtu.be/abcdefghijk?si=share', state, detail: '素材未齐', updatedAt: 1 }
    expect(pageInspirationTask(scene, media, [task])).toBe(task)
  })
  it('keeps an active task bound to its submitted host rather than another host recent result', () => {
    const media = sniff('<video src="https://cdn.example/video.mp4"></video>')
    const task: InspirationSaveTask = { taskId: 'bound', host: 'http://127.0.0.1:43120', sourceUrl: scene.url, state: 'pending', updatedAt: 1 }
    const other: InspirationSaveTask = { ...task, taskId: 'other-host', host: 'http://127.0.0.1:45120', state: 'saved', updatedAt: 2 }
    expect(pageInspirationTask(scene, media, [other, task])).toBe(task)
  })
})
