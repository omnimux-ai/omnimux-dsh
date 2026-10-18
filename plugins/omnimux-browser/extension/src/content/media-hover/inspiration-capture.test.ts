// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeMedia } from './payload.ts'

const POSTER = 'https://pbs.twimg.com/amplify_video_thumb/1/img/poster.jpg'
const VIDEO = 'https://video.twimg.com/amplify_video/1/video.mp4'
const pageUrl = 'https://x.com/home'

function post(id: string, body: string, handle = 'creator'): string {
  return `<article data-testid="tweet"><div data-testid="User-Name">
    <a role="link" href="/${handle}">${handle}@${handle}</a>
    <a href="/${handle}/status/${id}"><time datetime="2026-10-18T00:00:00.000Z"></time></a>
  </div><div data-testid="tweetText">Post ${id}</div>${body}</article>`
}

function video(id = 'target'): string {
  return `<div data-testid="videoPlayer"><video id="${id}" src="${VIDEO}" poster="${POSTER}" width="640" height="360"></video></div>`
}

beforeEach(() => { document.body.innerHTML = '' })

describe('悬浮视频保存来源', () => {
  it('首页第二帖的视频只携带自己原帖；复制和附件来源保持不变', () => {
    document.body.innerHTML = `<main>${post('111', video('first'))}${post('222', video())}</main>`
    const element = document.getElementById('target')!
    const payload = normalizeMedia(element, 'video', pageUrl, { pageUrl })!
    expect(payload.inspirationUrl).toBe('https://x.com/creator/status/222')
    expect(payload.inspirationCapture?.text).toBe('Post 222')
    expect(payload.inspirationCapture?.media_items).toEqual([{ type: 'video', url: VIDEO, poster_url: POSTER }])
    expect(payload.src).toBe(POSTER)
    expect(payload.pageUrl).toBe(pageUrl)
    expect(payload.previewSrc).toBe(POSTER)
    expect(payload.sourceKind).toBe('poster')
  })

  it('引用链接先出现时仍选目标原帖，引用附件不进入采集', () => {
    document.body.innerHTML = `<article data-testid="tweet">
      <div data-testid="quoteTweet"><a href="/quoted/status/999"><time></time></a>
        <div data-testid="tweetText">Quoted</div>${video('quoted')}</div>
      <a href="/creator/status/222"><time></time></a><div data-testid="tweetText">Mine</div>${video()}
    </article>`
    const payload = normalizeMedia(document.getElementById('target')!, 'video', pageUrl, { pageUrl })!
    expect(payload.inspirationUrl).toBe('https://x.com/creator/status/222')
    expect(payload.inspirationCapture?.text).toBe('Mine')
    expect(payload.inspirationCapture?.media_items).toHaveLength(1)
  })

  it('引用视频没有独立所属文章时明确拒绝，不假借外层原帖', () => {
    document.body.innerHTML = post('222', `<div data-testid="quoteTweet"><div data-testid="tweetText">Quoted</div>${video()}</div>`)
    const payload = normalizeMedia(document.getElementById('target')!, 'video', pageUrl, { pageUrl })!
    expect(payload.inspirationUrl).toBe('')
    expect(payload.inspirationCapture).toBeUndefined()
    expect(payload.src).toBe(POSTER)
    expect(payload.pageUrl).toBe(pageUrl)
  })

  it('当前视频无所属原帖时不使用首页、另一条帖子或当前详情地址兜底', () => {
    document.body.innerHTML = `${post('111', video('first'))}${video()}`
    expect(normalizeMedia(document.getElementById('target')!, 'video', pageUrl)?.inspirationUrl).toBe('')
    document.body.innerHTML = `<article data-testid="tweet">${video()}</article>`
    const payload = normalizeMedia(document.getElementById('target')!, 'video', 'https://x.com/other/status/555')!
    expect(payload.inspirationUrl).toBe('')
    expect(payload.inspirationCapture).toBeUndefined()
  })

  it('只有封面的视频仍携带视频缺失位置，不能冒充图片或可播放文件', () => {
    document.body.innerHTML = post('222', `<div data-testid="videoPlayer"><video id="target" poster="${POSTER}"></video></div>`)
    const payload = normalizeMedia(document.getElementById('target')!, 'video', pageUrl)!
    expect(payload.inspirationCapture?.media_items).toEqual([{ type: 'video', url: '', poster_url: POSTER }])
  })

  it('其他平台及图片继续沿用既有来源能力', () => {
    document.body.innerHTML = video()
    const payload = normalizeMedia(document.getElementById('target')!, 'video', 'https://www.youtube.com/watch?v=one')!
    expect(payload.inspirationUrl).toBeUndefined()
    expect(payload.inspirationCapture).toBeUndefined()
    expect(payload.src).toBe(POSTER)
    document.body.innerHTML = post('222', `<div data-testid="tweetPhoto"><img id="image" src="${POSTER}" /></div>`)
    const image = normalizeMedia(document.getElementById('image')!, 'image', pageUrl)!
    expect(image.inspirationUrl).toBeUndefined()
    expect(image.inspirationCapture).toBeUndefined()
  })
})
