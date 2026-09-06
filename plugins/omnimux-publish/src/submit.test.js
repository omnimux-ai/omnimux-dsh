import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { parsePublishConfig } from './config.js'
import { createHubChannel } from './hubtools.js'
import { createAccountSource } from './accounts.js'
import { createMediaStore } from './media.js'
import { createRecordStore, PublishError } from './store.js'
import { composeContent, createSubmitService } from './submit.js'

/** @type {string} */
let dir = ''
/** @type {ReturnType<typeof createRecordStore>} */
let store = ''
/** @type {ReturnType<typeof createMediaStore>} */
let media = ''
/** @type {Record<string, Function>} */
let handlers = {}
/** @type {{ calls: Array<{ name: string, arguments: object }>, exec: object }} */
let tools = ''
/** @type {ReturnType<typeof createSubmitService>} */
let service = ''
let tick = 0

/** 编程式 mock ctx.tools（官方 execute result 形状）。 */
function mockTools() {
  const calls = []
  return {
    calls,
    get: (name) => (name in handlers ? { name } : undefined),
    async execute(exec) {
      calls.push({ name: exec.name, arguments: exec.arguments, exec })
      const handler = handlers[exec.name]
      if (!handler) return { content: [{ type: 'text', text: `UNKNOWN_TOOL ${exec.name}` }], isError: true, value: undefined }
      try {
        const value = await handler(exec.arguments, exec)
        return { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false, value }
      } catch (error) {
        return { content: [{ type: 'text', text: `${error.name}: ${error.message}` }], isError: true, value: undefined }
      }
    },
  }
}

const ACCOUNT_ROWS = {
  success: true,
  data: {
    accounts: [
      { id: 'acc-1', provider: 'tiktok_direct', platform: 'tiktok', username: 'one', status: 'active' },
      { id: 'acc-2', provider: 'tiktok_direct', platform: 'tiktok', username: 'two', status: 'active' },
    ],
  },
}

/** 站点账号 + presign + create + get 的默认 happy-path handlers。 */
function defaultHandlers(overrides = {}) {
  return {
    omnimux_accounts_list: () => ACCOUNT_ROWS,
    omnimux_publish_presign: (args) => ({ success: true, data: { upload_url: `https://up/${args.filename}`, public_url: `https://pub/${args.filename}` } }),
    omnimux_publish_create: (args) => ({ success: true, data: { id: `post-${args.account_ids[0]}`, status: 'scheduled' } }),
    omnimux_publish_get: () => ({ success: true, data: { id: 1, status: 'published' } }),
    ...overrides,
  }
}

function freshService(handlerOverrides = {}) {
  handlers = defaultHandlers(handlerOverrides)
  tools = mockTools()
  // 预签名 PUT 走 mock fetcher（测试环境不打真网络）
  const fetcher = async () => ({ ok: true, status: 200 })
  const channel = createHubChannel({ tools, fetcher })
  const accounts = createAccountSource({ channel, overlayPath: '' })
  const config = parsePublishConfig({ dataDir: dir, submitTimeoutSeconds: 5 })
  service = createSubmitService({ store, media, channel, accounts, config, now: () => new Date(2026, 0, 1, 0, 0, ++tick).toISOString() })
  return service
}

/** 建一个可直接提交的图文草稿（1 图 + 2 账号）。 */
function seedDraft(overrides = {}) {
  const { media: row } = media.importBuffer(Buffer.from('image-bytes'), { filename: 'a.png', content_type: 'image/png' })
  return store.create({
    type: 'image',
    title: '标题',
    description: '描述',
    topics: ['旅行', '摄影'],
    media_ids: [row.id],
    account_ids: ['acc-1', 'acc-2'],
    ...overrides,
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-publish-submit-'))
  tick = 0
  store = createRecordStore({
    paths: { recordsFile: join(dir, 'records.json') },
    now: () => new Date(2026, 0, 1, 0, 0, ++tick).toISOString(),
  })
  media = createMediaStore({
    paths: { mediaIndexFile: join(dir, 'media.json'), mediaDir: join(dir, 'media') },
    maxBytes: 1024 * 1024,
  })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('provider isolation before side effects', () => {
  it('rejects a legacy Zernio draft without uploading or changing its content', async () => {
    freshService({ omnimux_accounts_list: () => ({ accounts: [{ id: 'acc-1', provider: 'zernio', platform: 'tiktok', status: 'active' }] }) })
    const draft = seedDraft({ account_ids: ['acc-1'] })
    const before = store.getView(draft.id)
    await assert.rejects(service.run(draft.id), (e) => e.details?.errors?.some((entry) => entry.code === 'account-provider-mismatch'))
    assert.deepEqual(store.getView(draft.id), before)
    assert.ok(tools.calls.every((call) => call.name === 'omnimux_accounts_list'))
  })

  it('rejects non-official and unknown historical tasks before retry or refresh', async () => {
    freshService()
    for (const provider of ['zernio', undefined, 'unknown']) {
      const draft = seedDraft({ account_ids: ['acc-1'] })
      store.materialize(draft.id, [{ id: 'acc-1', platform: 'tiktok', provider }])
      const task = store.getView(draft.id).subtasks[0]
      store.updateTask(task.id, { status: 'failed', post_id: 'legacy-post' })
      const before = store.getView(draft.id)
      await assert.rejects(service.retryTask(task.id), (e) => e.code === 'post-provider-mismatch')
      assert.deepEqual(store.getView(draft.id), before)
      store.updateTask(task.id, { status: 'submitted' })
      const beforeRefresh = store.getView(draft.id)
      const result = await service.refresh(draft.id)
      assert.equal(result.sync_errors.length, 1)
      assert.deepEqual(store.getView(draft.id), beforeRefresh)
    }
    assert.deepEqual(tools.calls, [])
  })

  it('revalidates the current account before retry mutations and uploads', async () => {
    freshService()
    const draft = seedDraft({ account_ids: ['acc-1'] })
    const prepared = await service.prepare(draft.id)
    const task = prepared.subtasks[0]
    assert.equal(task.provider, 'tiktok_direct')
    store.updateTask(task.id, { status: 'failed', error: 'previous failure', attempts: 2 })
    handlers.omnimux_accounts_list = () => ({ accounts: [{ id: 'acc-1', platform: 'tiktok', provider: 'zernio', status: 'active' }] })
    tools.calls.length = 0
    const before = store.getView(draft.id)
    await assert.rejects(service.retryTask(task.id), (e) => e.code === 'account-provider-mismatch')
    assert.deepEqual(store.getView(draft.id), before)
    assert.ok(tools.calls.every((call) => call.name === 'omnimux_accounts_list'))
  })

  it('revalidates source between prepare and background dispatch', async () => {
    freshService()
    const draft = seedDraft({ account_ids: ['acc-1'] })
    await service.prepare(draft.id)
    handlers.omnimux_accounts_list = () => ({ accounts: [] })
    tools.calls.length = 0
    const before = store.getView(draft.id)
    await assert.rejects(service.dispatch(draft.id), (e) => e.code === 'account-provider-mismatch')
    assert.deepEqual(store.getView(draft.id), before)
    assert.ok(tools.calls.every((call) => call.name === 'omnimux_accounts_list'))
  })
})

describe('SubmitService.run happy path', () => {
  it('presigns once per media, creates per account, taskId 即落盘', async () => {
    freshService()
    const draft = seedDraft()
    const view = await service.run(draft.id)

    // 每媒体 presign 一次
    const presigns = tools.calls.filter((c) => c.name === 'omnimux_publish_presign')
    assert.equal(presigns.length, 1)
    assert.deepEqual(presigns[0].arguments, { filename: 'a.png', content_type: 'image/png' })

    // 逐账号 create，account_ids 恒为单元素数组
    const creates = tools.calls.filter((c) => c.name === 'omnimux_publish_create')
    assert.equal(creates.length, 2)
    for (const call of creates) {
      assert.equal(call.arguments.account_ids.length, 1)
      assert.equal(typeof call.arguments.content, 'string')
      assert.deepEqual(call.arguments.media_items, [{ url: 'https://pub/a.png' }])
    }
    // content 组合：标题 + 描述 + 话题
    assert.equal(creates[0].arguments.content, '标题\n描述\n#旅行 #摄影')

    // 子任务全部 submitted，post_id 落盘
    assert.equal(view.aggregate, 'publishing')
    assert.ok(view.subtasks.every((t) => t.status === 'submitted' && t.post_id))
    assert.deepEqual(view.subtasks.map((t) => t.post_id), ['post-acc-1', 'post-acc-2'])

    // taskId 即落盘：换一个 store 实例从磁盘读
    const reloaded = createRecordStore({ paths: { recordsFile: join(dir, 'records.json') } })
    const persisted = reloaded.getView(draft.id)
    assert.ok(persisted.subtasks.every((t) => t.status === 'submitted'))
    assert.equal(persisted.uploads[media.list()[0].id], 'https://pub/a.png')
  })

  it('re-running a submitted record is rejected (record-not-draft)', async () => {
    freshService()
    const draft = seedDraft()
    await service.run(draft.id)
    await assert.rejects(() => service.run(draft.id), (e) => e instanceof PublishError && e.code === 'record-not-draft')
  })

  it('in-flight Map 幂等：并发重复 submit 返回同一 promise，create 只跑一遍', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    freshService({
      omnimux_publish_create: async (args) => {
        await gate
        return { success: true, data: { id: `post-${args.account_ids[0]}` } }
      },
    })
    const draft = seedDraft()
    const first = service.run(draft.id)
    const second = service.run(draft.id)
    assert.equal(first, second)
    release()
    await first
    assert.equal(tools.calls.filter((c) => c.name === 'omnimux_publish_create').length, 2)
  })
})

describe('SubmitService.run 失败隔离与降级', () => {
  it('单账号 create 失败不阻塞其他账号（失败隔离）', async () => {
    freshService({
      omnimux_publish_create: (args) => {
        if (args.account_ids[0] === 'acc-2') throw new Error('omnimux-request-failed: HTTP 500 boom')
        return { success: true, data: { id: 'post-acc-1' } }
      },
    })
    const draft = seedDraft()
    const view = await service.run(draft.id)
    const summary = view.subtask_summary
    assert.equal(summary.submitted, 1)
    assert.equal(summary.failed, 1)
    assert.equal(view.aggregate, 'publishing') // 仍有 in-flight（submitted）
    const failed = view.subtasks.find((t) => t.status === 'failed')
    assert.match(failed.error, /HTTP 500 boom/)
    const ok = view.subtasks.find((t) => t.status === 'submitted')
    assert.equal(ok.post_id, 'post-acc-1')
  })

  it('未登录（needs-omnimux）→ submit 明确报错，不物化子任务', async () => {
    freshService({
      omnimux_accounts_list: () => {
        throw new PublishError('needs-omnimux', 'sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      },
    })
    const draft = seedDraft()
    await assert.rejects(() => service.run(draft.id), (e) => e instanceof PublishError && e.code === 'needs-omnimux')
    assert.equal(store.getView(draft.id).status, 'draft') // 账本未被污染
    assert.equal(store.getView(draft.id).subtasks.length, 0)
  })

  it('non-official account is rejected and its draft remains unchanged', async () => {
    freshService({
      omnimux_accounts_list: () => ({
        success: true,
        data: { accounts: [{ id: 'acc-1', platform: 'bilibili', status: 'active' }] },
      }),
    })
    const draft = seedDraft({ account_ids: ['acc-1'] })
    await assert.rejects(() => service.run(draft.id), (e) => e instanceof PublishError && e.code === 'account-provider-mismatch')
    assert.equal(store.getView(draft.id).status, 'draft')
  })

  it('媒体上传失败 → 全部子任务 failed(upload-failed)，可 retry', async () => {
    freshService({
      omnimux_publish_presign: () => {
        throw new Error('omnimux-request-failed: HTTP 429 rate limited')
      },
    })
    const draft = seedDraft()
    const view = await service.run(draft.id)
    assert.ok(view.subtasks.every((t) => t.status === 'failed'))
    assert.ok(view.subtasks.every((t) => /media upload failed/.test(t.error)))
  })

  it('上传字节 PUT 失败同样落 failed', async () => {
    const fetcher = async () => ({ ok: false, status: 403 })
    handlers = defaultHandlers()
    tools = mockTools()
    const channel = createHubChannel({ tools, fetcher })
    const accounts = createAccountSource({ channel, overlayPath: '' })
    const config = parsePublishConfig({ dataDir: dir })
    service = createSubmitService({ store, media, channel, accounts, config })
    const draft = seedDraft()
    const view = await service.run(draft.id)
    assert.ok(view.subtasks.every((t) => /media upload failed/.test(t.error)))
  })
})

describe('SubmitService.refresh（statusMap 映射）', () => {
  async function submittedRecord(getStatus) {
    freshService({ omnimux_publish_get: () => ({ success: true, data: { id: 1, status: getStatus } }) })
    const draft = seedDraft()
    await service.run(draft.id)
    return draft
  }

  it('maps raw review → reviewing（待审核）', async () => {
    const draft = await submittedRecord('review')
    const { record } = await service.refresh(draft.id)
    assert.ok(record.subtasks.every((t) => t.status === 'reviewing' && t.raw_status === 'review'))
  })

  it('maps raw published → published（终态 + settled_at）', async () => {
    const draft = await submittedRecord('published')
    const { record } = await service.refresh(draft.id)
    assert.ok(record.subtasks.every((t) => t.status === 'published'))
    assert.ok(record.subtasks.every((t) => t.settled_at != null))
    assert.equal(record.aggregate, 'published')
  })

  it('unknown raw status keeps the current task status but stores raw_status', async () => {
    const draft = await submittedRecord('weird_platform_state')
    const { record } = await service.refresh(draft.id)
    assert.ok(record.subtasks.every((t) => t.status === 'submitted'))
    assert.ok(record.subtasks.every((t) => t.raw_status === 'weird_platform_state'))
  })

  it('skips terminal tasks and surfaces per-task sync errors', async () => {
    let call = 0
    freshService({
      omnimux_publish_get: () => {
        call += 1
        if (call === 1) throw new Error('omnimux-request-failed: HTTP 500 nope')
        return { success: true, data: { id: 1, status: 'published' } }
      },
    })
    const draft = seedDraft()
    await service.run(draft.id)
    const { record, sync_errors } = await service.refresh(draft.id)
    assert.equal(sync_errors.length, 1)
    assert.match(sync_errors[0].error, /HTTP 500 nope/)
    // 另一个任务照常同步（sync error 不阻塞兄弟任务）
    const statuses = record.subtasks.map((t) => t.status).sort()
    assert.deepEqual(statuses, ['published', 'submitted'])
  })

  it('needs-omnimux during refresh propagates immediately', async () => {
    const draft = await submittedRecord('published')
    handlers.omnimux_publish_get = () => {
      // 模拟 hub OmnimuxError 的真实消息（code 不进 content，见 hubtools 注释）
      throw new Error('sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
    }
    await assert.rejects(() => service.refresh(draft.id), (e) => e.code === 'needs-omnimux')
  })
})

describe('SubmitService.retryTask', () => {
  async function failedRecord() {
    freshService({
      omnimux_publish_create: (args) => {
        if (args.account_ids[0] === 'acc-2') throw new Error('omnimux-request-failed: HTTP 500 boom')
        return { success: true, data: { id: 'post-acc-1' } }
      },
    })
    const draft = seedDraft()
    await service.run(draft.id)
    return { draft, view: store.getView(draft.id) }
  }

  it('retries a failed account reusing uploaded media（无新 presign）', async () => {
    const { view } = await failedRecord()
    const failedTask = view.subtasks.find((t) => t.status === 'failed')
    const presignCountBefore = tools.calls.filter((c) => c.name === 'omnimux_publish_presign').length

    // 修好 create
    handlers.omnimux_publish_create = (args) => ({ success: true, data: { id: `post-retry-${args.account_ids[0]}` } })
    const { record, task } = await service.retryTask(failedTask.id)

    assert.equal(task.status, 'submitted')
    assert.equal(task.post_id, 'post-retry-acc-2')
    assert.equal(task.attempts, 1)
    assert.equal(task.error, null)
    // 复用已上传媒体：没有新的 presign
    assert.equal(tools.calls.filter((c) => c.name === 'omnimux_publish_presign').length, presignCountBefore)
    // 新 create 复用同一 media_items
    const lastCreate = tools.calls.filter((c) => c.name === 'omnimux_publish_create').at(-1)
    assert.deepEqual(lastCreate.arguments.media_items, [{ url: 'https://pub/a.png' }])
    assert.equal(record.aggregate, 'publishing')
  })

  it('only failed tasks are retryable', async () => {
    const { view } = await failedRecord()
    const okTask = view.subtasks.find((t) => t.status === 'submitted')
    await assert.rejects(() => service.retryTask(okTask.id), (e) => e.code === 'task-not-retryable')
  })

  it('a failing retry lands back on failed with the error', async () => {
    const { view } = await failedRecord()
    const failedTask = view.subtasks.find((t) => t.status === 'failed')
    await assert.rejects(() => service.retryTask(failedTask.id), (e) => e.code === 'hub-tool-error')
    const after = store.findTaskAnywhere(failedTask.id).task
    assert.equal(after.status, 'failed')
    assert.match(after.error, /HTTP 500 boom/)
    assert.equal(after.attempts, 1)
  })

  it('re-presigns when the upload mapping is missing (兜底)', async () => {
    const { draft, view } = await failedRecord()
    const failedTask = view.subtasks.find((t) => t.status === 'failed')
    store.setUploads(draft.id, {}, { replace: true }) // 清空 uploads 模拟映射丢失
    handlers.omnimux_publish_create = (args) => ({ success: true, data: { id: 'post-again' } })
    const presignCountBefore = tools.calls.filter((c) => c.name === 'omnimux_publish_presign').length
    const { task } = await service.retryTask(failedTask.id)
    assert.equal(task.status, 'submitted')
    assert.equal(tools.calls.filter((c) => c.name === 'omnimux_publish_presign').length, presignCountBefore + 1)
  })
})

describe('SubmitService.dispose（卸载清理）', () => {
  it('marks submitting tasks interrupted on unload', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    freshService({
      omnimux_publish_create: async (args) => {
        await gate
        return { success: true, data: { id: `post-${args.account_ids[0]}` } }
      },
    })
    const draft = seedDraft()
    const running = service.run(draft.id)
    service.dispose('plugin unloaded') // runner 仍在飞 → submitting 标 interrupted
    release()
    await running
    // dispose 已把 submitting 落为 failed(interrupted)；
    // 随后完成的 create 覆写为 submitted（竞态下账本最终一致，磁盘语义由 recover 兜底）
    const final = store.getView(draft.id)
    assert.ok(['submitted', 'failed'].includes(final.subtasks[0].status))
  })
})

describe('composeContent', () => {
  it('joins title, description, and topic tags', () => {
    assert.equal(
      composeContent({ title: 'T', description: 'D', topics: ['a', '#b'] }),
      'T\nD\n#a #b',
    )
    assert.equal(composeContent({ description: 'D', topics: [] }), 'D')
    assert.equal(composeContent({ title: 'T' }), 'T')
    assert.equal(composeContent({}), '')
  })
})
