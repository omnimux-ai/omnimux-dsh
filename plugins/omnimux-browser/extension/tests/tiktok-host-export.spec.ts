// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  discoverHostBase,
  httpBaseFromBridgeUrl,
  requestInspirationSave,
  requestMediaExport,
} from '../src/background/media-export.ts'

const POST = 'https://www.tiktok.com/@cleanlife/video/7412345678901234567'
const BASE = 'http://127.0.0.1:43120'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('宿主地址推导', () => {
  it('把桥地址换算成同一个端口的本地网页地址', () => {
    expect(httpBaseFromBridgeUrl('ws://127.0.0.1:43120/ext/bridge')).toBe(BASE)
    expect(httpBaseFromBridgeUrl('ws://127.0.0.1:45120/ext/bridge')).toBe('http://127.0.0.1:45120')
  })

  it('加密桥换算成加密网页地址', () => {
    expect(httpBaseFromBridgeUrl('wss://host.example/ext/bridge')).toBe('https://host.example')
  })

  it('拿不到可用地址时明确回答空，而不是编一个端口', () => {
    expect(httpBaseFromBridgeUrl('')).toBeNull()
    expect(httpBaseFromBridgeUrl('not a url')).toBeNull()
    expect(httpBaseFromBridgeUrl('http://127.0.0.1:43120/ext/bridge')).toBeNull()
  })
})

describe('下载无水印视频', () => {
  it('把宿主导出的文件名带回来给用户看', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const outcome = await requestMediaExport({
      base: BASE,
      url: POST,
      kind: 'video',
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
        return jsonResponse(200, { data: { kind: 'video', path: '/Users/me/Downloads/a.mp4', filename: 'cleanlife-钩子-741.mp4', bytes: 12 } })
      },
    })

    expect(outcome).toEqual({ ok: true, code: 'exported', filename: 'cleanlife-钩子-741.mp4' })
    expect(calls[0].url).toBe(`${BASE}/omnimux/inspiration/local/fetch-media`)
    expect(calls[0].body).toEqual({ url: POST, kind: 'video' })
  })

  it('把宿主给出的原因原样带回，不换成笼统失败', async () => {
    const outcome = await requestMediaExport({
      base: BASE,
      url: POST,
      kind: 'audio',
      fetchImpl: async () => jsonResponse(422, { error: '未从该作品解析到可下载的视频直链（可能是图文作品、地区受限或需要登录 TikTok）' }),
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('rejected')
    expect(outcome.detail).toContain('视频直链')
  })

  it('主程序没在跑时说清楚是连不上，而不是内容有问题', async () => {
    const outcome = await requestMediaExport({
      base: BASE,
      url: POST,
      kind: 'video',
      fetchImpl: async () => { throw new TypeError('Failed to fetch') },
    })

    expect(outcome).toEqual({ ok: false, code: 'unreachable' })
  })

  it('每次请求都带超时预算，宿主卡住时不会永远等着', async () => {
    let signal: AbortSignal | undefined
    await requestMediaExport({
      base: BASE,
      url: POST,
      kind: 'video',
      fetchImpl: async (_input, init) => {
        signal = init?.signal ?? undefined
        return jsonResponse(200, { data: { filename: 'a.mp4' } })
      },
    })

    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('主程序回了非 JSON 内容也不会把异常抛到界面上', async () => {
    const outcome = await requestMediaExport({
      base: BASE,
      url: POST,
      kind: 'video',
      fetchImpl: async () => new Response('<html>gateway</html>', { status: 502 }),
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('rejected')
  })
})

describe('保存到灵感库', () => {
  it('新素材写入成功', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const outcome = await requestInspirationSave({
      base: BASE,
      url: POST,
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
        return jsonResponse(200, { data: { id: 'ins_1', title: '三秒钩子' } })
      },
    })

    expect(outcome).toEqual({ ok: true, code: 'saved' })
    expect(calls[0].url).toBe(`${BASE}/omnimux/inspiration/local/import-url`)
    expect(calls[0].body).toEqual({ url: POST })
  })

  it('库里已经有的素材按“已经在库里”回答，不当成失败', async () => {
    const outcome = await requestInspirationSave({
      base: BASE,
      url: POST,
      fetchImpl: async () => jsonResponse(409, {
        error: '该灵感素材已在库中，请勿重复导入',
        data: { id: 'ins_1' },
        is_duplicate: true,
      }),
    })

    expect(outcome).toEqual({ ok: true, code: 'duplicate' })
  })

  it('主程序没在跑时同样回答连不上', async () => {
    const outcome = await requestInspirationSave({
      base: BASE,
      url: POST,
      fetchImpl: async () => { throw new TypeError('Failed to fetch') },
    })

    expect(outcome).toEqual({ ok: false, code: 'unreachable' })
  })

  it('入库被拒绝时带回宿主的说明', async () => {
    const outcome = await requestInspirationSave({
      base: BASE,
      url: POST,
      fetchImpl: async () => jsonResponse(502, { error: 'OmniMux 社媒解析调用失败: region blocked' }),
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.detail).toContain('region blocked')
  })
})

describe('宿主地址探测', () => {
  it('按候选顺序裁决：靠前的端口可用就用它', async () => {
    const base = await discoverHostBase([45120, 43120], async (input) => {
      const port = String(input).includes(':45120') ? 45120 : 43120
      return jsonResponse(200, { wsUrl: `ws://127.0.0.1:${port}/ext/bridge` })
    }, 100)

    expect(base).toBe('http://127.0.0.1:45120')
  })

  it('靠前的端口不应答时改用靠后的，且只等一个探测超时', async () => {
    const started = Date.now()
    const base = await discoverHostBase([45120, 43120], async (input, init) => {
      if (String(input).includes(':45120')) {
        // A port with no DSH behind it: the real fetch rejects when its own
        // AbortSignal fires, and the sweep must not wait that out per port.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('timeout')))
        })
      }
      return jsonResponse(200, { wsUrl: 'ws://127.0.0.1:43120/ext/bridge' })
    }, 40)

    expect(base).toBe(BASE)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('应答的不是 dsh 时继续看别的端口', async () => {
    const base = await discoverHostBase([45120, 43120], async (input) => (
      String(input).includes(':45120')
        ? jsonResponse(200, { something: 'else' })
        : jsonResponse(200, { wsUrl: 'ws://127.0.0.1:43120/ext/bridge' })
    ), 100)

    expect(base).toBe(BASE)
  })

  it('所有候选端口都不通时回答空，交给调用方说“主程序没在跑”', async () => {
    const base = await discoverHostBase([45120, 43120], async () => {
      throw new TypeError('Failed to fetch')
    }, 100)

    expect(base).toBeNull()
  })

  it('探测结果用的是桥地址换算出的同一个来源', async () => {
    const seen: string[] = []
    const base = await discoverHostBase([43120], async (input) => {
      seen.push(String(input))
      return jsonResponse(200, { wsUrl: 'ws://127.0.0.1:43120/ext/bridge' })
    }, 100)

    expect(seen).toEqual(['http://127.0.0.1:43120/ext/bridge-config'])
    expect(base).toBe(BASE)
  })
})
