import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toInspirationCardRow } from './inspiration-card.js'
import { rivalCardHeightPx, rivalPlacements } from './rival-masonry.js'
import { zh } from './locales.js'

describe('inspiration cards — shared account-feed mapping', () => {
  it('distinguishes text, photo tweets and video tweets without mutating stored records', () => {
    const rows = [
      { id: 'text', type: 'link', source_platform: 'x', content: '正文', title: '标题' },
      { id: 'photo', type: 'image', source_platform: 'x', content_shape: 'gallery', media_urls: ['https://images.example/1.jpg', 'https://images.example/2.jpg'], ratio: 1.5 },
      { id: 'video', type: 'video', source_platform: 'x', media_urls: ['/omnimux/inspiration/local/media/videos/v_ab12.mp4'] },
    ]
    const before = JSON.stringify(rows)
    const [text, photo, video] = rows.map(toInspirationCardRow)
    assert.equal(text.card_type, 'text')
    assert.equal(text.title, '正文')
    assert.equal(photo.card_type, 'text-media')
    assert.equal(photo.media_kind, 'image')
    assert.equal(photo.image_count, 2)
    assert.equal(photo.ratio, 1.5)
    assert.equal(video.card_type, 'text-media')
    assert.equal(video.media_kind, 'video')
    assert.equal(JSON.stringify(rows), before)
    assert.equal(text.source_row, rows[0])
  })

  it('keeps public videos in the shared video shape and respects landscape-platform geometry', () => {
    assert.equal(toInspirationCardRow({ id: 'public', type: 'video', source_platform: 'tiktok', cover_key: 'cover.jpg' }).card_type, 'short-video')
    assert.equal(toInspirationCardRow({ id: 'youtube', type: 'video', source_platform: 'youtube', cover_key: 'cover.jpg' }).card_type, 'long-video')
    assert.equal(toInspirationCardRow({ id: 'plain', type: 'link', title: '离线文字' }).card_type, 'text')
  })

  it('uses the existing shortest-column layout for mixed library content and stable appends', () => {
    const rows = [
      { id: 'short', type: 'link', source_platform: 'x', title: '短文' },
      { id: 'video', type: 'video', source_platform: 'tiktok', cover_key: 'cover.jpg' },
      { id: 'long', type: 'link', source_platform: 'x', title: '长文内容'.repeat(80) },
      { id: 'image', type: 'image', source_platform: 'x', media_urls: ['https://images.example/1.jpg'] },
    ].map(toInspirationCardRow)
    const initial = rivalPlacements(rows.slice(0, 3), 2, 250)
    const appended = rivalPlacements(rows, 2, 250)
    for (const [id, placement] of initial.placements) {
      assert.deepEqual(appended.placements.get(id), placement)
    }
    assert.notEqual(appended.placements.get('video').height, appended.placements.get('short').height)
    for (const [id, item] of appended.placements) {
      for (const [otherId, other] of appended.placements) {
        if (id !== otherId && item.col === other.col && item.top < other.top) {
          assert.ok(item.top + item.height <= other.top)
        }
      }
    }
  })

  it('uses the visible failure or importing notice as the measured text body', () => {
    const t = (key) => zh[key] || key
    const row = { id: 'failed', title: '原始标题', source_platform: 'x', type: 'link', import_status: 'failed', import_error: '导入中断，请重试。'.repeat(30) }
    const failed = toInspirationCardRow(row, t)
    assert.equal(failed.title, zh['add.failedDetail'].replace('{error}', row.import_error))
    assert.equal(failed.notice_kind, 'error')
    const failedVideo = toInspirationCardRow({ ...row, type: 'video' }, t)
    assert.equal(failedVideo.card_type, 'text', 'a failed import with no saved media needs its readable error body')
    assert.equal(failedVideo.title, failed.title)
    assert.equal(failed.source_row.title, '原始标题')
    assert.ok(rivalCardHeightPx(failed, 250) > rivalCardHeightPx({ ...failed, title: '原始标题' }, 250))
    const importing = toInspirationCardRow({ ...row, import_status: 'importing', import_stage: 'downloading' }, t)
    assert.equal(importing.title, zh['add.status.downloading'])
    assert.equal(importing.notice_kind, 'importing')
  })

})
