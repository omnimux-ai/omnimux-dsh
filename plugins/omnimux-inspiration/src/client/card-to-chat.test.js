import assert from 'node:assert/strict'
import { it } from 'node:test'
import { addCardToSession, buildCardDocument, cardFileName } from './card-to-chat.js'
import { runExclusive } from './collection-to-chat.js'

/**
 * Unit contract for adding one library card to the current conversation
 * (Issue 3502): one Markdown attachment through the official composer intake,
 * never a send, never a draft write, and an explicit error key for every abort.
 */

const zhTable = new Map(Object.entries({
  'card.session.docHeading': '灵感卡片：{title}',
  'card.session.docSourceLine': '来源：OmniMux 灵感库',
  'card.session.docIdLine': '卡片 ID：{id}',
  'card.session.docPlatform': '平台：{platform}',
  'card.session.docType': '类型：{type}',
  'card.session.docTime': '时间：{time}',
  'card.session.docViews': '播放量：{views}',
  'card.session.docDuration': '时长（秒）：{duration}',
  'card.session.docSourceUrl': '来源链接：{url}',
  'card.session.docMedia': '媒体地址：{url}',
  'card.session.docBody': '正文/说明：',
  'card.session.docRead': '使用 inspiration_get 按上述卡片 ID 读取完整信息。',
}))
const t = (key) => zhTable.get(key) || key

const ROW = {
  id: 'card_1',
  title: '竖屏口播：三秒钩子',
  content: '竖屏口播：三秒钩子',
  source_platform: 'tiktok',
  type: 'video',
  duration: 32,
  stats: { views: 128000 },
  source_url: 'https://example.com/v/1',
  cover_url: '/omnimux/inspiration/local/media/covers/c1.png',
  created_at: '2026-10-17T08:00:00.000Z',
}

function recordingFiles(existing = []) {
  const state = { added: [], files: existing }
  return {
    state,
    api: {
      list: () => state.files,
      add: async (files) => {
        state.added = state.added.concat(files)
        return { ok: true }
      },
    },
  }
}

it('builds one Markdown card with the sourced facts and the read instruction', () => {
  const doc = buildCardDocument({ row: ROW, t })
  assert.match(doc, /^# 灵感卡片：竖屏口播：三秒钩子/m)
  assert.match(doc, /卡片 ID：card_1/)
  assert.match(doc, /平台：tiktok/)
  assert.match(doc, /类型：video/)
  assert.match(doc, /播放量：128000/)
  assert.match(doc, /时长（秒）：32/)
  assert.match(doc, /来源链接：https:\/\/example\.com\/v\/1/)
  assert.match(doc, /媒体地址：\/omnimux\/inspiration\/local\/media\/covers\/c1\.png/)
  assert.match(doc, /inspiration_get/)
})

it('omits missing facts instead of inventing them', () => {
  const doc = buildCardDocument({ row: { id: 'bare', title: '只有标题' }, t })
  assert.match(doc, /卡片 ID：bare/)
  assert.doesNotMatch(doc, /平台：/)
  assert.doesNotMatch(doc, /播放量：/)
  assert.doesNotMatch(doc, /时长（秒）：/)
  assert.doesNotMatch(doc, /来源链接：/)
})

it('sanitises the attachment file name', () => {
  assert.equal(cardFileName(ROW), '竖屏口播：三秒钩子 · 灵感卡-card_1.md')
  assert.equal(cardFileName({ id: 'x1', title: 'a/b\\c:d*e?f"g<h>i|j' }), 'a-b-c-d-e-f-g-h-i-j · 灵感卡-x1.md')
  assert.equal(cardFileName({ id: 'x1' }), '灵感卡片 · 灵感卡-x1.md')
  // Same title, different cards must not collide — the id keeps the name unique.
  assert.notEqual(cardFileName({ id: 'a1', title: '同名' }), cardFileName({ id: 'b2', title: '同名' }))
})

it('refuses to add without a session', async () => {
  const files = recordingFiles()
  const result = await addCardToSession(ROW, { t, sessionId: '', nativeFiles: files.api, reveal() {} })
  assert.deepEqual(result, { ok: false, errorKey: 'card.sessionNoSession', code: 'no-session' })
  assert.equal(files.state.added.length, 0)
})

it('mounts exactly one Markdown attachment on the current composer', async () => {
  const files = recordingFiles()
  let revealed = 0
  const result = await addCardToSession(ROW, {
    t,
    sessionId: 'sess-1',
    nativeFiles: files.api,
    reveal() { revealed += 1 },
  })
  assert.equal(result.ok, true)
  assert.equal(revealed, 1, 'the conversation is revealed only after the mount')
  assert.equal(files.state.added.length, 1)
  assert.equal(files.state.added[0].name, '竖屏口播：三秒钩子 · 灵感卡-card_1.md')
  assert.equal(files.state.added[0].type, 'text/markdown')
})

it('reports a duplicate instead of mounting the same card twice', async () => {
  const files = recordingFiles(['竖屏口播：三秒钩子 · 灵感卡-card_1.md'])
  const result = await addCardToSession(ROW, { t, sessionId: 'sess-1', nativeFiles: files.api, reveal() {} })
  assert.deepEqual(result, { ok: true, duplicate: true })
  assert.equal(files.state.added.length, 0)
})

it('returns an explicit error key when the composer refuses the file', async () => {
  const result = await addCardToSession(ROW, {
    t,
    sessionId: 'sess-1',
    nativeFiles: { list: () => [], add: async () => ({ ok: false, message: 'attach-full' }) },
    reveal() {},
  })
  assert.equal(result.ok, false)
  assert.equal(result.errorKey, 'card.sessionFailed')
  assert.equal(result.detail, 'attach-full')
})

it('returns an explicit error key when there is no composer intake', async () => {
  const result = await addCardToSession(ROW, { t, sessionId: 'sess-1', nativeFiles: null, reveal() {} })
  assert.equal(result.ok, false)
  assert.equal(result.errorKey, 'card.sessionUnavailable')
})

it('maps the shared composer lock to the card copy', async () => {
  // Collection and card adds share one composer lock; a concurrent card add must
  // answer with the card key, not the collection copy.
  let release = () => {}
  const held = runExclusive(() => new Promise((resolve) => { release = () => resolve({ ok: true }) }))
  const result = await addCardToSession(ROW, { t, sessionId: 'sess-1', reveal() {}, nativeFiles: { list: () => [], add: async () => ({ ok: true }) } })
  assert.deepEqual(result, { ok: false, errorKey: 'card.sessionBusy', code: 'busy' })
  release()
  await held
})
