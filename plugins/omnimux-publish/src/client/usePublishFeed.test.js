import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TAB_FILTER,
  matchesTab,
  matchesSearchQuery,
  filterRecord,
  compareRecords,
  buildCsvContent,
  exportCsv,
  executeSingleRetry,
  executeBatchRetry,
  executeBatchDeleteDrafts,
  executeDeleteDraft,
} from './usePublishFeed.js'

test('TAB_FILTER semantic freeze (#188)', () => {
  assert.equal(TAB_FILTER.all, 'submitted')
  assert.equal(TAB_FILTER.drafts, 'draft')
  assert.equal(TAB_FILTER.reviewing, 'reviewing')
  assert.equal(TAB_FILTER.published, 'published')
  assert.equal(TAB_FILTER.retry, 'failed')
})

test('matchesTab correctly filters records according to tab rules', () => {
  const draft = { status: 'draft', subtasks: [] }
  const submitted = { status: 'submitted', subtasks: [{ status: 'submitted' }] }
  const reviewing = { status: 'submitted', subtasks: [{ status: 'reviewing' }] }
  const published = { status: 'submitted', subtasks: [{ status: 'published' }] }
  const failed = { status: 'submitted', subtasks: [{ status: 'failed' }] }

  // tab: all
  assert.equal(matchesTab(draft, 'all'), false)
  assert.equal(matchesTab(submitted, 'all'), true)
  assert.equal(matchesTab(reviewing, 'all'), true)
  assert.equal(matchesTab(published, 'all'), true)
  assert.equal(matchesTab(failed, 'all'), true)

  // tab: drafts
  assert.equal(matchesTab(draft, 'drafts'), true)
  assert.equal(matchesTab(submitted, 'drafts'), false)

  // tab: reviewing
  assert.equal(matchesTab(reviewing, 'reviewing'), true)
  assert.equal(matchesTab(published, 'reviewing'), false)

  // tab: published
  assert.equal(matchesTab(published, 'published'), true)
  assert.equal(matchesTab(failed, 'published'), false)

  // tab: retry
  assert.equal(matchesTab(failed, 'retry'), true)
  assert.equal(matchesTab(published, 'retry'), false)
})

test('matchesSearchQuery tests title, description, and topics', () => {
  const rec = {
    title: 'Hello World',
    description: 'Special summer campaign',
    topics: ['AI', 'Tech'],
  }

  assert.equal(matchesSearchQuery(rec, ''), true)
  assert.equal(matchesSearchQuery(rec, 'hello'), true)
  assert.equal(matchesSearchQuery(rec, 'summer'), true)
  assert.equal(matchesSearchQuery(rec, 'tech'), true)
  assert.equal(matchesSearchQuery(rec, 'winter'), false)
})

test('filterRecord filters by tab, query, typeFilter and modeFilter', () => {
  const rec = {
    status: 'submitted',
    type: 'video',
    mode: 'instant',
    title: 'Demo Reel',
    subtasks: [{ status: 'published' }],
  }

  assert.equal(filterRecord(rec, { tab: 'all', q: '', typeFilter: '', modeFilter: '' }), true)
  assert.equal(filterRecord(rec, { tab: 'all', q: 'reel', typeFilter: 'video', modeFilter: 'instant' }), true)
  assert.equal(filterRecord(rec, { tab: 'all', q: '', typeFilter: 'image', modeFilter: '' }), false)
  assert.equal(filterRecord(rec, { tab: 'all', q: '', typeFilter: '', modeFilter: 'scheduled' }), false)
})

test('compareRecords handles all sort options', () => {
  const a = { id: '1', title: 'Alpha', created_at: '2026-08-01T00:00:00Z', submitted_at: '2026-08-01T00:00:00Z' }
  const b = { id: '2', title: 'Beta', created_at: '2026-08-02T00:00:00Z', submitted_at: '2026-08-02T00:00:00Z' }

  // recent (descending created/updated)
  assert.ok(compareRecords(a, b, 'recent') > 0)
  assert.ok(compareRecords(b, a, 'recent') < 0)

  // dateDesc (descending submitted)
  assert.ok(compareRecords(a, b, 'dateDesc') > 0)
  assert.ok(compareRecords(b, a, 'dateDesc') < 0)

  // dateAsc (ascending submitted)
  assert.ok(compareRecords(a, b, 'dateAsc') < 0)
  assert.ok(compareRecords(b, a, 'dateAsc') > 0)

  // title (alphabetical ascending)
  assert.ok(compareRecords(a, b, 'title') < 0)
  assert.ok(compareRecords(b, a, 'title') > 0)
})

test('buildCsvContent generates valid CSV string with BOM', () => {
  const records = [
    {
      id: 'rec_1',
      title: 'Post "1"',
      type: 'image',
      subtasks: [{ platform: 'xhs' }, { platform: 'douyin' }],
      submitted_at: '2026-08-20',
      status: 'submitted',
      mode: 'instant',
    },
  ]

  const csv = buildCsvContent(records)
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('ID,Title,Type,Platforms,Date,Status,Mode'))
  assert.ok(csv.includes('"rec_1"'))
  assert.ok(csv.includes('"Post ""1"""'))
  assert.ok(csv.includes('"xhs;douyin"'))
})

test('exportCsv warns when empty', () => {
  let toast = ''
  exportCsv([], (msg) => { toast = msg })
  assert.equal(toast, '当前无记录可导出')
})

test('executeSingleRetry triggers task retry and shows toast', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, status: 200 }), { status: 200 })
  try {
    let toast = ''
    let successCalled = false
    const rec = {
      id: 'rec_123',
      subtasks: [{ id: 'task_123', provider: 'tiktok_direct', platform: 'tiktok', account_id: 'acc_1', status: 'failed' }],
    }

    await executeSingleRetry(rec, (msg) => { toast = msg }, () => { successCalled = true })
    assert.equal(toast, '已下发重试')
    assert.equal(successCalled, true)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('executeBatchRetry retries all failed subtasks', async () => {
  const origFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) })
    return new Response(JSON.stringify({ ok: true, status: 200 }), { status: 200 })
  }
  try {
    let toast = ''
    let successCalled = false
    const records = [
      {
        id: 'rec_1',
        subtasks: [
          { id: 'task_1', provider: 'tiktok_direct', platform: 'tiktok', account_id: 'acc_1', status: 'failed' },
          { platform: 'douyin', account_id: 'acc_2', status: 'published' },
        ],
      },
      {
        id: 'rec_2',
        subtasks: [
          { id: 'task_2', provider: 'tiktok_direct', platform: 'tiktok', account_id: 'acc_3', status: 'failed' },
        ],
      },
    ]

    await executeBatchRetry(records, new Set(['rec_1', 'rec_2']), (msg) => { toast = msg }, () => { successCalled = true })
    assert.equal(toast, '已重试 2 个失败子任务')
    assert.equal(successCalled, true)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].body.task_id, 'task_1')
    assert.equal(calls[1].body.task_id, 'task_2')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('executeBatchDeleteDrafts deletes only drafts in selection', async () => {
  const origFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) })
    return new Response(JSON.stringify({ ok: true, status: 200 }), { status: 200 })
  }
  try {
    let toast = ''
    let successCalled = false
    const records = [
      { id: 'draft_1', status: 'draft' },
      { id: 'sub_2', status: 'submitted' },
      { id: 'draft_3', status: 'draft' },
    ]

    await executeBatchDeleteDrafts(records, new Set(['draft_1', 'sub_2', 'draft_3']), (msg) => { toast = msg }, () => { successCalled = true })
    assert.equal(toast, '已删除 2 条草稿')
    assert.equal(successCalled, true)
    assert.equal(calls.length, 2)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('retry excludes legacy sources and does not report a rejected request as success', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (_url, opts) => {
    calls.push(JSON.parse(opts.body))
    return new Response(JSON.stringify({ error: 'account-provider-mismatch' }), { status: 409 })
  }
  try {
    const legacy = { id: 'legacy', subtasks: [
      { id: 'z', provider: 'zernio', platform: 'tiktok', status: 'failed' },
      { id: 'unknown', platform: 'tiktok', status: 'failed' },
    ] }
    let success = 0
    const messages = []
    await executeSingleRetry(legacy, (message) => messages.push(message), () => success++)
    await executeBatchRetry([legacy], new Set(['legacy']), (message) => messages.push(message), () => success++)
    assert.equal(calls.length, 0)
    const official = { id: 'record', subtasks: [
      { id: 'official-task', provider: 'tiktok_direct', platform: 'tiktok', status: 'failed' },
    ] }
    await executeSingleRetry(official, (message) => messages.push(message), () => success++)
    await executeBatchRetry([official], new Set(['record']), (message) => messages.push(message), () => success++)
    assert.deepEqual(calls.map((call) => call.task_id), ['official-task', 'official-task'])
    assert.equal(success, 0)
    assert.equal(messages.length, 4)
    assert.ok(messages.slice(2).every((message) => message.includes('account-provider-mismatch')))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('executeDeleteDraft handles success and failure', async () => {
  const origFetch = globalThis.fetch
  try {
    // Success case
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, status: 200 }), { status: 200 })
    let toast = ''
    let successCalled = false
    await executeDeleteDraft({ id: 'draft_1' }, (k) => k, (msg) => { toast = msg }, () => { successCalled = true })
    assert.equal(toast, '已删除草稿')
    assert.equal(successCalled, true)

    // Failure case
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'draft-not-found' }), { status: 404 })
    let failToast = ''
    let failSuccess = false
    await executeDeleteDraft({ id: 'draft_2' }, (k, v) => `failed: ${v.reason}`, (msg) => { failToast = msg }, () => { failSuccess = true })
    assert.equal(failToast, 'failed: draft-not-found')
    assert.equal(failSuccess, false)
  } finally {
    globalThis.fetch = origFetch
  }
})
