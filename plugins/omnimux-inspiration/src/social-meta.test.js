import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSocialMeta, socialPayloadLayers } from './http-handlers.js'

/** X / Twitter tweet envelope as returned by the OmniMux cloud tool. */
const X_TWEET_VIDEO = {
  text: '开场三秒反杀，这就是钩子',
  display_text: 'display text fallback',
  author: { name: '老王', screen_name: 'laowangbabababa', image: 'https://pbs.twimg.com/profile_images/a.jpg' },
  engagement: { likes: 1200, views: 98000, retweets: 34, replies: 12, bookmarks: 8 },
  media: {
    video: [
      {
        media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/1/img/cover.jpg',
        variants: [
          { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/1/pl/playlist.m3u8' },
          { content_type: 'video/mp4', bitrate: 256000, url: 'https://video.twimg.com/amplify_video/1/vid/320x180/low.mp4' },
          { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/amplify_video/1/vid/1280x720/high.mp4' },
        ],
      },
    ],
  },
}

describe('parseSocialMeta — X / Twitter', () => {
  it('extracts the highest bitrate mp4 variant and the poster frame', () => {
    const meta = parseSocialMeta(X_TWEET_VIDEO)

    assert.equal(meta.video_url, 'https://video.twimg.com/amplify_video/1/vid/1280x720/high.mp4')
    assert.equal(meta.cover_url, 'https://pbs.twimg.com/amplify_video_thumb/1/img/cover.jpg')
    assert.equal(meta.text, '开场三秒反杀，这就是钩子')
    assert.equal(meta.title, '开场三秒反杀，这就是钩子')
    assert.equal(meta.author.name, '老王')
    assert.equal(meta.author.handle, 'laowangbabababa')
    assert.equal(meta.author.avatar, 'https://pbs.twimg.com/profile_images/a.jpg')
    assert.equal(meta.stats.likes, 1200)
    assert.equal(meta.stats.views, 98000)
    assert.equal(meta.stats.shares, 34)
    assert.equal(meta.stats.comments, 12)
    assert.equal(meta.stats.bookmarks, 8)
    assert.equal(meta.has_metadata, true)
  })

  it('falls back to entities.media[].video_info.variants[]', () => {
    const meta = parseSocialMeta({
      full_text: '实体降级路径',
      user: { name: 'Fallback Author', screen_name: 'fallback', profile_image_url: 'https://pbs.twimg.com/a.jpg' },
      entities: {
        media: [
          {
            media_url_https: 'https://pbs.twimg.com/media/photo.jpg',
            video_info: {
              variants: [
                { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/ext_tw_video/2/vid/640x360/mid.mp4' },
                { content_type: 'video/mp4', bitrate: 1280000, url: 'https://video.twimg.com/ext_tw_video/2/vid/720x720/hi.mp4' },
              ],
            },
          },
        ],
      },
    })

    assert.equal(meta.video_url, 'https://video.twimg.com/ext_tw_video/2/vid/720x720/hi.mp4')
    assert.equal(meta.cover_url, 'https://pbs.twimg.com/media/photo.jpg')
    assert.equal(meta.text, '实体降级路径')
    assert.equal(meta.author.name, 'Fallback Author')
    assert.equal(meta.author.handle, 'fallback')
  })

  it('keeps a photo-only tweet video-free but importable', () => {
    const meta = parseSocialMeta({
      text: '纯图文推文',
      entities: { media: [{ media_url_https: 'https://pbs.twimg.com/media/only-photo.jpg', type: 'photo' }] },
    })

    assert.equal(meta.video_url, '')
    assert.equal(meta.cover_url, 'https://pbs.twimg.com/media/only-photo.jpg')
    assert.equal(meta.has_metadata, true)
  })

  it('never promotes an unrelated url to the video stream', () => {
    const meta = parseSocialMeta({
      author: { name: 'spam', avatar: 'https://pbs.twimg.com/avatar.jpg' },
      tracker: 'https://t.co/pixel.gif',
      website: 'https://example.com/article',
      url: 'https://x.com/spam/status/1',
    })

    assert.equal(meta.video_url, '')
    assert.equal(meta.resolvedUrl, 'https://x.com/spam/status/1')
  })
})

describe('parseSocialMeta — Instagram', () => {
  it('reads the flat post shape (video_url / display_url / caption / owner)', () => {
    const meta = parseSocialMeta({
      video_url: 'https://scontent.cdninstagram.com/v/t16/abc.mp4?efg=1',
      display_url: 'https://scontent.cdninstagram.com/v/t51/cover.jpg',
      caption: { text: '三秒学会的妆容' },
      owner: { username: 'beautyqueen', full_name: '美妆女王', profile_pic_url: 'https://scontent/avatar.jpg' },
      like_count: 3200,
      comment_count: 88,
    })

    assert.equal(meta.video_url, 'https://scontent.cdninstagram.com/v/t16/abc.mp4?efg=1')
    assert.equal(meta.cover_url, 'https://scontent.cdninstagram.com/v/t51/cover.jpg')
    assert.equal(meta.text, '三秒学会的妆容')
    assert.equal(meta.author.name, '美妆女王')
    assert.equal(meta.author.handle, 'beautyqueen')
    assert.equal(meta.author.avatar, 'https://scontent/avatar.jpg')
    assert.equal(meta.stats.likes, 3200)
    assert.equal(meta.stats.comments, 88)
  })

  it('reads video_versions[] and image_versions2 candidates', () => {
    const meta = parseSocialMeta({
      video_versions: [{ url: 'https://scontent.cdninstagram.com/v/t16/xyz.mp4', width: 1080 }],
      image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/v/t51/candidate.jpg', width: 1080 }] },
      edge_media_to_caption: { edges: [{ node: { text: '边结构文案' } }] },
      user: { username: 'creator', full_name: '创作人' },
    })

    assert.equal(meta.video_url, 'https://scontent.cdninstagram.com/v/t16/xyz.mp4')
    assert.equal(meta.cover_url, 'https://scontent.cdninstagram.com/v/t51/candidate.jpg')
    assert.equal(meta.text, '边结构文案')
    assert.equal(meta.author.handle, 'creator')
  })

  it('picks the highest quality entry of a multi-entry video_versions[] ladder (regression)', () => {
    const meta = parseSocialMeta({
      video_versions: [
        { type: 101, width: 480, height: 852, url: 'https://scontent.cdninstagram.com/v/t50/low-480.mp4' },
        { type: 102, width: 720, height: 1280, url: 'https://scontent.cdninstagram.com/v/t50/mid-720.mp4' },
        { type: 103, width: 1080, height: 1920, url: 'https://scontent.cdninstagram.com/v/t50/high-1080.mp4' },
      ],
    })

    assert.equal(meta.video_url, 'https://scontent.cdninstagram.com/v/t50/high-1080.mp4')
  })

  it('falls back to the first usable video_versions[] entry when no ranking info exists', () => {
    const meta = parseSocialMeta({
      video_versions: [
        { url: 'https://scontent.cdninstagram.com/v/t50/first.mp4' },
        { url: 'https://scontent.cdninstagram.com/v/t50/second.mp4' },
      ],
    })

    assert.equal(meta.video_url, 'https://scontent.cdninstagram.com/v/t50/first.mp4')
  })

  it('degrades a photo post to metadata only', () => {
    const meta = parseSocialMeta({
      display_url: 'https://scontent.cdninstagram.com/v/t51/photo.jpg',
      caption: { text: '图文帖' },
    })

    assert.equal(meta.video_url, '')
    assert.equal(meta.cover_url, 'https://scontent.cdninstagram.com/v/t51/photo.jpg')
    assert.equal(meta.has_metadata, true)
  })
})

describe('parseSocialMeta — YouTube', () => {
  it('picks the best usable mp4 from formats[] / adaptive_formats[]', () => {
    const meta = parseSocialMeta({
      title: 'How to hook in 3 seconds',
      author: 'Creator Channel',
      lengthSeconds: 42,
      upload_date: '20240115',
      thumbnails: [
        { url: 'https://i.ytimg.com/vi/abc/default.jpg' },
        { url: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg' },
      ],
      formats: [
        { mimeType: 'video/mp4; codecs="avc1"', url: 'https://rr1---sn-x.googlevideo.com/videoplayback?itag=18', height: 360 },
        { mimeType: 'video/webm', url: 'https://rr1---sn-x.googlevideo.com/videoplayback?itag=43', height: 720 },
      ],
      adaptive_formats: [
        { mimeType: 'video/mp4; codecs="avc1"', url: 'https://rr2---sn-x.googlevideo.com/videoplayback?itag=137', height: 1080 },
      ],
    })

    assert.equal(meta.video_url, 'https://rr2---sn-x.googlevideo.com/videoplayback?itag=137')
    assert.equal(meta.cover_url, 'https://i.ytimg.com/vi/abc/maxresdefault.jpg')
    assert.equal(meta.title, 'How to hook in 3 seconds')
    assert.equal(meta.author.name, 'Creator Channel')
    assert.equal(meta.duration, 42)
    assert.equal(meta.published_at, '2024-01-15T00:00:00.000Z')
  })

  it('skips signatureCipher entries and degrades instead of guessing', () => {
    const meta = parseSocialMeta({
      title: 'Protected stream',
      formats: [
        { mimeType: 'video/mp4', signatureCipher: 's=abc&url=https%3A%2F%2Frr1.googlevideo.com%2Fvideoplayback' },
        { mimeType: 'video/mp4', cipher: 's=def&url=https%3A%2F%2Frr1.googlevideo.com%2Fvideoplayback' },
      ],
      thumbnail_url: 'https://i.ytimg.com/vi/protected/hqdefault.jpg',
    })

    assert.equal(meta.video_url, '')
    assert.equal(meta.cover_url, 'https://i.ytimg.com/vi/protected/hqdefault.jpg')
    assert.equal(meta.has_metadata, true)
  })

  it('does not mistake the watch page url for a video stream', () => {
    const meta = parseSocialMeta({ title: 'Page only', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })

    assert.equal(meta.video_url, '')
    assert.equal(meta.resolvedUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
})

describe('parseSocialMeta — bounded unwrap and TikTok compatibility', () => {
  it('unwraps the known gateway containers one level', () => {
    const cases = [
      { data: { items: [{ video_url: 'https://cdn.example.com/a.mp4' }] } },
      { items: [{ video_url: 'https://cdn.example.com/a.mp4' }] },
      { data: { items: [{ video: { play_addr: { url_list: ['https://cdn.example.com/a.mp4'] } } }] } },
      { result: { video_url: 'https://cdn.example.com/a.mp4' } },
      { aweme_detail: { video: { play_addr: { url_list: ['https://cdn.example.com/a.mp4'] } } } },
      { item_list: [{ video_url: 'https://cdn.example.com/a.mp4' }] },
    ]

    for (const payload of cases) {
      assert.equal(parseSocialMeta(payload).video_url, 'https://cdn.example.com/a.mp4')
    }
  })

  it('keeps the flat TikTok shape working', () => {
    const meta = parseSocialMeta({
      title: 'TikTok 爆款',
      desc: 'TikTok 爆款文案',
      cover_url: 'https://p16-sign.tiktokcdn.com/cover.jpg',
      video_url: 'https://v16-webapp.tiktokcdn.com/video.mp4',
      author: { name: 'TikToker', handle: 'tiktoker' },
      stats: { likes: 50000, comments: 1200 },
      video_duration: 18,
    })

    assert.equal(meta.video_url, 'https://v16-webapp.tiktokcdn.com/video.mp4')
    assert.equal(meta.cover_url, 'https://p16-sign.tiktokcdn.com/cover.jpg')
    assert.equal(meta.text, 'TikTok 爆款文案')
    assert.equal(meta.duration, 18)
    assert.equal(meta.author.name, 'TikToker')
    assert.equal(meta.stats.likes, 50000)
  })

  it('reports an empty envelope as content-free', () => {
    const meta = parseSocialMeta({})

    assert.equal(meta.has_metadata, false)
    assert.equal(meta.video_url, '')
    assert.equal(socialPayloadLayers({}).length, 1)
  })

  it('reports the hub empty sentinel as content-free (P0-1 regression)', () => {
    // `pickSocialPayload` answers `{ text: null }` when the hub has no content.
    for (const sentinel of [{ text: null }, { text: null, video_url: null }, { title: '', text: null }]) {
      const meta = parseSocialMeta(sentinel)
      assert.equal(meta.has_metadata, false, `${JSON.stringify(sentinel)} must carry no metadata`)
      assert.equal(meta.video_url, '')
    }
  })

  it('unwraps the nested gateway containers one level (P2-4 regression)', () => {
    const cases = [
      { data: { result: { video_url: 'https://cdn.example.com/a.mp4' } } },
      { result: { data: { video_url: 'https://cdn.example.com/a.mp4' } } },
      { data: { items: [{ data: { video_url: 'https://cdn.example.com/a.mp4' } }] } },
      { data: { aweme_list: [{ video_url: 'https://cdn.example.com/a.mp4' }] } },
      { data: { contents: [{ video_url: 'https://cdn.example.com/a.mp4' }] } },
    ]

    for (const payload of cases) {
      assert.equal(
        parseSocialMeta(payload).video_url,
        'https://cdn.example.com/a.mp4',
        `${JSON.stringify(payload)} must resolve its direct link`,
      )
    }
    // Still bounded: a layer nested two fields deep is not searched.
    assert.equal(parseSocialMeta({ data: { result: { data: { video_url: 'https://cdn.example.com/a.mp4' } } } }).video_url, '')
  })

  it('reads image entries that are objects instead of strings (P2-5 regression)', () => {
    const meta = parseSocialMeta({
      text: '图文帖',
      images: [{ url: 'https://cdn.example.com/one.jpg' }, { src: 'https://cdn.example.com/two.jpg' }, 'https://cdn.example.com/three.jpg'],
    })

    assert.deepEqual(meta.images, [
      'https://cdn.example.com/one.jpg',
      'https://cdn.example.com/two.jpg',
      'https://cdn.example.com/three.jpg',
    ])
  })
})

describe('parseSocialMeta — download-target policy (P0-2 regression)', () => {
  const DIRECT_LINK_FIELDS = ['video_url', 'video', 'play_url', 'play', 'download_url', 'url']

  it('never produces a video_url for loopback, metadata, private or file targets', () => {
    const blocked = [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://127.0.0.1:45120/omnimux/inspiration/local/items',
      'http://127.0.0.1:1234/a.webm',
      'http://10.0.0.5/a.mp4',
      'http://172.20.0.5/a.mp4',
      'http://192.168.1.5/a.mp4',
      'http://[::1]/a.mp4',
      'http://printer.local/a.mp4',
      'file:///etc/passwd',
    ]

    for (const field of DIRECT_LINK_FIELDS) {
      for (const target of blocked) {
        const meta = parseSocialMeta({ title: 'blocked', [field]: target })
        assert.equal(meta.video_url, '', `${field}=${target} must not become a download target`)
      }
    }
  })

  it('never produces a video_url for manifest or page containers', () => {
    for (const target of [
      'https://cdn.example.com/stream.m3u8',
      'https://cdn.example.com/manifest.mpd',
      'https://cdn.example.com/article.html',
      'https://cdn.example.com/article.htm',
      'https://cdn.example.com/stream.m3u8?token=abc',
    ]) {
      for (const field of DIRECT_LINK_FIELDS) {
        assert.equal(parseSocialMeta({ [field]: target }).video_url, '', `${field}=${target} must be rejected`)
      }
    }
  })

  it('keeps playable public direct links working', () => {
    for (const target of [
      'https://cdn.example.com/stream.mp4',
      'https://cdn.example.com/stream.mp4?token=abc',
      'https://v16-webapp.tiktokcdn.com/video.mp4',
      'https://rr1---sn-x.googlevideo.com/videoplayback?itag=18',
    ]) {
      assert.equal(parseSocialMeta({ video_url: target }).video_url, target)
    }
  })

  it('applies the same policy when the direct link hides behind a wrapper layer', () => {
    const meta = parseSocialMeta({ data: { items: [{ video_url: 'http://169.254.169.254/x.mp4' }] } })

    assert.equal(meta.video_url, '')
    assert.equal(meta.has_metadata, false)
  })
})
