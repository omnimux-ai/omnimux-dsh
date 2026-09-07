import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { aggregateStatus, createRecordStore, matchesStatusFilter, PublishError } from './store.js'
import { aggregateStatus as sharedAggregate, displayStatus } from './shared/record-status.js'

/** @type {string} */
let dir = ''
/** @type {ReturnType<typeof createRecordStore>} */
let store = ''
let tick = 0

function freshStore() {
  return createRecordStore({
    paths: { recordsFile: join(dir, 'records.json') },
    now: () => new Date(2026, 0, 1, 0, 0, ++tick).toISOString(),
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-publish-store-'))
  tick = 0
  store = freshStore()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function draftRecord(overrides = {}) {
  return store.create({
    type: 'image',
    title: '标题',
    description: '描述',
    topics: ['旅行'],
    media_ids: ['m1', 'm2'],
    account_ids: ['acc-1', 'acc-2'],
    ...overrides,
  })
}

describe('RecordStore persistence discipline', () => {
  it('writes records.json with 0600 inside a 0700 dir, atomically (no tmp leftovers)', () => {
    draftRecord()
    const file = join(dir, 'records.json')
    assert.ok(existsSync(file))
    assert.equal(statSync(dir).mode & 0o777, 0o700)
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.ok(!existsSync(`${file}.tmp`))
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(raw.schema, 1)
    assert.equal(raw.revision, 1)
    assert.equal(raw.records.length, 1)
  })

  it('reloads state from disk (revision and records survive)', () => {
    const view = draftRecord()
    const reloaded = freshStore()
    assert.equal(reloaded.revision(), 1)
    assert.equal(reloaded.getView(view.id).title, '标题')
  })
})

describe('draft CRUD', () => {
  it('creates a draft with normalized fields', () => {
    const view = store.create({ type: 'video', title: ' t ', topics: [' a ', '', 3], media_ids: ['m1'] })
    assert.match(view.id, /^rec_/)
    assert.equal(view.status, 'draft')
    assert.equal(view.title, 't')
    assert.deepEqual(view.topics, ['a'])
    assert.equal(view.aggregate, 'draft')
  })

  it('rejects invalid type', () => {
    assert.throws(() => store.create({ type: 'audio' }), (e) => e instanceof PublishError && e.code === 'invalid-arguments')
  })

  it('updates drafts and refuses to update submitted records', () => {
    const view = draftRecord()
    const updated = store.update(view.id, { title: '新标题' })
    assert.equal(updated.title, '新标题')
    store.materialize(view.id, [{ id: 'acc-1', platform: 'xiaohongshu' }, { id: 'acc-2', platform: 'douyin' }])
    assert.throws(
      () => store.update(view.id, { title: 'x' }),
      (e) => e instanceof PublishError && e.code === 'record-not-draft',
    )
  })

  it('delete requires draft status', () => {
    const view = draftRecord()
    assert.deepEqual(store.remove(view.id), { id: view.id, deleted: true })
    assert.equal(store.getView(view.id), null)
    const other = draftRecord()
    store.materialize(other.id, [{ id: 'acc-1', platform: 'xiaohongshu' }])
    assert.throws(() => store.remove(other.id), (e) => e.code === 'record-not-draft')
  })

  it('assignAccounts rejects duplicates', () => {
    const view = draftRecord()
    assert.throws(() => store.assignAccounts(view.id, ['a', 'a']), (e) => e.code === 'invalid-arguments')
    const assigned = store.assignAccounts(view.id, ['a', 'b'])
    assert.deepEqual(assigned.account_ids, ['a', 'b'])
  })
})

describe('submit materialization and the subtask ledger', () => {
  it('materializes one subtask per account and flips the record to submitted', () => {
    const view = draftRecord()
    const tasks = store.materialize(view.id, [
      { id: 'acc-1', platform: 'xiaohongshu' },
      { id: 'acc-2', platform: 'douyin' },
    ])
    assert.equal(tasks.length, 2)
    assert.deepEqual(tasks.map((t) => t.platform), ['xiaohongshu', 'douyin'])
    assert.ok(tasks.every((t) => t.status === 'submitting' && t.post_id === null))
    const after = store.getView(view.id)
    assert.equal(after.status, 'submitted')
    assert.notEqual(after.submitted_at, null)
  })

  it('taskId 即落盘：updateTask persists post_id and status transition', () => {
    const view = draftRecord()
    const [task] = store.materialize(view.id, [{ id: 'acc-1', platform: 'xiaohongshu' }])
    store.updateTask(task.id, { status: 'submitted', post_id: 12345, submitted_at: 't1' })
    const reloaded = freshStore() // 从磁盘重新加载验证「即落盘」
    const taskAfter = reloaded.getView(view.id).subtasks.find((t) => t.id === task.id)
    assert.equal(taskAfter.status, 'submitted')
    assert.equal(taskAfter.post_id, '12345') // number 归一为 string
  })

  it('findTaskAnywhere locates tasks across records', () => {
    const a = draftRecord()
    const b = store.create({ type: 'video', media_ids: ['m1'] })
    const [ta] = store.materialize(a.id, [{ id: 'acc-1', platform: 'xiaohongshu' }])
    const [tb] = store.materialize(b.id, [{ id: 'acc-2', platform: 'douyin' }])
    assert.equal(store.findTaskAnywhere(ta.id).record.id, a.id)
    assert.equal(store.findTaskAnywhere(tb.id).record.id, b.id)
    assert.throws(() => store.findTaskAnywhere('tsk_nope'), (e) => e.code === 'task-not-found')
  })
})

describe('中断恢复（recover）', () => {
  it('marks leftover submitting tasks as failed(interrupted) on load', () => {
    const view = draftRecord()
    const tasks = store.materialize(view.id, [{ id: 'acc-1', platform: 'xiaohongshu' }, { id: 'acc-2', platform: 'douyin' }])
    store.updateTask(tasks[0].id, { status: 'submitted', post_id: 'p1' })
    // tasks[1] 留在 submitting —— 模拟 Host 崩溃后重启
    const reloaded = freshStore()
    const touched = reloaded.recover()
    assert.equal(touched, true)
    const after = reloaded.getView(view.id)
    assert.equal(after.subtasks.find((t) => t.id === tasks[0].id).status, 'submitted')
    const interrupted = after.subtasks.find((t) => t.id === tasks[1].id)
    assert.equal(interrupted.status, 'failed')
    assert.equal(interrupted.error, 'interrupted')
  })

  it('recover is a no-op when nothing is in flight', () => {
    assert.equal(store.recover(), false)
  })
})

describe('三 tab 过滤与聚合状态', () => {
  function seed() {
    const draft = store.create({ type: 'image', title: '草稿', media_ids: ['m1'] })
    const reviewing = store.create({ type: 'image', title: '审核中', media_ids: ['m1'] })
    const tasksR = store.materialize(reviewing.id, [{ id: 'a1', platform: 'xiaohongshu' }])
    store.updateTask(tasksR[0].id, { status: 'submitted', post_id: 'p1' })
    store.updateTask(tasksR[0].id, { status: 'reviewing', raw_status: 'review' })

    const mixed = store.create({ type: 'video', title: '部分失败', media_ids: ['m2'] })
    const tasksM = store.materialize(mixed.id, [
      { id: 'a1', platform: 'douyin' },
      { id: 'a2', platform: 'kuaishou' },
    ])
    for (const [i, task] of tasksM.entries()) {
      store.updateTask(task.id, { status: 'submitted', post_id: `p${i + 2}` })
      store.updateTask(task.id, { status: i === 0 ? 'published' : 'failed' })
    }
    return { draft, reviewing, mixed }
  }

  it('draft filter returns only drafts (草稿箱)', () => {
    seed()
    const { records } = store.listViews({ status_filter: 'draft' })
    assert.equal(records.length, 1)
    assert.equal(records[0].title, '草稿')
  })

  it('submitted filter returns everything submitted (发布记录)', () => {
    seed()
    const { records } = store.listViews({ status_filter: 'submitted' })
    assert.equal(records.length, 2)
    assert.ok(records.every((r) => r.submitted_at != null))
  })

  it('reviewing filter returns records with reviewing subtasks (待审核 = 过滤视图)', () => {
    seed()
    const { records } = store.listViews({ status_filter: 'reviewing' })
    assert.equal(records.length, 1)
    assert.equal(records[0].title, '审核中')
    assert.equal(records[0].aggregate, 'publishing')
    assert.equal(displayStatus(records[0]), 'reviewing')
    assert.deepEqual(records[0].subtask_summary, { total: 1, submitted: 0, reviewing: 1, published: 0, failed: 0 })
  })

  it('failed filter returns records with failed subtasks; published only all-published', () => {
    seed()
    assert.equal(store.listViews({ status_filter: 'failed' }).records.length, 1)
    assert.equal(store.listViews({ status_filter: 'published' }).records.length, 0)
  })

  it('aggregate: partial failures surface as partial_failed', () => {
    const { mixed } = seed()
    assert.equal(store.getView(mixed.id).aggregate, 'partial_failed')
  })

  it('type filter and pagination apply', () => {
    seed()
    const videos = store.listViews({ status_filter: 'all', type: 'video' })
    assert.ok(videos.records.every((r) => r.type === 'video'))
    const page1 = store.listViews({ status_filter: 'all', page: 1 })
    assert.equal(page1.page, 1)
    assert.equal(page1.page_size, 50)
  })
})

describe('matchesStatusFilter semantics', () => {
  it('submitted records with no reviewing tasks do not match reviewing', () => {
    const record = { status: 'submitted', submitted_at: 't', subtasks: [{ status: 'published' }] }
    assert.equal(matchesStatusFilter(record, 'reviewing'), false)
    assert.equal(matchesStatusFilter(record, 'submitted'), true)
    assert.equal(matchesStatusFilter(record, 'published'), true)
  })
})

describe('shared aggregate integration', () => {
  it('re-exports the actual shared implementation, not an algorithm copy', () => {
    assert.equal(aggregateStatus, sharedAggregate)
  })

  it('projects submitted records with no tasks as draft without changing the ledger status', () => {
    const view = draftRecord()
    const file = join(dir, 'records.json')
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    raw.records[0].status = 'submitted'
    raw.records[0].submitted_at = 't'
    writeFileSync(file, JSON.stringify(raw))
    const after = freshStore().getView(view.id)
    assert.equal(after.status, 'submitted')
    assert.equal(after.aggregate, 'draft')
    assert.deepEqual(after.subtask_summary, { total: 0, submitted: 0, reviewing: 0, published: 0, failed: 0 })
  })
})
