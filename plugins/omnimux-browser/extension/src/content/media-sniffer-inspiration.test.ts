// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://x.com/home"}
import { beforeEach, describe, expect, it } from 'vitest'
import { sniffViewportMedia } from './media-sniffer.ts'

function post(id: string, media: string): string {
  return `<article data-testid="tweet"><a href="/creator/status/${id}"><time></time></a>
    <div data-testid="tweetText">Post ${id}</div>${media}</article>`
}

function layoutMedia(): void {
  for (const media of document.querySelectorAll('img,video')) {
    media.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 180,
      width: 320, height: 180, x: 0, y: 0, toJSON: () => ({}) })
  }
}

beforeEach(() => { document.body.innerHTML = '' })

describe('媒体预览携带各自所属帖子', () => {
  it('同屏多帖的图片和视频各自携带原帖地址，不复用第一页或焦点采集', () => {
    document.body.innerHTML = `<main>${post('111', '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/first.jpg" /></div>')}
      ${post('222', '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/second.jpg" /></div><div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/media/second-cover.jpg"></video></div>')}</main>`
    layoutMedia()
    const items = sniffViewportMedia()
    expect(items).toHaveLength(3)
    expect(items[0]?.inspirationUrl).toBe('https://x.com/creator/status/111')
    for (const item of items.slice(1)) {
      expect(item.inspirationUrl).toBe('https://x.com/creator/status/222')
      expect(item.inspirationCapture?.text).toBe('Post 222')
      expect(item.inspirationCapture?.media_items).toEqual([
        { type: 'image', url: 'https://pbs.twimg.com/media/second.jpg' },
        { type: 'video', url: '', poster_url: 'https://pbs.twimg.com/media/second-cover.jpg' },
      ])
    }
    expect(items[2]?.type).toBe('video')
    expect(items[2]?.src).toBe('https://pbs.twimg.com/media/second-cover.jpg')
  })

  it('引用媒体和无永久地址媒体明确标记不可归属，不能借页面主帖保存', () => {
    document.body.innerHTML = `${post('111', `<div data-testid="quoteTweet"><a href="/quoted/status/999"><time></time></a>
      <div data-testid="tweetText">Quoted</div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/quoted.jpg" /></div></div>`)}
      <article data-testid="tweet"><div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/media/unknown.jpg"></video></div></article>`
    layoutMedia()
    const items = sniffViewportMedia()
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.inspirationUrl).toBe('')
      expect(item.inspirationCapture).toBeUndefined()
    }
  })
})
