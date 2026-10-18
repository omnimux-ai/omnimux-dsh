import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { en, zh } from './locales.js'
import {
  addCollectionToSession,
  buildCollectionPrompt,
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

/** Standard injected io: members load, a session exists, prefill/reveal are recorded. */
function makeIo(overrides) {
  const prefills = []
  const reveals = []
  const base = {
    window: makeWindow('sess-1', null),
    t: zhT,
    fetchCollectionItems: async () => MEMBERS,
    prefill: async request => {
      prefills.push(request)
      return { ok: true }
    },
    reveal: () => reveals.push(1),
    prefills,
    reveals,
  }
  return Object.assign(base, overrides)
}

afterEach(() => {
  resetCollectionAddLock()
})

describe('buildCollectionPrompt', () => {
  it('marks the source, names the collection and lists every member id in zh', () => {
    const prompt = buildCollectionPrompt({ collection: COLLECTION, items: ITEMS, total: 2, t: zhT })
    assert.match(prompt, /OmniMux 灵感库 · 本地合集/, '来源标注必须出现')
    assert.match(prompt, /合集：夏日护肤/)
    assert.match(prompt, /合集 ID：col_1/)
    assert.match(prompt, /成员条数：2/)
    assert.match(prompt, /1\. A（成员 id：insp_1；平台：tiktok；类型：video）/)
    assert.match(prompt, /2\. B（成员 id：insp_2；平台：douyin；类型：image）/)
    assert.match(prompt, /inspiration_get/)
    assert.match(prompt, /逐条读取/)
    assert.match(prompt, /正文\/脚本/)
    assert.match(prompt, /本地媒体路径/)
    assert.ok(prompt.endsWith('问题：'), '草稿末尾必须留出用户提问的位置')
  })

  it('produces the English source label and read instruction', () => {
    const prompt = buildCollectionPrompt({ collection: COLLECTION, items: ITEMS, total: 2, t: enT })
    assert.match(prompt, /OmniMux inspiration library · local collection/)
    assert.match(prompt, /Collection: 夏日护肤/)
    assert.match(prompt, /Collection ID: col_1/)
    assert.match(prompt, /Members: 2/)
    assert.match(prompt, /1\. A \(member id: insp_1; platform: tiktok; type: video\)/)
    assert.match(prompt, /inspiration_get/)
    assert.match(prompt, /one by one/)
    assert.ok(prompt.endsWith('Question:'))
  })

  it('reports the true total when the read page is truncated', () => {
    const prompt = buildCollectionPrompt({ collection: COLLECTION, items: ITEMS, total: 120, t: zhT })
    assert.match(prompt, /以上列出 2 条，合集共 120 条/)
  })

  it('omits platform/type markers a lean row does not carry', () => {
    const prompt = buildCollectionPrompt({
      collection: COLLECTION,
      items: [{ id: 'insp_9', title: 'plain' }],
      total: 1,
      t: zhT,
    })
    assert.match(prompt, /1\. plain（成员 id：insp_9）/)
  })

  it('collapses line breaks and never re-expands user text tokens', () => {
    const prompt = buildCollectionPrompt({
      collection: { id: 'col_1', title: '第一行\n第二行' },
      items: [{ id: 'insp_1', title: '标题 {id} 注入\r\n尾行' }],
      total: 1,
      t: zhT,
    })
    assert.match(prompt, /合集：第一行 第二行/)
    assert.match(prompt, /1\. 标题 \{id\} 注入 尾行（成员 id：insp_1）/)
    assert.equal(prompt.split('\n').filter(line => line.startsWith('1. ')).length, 1)
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
  it('reads the full lean membership and reveals + prefills the current session without sending', async () => {
    const windowObject = makeWindow('sess-1', null)
    const reads = []
    const prefills = []
    const reveals = []
    const result = await addCollectionToSession(COLLECTION, {
      window: windowObject,
      t: zhT,
      fetchCollectionItems: async filters => {
        reads.push(filters)
        return MEMBERS
      },
      reveal: () => reveals.push(1),
      prefill: async request => {
        prefills.push(request)
        assert.deepEqual(request.attach(), { ok: true })
        return { ok: true }
      },
    })

    assert.deepEqual(result, { ok: true })
    assert.equal(reads.length, 1)
    assert.deepEqual(reads[0], { collection_id: 'col_1', page: 1, page_size: 100, projection: 'lean' })
    assert.equal(reveals.length, 1)
    assert.equal(prefills.length, 1)
    assert.equal(prefills[0].targetSessionId, 'sess-1')
    assert.equal(prefills[0].mode, 'append', '必须使用 append 模式保留用户已有草稿/附件')
    assert.match(prefills[0].prompt, /夏日护肤/)
    assert.match(prefills[0].prompt, /insp_1/)
    assert.equal(windowObject.calls.filter(entry => entry[0] === 'setDraft').length, 0, '不得直接写输入框')
    assert.equal(windowObject.calls.filter(entry => entry[0] === 'sendMessage').length, 0, '不得发送')
  })

  it('uncollapses the conversation column with split focus by default', async () => {
    const windowObject = makeWindow('sess-1', null)
    const result = await addCollectionToSession(COLLECTION, {
      window: windowObject,
      t: zhT,
      fetchCollectionItems: async () => MEMBERS,
      prefill: async () => ({ ok: true }),
    })
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(windowObject.calls, [['setConversationCollapsed', false], ['setFocus', 'split']])
  })

  it('uses the attachment-store session when the workbench snapshot is empty', async () => {
    const windowObject = makeWindow(null, 'sess-attach')
    const prefills = []
    const result = await addCollectionToSession(COLLECTION, {
      window: windowObject,
      t: zhT,
      fetchCollectionItems: async () => MEMBERS,
      reveal: () => {},
      prefill: async request => {
        prefills.push(request)
        return { ok: true }
      },
    })
    assert.deepEqual(result, { ok: true })
    assert.equal(prefills[0].targetSessionId, 'sess-attach')
  })

  it('refuses without a session and never prefills or reveals', async () => {
    const prefills = []
    const reveals = []
    const result = await addCollectionToSession(COLLECTION, {
      window: makeWindow(null, null),
      t: zhT,
      fetchCollectionItems: async () => MEMBERS,
      reveal: () => reveals.push(1),
      prefill: async request => {
        prefills.push(request)
        return { ok: true }
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.errorKey, 'collection.sessionNoSession')
    assert.equal(result.code, 'no-session')
    assert.equal(prefills.length, 0)
    assert.equal(reveals.length, 0, '没有会话时不得展开空会话')
  })

  it('reports the no-session key when the attachment store only has its unbound sentinel', async () => {
    const prefills = []
    const reveals = []
    const result = await addCollectionToSession(COLLECTION, {
      window: makeWindow('', 'default'),
      t: zhT,
      fetchCollectionItems: async () => MEMBERS,
      reveal: () => reveals.push(1),
      prefill: async request => {
        prefills.push(request)
        return { ok: true }
      },
    })
    assert.equal(result.errorKey, 'collection.sessionNoSession')
    assert.equal(result.code, 'no-session')
    assert.equal(reveals.length, 0, '未绑定会话时不得先展开会话栏')
    assert.equal(prefills.length, 0)
  })

  it('refuses a collection without an id before reading anything', async () => {
    let reads = 0
    const result = await addCollectionToSession({ title: '无 id' }, {
      window: makeWindow('sess-1', null),
      t: zhT,
      fetchCollectionItems: async () => {
        reads += 1
        return MEMBERS
      },
      reveal: () => undefined,
      prefill: async () => ({ ok: true }),
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'invalid-collection')
    assert.equal(reads, 0)
  })

  it('honours an injected empty sessionId over the window', async () => {
    const result = await addCollectionToSession(COLLECTION, {
      window: makeWindow('sess-1', null),
      sessionId: '',
      t: zhT,
      fetchCollectionItems: async () => MEMBERS,
      prefill: async () => ({ ok: true }),
      reveal: () => {},
    })
    assert.equal(result.errorKey, 'collection.sessionNoSession')
  })

  it('maps a failed or rejected membership read to the fetch error key', async () => {
    const rejected = { ok: false, errorKey: 'collection.sessionFetchFailed', code: 'fetch-failed' }
    const failed = await addCollectionToSession(COLLECTION, {
      window: makeWindow('sess-1', null),
      t: zhT,
      fetchCollectionItems: async () => ({ ok: false, status: 500, body: { error: 'boom' } }),
      prefill: async () => ({ ok: true }),
      reveal: () => {},
    })
    assert.deepEqual(failed, rejected)

    resetCollectionAddLock()
    const thrown = await addCollectionToSession(COLLECTION, {
      window: makeWindow('sess-1', null),
      t: zhT,
      fetchCollectionItems: async () => {
        throw new Error('offline')
      },
      prefill: async () => ({ ok: true }),
      reveal: () => {},
    })
    assert.deepEqual(thrown, rejected)
  })

  it('reports an empty collection instead of prefilling a fake success', async () => {
    const prefills = []
    const result = await addCollectionToSession(COLLECTION, {
      window: makeWindow('sess-1', null),
      t: zhT,
      fetchCollectionItems: async () => ({ ok: true, status: 200, body: { data: { items: [], total: 0 } } }),
      prefill: async request => {
        prefills.push(request)
        return { ok: true }
      },
      reveal: () => {},
    })
    assert.equal(result.errorKey, 'collection.sessionEmpty')
    assert.equal(prefills.length, 0)
  })

  it('maps prefill refusals to explicit error keys', async () => {
    const cases = [
      ['draft-protected', 'collection.sessionDraftProtected'],
      ['attach-full', 'collection.sessionFailed'],
      ['attach-failed', 'collection.sessionFailed'],
      ['composer-missing', 'collection.sessionFailed'],
      ['composer-busy', 'collection.sessionBusy'],
    ]
    for (const pair of cases) {
      resetCollectionAddLock()
      const result = await addCollectionToSession(COLLECTION, makeIo({
        prefill: async () => ({ ok: false, error: pair[0] }),
      }))
      assert.equal(result.ok, false, pair[0])
      assert.equal(result.errorKey, pair[1], pair[0])
      assert.equal(result.code, pair[0], pair[0])
    }
  })

  it('maps a throwing prefill seam to the generic failure key', async () => {
    const result = await addCollectionToSession(COLLECTION, makeIo({
      prefill: async () => {
        throw new Error('seam exploded')
      },
    }))
    assert.deepEqual(result, { ok: false, errorKey: 'collection.sessionFailed', code: 'prefill-failed' })
  })

  it('reveals the conversation before waiting for the member read', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const reveals = []
    const pending = addCollectionToSession(COLLECTION, {
      window: makeWindow('sess-1', null),
      t: zhT,
      fetchCollectionItems: async () => { await gate; return MEMBERS },
      reveal: () => reveals.push(1),
      prefill: async () => ({ ok: true }),
    })
    await Promise.resolve()
    assert.equal(reveals.length, 1, '点击后必须立即展开会话栏，不等待合集成员读取')
    release()
    assert.deepEqual(await pending, { ok: true })
  })

  it('uses the official ensureConversationVisible entry when available', async () => {
    const calls = []
    const windowObject = makeWindow('sess-1', null)
    windowObject.__omnimuxWorkbench.ensureConversationVisible = options => calls.push({ kind: 'ensure', ...options })
    const result = await addCollectionToSession(COLLECTION, {
      window: windowObject,
      t: zhT,
      fetchCollectionItems: async () => MEMBERS,
      prefill: async () => ({ ok: true }),
    })
    assert.deepEqual(result, { ok: true })
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.ok(calls.length >= 1, '必须调用 ensureConversationVisible')
    assert.equal(calls[0].kind, 'ensure')
    assert.equal(Object.hasOwn(calls[0], 'sessionId'), false, 'ensure 不传 sessionId，保持库与会话分栏而不是会话全屏')
    assert.equal(windowObject.calls.filter(entry => entry[0] === 'setConversationCollapsed').length, 0, '有 ensure 时不应回退到折叠键')
  })

  it('falls back to collapse + split when ensureConversationVisible is unavailable', async () => {
    const windowObject = makeWindow('sess-1', null)
    const result = await addCollectionToSession(COLLECTION, {
      window: windowObject,
      t: zhT,
      fetchCollectionItems: async () => MEMBERS,
      prefill: async () => ({ ok: true }),
    })
    assert.deepEqual(result, { ok: true })
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.ok(windowObject.calls.some(entry => entry[0] === 'setConversationCollapsed' && entry[1] === false))
    assert.ok(windowObject.calls.some(entry => entry[0] === 'setFocus' && entry[1] === 'split'))
  })

  it('refuses a concurrent add while the first is still running', async () => {
    let release
    const gate = new Promise(resolve => {
      release = resolve
    })
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
