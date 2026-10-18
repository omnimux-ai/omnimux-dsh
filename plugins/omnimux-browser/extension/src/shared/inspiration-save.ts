/** Shared receipts: browser caches never stand in for a host library result. */
export const INSPIRATION_TASKS_KEY = 'omnimuxInspirationSaveTasks'
export const INSPIRATION_SAVE_MESSAGE = 'DSH_SAVE_INSPIRATION_PANEL'
export const INSPIRATION_CHECK_MESSAGE = 'DSH_CHECK_INSPIRATION_TASKS'
export const INSPIRATION_OBSERVER_PORT = 'omnimux-inspiration-observer'
export const INSPIRATION_RECOVERY_ALARM = 'omnimux-inspiration-recovery'

export type InspirationSaveState = 'saving' | 'saved' | 'partial' | 'duplicate' | 'pending' | 'failed'
export interface InspirationSaveTask {
  taskId: string
  host: string
  sourceUrl: string
  itemId?: string
  state: InspirationSaveState
  detail?: string
  updatedAt: number
}
export interface InspirationSaveRequest {
  targetUrl: string
  capture?: Record<string, unknown>
}

export function canonicalInspirationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (/(^|\.)(x\.com|twitter\.com)$/i.test(url.hostname)) {
      const match = /^\/([^/]+)\/status\/(\d+)(?:\/|$)/.exec(url.pathname)
      return match ? `https://x.com/${match[1]}/status/${match[2]}` : null
    }
    url.hash = ''
    return url.href
  } catch { return null }
}

export function isInspirationTask(value: unknown): value is InspirationSaveTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<InspirationSaveTask>
  return typeof task.taskId === 'string' && typeof task.host === 'string'
    && typeof task.sourceUrl === 'string' && typeof task.updatedAt === 'number'
    && ['saving', 'saved', 'partial', 'duplicate', 'pending', 'failed'].includes(task.state ?? '')
}

export function inspirationSaveLabel(task: Pick<InspirationSaveTask, 'state'> | null, locale: 'zh' | 'en' = 'zh'): string {
  const labels = locale === 'en'
    ? { saving: 'Saving', saved: 'Saved', partial: 'Partially saved', duplicate: 'Already in library', pending: 'Result pending', failed: 'Save failed' }
    : { saving: '保存中', saved: '已保存', partial: '部分保存', duplicate: '已在灵感库', pending: '结果待确认', failed: '保存失败' }
  return task ? labels[task.state] : (locale === 'en' ? 'Save to inspiration' : '保存到灵感库')
}

export function inspirationSaveDetail(task: InspirationSaveTask, locale: 'zh' | 'en' = 'zh'): string {
  const label = inspirationSaveLabel(task, locale)
  const retry = task.state === 'partial' ? (locale === 'en' ? ' · Retry to complete' : ' · 点击重试补齐') : ''
  return `${label}${task.detail ? `：${task.detail}` : ''}${retry}`
}

/** Subscribe before reading, so a write between the two cannot lose its receipt. */
export function observeInspirationTasks(listener: (tasks: InspirationSaveTask[]) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.storage.onChanged || !chrome.runtime?.connect) return () => {}
  let active = true
  let revision = 0
  const receive = (value: unknown) => {
    if (active) listener(Array.isArray(value) ? value.filter(isInspirationTask) : [])
  }
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !changes[INSPIRATION_TASKS_KEY]) return
    revision += 1
    receive(changes[INSPIRATION_TASKS_KEY].newValue)
  }
  chrome.storage.onChanged.addListener(changed)
  const readRevision = revision
  void chrome.storage.local.get(INSPIRATION_TASKS_KEY).then((stored) => {
    if (revision === readRevision) receive(stored[INSPIRATION_TASKS_KEY])
  }).catch(() => {})
  let port: chrome.runtime.Port | undefined
  let reconnect: ReturnType<typeof setTimeout> | undefined
  const connect = () => {
    if (!active) return
    port = chrome.runtime.connect({ name: INSPIRATION_OBSERVER_PORT })
    port.onDisconnect?.addListener(() => {
      if (active) reconnect = setTimeout(connect, 1_000)
    })
  }
  connect()
  // On worker/browser startup, reconcile existing submissions; never re-submit.
  void chrome.runtime.sendMessage({ type: INSPIRATION_CHECK_MESSAGE }).catch(() => {})
  return () => {
    active = false
    chrome.storage.onChanged.removeListener(changed)
    if (reconnect !== undefined) clearTimeout(reconnect)
    port?.disconnect()
  }
}

export async function submitInspirationSave(request: InspirationSaveRequest): Promise<InspirationSaveTask> {
  const response = await chrome.runtime.sendMessage({ type: INSPIRATION_SAVE_MESSAGE, payload: request })
  if (!isInspirationTask(response?.task)) throw new Error(typeof response?.message === 'string' ? response.message : '保存结果待确认，请重新打开后核对')
  return response.task
}

/** Hover/shortcut callers wait on the same storage receipt as every open panel. */
export async function waitForInspirationTask(
  initial: InspirationSaveTask,
  onUpdate?: (task: InspirationSaveTask) => void,
  signal?: AbortSignal,
): Promise<InspirationSaveTask> {
  if (initial.state !== 'saving' && (initial.state !== 'pending' || !onUpdate)) return initial
  onUpdate?.(initial)
  return new Promise((resolve, reject) => {
    let stopped = false
    let stop = () => {}
    const finish = (task?: InspirationSaveTask) => {
      if (stopped) return
      stopped = true
      stop()
      signal?.removeEventListener('abort', aborted)
      if (task) resolve(task)
      else reject(new Error('保存结果将在重新打开时核对'))
    }
    const aborted = () => finish()
    if (signal?.aborted) { finish(); return }
    signal?.addEventListener('abort', aborted, { once: true })
    stop = observeInspirationTasks((tasks) => {
      const task = tasks.find((item) => item.taskId === initial.taskId)
      if (!task) return
      onUpdate?.(task)
      if (task.state !== 'saving' && (task.state !== 'pending' || !onUpdate)) finish(task)
    })
  })
}
