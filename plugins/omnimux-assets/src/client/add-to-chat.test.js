import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isImageFile,
  pickCoverFile,
  inferAssetExtension,
  buildAssetPayload,
  addAssetToConversation,
} from './add-to-chat.js'

describe('add-to-chat helpers', () => {
  describe('isImageFile', () => {
    it('recognizes kind === image or type === image', () => {
      assert.equal(isImageFile({ kind: 'image' }), true)
      assert.equal(isImageFile({ type: 'image' }), true)
      assert.equal(isImageFile({ kind: 'video' }), false)
      assert.equal(isImageFile(null), false)
    })

    it('recognizes mime type starting with image/', () => {
      assert.equal(isImageFile({ mime: 'image/png' }), true)
      assert.equal(isImageFile({ mime: 'image/jpeg' }), true)
      assert.equal(isImageFile({ mime: 'video/mp4' }), false)
    })

    it('recognizes image extensions from filename or path', () => {
      assert.equal(isImageFile({ original_name: 'avatar.PNG' }), true)
      assert.equal(isImageFile({ name: 'photo.webp' }), true)
      assert.equal(isImageFile({ real_path: '/path/to/hero.jpg' }), true)
      assert.equal(isImageFile({ relative_path: 'sub/icon.svg' }), true)
      assert.equal(isImageFile({ name: 'document.pdf' }), false)
      assert.equal(isImageFile({ name: 'clip.mp4' }), false)
    })
  })

  describe('pickCoverFile', () => {
    it('prefers asset.cover if it is an image', () => {
      const asset = {
        cover: { id: 'cov1', kind: 'image', name: 'thumb.jpg' },
        files: [
          { id: 'f1', kind: 'image', name: 'other.png' },
        ],
      }
      assert.equal(pickCoverFile(asset)?.id, 'cov1')
    })

    it('falls back to first image file in asset.files if cover is not an image', () => {
      const asset = {
        cover: { id: 'cov_doc', kind: 'file', name: 'doc.pdf' },
        files: [
          { id: 'f_audio', kind: 'audio', name: 'track.mp3' },
          { id: 'f_img', kind: 'image', name: 'preview.png' },
        ],
      }
      assert.equal(pickCoverFile(asset)?.id, 'f_img')
    })

    it('returns null if no image exists or files is non-array', () => {
      const asset = {
        cover: { id: 'cov_doc', kind: 'file', name: 'doc.pdf' },
        files: [
          { id: 'f_audio', kind: 'audio', name: 'track.mp3' },
        ],
      }
      assert.equal(pickCoverFile(asset), null)
      assert.equal(pickCoverFile({ files: null }), null)
      assert.equal(pickCoverFile({ files: 'not-an-array' }), null)
    })
  })

  describe('inferAssetExtension', () => {
    it('extracts extension from path or name in uppercase', () => {
      assert.equal(inferAssetExtension({ original_name: 'hero.png' }), 'PNG')
      assert.equal(inferAssetExtension({ relative_path: 'a/b/c.jpeg' }), 'JPEG')
      assert.equal(inferAssetExtension({ real_path: 'foo/bar.webp' }), 'WEBP')
    })

    it('falls back to title or ASSET', () => {
      assert.equal(inferAssetExtension(null, 'sample.jpg'), 'JPG')
      assert.equal(inferAssetExtension(null, 'My Asset'), 'ASSET')
      assert.equal(inferAssetExtension({}, ''), 'ASSET')
    })
  })

  describe('buildAssetPayload', () => {
    it('builds standard payload conforming to OmniMux attachment schema', () => {
      const asset = {
        id: 'ast_123',
        name: '赛博朋克主角',
        type: 'character',
        cover: { id: 'fil_1', kind: 'image', name: 'hero.png', relative_path: 'images/hero.png' },
        files: [
          { id: 'fil_1', kind: 'image', name: 'hero.png', relative_path: 'images/hero.png' },
        ],
      }
      const payload = buildAssetPayload(asset)
      assert.ok(payload)
      assert.equal(payload.sourcePlugin, 'omnimux-assets')
      assert.equal(payload.kind, 'asset')
      assert.equal(payload.entityId, 'ast_123')
      assert.equal(payload.title, '赛博朋克主角')
      assert.equal(payload.extension, 'PNG')
      assert.equal(payload.relativePath, 'images/hero.png')
      assert.match(payload.previewUrl, /\/omnimux\/assets\/library\/preview\?id=ast_123&file=fil_1/)
      assert.deepEqual(payload.metadata, {
        asset_id: 'ast_123',
        type: 'character',
        files: asset.files,
      })
    })

    it('handles asset without name and falls back to default title', () => {
      const payload = buildAssetPayload({ id: 'ast_noname', files: [] })
      assert.ok(payload)
      assert.equal(payload.title, '资产')
      assert.equal(payload.extension, 'ASSET')
    })

    it('returns null for null or missing id asset', () => {
      assert.equal(buildAssetPayload(null), null)
      assert.equal(buildAssetPayload({}), null)
    })
  })

  describe('addAssetToConversation', () => {
    it('reveals conversation column, invokes store.addAttachment, and dispatches CustomEvent', () => {
      let collapsedState = null
      let focusMode = null
      let storeSessionId = null
      let storePayload = null
      let dispatchedEvent = null

      const fakeWorkbench = {
        setConversationCollapsed: (c) => { collapsedState = c },
        setFocus: (f) => { focusMode = f },
      }

      const fakeAttachmentsStore = {
        addAttachment: (sessionId, payload) => {
          storeSessionId = sessionId
          storePayload = payload
          return { ok: true }
        },
      }

      class FakeCustomEvent {
        constructor(type, init) {
          this.type = type
          this.detail = init?.detail
        }
      }

      const fakeWindow = {
        __omnimuxWorkbench: fakeWorkbench,
        __omnimuxAttachments: fakeAttachmentsStore,
        dispatchEvent: (evt) => {
          dispatchedEvent = evt
          return true
        },
      }

      const asset = {
        id: 'ast_456',
        name: '科幻飞船',
        type: 'prop',
        files: [{ id: 'f_ship', kind: 'image', name: 'ship.webp' }],
      }

      const res = addAssetToConversation(asset, {
        window: fakeWindow,
        CustomEvent: FakeCustomEvent,
      })

      assert.equal(res.ok, true)
      assert.equal(collapsedState, false)
      assert.equal(focusMode, 'split')
      assert.equal(storeSessionId, '')
      assert.ok(storePayload)
      assert.equal(storePayload.entityId, 'ast_456')
      assert.equal(storePayload.title, '科幻飞船')
      assert.equal(storePayload.extension, 'WEBP')
      assert.ok(dispatchedEvent)
      assert.equal(dispatchedEvent.type, 'omnimux:add-to-conversation')
      assert.equal(dispatchedEvent.detail.entityId, 'ast_456')
    })

    it('survives throwing workbench, store, or event dispatch errors gracefully', () => {
      const brokenWindow = {
        __omnimuxWorkbench: {
          setConversationCollapsed: () => { throw new Error('collapsed boom') },
          setFocus: () => { throw new Error('focus boom') },
        },
        __omnimuxAttachments: {
          addAttachment: () => { throw new Error('store boom') },
        },
        dispatchEvent: () => { throw new Error('dispatch boom') },
      }
      const res = addAssetToConversation({ id: 'ast_err', name: 'Fault Tolerant' }, { window: brokenWindow })
      assert.equal(res.ok, true)
      assert.equal(res.payload.entityId, 'ast_err')
    })

    it('returns error if asset has no id', () => {
      const res = addAssetToConversation({}, { window: {} })
      assert.equal(res.ok, false)
      assert.equal(res.error, 'no-asset')
    })
  })
})
