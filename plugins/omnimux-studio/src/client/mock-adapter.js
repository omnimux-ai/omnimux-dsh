/** Cancellable foreground-only simulation clock; never calls a model. */
export class MockAdapter {
  constructor(clock = { now: () => Date.now(), setTimeout, clearTimeout }, idFactory = () => crypto.randomUUID()) {
    this.clock = clock
    this.idFactory = idFactory
  }
  start(request, signal, onResult) {
    let remaining = 3500
    let startedAt = 0
    let timer = null
    let finished = false
    const cancel = () => {
      if (timer !== null) this.clock.clearTimeout(timer)
      timer = null
      finished = true
      signal.removeEventListener('abort', cancel)
    }
    const handle = {
      pause: () => {
        if (timer === null || finished) return
        remaining = Math.max(0, remaining - (this.clock.now() - startedAt))
        this.clock.clearTimeout(timer)
        timer = null
      },
      resume: () => {
        if (finished || signal.aborted || timer !== null) return
        startedAt = this.clock.now()
        timer = this.clock.setTimeout(() => {
          if (finished || signal.aborted) return
          cancel()
          const analysis = request.draft.mode === 'agent' && request.draft.spec === null
          const kind = analysis ? 'text' : request.draft.mode === 'image' ? 'image' : 'video'
          onResult({ status: 'completed', results: Array.from({ length: request.draft.spec?.batchCount ?? 1 }, () => ({
            id: this.idFactory(), kind, fixtureId: `mock:sample-${kind}`, mediaState: kind === 'text' ? 'ready' : 'idle',
            actualMetadata: kind === 'text' ? { text: '样例分析：开头展示产品，主体演示使用场景，结尾呈现行动提示。未读取或解析输入链接。' } : { source: 'prototype fixture', dimensions: 'unknown until loaded', durationSeconds: null },
          })) })
        }, remaining)
      },
      cancel,
    }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    return handle
  }
}
