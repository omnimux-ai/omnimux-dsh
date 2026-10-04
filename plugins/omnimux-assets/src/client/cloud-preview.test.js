import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cloudAssetToPreviewItem, previewKindOf } from './cloud-preview.js'

const IMAGE_ROW = {
  id: 'character-abc',
  name: 'Luna · 卧室时尚自拍',
  description: '室内自拍风格角色',
  mediaType: 'image',
  playable: true,
}
const VIDEO_ROW = { id: 'scene-vid', name: '写字楼', description: '', mediaType: 'video' }
const AUDIO_ROW = { id: 'audio-voice-bbb', name: '林潇 2.0', description: '配音 · 0:12', mediaType: 'audio' }
const TEXT_ROW = { id: 'doc-note-1', name: 'Reddit 首页', description: '完整正文', mediaType: 'document' }
const OTHER_ROW = { id: 'prop-plain', name: '道具', description: '无媒体', mediaType: 'other' }

describe('previewKindOf', () => {
  it('keeps the three playable kinds and folds everything else into file', () => {
    assert.equal(previewKindOf('image'), 'image')
    assert.equal(previewKindOf('video'), 'video')
    assert.equal(previewKindOf('audio'), 'audio')
    assert.equal(previewKindOf('document'), 'file')
    assert.equal(previewKindOf('other'), 'file')
    assert.equal(previewKindOf(undefined), 'file')
  })
})

describe('cloudAssetToPreviewItem', () => {
  it('points an image row at the Host media route', () => {
    const item = cloudAssetToPreviewItem(IMAGE_ROW)
    assert.equal(item.kind, 'image')
    assert.equal(item.title, 'Luna · 卧室时尚自拍')
    assert.equal(item.previewUrl, '/omnimux/assets/cloud/media?id=character-abc&which=media')
    assert.equal(item.sourceAssetId, 'character-abc')
    assert.equal(item.cloud, true)
  })

  it('namespaces the modal id so a cloud row can never collide with a library row', () => {
    const item = cloudAssetToPreviewItem(IMAGE_ROW)
    assert.equal(item.id, 'cloud:character-abc')
    assert.notEqual(item.id, item.sourceAssetId)
  })

  it('points a video row at the playable media, not the cover', () => {
    const item = cloudAssetToPreviewItem(VIDEO_ROW)
    assert.equal(item.kind, 'video')
    assert.match(item.previewUrl, /which=media/)
    assert.doesNotMatch(item.previewUrl, /which=cover/)
  })

  it('gives an audio row a playable url and no text body', () => {
    const item = cloudAssetToPreviewItem(AUDIO_ROW)
    assert.equal(item.kind, 'audio')
    assert.equal(item.previewUrl, '/omnimux/assets/cloud/media?id=audio-voice-bbb&which=media')
    assert.equal(item.text, '')
  })

  it('carries the whole description as the text of a text row', () => {
    const item = cloudAssetToPreviewItem(TEXT_ROW)
    assert.equal(item.kind, 'file')
    assert.equal(item.text, '完整正文')
    assert.equal(item.previewUrl, '')
  })

  it('leaves the extension badge empty, because a catalog row has no extension', () => {
    assert.equal(cloudAssetToPreviewItem(IMAGE_ROW).extension, '')
    assert.equal(cloudAssetToPreviewItem(TEXT_ROW).extension, '')
  })

  it('treats a row of unknown media type as text rather than a broken player', () => {
    const item = cloudAssetToPreviewItem(OTHER_ROW)
    assert.equal(item.kind, 'file')
    assert.equal(item.text, '无媒体')
  })

  it('refuses a row with no id instead of opening an empty preview', () => {
    assert.equal(cloudAssetToPreviewItem(null), null)
    assert.equal(cloudAssetToPreviewItem({ name: 'x' }), null)
    assert.equal(cloudAssetToPreviewItem({ id: '' }), null)
  })

  it('keeps the source row so the preview can still be saved to the library', () => {
    const item = cloudAssetToPreviewItem(IMAGE_ROW)
    assert.equal(item.sourceAsset, IMAGE_ROW)
  })
})

/**
 * Issue #3058：官方音色详情出口。
 * verified → audio kind + 可流式 previewUrl；unverified official-voice-preview →
 * 文本描述，绝不退化为「当前文件格式不支持内嵌预览」的空态。
 */
describe('cloudAssetToPreviewItem - official voice preview (Issue #3058)', () => {
  const OFFICIAL_PREVIEW = {
    purpose: 'official-voice-preview',
    state: 'verified-file',
    primary_url: 'https://cdn.example.com/voice.mp3',
    candidates: ['https://cdn.example.com/voice.mp3'],
    checked_at: '2026-10-03T00:00:00.000Z',
    evidence_ref: 'audit-20261003',
  }
  const VERIFIED_VOICE = {
    id: 'audio-voiceover-abc',
    name: '林潇 2.0',
    description: '通用场景 · 中文',
    mediaType: 'audio',
    playable: true,
    hasMedia: true,
    preview: OFFICIAL_PREVIEW,
  }

  it('a verified official voice preview opens as audio on its DTO primary URL', () => {
    const item = cloudAssetToPreviewItem(VERIFIED_VOICE)
    assert.equal(item.kind, 'audio')
    // 详情音频直接读 DTO primary 官方 CDN 直链——DTO-only 行（media_url 为空）
    // 也能播放，不依赖 media 路由的 302 重定向。
    assert.equal(item.previewUrl, 'https://cdn.example.com/voice.mp3')
    assert.equal(item.text, '')
    assert.deepEqual(item.preview, OFFICIAL_PREVIEW)
  })

  it('a DTO-only verified row (no media_url) still opens a playable audio detail (OCR #11)', () => {
    const item = cloudAssetToPreviewItem({ ...VERIFIED_VOICE, hasMedia: false })
    assert.equal(item.kind, 'audio')
    assert.equal(item.previewUrl, 'https://cdn.example.com/voice.mp3')
    assert.equal(item.text, '')
  })

  it('an unverified official voice preview shows the description, never unsupported-media', () => {
    const item = cloudAssetToPreviewItem({
      ...VERIFIED_VOICE,
      hasMedia: false,
      preview: { ...OFFICIAL_PREVIEW, state: 'unverified', primary_url: null },
    })
    assert.equal(item.kind, 'file')
    assert.equal(item.text, VERIFIED_VOICE.description)
    assert.equal(item.previewUrl, '')
    assert.deepEqual(item.preview.state, 'unverified')
  })

  it('carries purpose to the modal so actions can be gated on it', () => {
    const item = cloudAssetToPreviewItem(VERIFIED_VOICE)
    assert.equal(item.preview.purpose, 'official-voice-preview')
    assert.equal(item.sourceAsset.preview.purpose, 'official-voice-preview')
  })
})
