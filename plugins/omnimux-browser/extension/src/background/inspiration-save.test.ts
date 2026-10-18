// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { InspirationSaveCoordinator } from './inspiration-save.ts'
import { INSPIRATION_TASKS_KEY } from '../shared/inspiration-save.ts'

const canonicalSourceUrl = 'https://x.com/i/status/123'
const sourceUrl = 'https://x.com/second/status/123'
const host = 'http://127.0.0.1:43120'
const receipt = (state: string, extra = {}) => Response.json({ data: { id: 'row-1', source_url: sourceUrl, import_status: state, ...extra } })
const tick = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve() }
function setup(fetchImpl: typeof fetch, initial: unknown[] = [], resolveHost = async () => host as string | null) {
  let stored: unknown[] = initial
  const storage = {
    get: vi.fn(async () => ({ [INSPIRATION_TASKS_KEY]: structuredClone(stored) })),
    set: vi.fn(async (value: Record<string, unknown>) => { stored = structuredClone(value[INSPIRATION_TASKS_KEY]) as unknown[] }),
  } as unknown as Pick<chrome.storage.StorageArea, 'get' | 'set'>
  return { coordinator: new InspirationSaveCoordinator({ storage, resolveHost, fetchImpl }), storage, stored: () => stored }
}

describe('host-confirmed inspiration saves', () => {
  it('202 remains saving and a later failure cannot become success', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(receipt('importing')).mockResolvedValueOnce(receipt('failed', { import_error: '视频下载失败' }))
    const { coordinator, stored } = setup(fetchImpl)
    const task = await coordinator.submit({ targetUrl: sourceUrl, capture: { text: '完整正文'.repeat(1000) } })
    expect(task.state).toBe('saving')
    await tick()
    expect((await coordinator.list())[0]?.state).toBe('saving')
    const sent = JSON.parse(fetchImpl.mock.calls[0]?.[1].body)
    expect(sent).toMatchObject({ background: true, auto_analyze: false, return_existing: true, preserve_available: true })
    expect(sent.capture.text.length).toBe(4000)
    expect(JSON.stringify(stored())).not.toContain('完整正文')
    await coordinator.reconcile()
    expect((await coordinator.list())[0]).toMatchObject({ state: 'failed', itemId: 'row-1', detail: '视频下载失败' })
  })
  it('keeps partial receipts retryable and starts the same source on the same host', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(receipt('degraded', { import_error: '第2张图片失败' })).mockResolvedValueOnce(receipt('ready'))
    const { coordinator } = setup(fetchImpl)
    const first = await coordinator.submit({ targetUrl: sourceUrl })
    await tick()
    expect((await coordinator.list())[0]?.state).toBe('partial')
    const retry = await coordinator.submit({ targetUrl: sourceUrl })
    await tick()
    expect(retry.taskId).toBe(first.taskId)
    expect((await coordinator.list())[0]).toMatchObject({ state: 'saved', itemId: 'row-1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('recovers lost replies by exact source, never posts again or changes hosts', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('reply lost')).mockResolvedValueOnce(Response.json({ data: { items: [{ id: 'row-1', source_url: sourceUrl, import_status: 'ready' }], total: 1 } }))
    const { coordinator, stored } = setup(fetchImpl)
    await coordinator.submit({ targetUrl: sourceUrl })
    await tick()
    const recovered = setup(fetchImpl, stored(), async () => 'http://127.0.0.1:45120').coordinator
    await recovered.submit({ targetUrl: sourceUrl })
    await tick()
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(`${host}/omnimux/inspiration/local?source_url=${encodeURIComponent(canonicalSourceUrl)}`)
    expect(fetchImpl.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
    expect((await recovered.list())[0]).toMatchObject({ state: 'saved', host })
  })
  it('rejects an ambiguous or wrong-source result and keeps the task pending', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ ok: true })).mockResolvedValueOnce(Response.json({ data: { items: [{ id: 'wrong', source_url: 'https://x.com/other/status/999', import_status: 'ready' }] } }))
    const { coordinator } = setup(fetchImpl)
    await coordinator.submit({ targetUrl: sourceUrl })
    await tick()
    expect((await coordinator.list())[0]?.state).toBe('pending')
  })
  it('serializes duplicate clicks and never checks before the post reply', async () => {
    let answer!: (value: Response) => void
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { answer = resolve }))
    const { coordinator } = setup(fetchImpl)
    const tasks = await Promise.all([coordinator.submit({ targetUrl: sourceUrl }), coordinator.submit({ targetUrl: sourceUrl })])
    await coordinator.reconcile()
    expect(tasks[0]?.taskId).toBe(tasks[1]?.taskId)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    answer(receipt('ready'))
    await tick()
    expect((await coordinator.list())[0]?.state).toBe('saved')
  })
  it('does not persist offline work or assume a home page is a post', async () => {
    const fetchImpl = vi.fn()
    const { coordinator, storage } = setup(fetchImpl, [], async () => null)
    expect((await coordinator.submit({ targetUrl: sourceUrl })).state).toBe('failed')
    expect((await coordinator.submit({ targetUrl: 'https://x.com/home' })).state).toBe('failed')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
  })
  it('only labels validated ready duplicates as already saved', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ is_duplicate: true, data: { id: 'row-1', import_status: 'ready' } }))
    const { coordinator } = setup(fetchImpl)
    await coordinator.submit({ targetUrl: sourceUrl })
    await tick()
    expect((await coordinator.list())[0]?.state).toBe('duplicate')
  })
  it('never posts when receipt storage fails or its quota is exhausted', async () => {
    const fetchImpl = vi.fn()
    const { coordinator, storage } = setup(fetchImpl)
    vi.mocked(storage.set).mockRejectedValue(new Error('QUOTA_BYTES exceeded'))
    expect(await coordinator.submit({ targetUrl: sourceUrl })).toMatchObject({ state: 'failed', detail: '无法保留保存收据，请检查浏览器存储后重试' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await coordinator.list()).toEqual([])
    // A second click can try again; the failed local write is not a live job.
    vi.mocked(storage.set).mockResolvedValue(undefined)
    fetchImpl.mockResolvedValue(receipt('ready'))
    await coordinator.submit({ targetUrl: sourceUrl })
    await tick()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('keeps only a bounded set of settled receipts with no captured body', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: { id: 'row', import_status: 'ready' } }))
    const { coordinator, stored } = setup(fetchImpl)
    for (let i = 0; i < 55; i += 1) {
      await coordinator.submit({ targetUrl: `https://x.com/author/status/${i}`, capture: { text: 'private captured body' } })
      await tick()
    }
    expect(await coordinator.list()).toHaveLength(50)
    expect(JSON.stringify(stored())).not.toContain('private captured body')
  })
  it('rejects a capture from a different post before host submission', async () => {
    const fetchImpl = vi.fn()
    const { coordinator } = setup(fetchImpl)
    expect((await coordinator.submit({ targetUrl: sourceUrl, capture: { url: 'https://x.com/wrong/status/999' } })).state).toBe('failed')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not publish a saved receipt when the post-result storage write fails', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => receipt('ready'))
    const { coordinator, storage, stored } = setup(fetchImpl)
    vi.mocked(storage.set).mockResolvedValueOnce(undefined).mockRejectedValue(new Error('quota exhausted'))
    expect((await coordinator.submit({ targetUrl: sourceUrl })).state).toBe('saving')
    await tick()
    expect((await coordinator.list())[0]?.state).toBe('pending')
    expect(JSON.stringify(stored())).not.toContain('saved')
    vi.mocked(storage.set).mockResolvedValue(undefined)
    await coordinator.reconcile()
    expect((await coordinator.list())[0]?.state).toBe('saved')
    expect(fetchImpl.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
  })

  it('accepts a ready duplicate returned under an X post id alias', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ is_duplicate: true, data: { id: 'row-1', source_url: canonicalSourceUrl, import_status: 'ready' } }))
    const { coordinator } = setup(fetchImpl)
    await coordinator.submit({ targetUrl: sourceUrl })
    await tick()
    expect((await coordinator.list())[0]).toMatchObject({ state: 'duplicate', sourceUrl: canonicalSourceUrl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('restores an old author-named receipt through the exact-source alias lookup without reposting', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ data: { items: [{ id: 'row-1', source_url: canonicalSourceUrl, import_status: 'ready' }] } }))
    const initial = [{ taskId: 'old-task', host, sourceUrl, state: 'pending', updatedAt: 1 }]
    const { coordinator } = setup(fetchImpl, initial)
    await coordinator.submit({ targetUrl: 'https://x.com/newname/status/123' })
    await tick()
    expect((await coordinator.list())[0]).toMatchObject({ state: 'saved', taskId: 'old-task' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[1]?.method).not.toBe('POST')
  })
  it('accepts a same-video non-X receipt despite sharing parameters and a host alias', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ data: { id: 'row-1', source_url: 'https://youtu.be/abcdefghijk?si=share', import_status: 'ready' } }))
    const { coordinator } = setup(fetchImpl)
    await coordinator.submit({ targetUrl: 'https://www.youtube.com/watch?v=abcdefghijk&utm_source=share' })
    await tick()
    expect((await coordinator.list())[0]?.state).toBe('saved')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

})
