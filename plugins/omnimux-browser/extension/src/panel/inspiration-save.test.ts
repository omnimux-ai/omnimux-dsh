import { describe, expect, it } from 'vitest'
import { pageInspirationRequest } from './inspiration-save.ts'
import type { PageSceneInfo } from './components/SceneBadge.tsx'

const firstUrl = 'https://x.com/first/status/1'
const secondUrl = 'https://x.com/second/status/2'
const scene: PageSceneInfo = { url: 'https://x.com/home', title: '首页', platform: 'twitter', pageType: 'home', tweet: { url: firstUrl, shape: 'text', text: '第一帖', author: { name: 'First', handle: 'first', avatar: '', verified: false }, postedAt: null, mediaUrls: [], mediaItems: [], coverUrl: '', stats: {} } }

describe('panel inspiration source selection', () => {
  it('hero saves the captured permanent post with full text', () => {
    expect(pageInspirationRequest(scene)).toMatchObject({ targetUrl: 'https://x.com/i/status/1', capture: { url: firstUrl, text: '第一帖', shape: 'text' } })
  })
  it('a media preview uses its own post and never the first hero tweet', () => {
    expect(pageInspirationRequest(scene, { id: 'second', type: 'video', src: 'https://cdn.example/poster.jpg', previewSrc: '', inspirationUrl: secondUrl, inspirationCapture: { url: secondUrl, text: '第二帖', author: { name: 'Second', handle: 'second', avatar: '', verified: false }, stats: {}, posted_at: null, cover_url: '', shape: 'video', media_items: [{ type: 'video', url: '' }] } }))
      .toMatchObject({ targetUrl: 'https://x.com/i/status/2', capture: { text: '第二帖' } })
  })
  it('a preview with unknown ownership cannot use a media URL or home page as source', () => {
    expect(pageInspirationRequest(scene, { id: 'unknown', type: 'video', src: 'https://cdn.example/media.mp4', previewSrc: '' })).toBeNull()
    expect(pageInspirationRequest({ ...scene, tweet: undefined })).toBeNull()
  })
})
