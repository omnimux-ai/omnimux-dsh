import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeInspirationTasks, waitForInspirationTask, INSPIRATION_TASKS_KEY, type InspirationSaveTask } from './inspiration-save.ts'

afterEach(() => vi.unstubAllGlobals())
const task: InspirationSaveTask = { taskId: 'save-1', sourceUrl: 'https://x.com/current/status/123', host: 'http://127.0.0.1:43120', state: 'saving', updatedAt: 1 }
function runtime() {
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>()
  const disconnect = vi.fn()
  const sendMessage = vi.fn(async () => ({}))
  let read!: (stored: Record<string, unknown>) => void
  vi.stubGlobal('chrome', { runtime: { sendMessage, connect: vi.fn(() => ({ disconnect })) }, storage: { local: { get: () => new Promise<Record<string, unknown>>((resolve) => { read = resolve }) }, onChanged: { addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => listeners.add(listener), removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => listeners.delete(listener) } } })
  return { disconnect, sendMessage, read: (values: unknown[]) => read({ [INSPIRATION_TASKS_KEY]: values }), emit: (next: InspirationSaveTask) => { for (const listener of listeners) listener({ [INSPIRATION_TASKS_KEY]: { newValue: [next] } }, 'local') }, listeners }
}

describe('shared inspiration receipt subscriptions', () => {
  it('a delayed initial read cannot overwrite a newer final storage receipt', async () => {
    const host = runtime()
    const update = vi.fn()
    const stop = observeInspirationTasks(update)
    host.emit({ ...task, state: 'saved', updatedAt: 2 })
    host.read([task])
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenLastCalledWith([{ ...task, state: 'saved', updatedAt: 2 }])
    stop()
    expect(host.listeners.size).toBe(0)
    expect(host.disconnect).toHaveBeenCalledOnce()
    expect(host.sendMessage).toHaveBeenCalledTimes(1)
  })
  it('an open hover keeps following a pending result to the same final task', async () => {
    const host = runtime()
    const update = vi.fn()
    const result = waitForInspirationTask(task, update)
    host.read([task])
    host.emit({ ...task, state: 'pending', updatedAt: 2 })
    expect(update).toHaveBeenLastCalledWith({ ...task, state: 'pending', updatedAt: 2 })
    expect(host.listeners.size).toBe(1)
    host.emit({ ...task, state: 'saved', updatedAt: 3 })
    expect(await result).toMatchObject({ state: 'saved' })
    expect(host.listeners.size).toBe(0)
  })
  it('leaving an overlay releases its observer without cancelling or re-submitting the host task', async () => {
    const host = runtime()
    const abort = new AbortController()
    const result = waitForInspirationTask(task, () => {}, abort.signal)
    abort.abort()
    await expect(result).rejects.toThrow('重新打开')
    expect(host.listeners.size).toBe(0)
    expect(host.disconnect).toHaveBeenCalledOnce()
    expect(host.sendMessage).toHaveBeenCalledTimes(1)
  })
})
