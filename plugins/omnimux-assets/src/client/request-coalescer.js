/**
 * 飞行中请求合并器（In-flight Request Coalescing / Deduplication）。
 *
 * 当同一个资源或参数的请求仍在进行中时，后续并发请求复用同一个 Promise，
 * 避免并发网络风暴与带宽浪费。请求决议后无论成功还是失败，均自动从飞行表注销。
 */
export class RequestCoalescer {
  constructor() {
    /** @type {Map<string, Promise<any>>} */
    this.inFlight = new Map()
  }

  /**
   * @template T
   * @param {string} key 请求去重标识
   * @param {() => Promise<T>} fetcher 真正的请求执行器
   * @returns {Promise<T>}
   */
  coalesce(key, fetcher) {
    if (!key || typeof fetcher !== 'function') return fetcher?.()
    const running = this.inFlight.get(key)
    if (running) return running

    const promise = (async () => {
      try {
        return await fetcher()
      } finally {
        this.inFlight.delete(key)
      }
    })()

    this.inFlight.set(key, promise)
    return promise
  }

  get inFlightCount() {
    return this.inFlight.size
  }

  clear() {
    this.inFlight.clear()
  }
}

export const defaultRequestCoalescer = new RequestCoalescer()
