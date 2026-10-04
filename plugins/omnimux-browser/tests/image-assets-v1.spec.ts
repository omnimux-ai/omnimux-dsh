/**
 * V1 图片真实入资产库 · 宿主保存编排（Issue #3052）。
 *
 * 契约：docs/implementation/browser-image-assets-wire-contract.md —
 * `omnimux.saveImageAsset` 只接收 {requestId,url,pageUrl,title?}；下载复用
 * fetchMediaBytes 的公网/私网/逐跳/8MiB/9s 防护；真实解码校验走宿主
 * attachments.validateImage；物化与登记走 assets 同一活跃实例的窄服务。
 * 失败 outcome 只用冻结词汇，不回传路径、字节、原始 URL 或异常细节。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createImageAssetSaveDeps,
  imageAssetSourceKey,
  normalizeImageMime,
  parseImageAssetPayload,
  saveImageAsset,
  type ImageAssetSaveOutcome,
} from '../src/image-assets.ts'
import { fetchMediaBytes } from '../src/media-fetch.ts'
import type { MediaFetchOutcome } from '../src/protocol.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'req-1',
    url: 'https://cdn.example.com/photo.png',
    pageUrl: 'https://news.example.com/article',
    title: '页面图',
    ...overrides,
  }
}

function deps(overrides: {
  fetchMedia?: (url: unknown, options?: { signal?: AbortSignal }) => Promise<MediaFetchOutcome>
  validateImage?: (input: { data: Uint8Array; mediaType: string }) => Promise<void>
  imageMediaTypes?: readonly string[]
  assetLibrary?: () => { ingestDownloadedImage: (input: unknown) => Promise<unknown> } | undefined
} = {}) {
  return {
    fetchMedia: overrides.fetchMedia ?? vi.fn(async () => ({
      status: 'ok' as const,
      contentType: 'image/png',
      byteLength: PNG.byteLength,
      data: Buffer.from(PNG).toString('base64'),
    })),
    validateImage: overrides.validateImage ?? vi.fn(async () => {}),
    imageMediaTypes: overrides.imageMediaTypes ?? ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    assetLibrary: overrides.assetLibrary ?? (() => ({
      ingestDownloadedImage: vi.fn(async (input: unknown) => ({
        status: 'saved', assetId: 'ast_1', fileId: 'fil_1', lrev: 3, input,
      })),
    })),
  }
}

describe('parseImageAssetPayload · 窄输入（#3052）', () => {
  it('accepts the frozen wire shape', () => {
    const parsed = parseImageAssetPayload(payload())
    expect(parsed).toEqual({
      requestId: 'req-1',
      url: 'https://cdn.example.com/photo.png',
      pageUrl: 'https://news.example.com/article',
      title: '页面图',
    })
    // title 可省。
    const minimal = payload()
    delete minimal.title
    const parsedMinimal = parseImageAssetPayload(minimal)
    expect(parsedMinimal && parsedMinimal.title).toBe(undefined)
  })

  it.each([
    ['non-object', 'x'],
    ['missing requestId', payload({ requestId: undefined })],
    ['empty url', payload({ url: '  ' })],
    ['missing pageUrl', payload({ pageUrl: undefined })],
    ['non-string url', payload({ url: 42 })],
    ['non-string title', payload({ title: 7 })],
    ['requestId over 128', payload({ requestId: 'r'.repeat(129) })],
    ['url over 8192', payload({ url: `https://a/${'x'.repeat(8192)}` })],
    ['pageUrl over 8192', payload({ pageUrl: `https://p/${'x'.repeat(8192)}` })],
    ['title over 200', payload({ title: 't'.repeat(201) })],
    ['local path smuggled in', payload({ path: '/etc/passwd' })],
    ['credential smuggled in', payload({ headers: { cookie: 'x' } })],
  ])('rejects %s', (_label, value) => {
    expect(parseImageAssetPayload(value)).toBeUndefined()
  })
})

describe('normalizeImageMime · MIME 门禁', () => {
  it('accepts the frozen raster set with parameters stripped', () => {
    expect(normalizeImageMime('image/png')).toBe('image/png')
    expect(normalizeImageMime('image/jpeg')).toBe('image/jpeg')
    expect(normalizeImageMime('image/webp')).toBe('image/webp')
    expect(normalizeImageMime('image/gif')).toBe('image/gif')
    expect(normalizeImageMime('image/png; charset=binary')).toBe('image/png')
  })

  it.each(['image/svg+xml', 'application/octet-stream', 'text/html', 'image/heic', '', 'IMAGE/PNG2', 'image/png/x'])(
    'rejects %s without guessing a suffix',
    (contentType) => {
      expect(normalizeImageMime(contentType)).toBeNull()
    },
  )
})

describe('imageAssetSourceKey · 来源幂等', () => {
  it('drops the fragment but keeps the signed query', () => {
    const a = imageAssetSourceKey('https://cdn.example.com/a.png?sig=1#frag')
    const b = imageAssetSourceKey('https://cdn.example.com/a.png?sig=1#other')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    const signed = imageAssetSourceKey('https://cdn.example.com/a.png?sig=2')
    expect(signed).not.toBe(a)
  })
})

describe('saveImageAsset · 下载/校验/入库编排', () => {
  it('returns unavailable when the asset service is absent', async () => {
    const outcome = await saveImageAsset(payload() as never, deps({ assetLibrary: () => undefined }))
    expect(outcome).toEqual({ status: 'unavailable' })
  })

  it('returns unavailable when host image validation is absent', async () => {
    const d = deps()
    // 无 validateImage：缺能力是诚实失败，不是降格为仅 header 检查。
    delete (d as { validateImage?: unknown }).validateImage
    const outcome = await saveImageAsset(payload() as never, d)
    expect(outcome).toEqual({ status: 'unavailable' })
  })

  it('rejects non-public and non-string urls before dialing', async () => {
    const fetchMedia = vi.fn(async () => ({ status: 'ok' as const, contentType: '', byteLength: 1, data: 'AA==' }))
    for (const url of ['file:///etc/passwd', 'http://127.0.0.1/x.png', 'not a url', '', 42]) {
      const outcome = await saveImageAsset(payload({ url }) as never, deps({ fetchMedia }))
      expect(outcome, String(url)).toEqual({ status: 'invalid-url' })
    }
    expect(fetchMedia).not.toHaveBeenCalled()
  })

  it.each([
    ['timeout', { status: 'timeout', timeoutMs: 9000 }, { status: 'timeout' }],
    ['too-large', { status: 'too-large', limit: 8388608 }, { status: 'too-large' }],
    ['http-error', { status: 'http-error', statusCode: 404 }, { status: 'http-error', statusCode: 404 }],
    ['bad-request', { status: 'bad-request', message: 'no' }, { status: 'invalid-url' }],
    ['failed', { status: 'failed', message: 'the media request failed' }, { status: 'http-error' }],
  ])('maps fetch %s into the frozen outcome vocabulary', async (_label, fetchOutcome, expected) => {
    const outcome = await saveImageAsset(payload() as never, deps({
      fetchMedia: vi.fn(async () => fetchOutcome as MediaFetchOutcome),
    }))
    expect(outcome).toEqual(expected)
  })

  it('rejects non-image and missing content types without magic sniffing', async () => {
    for (const contentType of ['image/svg+xml', 'application/octet-stream', 'text/html', '']) {
      const outcome = await saveImageAsset(payload() as never, deps({
        fetchMedia: vi.fn(async () => ({
          status: 'ok' as const,
          contentType,
          byteLength: PNG.byteLength,
          data: Buffer.from(PNG).toString('base64'),
        })),
      }))
      expect(outcome, contentType || '(empty)').toEqual({ status: 'unsupported-image' })
    }
  })

  it('intersects the frozen types with the host imageLimits mediaTypes', async () => {
    const outcome = await saveImageAsset(payload() as never, deps({ imageMediaTypes: ['image/jpeg'] }))
    expect(outcome).toEqual({ status: 'unsupported-image' })
  })

  it.each([
    ['UNSUPPORTED_IMAGE_TYPE', 'unsupported-image'],
    ['INVALID_IMAGE', 'unsupported-image'],
    ['IMAGE_TYPE_MISMATCH', 'mime-mismatch'],
    ['IMAGE_TOO_LARGE', 'too-large'],
    ['IMAGE_TOO_MANY_PIXELS', 'too-large'],
    ['IMAGE_DIMENSION_TOO_LARGE', 'too-large'],
    ['ATTACHMENT_CORRUPT', 'unavailable'],
  ])('maps validation error %s to %s', async (code, status) => {
    const validateImage = vi.fn(async () => {
      const error = new Error('attachment refused') as Error & { code?: string }
      error.code = code
      throw error
    })
    const outcome = await saveImageAsset(payload() as never, deps({ validateImage }))
    expect(outcome).toEqual({ status })
  })

  it('calls validateImage with the downloaded bytes and normalized mime — never saving attachments', async () => {
    const validateImage = vi.fn(async () => {})
    const fetchMedia = vi.fn(async () => ({
      status: 'ok' as const,
      contentType: 'image/png; charset=binary',
      byteLength: PNG.byteLength,
      data: Buffer.from(PNG).toString('base64'),
    }))
    await saveImageAsset(payload() as never, deps({ fetchMedia, validateImage }))
    const validated = (validateImage.mock.calls[0]?.[0] ?? {}) as { data?: Uint8Array; mediaType?: string }
    expect(validated.mediaType).toBe('image/png')
    expect(validated.data instanceof Uint8Array).toBe(true)
    expect(Array.from(validated.data ?? [])).toEqual([...PNG])
  })

  it('passes the source digest, bytes, mime and bounded provenance to the asset service', async () => {
    const ingest = vi.fn(async () => ({ status: 'saved', assetId: 'ast_9', fileId: 'fil_9', lrev: 4 }))
    const assetLibrary = () => ({ ingestDownloadedImage: ingest })
    const outcome = await saveImageAsset(payload() as never, deps({ assetLibrary }))

    expect(outcome).toEqual({ status: 'saved', assetId: 'ast_9', fileId: 'fil_9', lrev: 4 })
    const input = ingest.mock.calls[0]?.[0] as {
      bytes: Uint8Array
      mime: string
      sourceKey: string
      displayName: string
      description: string
    }
    const inputBytes = Array.from(input.bytes)
    expect(inputBytes).toEqual([...PNG])
    expect(input.mime).toBe('image/png')
    expect(input.sourceKey).toBe(imageAssetSourceKey('https://cdn.example.com/photo.png'))
    expect(input.displayName).toBe('页面图')
    expect(input.description).toContain('https://news.example.com/article')
    // 回执不携带本机路径、字节或原始 url。
    expect(JSON.stringify(outcome)).not.toContain('cdn.example.com')
    expect(JSON.stringify(outcome)).not.toContain('/Users/')
  })

  it('maps a duplicate receipt through unchanged', async () => {
    const ingest = vi.fn(async () => ({ status: 'duplicate', assetId: 'ast_1', fileId: 'fil_2', lrev: 4 }))
    const outcome = await saveImageAsset(payload() as never, deps({
      assetLibrary: () => ({ ingestDownloadedImage: ingest }),
    }))
    expect(outcome).toEqual({ status: 'duplicate', assetId: 'ast_1', fileId: 'fil_2', lrev: 4 })
  })

  it('turns ingest failure or a malformed receipt into storage-failed', async () => {
    const throwing = await saveImageAsset(payload() as never, deps({
      assetLibrary: () => ({ ingestDownloadedImage: vi.fn(async () => { throw new Error('disk gone') }) }),
    }))
    expect(throwing).toEqual({ status: 'storage-failed' })

    for (const malformed of [
      { status: 'saved', assetId: '', fileId: 'fil_1', lrev: 1 },
      { status: 'saved', assetId: 'ast_1', fileId: 'fil_1', lrev: -1 },
      { status: 'unknown', assetId: 'ast_1', fileId: 'fil_1', lrev: 1 },
      {},
      null,
    ]) {
      const outcome = await saveImageAsset(payload() as never, deps({
        assetLibrary: () => ({ ingestDownloadedImage: vi.fn(async () => malformed) }),
      }))
      expect(outcome).toEqual({ status: 'storage-failed' })
    }
  })

  it('reports cancelled when the connection generation dies mid-save', async () => {
    const abort = new AbortController()
    const fetchMedia = vi.fn(async (_url: unknown, options?: { signal?: AbortSignal }) => {
      options?.signal?.addEventListener('abort', () => {}, { once: true })
      return { status: 'failed' as const, message: 'the media request failed' }
    })
    const outcome = await saveImageAsset(payload() as never, deps({ fetchMedia }), abort.signal)
    expect(fetchMedia).toHaveBeenCalled()
    expect(outcome).toEqual({ status: 'http-error' })

    const abortedBefore = new AbortController()
    abortedBefore.abort()
    const cancelled = await saveImageAsset(payload() as never, deps({ fetchMedia }), abortedBefore.signal)
    expect(cancelled).toEqual({ status: 'cancelled' })
  })
})

describe('createImageAssetSaveDeps · 按调用解析宿主能力（QA #3052 Q5）', () => {
  it('attachments 在桥挂载之后才就位时，下一次调用能拿到新 provider', async () => {
    // 模拟 Cordis ctx.get：第一次调用 attachments 未挂载 → unavailable；
    // 挂载后再调用必须进入正常的输入校验分支，而不是永久 unavailable。
    const services: Record<string, unknown> = { assetLibrary: { ingestDownloadedImage: vi.fn(async () => ({ status: 'saved', assetId: 'ast_1', fileId: 'fil_1', lrev: 1 })) } }
    const ctx = { get: (name: string) => services[name] }
    const deps = createImageAssetSaveDeps(ctx as never)

    const before = await saveImageAsset(payload({ url: 'http://127.0.0.1:1/no.png' }) as never, deps)
    expect(before).toEqual({ status: 'unavailable' })

    services.attachments = {
      validateImage: vi.fn(async () => {}),
      imageLimits: { mediaTypes: ['image/png'] },
    }
    const after = await saveImageAsset(payload({ url: 'http://127.0.0.1:1/no.png' }) as never, deps)
    // 能力已恢复：私有 URL 走到 invalid-url 而不是 unavailable。
    expect(after).toEqual({ status: 'invalid-url' })

    // HMR 换掉 provider：新 provider 的 limits 立即生效。
    services.attachments = {
      validateImage: vi.fn(async () => {}),
      imageLimits: { mediaTypes: ['image/jpeg'] },
    }
    const fetchMedia = vi.fn(async () => ({
      status: 'ok' as const,
      contentType: 'image/png',
      byteLength: PNG.byteLength,
      data: Buffer.from(PNG).toString('base64'),
    }))
    // spread 在此刻求值 getter：拿到的是新 provider 的 limits。
    const swapped = await saveImageAsset(payload() as never, { ...deps, fetchMedia })
    // 冻结集与 jpeg-only 交集不含 png → unsupported-image，证明读的是新 provider。
    expect(swapped).toEqual({ status: 'unsupported-image' })
  })
})

describe('saveImageAsset · 提交后取消回执（QA #3052 OCR）', () => {
  it('连接代次在 ingest 提交期间死亡时回 cancelled，不回 saved', async () => {
    // ingest 已把真实文件与账本提交 —— 不回滚、不撤已落数据；但回执契约
    // 是连接代次死亡报 cancelled，不能把 saved 交给一个已断的连接。
    const abort = new AbortController()
    let committed = false
    const ingest = vi.fn(async () => {
      committed = true
      abort.abort()
      return { status: 'saved' as const, assetId: 'ast_1', fileId: 'fil_1', lrev: 1 }
    })
    const outcome = await saveImageAsset(payload() as never, deps({
      assetLibrary: () => ({ ingestDownloadedImage: ingest }),
    }), abort.signal)
    expect(committed).toBe(true)
    expect(outcome).toEqual({ status: 'cancelled' })
  })

  it('提交前死亡已是 cancelled；存活则回执照常送达', async () => {
    const abort = new AbortController()
    const alive = await saveImageAsset(payload() as never, deps(), abort.signal)
    expect(alive).toMatchObject({ status: 'saved', assetId: 'ast_1', fileId: 'fil_1', lrev: 3 })
  })
})

describe('saveImageAsset · 校验在途取消（OCR R2-2）', () => {
  it('连接代次在校验在途时死亡立即回 cancelled，不等解码器；迟到的校验结果被收尾', async () => {
    // OCR R2-2：慢/卡死的解码器在连接死亡时必须让 RPC 及时回 cancelled，
    // 校验结果随后到达只作后台收尾 —— 既不阻塞回执也不产生 unhandled rejection。
    const abort = new AbortController()
    let resolveValidation: ((value: void) => void) | undefined
    let rejectValidation: ((error: unknown) => void) | undefined
    const validateImage = vi.fn(
      () => new Promise<void>((resolve, reject) => {
        resolveValidation = resolve
        rejectValidation = reject
      }),
    )
    const pending = saveImageAsset(payload() as never, deps({ validateImage }), abort.signal)

    // 等校验真正在途（microtask 调度），然后杀掉连接。
    for (let i = 0; i < 20 && !validateImage.mock.calls.length; i += 1) {
      await Promise.resolve()
    }
    expect(validateImage).toHaveBeenCalledTimes(1)
    abort.abort()

    const outcome = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve('STILL_WAITING'), 3000)),
    ])
    expect(outcome).toEqual({ status: 'cancelled' })

    // 迟到的校验失败被安静收尾，不得成为 unhandled rejection；进程级
    // unhandledRejection 会让宿主整条连接代次报错。
    const unhandled: unknown[] = []
    const onUnhandled = (error: unknown) => { unhandled.push(error) }
    process.on('unhandledRejection', onUnhandled)
    try {
      rejectValidation?.(Object.assign(new Error('late decode refusal'), { code: 'INVALID_IMAGE' }))
      await new Promise((resolve) => setTimeout(resolve, 10))
      await pending
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).toEqual([])
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
      resolveValidation?.()
    }
  })
})

describe('fetchMediaBytes · 外部取消信号', () => {
  it('distinguishes the caller abort from the own timeout budget', async () => {
    const external = new AbortController()
    const hanging = (async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })) as unknown as typeof fetch

    external.abort()
    const outcome = await fetchMediaBytes('https://cdn.example.com/a.png', {
      fetchImpl: hanging,
      signal: external.signal,
      timeoutMs: 60_000,
    })
    // 外部 abort 不是我们的 9 秒预算：不能报成 timeout。
    expect(outcome).toEqual({ status: 'failed', message: 'the media request failed' })
  })

  it('external abort first-wins: a late rejection after the own timer still reports failed, not timeout', async () => {
    // 调用方先 abort，但底层 fetch 到内部计时器触发后才 reject —— 失败归因
    // 必须跟随第一个真实终止源，迟到的 timer 不能把外部取消改报成 timeout。
    const external = new AbortController()
    let observed = false
    const late = (async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { observed = true }, { once: true })
      setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 60)
    })) as unknown as typeof fetch

    const pending = fetchMediaBytes('https://cdn.example.com/a.png', {
      fetchImpl: late,
      signal: external.signal,
      timeoutMs: 20,
    })
    external.abort()
    const outcome = await pending
    expect(observed).toBe(true)
    expect(outcome).toEqual({ status: 'failed', message: 'the media request failed' })
  })

  it('module timeout first-wins: a later external abort cannot reattribute it to failed', async () => {
    // OCR R2-3：内部计时器先触发（timedOut 已置位、controller 已 abort），
    // 此时调用方再 abort 只能中断传输 —— 不得把已经发生的 timeout 覆盖成
    // failed（调用方取消）。归因跟随第一个真实终止源。
    const external = new AbortController()
    let observedControllerAbort = false
    const late = (async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { observedControllerAbort = true }, { once: true })
      setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 40)
    })) as unknown as typeof fetch

    const pending = fetchMediaBytes('https://cdn.example.com/a.png', {
      fetchImpl: late,
      signal: external.signal,
      timeoutMs: 15,
    })
    // 等内部 timeout 先触发，再发外部 abort。
    await new Promise((resolve) => setTimeout(resolve, 30))
    external.abort()
    const outcome = await pending
    expect(observedControllerAbort).toBe(true)
    expect(outcome).toEqual({ status: 'timeout', timeoutMs: 15 })
  })

  it('still reports its own timeout the same way', async () => {
    const hanging = (async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })) as unknown as typeof fetch
    const outcome = await fetchMediaBytes('https://cdn.example.com/a.png', { fetchImpl: hanging, timeoutMs: 5 })
    expect(outcome).toEqual({ status: 'timeout', timeoutMs: 5 })
  })
})

describe('outcome 词汇', () => {
  it('成功回执必须含非空 assetId/fileId 与有限 lrev', async () => {
    const outcome = await saveImageAsset(payload() as never, deps()) as ImageAssetSaveOutcome
    expect(outcome).toMatchObject({ status: 'saved' })
    if (outcome.status === 'saved' || outcome.status === 'duplicate') {
      expect(outcome.assetId.length).toBeGreaterThan(0)
      expect(outcome.fileId.length).toBeGreaterThan(0)
      expect(Number.isSafeInteger(outcome.lrev) && outcome.lrev >= 0).toBe(true)
    }
  })
})
