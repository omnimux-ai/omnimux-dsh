/**
 * T05 gate for G6 — one assertion set that covers all four red lines.
 *
 * The attachment store and the workbench are stubs that *record* every call, so
 * "the tab was not closed", "the canvas was not touched", "nothing was sent" and
 * "the URL was not built from a filesystem path" are assertions about what was
 * called rather than readings of the source.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  addRivalPostToSession,
  attachFailureKey,
  buildRivalAttachmentPayload,
  isAddToChatBusy,
  localMediaPath,
  resetAddToChatLock,
  revealConversation,
  runExclusive,
} from './rival-add-to-chat.js'

/**
 * A window stub whose attachment store and workbench record every interaction.
 */
function makeWindow(attachResult = { ok: true }) {
  const calls = { attachments: [], workbench: [], tabs: [], canvas: [], drafts: [], sends: [] }
  const win = {
    calls,
    __omnimuxAttachments: {
      addAttachment(sessionId, payload) {
        calls.attachments.push({ sessionId, payload })
        return attachResult
      },
    },
    __omnimuxWorkbench: {
      setConversationCollapsed(next) { calls.workbench.push(['setConversationCollapsed', next]) },
      setFocus(mode) { calls.workbench.push(['setFocus', mode]) },
      // The red lines: these exist on the real object and must never be called.
      closeTab(...args) { calls.tabs.push(args) },
      setCanvasVisible(...args) { calls.canvas.push(['setCanvasVisible', ...args]) },
      setCanvasLayout(...args) { calls.canvas.push(['setCanvasLayout', ...args]) },
      createProject(...args) { calls.canvas.push(['createProject', ...args]) },
      setDraft(...args) { calls.drafts.push(args) },
      sendMessage(...args) { calls.sends.push(args) },
    },
  }
  return win
}

const ACCOUNT = { id: 'riv_1', platform: 'tiktok', handle: '@foo' }
const POST = {
  id: '7321234567890123456',
  title: 'Kitchen hack',
  text: 'three tools you already own',
  url: 'https://www.tiktok.com/@foo/video/7321234567890123456',
  duration: 31,
  cover_local_path: '/home/u/.dsh/omnimux/inspirations/media/rival-accounts/covers/rival-abcd1234.jpg',
  cover_http_url: '/omnimux/inspiration/local/media/rival-accounts/covers/rival-abcd1234.jpg',
  video_local_path: null,
  stats: { views: 5000, likes: 400, comments: 30, shares: 10, saves: null },
}

beforeEach(() => {
  resetAddToChatLock()
})

describe('G6: the attachment payload contract', () => {
  it('uses the new rival_post kind and the post id as the entity', () => {
    const payload = buildRivalAttachmentPayload(POST, {
      localPath: POST.cover_local_path,
      httpUrl: POST.cover_http_url,
      kind: 'cover',
    }, ACCOUNT)
    assert.equal(payload.kind, 'rival_post')
    assert.equal(payload.sourcePlugin, 'omnimux-inspiration')
    assert.equal(payload.entityId, POST.id)
    assert.equal(payload.extension, 'JPG')
    assert.equal(payload.metadata.rival_post_id, POST.id)
    assert.equal(payload.metadata.rival_account_id, ACCOUNT.id)
    assert.equal(payload.metadata.platform, 'tiktok')
    assert.deepEqual(payload.metadata.stats, POST.stats)
    assert.equal(payload.metadata.source_url, POST.url)
  })

  it('points relativePath at a real file and previewUrl at the Host route', () => {
    const payload = buildRivalAttachmentPayload(POST, {
      localPath: POST.cover_local_path,
      httpUrl: POST.cover_http_url,
      kind: 'cover',
    }, ACCOUNT)
    assert.equal(payload.relativePath, POST.cover_local_path)
    assert.equal(payload.previewUrl, POST.cover_http_url)
    // The renderer's URL never comes from the filesystem path.
    assert.equal(payload.previewUrl.includes('/home/'), false)
    assert.equal(payload.previewUrl.startsWith('/omnimux/inspiration/local/media/'), true)
  })

  it('marks a video payload with MP4 and its duration', () => {
    const payload = buildRivalAttachmentPayload(
      { ...POST, video_local_path: '/home/u/media/rival-accounts/videos/rival-abcd1234.mp4' },
      { localPath: '/home/u/media/rival-accounts/videos/rival-abcd1234.mp4', httpUrl: POST.cover_http_url, kind: 'video', duration: 31 },
      ACCOUNT,
    )
    assert.equal(payload.extension, 'MP4')
    assert.equal(payload.duration, 31)
    assert.equal(payload.metadata.media_mode, 'video')
  })

  it('omits duration for a cover payload', () => {
    const payload = buildRivalAttachmentPayload(POST, { localPath: '/x.jpg', httpUrl: '/m/x.jpg', kind: 'cover' }, ACCOUNT)
    assert.equal('duration' in payload, false)
  })

  it('is stable for the same post, so the store fingerprint dedupes it', () => {
    const one = buildRivalAttachmentPayload(POST, { localPath: '/a.jpg', httpUrl: '/m/a.jpg', kind: 'cover' }, ACCOUNT)
    const two = buildRivalAttachmentPayload(POST, { localPath: '/a.jpg', httpUrl: '/m/a.jpg', kind: 'cover' }, ACCOUNT)
    const fingerprint = (payload) => [payload.sourcePlugin, payload.kind, payload.entityId, payload.relativePath].join('::')
    assert.equal(fingerprint(one), fingerprint(two))
    // ... and differs from the "convert to inspiration" attachment of the same
    // post, which is the whole reason for a separate kind.
    const inspirationFingerprint = ['omnimux-inspiration', 'inspiration', POST.id, '/a.jpg'].join('::')
    assert.notEqual(fingerprint(one), inspirationFingerprint)
  })
})

describe('G6: mounting into the active session', () => {
  it('mounts through addAttachment with an empty session id', async () => {
    const win = makeWindow()
    const result = await addRivalPostToSession(POST, ACCOUNT, { window: win })
    assert.equal(result.ok, true)
    assert.equal(win.calls.attachments.length, 1)
    assert.equal(win.calls.attachments[0].sessionId, '')
    assert.equal(win.calls.attachments[0].payload.kind, 'rival_post')
  })

  it('never closes a tab, never touches the canvas, never sends', async () => {
    const win = makeWindow()
    await addRivalPostToSession(POST, ACCOUNT, { window: win })
    assert.deepEqual(win.calls.tabs, [])
    assert.deepEqual(win.calls.canvas, [])
    assert.deepEqual(win.calls.drafts, [])
    assert.deepEqual(win.calls.sends, [])
  })

  it('reveals the conversation column with uncollapse + split only', async () => {
    const win = makeWindow()
    await addRivalPostToSession(POST, ACCOUNT, { window: win })
    const methods = win.calls.workbench.map(([name]) => name).sort()
    assert.deepEqual(methods, ['setConversationCollapsed', 'setFocus'])
    assert.deepEqual(win.calls.workbench.find(([name]) => name === 'setConversationCollapsed'), ['setConversationCollapsed', false])
    assert.deepEqual(win.calls.workbench.find(([name]) => name === 'setFocus'), ['setFocus', 'split'])
  })

  it('downloads the cover first when no local file exists', async () => {
    const win = makeWindow()
    const calls = []
    const result = await addRivalPostToSession({ ...POST, cover_local_path: null }, ACCOUNT, {
      window: win,
      ensureMedia: async (accountId, postId, kind) => {
        calls.push({ accountId, postId, kind })
        return { ok: true, body: { data: { absolute_path: '/tmp/c.jpg', http_url: '/m/c.jpg', kind: 'cover', extension: 'JPG' } } }
      },
    })
    assert.deepEqual(calls, [{ accountId: 'riv_1', postId: POST.id, kind: 'cover' }])
    assert.equal(result.ok, true)
    assert.equal(result.attachment.relativePath, '/tmp/c.jpg')
    assert.equal(result.attachment.previewUrl, '/m/c.jpg')
  })

  it('reuses a local file instead of calling the Host again', async () => {
    const win = makeWindow()
    let called = false
    const result = await addRivalPostToSession(POST, ACCOUNT, {
      window: win,
      ensureMedia: async () => { called = true; return { ok: false } },
    })
    assert.equal(result.ok, true)
    assert.equal(called, false)
    assert.equal(result.attachment.relativePath, POST.cover_local_path)
  })

  it('prefers the video only when asked and only when it is on disk', async () => {
    const win = makeWindow()
    const videoPost = { ...POST, video_local_path: '/v/x.mp4' }
    const result = await addRivalPostToSession(videoPost, ACCOUNT, { window: win, preferVideo: true })
    assert.equal(result.attachment.extension, 'MP4')
    assert.equal(result.attachment.relativePath, '/v/x.mp4')
    const coverResult = await addRivalPostToSession(videoPost, ACCOUNT, { window: win, preferVideo: false })
    assert.equal(coverResult.attachment.extension, 'JPG')
  })

  it('reports a duplicate without revealing the conversation again', async () => {
    const win = makeWindow({ ok: false, reason: 'duplicate' })
    const result = await addRivalPostToSession(POST, ACCOUNT, { window: win })
    assert.equal(result.ok, false)
    assert.equal(result.key, 'rivalAccounts.post.alreadyInChat')
    assert.deepEqual(win.calls.workbench, [])
  })

  it('reports the eight-attachment ceiling', async () => {
    const win = makeWindow({ ok: false, reason: 'quota-exceeded' })
    const result = await addRivalPostToSession(POST, ACCOUNT, { window: win })
    assert.equal(result.key, 'rivalAccounts.post.attachFull')
    assert.deepEqual(win.calls.workbench, [])
  })

  it('maps every refusal reason to a locale key', () => {
    assert.equal(attachFailureKey('duplicate'), 'rivalAccounts.post.alreadyInChat')
    assert.equal(attachFailureKey('quota-exceeded'), 'rivalAccounts.post.attachFull')
    assert.equal(attachFailureKey('attach-full'), 'rivalAccounts.post.attachFull')
    assert.equal(attachFailureKey('invalid-payload'), 'rivalAccounts.post.attachFailed')
    assert.equal(attachFailureKey(undefined), 'rivalAccounts.post.attachFailed')
  })

  it('tells the user to convert instead when the post has no media', async () => {
    const win = makeWindow()
    const result = await addRivalPostToSession({ ...POST, cover_local_path: null }, ACCOUNT, {
      window: win,
      ensureMedia: async () => ({ ok: false, status: 409, body: { code: 'no-media' } }),
    })
    assert.equal(result.ok, false)
    assert.equal(result.key, 'rivalAccounts.post.noMedia')
    assert.deepEqual(win.calls.attachments, [])
    assert.deepEqual(win.calls.workbench, [])
  })

  it('reports a media download failure without mounting anything', async () => {
    const win = makeWindow()
    const result = await addRivalPostToSession({ ...POST, cover_local_path: null }, ACCOUNT, {
      window: win,
      ensureMedia: async () => { throw new Error('network down') },
    })
    assert.equal(result.ok, false)
    assert.equal(result.key, 'rivalAccounts.post.attachFailed')
    assert.deepEqual(win.calls.attachments, [])
  })

  it('refuses a second click while the first is still running', async () => {
    const win = makeWindow()
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const first = addRivalPostToSession(POST, ACCOUNT, {
      window: win,
      ensureMedia: async () => {
        await gate
        return { ok: true, body: { data: { absolute_path: '/tmp/c.jpg', http_url: '/m/c.jpg', kind: 'cover' } } }
      },
    })
    await Promise.resolve()
    assert.equal(isAddToChatBusy(), true)
    const second = await addRivalPostToSession(POST, ACCOUNT, { window: win, ensureMedia: async () => ({ ok: true, body: { data: { absolute_path: '/x.jpg' } } }) })
    assert.deepEqual(second, { ok: false, error: 'busy' })
    release()
    await first
    assert.equal(win.calls.attachments.length, 1)
  })

  it('keeps a failed run from leaving the lock held', async () => {
    const win = makeWindow()
    await addRivalPostToSession(POST, ACCOUNT, { window: win, ensureMedia: async () => { throw new Error('x') } })
    assert.equal(isAddToChatBusy(), false)
  })
})

describe('G6: helpers', () => {
  it('resolves the local media path per kind', () => {
    assert.equal(localMediaPath(POST, 'cover'), POST.cover_local_path)
    assert.equal(localMediaPath(POST, 'video'), '')
    assert.equal(localMediaPath(null, 'cover'), '')
  })

  it('ignores a reveal failure on a missing workbench', () => {
    assert.doesNotThrow(() => revealConversation(undefined))
    assert.doesNotThrow(() => revealConversation({ setConversationCollapsed: () => { throw new Error('x') } }))
  })

  it('serializes exclusive work', async () => {
    const order = []
    const first = runExclusive(async () => { order.push(1); return 'a' })
    const second = await runExclusive(async () => { order.push(2); return 'b' })
    assert.deepEqual(second, { ok: false, error: 'busy' })
    assert.equal(await first, 'a')
    assert.deepEqual(order, [1])
  })
})
