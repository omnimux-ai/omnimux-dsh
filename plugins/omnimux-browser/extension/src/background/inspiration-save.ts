import {
  canonicalInspirationUrl, INSPIRATION_TASKS_KEY, isInspirationTask,
  type InspirationSaveRequest, type InspirationSaveTask,
} from '../shared/inspiration-save.ts'
import { INSPIRATION_BASE_PATH, IMPORT_URL_PATH } from './media-export.ts'

interface SaveDependencies {
  storage: Pick<chrome.storage.StorageArea, 'get' | 'set'>
  resolveHost: () => Promise<string | null>
  fetchImpl?: typeof fetch
  now?: () => number
  changed?: () => void
}

const active = (task: InspirationSaveTask) => task.state === 'saving' || task.state === 'pending'
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const cleanDetail = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, 700) : undefined

/** The worker is the sole submitter. Only bounded receipts survive suspension. */
export class InspirationSaveCoordinator {
  private tasks: InspirationSaveTask[] = []
  private loadFailed = false
  private readonly ready: Promise<void>
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private writes: Promise<void> = Promise.resolve()
  private readonly submissions = new Map<string, Promise<InspirationSaveTask>>()
  private readonly checks = new Map<string, Promise<void>>()
  private readonly posts = new Set<string>()
  constructor(private readonly deps: SaveDependencies) {
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.now = deps.now ?? Date.now
    this.ready = deps.storage.get(INSPIRATION_TASKS_KEY).then((stored) => {
      const values = stored[INSPIRATION_TASKS_KEY]
      this.tasks = Array.isArray(values) ? values.filter(isInspirationTask).map((task) => ({ ...task })) : []
    }).catch(() => { this.loadFailed = true })
  }
  async hasPending(): Promise<boolean> { await this.ready; return this.tasks.some(active) }
  async list(): Promise<InspirationSaveTask[]> { await this.ready; return this.tasks.map((task) => ({ ...task })) }

  private async persist(): Promise<void> {
    const snapshot = this.tasks.map((task) => ({ ...task }))
    const write = this.writes.then(() => this.deps.storage.set({ [INSPIRATION_TASKS_KEY]: snapshot }))
    this.writes = write.catch(() => {})
    await write
    this.deps.changed?.()
  }
  private async update(task: InspirationSaveTask, patch: Partial<InspirationSaveTask>): Promise<void> {
    Object.assign(task, patch, { updatedAt: this.now() })
    await this.persist()
  }
  private failure(sourceUrl: string, detail: string): InspirationSaveTask {
    return { taskId: crypto.randomUUID(), host: '', sourceUrl, state: 'failed', detail, updatedAt: this.now() }
  }

  async submit(request: InspirationSaveRequest): Promise<InspirationSaveTask> {
    const sourceUrl = canonicalInspirationUrl(request?.targetUrl)
    if (!sourceUrl) return this.failure('', '无法确定原帖地址，请打开原帖后重试')
    await this.ready
    if (this.loadFailed) return this.failure(sourceUrl, '无法读取保存收据，请检查浏览器存储后重试')
    if (request.capture?.url !== undefined && canonicalInspirationUrl(request.capture.url) !== sourceUrl) return this.failure(sourceUrl, '采集内容与原帖不一致，请刷新原帖后重试')
    const pending = this.tasks.find((task) => task.sourceUrl === sourceUrl && active(task))
    if (pending) {
      void this.check(pending).catch(() => {})
      return { ...pending }
    }
    const previous = this.submissions.get(sourceUrl)
    if (previous) return previous
    const submission = this.begin(sourceUrl, request.capture)
    this.submissions.set(sourceUrl, submission)
    try { return await submission } finally { this.submissions.delete(sourceUrl) }
  }

  private async begin(sourceUrl: string, capture?: Record<string, unknown>): Promise<InspirationSaveTask> {
    const host = await this.deps.resolveHost()
    if (!host) return this.failure(sourceUrl, '请启动并连接主程序后再保存')
    const existing = this.tasks.find((task) => task.host === host && task.sourceUrl === sourceUrl)
    // Re-check ready entries too: the host may have deleted a row since last save.
    const task: InspirationSaveTask = existing ?? { taskId: crypto.randomUUID(), host, sourceUrl, state: 'saving', updatedAt: this.now() }
    if (!existing) {
      if (this.tasks.filter(active).length >= 100) return this.failure(sourceUrl, '待确认任务较多，请等待现有任务完成后再保存')
      // Keep at most 50 settled receipts; never evict a live submission.
      this.tasks = this.tasks.filter(active).concat(this.tasks.filter((item) => !active(item)).slice(-49), task)
    }
    const prior = existing ? { ...existing } : null
    try {
      await this.update(task, { state: 'saving', detail: undefined })
    } catch {
      if (prior) Object.assign(task, prior)
      else this.tasks = this.tasks.filter((item) => item !== task)
      return this.failure(sourceUrl, '无法保留保存收据，请检查浏览器存储后重试')
    }
    // Persist BEFORE POST. Worker loss after this point means reconcile, not retry.
    this.posts.add(task.taskId)
    void this.post(task, capture).catch(async () => {
      await this.update(task, { state: 'pending', detail: '暂时无法核对结果，恢复连接后继续确认' }).catch(() => {})
    }).finally(() => { this.posts.delete(task.taskId) })
    return { ...task }
  }

  private applyReceipt(task: InspirationSaveTask, body: unknown): Partial<InspirationSaveTask> | null {
    const envelope = record(body)
    const data = record(envelope?.data)
    const id = typeof data?.id === 'string' && data.id.trim() ? data.id : null
    const status = data?.import_status
    if (!id || !['importing', 'ready', 'degraded', 'failed'].includes(String(status))) return null
    if (data?.source_url && canonicalInspirationUrl(data.source_url) !== task.sourceUrl) return null
    return {
      itemId: id,
      state: status === 'importing' ? 'saving' : status === 'ready' ? (envelope?.is_duplicate === true ? 'duplicate' : 'saved') : status === 'degraded' ? 'partial' : 'failed',
      detail: cleanDetail(data?.import_error) ?? (status === 'degraded' ? '部分素材尚未保存，可重试补齐' : undefined),
    }
  }
  private async post(task: InspirationSaveTask, capture?: Record<string, unknown>): Promise<void> {
    try {
      const response = await this.fetchImpl(`${task.host}${IMPORT_URL_PATH}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: task.sourceUrl, background: true, auto_analyze: false, return_existing: true, preserve_available: true, ...(capture ? { capture } : {}) }),
        signal: AbortSignal.timeout(12_000),
      })
      const body: unknown = await response.json().catch(() => null)
      const receipt = this.applyReceipt(task, body)
      if (receipt) { await this.update(task, receipt); return }
      if (!response.ok && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 409) {
        await this.update(task, { state: 'failed', detail: cleanDetail(record(body)?.error) ?? `主程序未接受保存（${response.status}）` })
        return
      }
      // A response without a durable row is result-unknown, even for HTTP 2xx.
      await this.update(task, { state: 'pending', detail: '暂时无法确认保存结果，正在核对' })
      await this.readReceipt(task)
    } catch {
      await this.update(task, { state: 'pending', detail: '暂时无法核对结果，恢复连接后继续确认' })
    }
  }
  async reconcile(): Promise<void> {
    await this.ready
    await Promise.allSettled(this.tasks.filter(active).map((task) => this.check(task)))
  }
  private check(task: InspirationSaveTask): Promise<void> {
    if (this.posts.has(task.taskId)) return Promise.resolve()
    const current = this.checks.get(task.taskId)
    if (current) return current
    const work = this.readReceipt(task).finally(() => { this.checks.delete(task.taskId) })
    this.checks.set(task.taskId, work)
    return work
  }
  private async readReceipt(task: InspirationSaveTask): Promise<void> {
    try {
      const path = task.itemId ? `${INSPIRATION_BASE_PATH}/${encodeURIComponent(task.itemId)}` : `${INSPIRATION_BASE_PATH}?source_url=${encodeURIComponent(task.sourceUrl)}`
      const response = await this.fetchImpl(`${task.host}${path}`, { signal: AbortSignal.timeout(5_000) })
      if (!response.ok) throw new Error('unreachable')
      let body: unknown = await response.json()
      if (!task.itemId) {
        const data = record(record(body)?.data)
        const items = Array.isArray(data?.items) ? data.items : []
        const matching = items.filter((item) => canonicalInspirationUrl(record(item)?.source_url) === task.sourceUrl)
        if (matching.length !== 1) throw new Error('no exact receipt')
        body = { data: matching[0] }
      }
      const receipt = this.applyReceipt(task, body)
      if (!receipt) throw new Error('invalid receipt')
      await this.update(task, receipt)
    } catch {
      await this.update(task, { state: 'pending', detail: '暂时无法核对结果，恢复连接后继续确认' })
    }
  }
}
