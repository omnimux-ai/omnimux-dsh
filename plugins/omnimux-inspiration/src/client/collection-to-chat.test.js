import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { en, zh } from './locales.js'
import {
  addCollectionToSession,
  buildCollectionDocument,
  collectionFileName,
  isCollectionAddBusy,
  resetCollectionAddLock,
  resolveActiveSessionId,
} from './collection-to-chat.js'

const zhTable = new Map(Object.entries(zh))
const enTable = new Map(Object.entries(en))
const zhT = key => zhTable.get(key) || key
const enT = key => enTable.get(key) || key

const COLLECTION = { id: 'col_1', title: '夏日护肤' }
const ITEMS = [
  { id: 'insp_1', title: 'A', source_platform: 'tiktok', type: 'video' },
  { id: 'insp_2', title: 'B', source_platform: 'douyin', type: 'image' },
]
const MEMBERS = { ok: true, status: 200, body: { data: { items: ITEMS, total: 2 } } }

function makeFile(content, name) {
  return new File([content], name, { type: 'text/markdown' })
}

/** A window whose workbench/attachments record every call, so "nothing was sent" is measurable. */
function makeWindow(snapshotSessionId, attachmentSessionId) {
  const calls = []
  const windowObject = {
    navigator: { language: 'zh-CN' },
    calls,
    __omnimuxWorkbench: {
      getSnapshot() {
        return { sessionId: snapshotSessionId }
      },
      setConversationCollapsed(next) {
        calls.push(['setConversationCollapsed', next])
      },
      setFocus(mode) {
        calls.push(['setFocus', mode])
      },
      setDraft() {
        calls.push(['setDraft'])
      },
      sendMessage() {
        calls.push(['sendMessage'])
      },
    },
    __omnimuxAttachments: {
      getActiveSessionId() {
        return attachmentSessionId
      },
    },
  }
  return windowObject
}

function makeComposerFiles() {
  const added = []
  const names = []
  return {
    added,
    names,
    async add(files) {
      added.push(files)
      return { ok: true }
    },
    list() {
      return names.slice()
    },
  }
}

/** Standard injected io: native intake, member read and reveal are all recorded. */
function makeIo(overrides) {
  const reveals = []
  const reads = []
  const files = makeComposerFiles()
  const base = {
    window: makeWindow('sess-1', null),
    t: zhT,
    fetchCollectionItems: async filters => {
      reads.push(filters)
      return MEMBERS
    },
    nativeFiles: files,
    makeFile,
    reveal: () => reveals.push(1),
    reveals,
    reads,
    files,
  }
  return Object.assign(base, overrides)
}

afterEach(() => {
  resetCollectionAddLock()
})

describe('buildCollectionDocument', () => {
  it('marks the source, names the collection and lists every member id in zh', () => {
    const document = buildCollectionDocument({ collection: COLLECTION, items: ITEMS, total: 2, t: zhT })
    assert.match(document, /# 灵感库合集：夏日护肤/)
    assert.match(document, /OmniMux 灵感库 · 本地合集/, '来源标注必须出现')
    assert.match(document, /合集 ID：col_1/)
    assert.match(document, /成员条数：2/)
    assert.match(document, /1\. A（成员 id：insp_1；平台：tiktok；类型：video）/)
    assert.match(document, /2\. B（成员 id：insp_2；平台：douyin；类型：image）/)
    assert.match(document, /inspiration_get/)
    assert.match(document, /正文\/脚本/)
    assert.equal(document.includes('问题：'), false, '文件里不留问题占位，提问在输入框')
  })

  it('produces the English source label and read instruction', () => {
    const document = buildCollectionDocument({ collection: COLLECTION, items: ITEMS, total: 2, t: enT })
    assert.match(document, /# Inspiration collection: 夏日护肤/)
    assert.match(document, /OmniMux inspiration library · local collection/)
    assert.match(document, /Collection ID: col_1/)
    assert.match(document, /Members: 2/)
    assert.match(document, /1\. A \(member id: insp_1; platform: tiktok; type: video\)/)
    assert.match(document, /one by one/)
  })

  it('reports the true total when the read is truncated', () => {
    const document = buildCollectionDocument({ collection: COLLECTION, items: ITEMS, total: 120, t: zhT })
    assert.match(document, /以上列出 2 条，合集共 120 条/)
  })

  it('omits platform/type markers a lean row does not carry', () => {
    const document = buildCollectionDocument({
      collection: COLLECTION,
      items: [{ id: 'insp_9', title: 'plain' }],
      total: 1,
      t: zhT,
    })
    assert.match(document, /1\. plain（成员 id：insp_9）/)
  })

  it('collapses line breaks and never re-expands user text tokens', () => {
    const document = buildCollectionDocument({
      collection: { id: 'col_1', title: '第一行\n第二行' },
      items: [{ id: 'insp_1', title: '标题 {id} 注入\r\n尾行' }],
      total: 1,
      t: zhT,
    })
    assert.match(document, /合集 ID：col_1/)
    assert.match(document, /1\. 标题 \{id\} 注入 尾行（成员 id：insp_1）/)
    assert.equal(document.split('\n').filter(line => line.startsWith('1. ')).length, 1)
  })
})

describe('collectionFileName', () => {
  it('names the file after the collection', () => {
    assert.equal(collectionFileName(COLLECTION), '夏日护肤 · 灵感库合集.md')
  })

  it('replaces characters that cannot survive a native file name', () => {
    assert.equal(collectionFileName({ id: 'c', title: 'a/b\\c:d*e?f"g<h>i|j' }), 'a-b-c-d-e-f-g-h-i-j · 灵感库合集.md')
  })

  it('trims long names and falls back to the id when the title is blank', () => {
    assert.equal(collectionFileName({ id: 'col_123456789', title: '  ' }), '灵感库合集-col_1234.md')
    const name = collectionFileName({ id: 'c', title: 'x'.repeat(120) })
    assert.ok(name.length < 120)
    assert.ok(name.endsWith(' · 灵感库合集.md'))
  })
})

describe('resolveActiveSessionId', () => {
  it('prefers the workbench snapshot and falls back to the attachment store', () => {
    assert.equal(resolveActiveSessionId(makeWindow('sess-workbench', 'sess-attach')), 'sess-workbench')
    assert.equal(resolveActiveSessionId(makeWindow(null, 'sess-attach')), 'sess-attach')
    assert.equal(resolveActiveSessionId(makeWindow(null, null)), '')
  })

  it('treats the unbound attachment sentinel as no session', () => {
    assert.equal(resolveActiveSessionId(makeWindow('', 'default')), '')
    assert.equal(resolveActiveSessionId(makeWindow('default', '__none__')), '')
    assert.equal(resolveActiveSessionId(makeWindow('default', 'sess-attach')), 'sess-attach')
  })
})

describe('addCollectionToSession', () => {
  it('mounts exactly one Markdown file through the native intake without touching the draft', async () => {
    const io = makeIo({})
    const result = await addCollectionToSession(COLLECTION, io)

    assert.deepEqual(result, { ok: true })
    assert.equal(io.reads.length, 1)
    assert.deepEqual(io.reads[0], { collection_id: 'col_1', page: 1, page_size: 100, projection: 'lean' })
    assert.equal(io.reveals.length, 1)
    assert.equal(io.files.added.length, 1)
    const files = io.files.added[0]
    assert.equal(files.length, 1)
    assert.equal(files[0].name, '夏日护肤 · 灵感库合集.md')
    assert.equal(files[0].type, 'text/markdown')
    const content = await files[0].text()
    assert.match(content, /# 灵感库合集：夏日护肤/)
    assert.match(content, /insp_1/)
    assert.match(content, /insp_2/)
    assert.equal(io.window.calls.filter(entry => entry[0] === 'setDraft').length, 0, '不得直接写输入框')
    assert.equal(io.window.calls.filter(entry => entry[0] === 'sendMessage').length, 0, '不得发送')
  })

  it('reveals the conversation before waiting for the member read', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const io = makeIo({
      fetchCollectionItems: async () => {
        await gate
        return MEMBERS
      },
    })
    const pending = addCollectionToSession(COLLECTION, io)
    await Promise.resolve()
    assert.equal(io.reveals.length, 1, '点击后必须立即展开会话栏，不等待成员读取')
    release()
    assert.deepEqual(await pending, { ok: true })
  })

  it('uses the official ensureConversationVisible entry when available', async () => {
    const calls = []
    const windowObject = makeWindow('sess-1', null)
    windowObject.__omnimuxWorkbench.ensureConversationVisible = options => calls.push({ kind: 'ensure', ...options })
    const io = makeIo({ window: windowObject, reveal: undefined })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: true })
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.ok(calls.length >= 1, '必须调用 ensureConversationVisible')
    assert.equal(Object.hasOwn(calls[0], 'sessionId'), false, 'ensure 不传 sessionId，保持分栏')
    assert.equal(windowObject.calls.filter(entry => entry[0] === 'setConversationCollapsed').length, 0, '有 ensure 时不应回退')
  })

  it('falls back to collapse + split when ensureConversationVisible is unavailable', async () => {
    const windowObject = makeWindow('sess-1', null)
    const io = makeIo({ window: windowObject, reveal: undefined })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: true })
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.ok(windowObject.calls.some(entry => entry[0] === 'setConversationCollapsed' && entry[1] === false))
    assert.ok(windowObject.calls.some(entry => entry[0] === 'setFocus' && entry[1] === 'split'))
  })

  it('waits for the tray bridge instead of racing the cold mount', async () => {
    const io = makeIo({
      nativeFiles: undefined,
      waitForFiles: async (windowObject, sessionId) => {
        assert.equal(sessionId, 'sess-1')
        assert.ok(windowObject)
        return makeComposerFiles()
      },
    })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: true })
  })

  it('reports an explicit error when the native intake is unavailable', async () => {
    const io = makeIo({ nativeFiles: undefined, waitForFiles: async () => null })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: false, errorKey: 'collection.attachmentUnavailable', code: 'no-native-files' })
    assert.equal(io.reveals.length, 1, '即使附件能力缺失，会话栏也已展开')
    assert.equal(io.reads.length, 0, '没有附件能力时不再读成员')
  })

  it('does not upload a second copy of an already attached collection', async () => {
    const files = makeComposerFiles()
    files.names.push('夏日护肤 · 灵感库合集.md')
    const io = makeIo({ nativeFiles: files })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: true, duplicate: true })
    assert.equal(io.reads.length, 0)
    assert.equal(files.added.length, 0)
  })

  it('maps the official intake error message to the attachment failure key', async () => {
    const io = makeIo({
      nativeFiles: {
        added: [],
        async add() {
          return { ok: false, message: '正在提交，暂时不能添加附件' }
        },
        list() {
          return []
        },
      },
    })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.equal(result.ok, false)
    assert.equal(result.errorKey, 'collection.attachmentFailed')
    assert.equal(result.code, 'add-failed')
    assert.equal(result.detail, '正在提交，暂时不能添加附件')
  })

  it('maps a throwing native intake to the attachment failure key', async () => {
    const io = makeIo({
      nativeFiles: {
        async add() {
          throw new Error('intake exploded')
        },
        list() {
          return []
        },
      },
    })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.equal(result.ok, false)
    assert.equal(result.errorKey, 'collection.attachmentFailed')
    assert.equal(result.code, 'add-failed')
  })

  it('uses the attachment-store session when the workbench snapshot is empty', async () => {
    const io = makeIo({ window: makeWindow(null, 'sess-attach') })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: true })
    assert.equal(io.files.added.length, 1)
  })

  it('refuses without a session and never reveals or reads', async () => {
    const io = makeIo({ window: makeWindow(null, null) })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.equal(result.ok, false)
    assert.equal(result.errorKey, 'collection.sessionNoSession')
    assert.equal(result.code, 'no-session')
    assert.equal(io.reveals.length, 0, '没有会话时不得展开空会话')
    assert.equal(io.reads.length, 0)
  })

  it('refuses a collection without an id before reading anything', async () => {
    const io = makeIo({})
    const result = await addCollectionToSession({ title: '无 id' }, io)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'invalid-collection')
    assert.equal(io.reads.length, 0)
  })

  it('honours an injected empty sessionId over the window', async () => {
    const io = makeIo({ sessionId: '' })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.equal(result.errorKey, 'collection.sessionNoSession')
  })

  it('maps a failed or rejected membership read to the fetch error key', async () => {
    const rejected = { ok: false, errorKey: 'collection.sessionFetchFailed', code: 'fetch-failed' }
    const failed = await addCollectionToSession(COLLECTION, makeIo({
      fetchCollectionItems: async () => ({ ok: false, status: 500, body: { error: 'boom' } }),
    }))
    assert.deepEqual(failed, rejected)

    resetCollectionAddLock()
    const thrown = await addCollectionToSession(COLLECTION, makeIo({
      fetchCollectionItems: async () => {
        throw new Error('offline')
      },
    }))
    assert.deepEqual(thrown, rejected)
  })

  it('reports an empty collection instead of mounting an empty file', async () => {
    const io = makeIo({
      fetchCollectionItems: async () => ({ ok: true, status: 200, body: { data: { items: [], total: 0 } } }),
    })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.equal(result.errorKey, 'collection.sessionEmpty')
    assert.equal(io.files.added.length, 0)
  })

  it('pages the membership into one document', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `insp_${index}`, title: `T${index}` }))
    const secondPage = Array.from({ length: 50 }, (_, index) => ({ id: `insp_${index + 100}`, title: `T${index + 100}` }))
    const pages = []
    const io = makeIo({
      fetchCollectionItems: async filters => {
        pages.push(filters.page)
        return filters.page === 1
          ? { ok: true, body: { data: { items: firstPage, total: 150 } } }
          : { ok: true, body: { data: { items: secondPage, total: 150 } } }
      },
    })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(pages, [1, 2])
    const content = await io.files.added[0][0].text()
    assert.match(content, /成员条数：150/)
    assert.match(content, /insp_149/)
    assert.equal(content.includes('其余成员未列出'), false)
  })

  it('keeps the total honest when the page cap truncates the list', async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ id: `insp_${index}`, title: `T${index}` }))
    const pages = []
    const io = makeIo({
      fetchCollectionItems: async filters => {
        pages.push(filters.page)
        return { ok: true, body: { data: { items: page, total: 600 } } }
      },
    })
    const result = await addCollectionToSession(COLLECTION, io)
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(pages, [1, 2, 3, 4, 5])
    const content = await io.files.added[0][0].text()
    assert.match(content, /成员条数：600/)
    assert.match(content, /以上列出 500 条，合集共 600 条/)
  })

  it('asks the hub to reveal the attachment rail after a successful add', async () => {
    const revealed = []
    const windowObject = makeWindow('sess-1', null)
    windowObject.__omnimuxComposerActions = { revealAttachments: () => revealed.push(1) }
    const io = makeIo({ window: windowObject })
    assert.deepEqual(await addCollectionToSession(COLLECTION, io), { ok: true })
    assert.equal(revealed.length, 1)
  })

  it('refuses a concurrent add while the first is still running', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const first = addCollectionToSession(COLLECTION, makeIo({
      fetchCollectionItems: async () => {
        await gate
        return MEMBERS
      },
    }))
    await Promise.resolve()
    assert.equal(isCollectionAddBusy(), true)
    const second = await addCollectionToSession(COLLECTION, makeIo({}))
    assert.deepEqual(second, { ok: false, errorKey: 'collection.sessionBusy', code: 'busy' })
    release()
    assert.deepEqual(await first, { ok: true })
    assert.equal(isCollectionAddBusy(), false)
  })
})
