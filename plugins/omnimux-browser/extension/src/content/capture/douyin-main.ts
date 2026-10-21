/**
 * 抖音 MAIN-world 采集桥（content script，`world: "MAIN"`，document_start）。
 *
 * 抖音详情数据不在 DOM 里：页面启动后通过 XHR 请求
 * `/aweme/v1/web/aweme/detail/`（另有 `SSR_RENDER_DATA` 全局）。isolated world
 * 读不到页面 JS 全局，也看不到 XHR 响应，所以这里在主世界把找到的 JSON 发布到
 * 一个 `<script type="application/json">` 节点，隔离世界的提取器只读 DOM 即可。
 *
 * 只做只读旁听：不修改请求、不注入远端脚本、不读取凭据；数据留在页面内。
 *
 * @module
 */

const TAG_ID = 'omnimux-douyin-capture'
/** Publishing cap: the extractor needs the aweme object, not the whole app state. */
const MAX_CHARS = 2_000_000

function publish(payload: unknown): void {
  if (payload === null || typeof payload !== 'object') return
  let text: string
  try {
    text = JSON.stringify(payload)
  } catch {
    return
  }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS)
  try {
    const head = document.head || document.documentElement
    if (head === null) return
    const existing = document.getElementById(TAG_ID)
    let node: HTMLScriptElement
    if (existing instanceof HTMLScriptElement) {
      node = existing
    } else {
      node = document.createElement('script')
      node.type = 'application/json'
      node.id = TAG_ID
      head.appendChild(node)
    }
    node.textContent = text
  } catch {
    // 页面 head 尚不可写时下一次响应再试。
  }
}

/** Publish only payloads that look like an aweme detail response. */
function publishDetail(parsed: unknown): void {
  if (parsed === null || typeof parsed !== 'object') return
  const record = parsed as Record<string, unknown>
  if (record['aweme_detail'] !== undefined || record['aweme_details'] !== undefined) {
    publish({ aweme_detail: record['aweme_detail'], aweme_details: record['aweme_details'] })
    return
  }
  publish(parsed)
}

function interceptXhr(): void {
  const proto = XMLHttpRequest.prototype
  const originalOpen = proto.open
  const originalSend = proto.send
  proto.open = function patchedOpen(this: XMLHttpRequest, ...args: unknown[]) {
    try {
      ;(this as unknown as { __omnimuxUrl?: string }).__omnimuxUrl = String(args[1] ?? '')
    } catch {
      // 非字符串 URL 交给原始实现处理。
    }
    return (originalOpen as (...rest: unknown[]) => void).apply(this, args as never)
  }
  proto.send = function patchedSend(this: XMLHttpRequest, ...args: unknown[]) {
    try {
      this.addEventListener('load', () => {
        try {
          const url = (this as unknown as { __omnimuxUrl?: string }).__omnimuxUrl ?? ''
          if (!/aweme\/detail|aweme\/post/.test(url)) return
          const text = this.responseText
          if (typeof text !== 'string' || text.length === 0) return
          publishDetail(JSON.parse(text))
        } catch {
          // 非 JSON / 页面结构变化：忽略这一条响应。
        }
      })
    } catch {
      // addEventListener 不可用时保持原始请求行为。
    }
    return (originalSend as (...rest: unknown[]) => void).apply(this, args as never)
  }
}

function interceptFetch(): void {
  const originalFetch = window.fetch
  if (typeof originalFetch !== 'function') return
  window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
    const request = args[0]
    const url = typeof request === 'string' ? request : request instanceof Request ? request.url : ''
    const pending = originalFetch.apply(this as never, args)
    if (!/aweme\/detail|aweme\/post/.test(url)) return pending
    void pending
      .then((response) => {
        if (!response.ok) return undefined
        return response.clone().json()
      })
      .then((parsed) => {
        if (parsed !== undefined) publishDetail(parsed)
      })
      .catch(() => undefined)
    return pending
  }
}

/** Poll the SSR global for a short window: hydration timing varies per page load. */
function watchGlobals(): void {
  const globals = window as unknown as Record<string, unknown>
  for (const key of ['SSR_RENDER_DATA', '_ROUTER_DATA', '__INITIAL_STATE__']) {
    const value = globals[key]
    if (value !== undefined) publish({ [key]: value })
  }
  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    for (const key of ['SSR_RENDER_DATA', '_ROUTER_DATA']) {
      const value = globals[key]
      if (value !== undefined) publish({ [key]: value })
    }
    if (attempts >= 20) window.clearInterval(timer)
  }, 500)
}

try {
  interceptXhr()
  interceptFetch()
  watchGlobals()
} catch {
  // 主世界注入失败时隔离世界的提取器回退 DOM 兜底。
}
