// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  DISCOVERY_PORTS,
  KNOWN_INSTANCE_NAMES,
  KNOWN_PORT_PRIORITY,
  discoverInstances,
  probeInstance,
  instanceStatusText,
  INSTANCE_SELECTOR_COPY,
} from '../src/shared/instance-discovery.ts'

/** 按 URL 中的端口分派 mock 响应，与 fetch 调用顺序无关。 */
function mockFetchByPort(handlers: Record<number, 'online' | 'forbidden' | 'offline'>) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as Request).url)
    const port = Number(new URL(url).port)
    switch (handlers[port] ?? 'offline') {
      case 'online':
        return {
          ok: true,
          status: 200,
          json: async () => ({ wsUrl: `ws://127.0.0.1:${port}/ext/bridge` }),
        } as Response
      case 'forbidden':
        return {
          ok: false,
          status: 403,
          json: async () => 'forbidden',
        } as unknown as Response
      default:
        throw new Error('Failed to fetch')
    }
  }) as unknown as typeof fetch
}

describe('instance-discovery shared module', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('DISCOVERY_PORTS 与 background 探测顺序一致', () => {
    expect([...DISCOVERY_PORTS]).toEqual([45120, 45128, 43120, 43128, 3080, 3081, 3090, 14389, 43189])
    expect(KNOWN_INSTANCE_NAMES[45120]?.nameZh).toBe('OmniMux Dev')
    expect(KNOWN_INSTANCE_NAMES[45120]?.isRecommended).toBe(true)
    expect(KNOWN_INSTANCE_NAMES[43128]?.nameZh).toBe('OmniMux PRD')
    expect(KNOWN_INSTANCE_NAMES[43120]?.nameZh).toBe('DSH Desktop')
    expect([...KNOWN_PORT_PRIORITY]).toEqual([45120, 43128, 43120])
  })

  it('probeInstance: 200 + wsUrl → online 且带 latencyMs', async () => {
    mockFetchByPort({ 45120: 'online' })
    const inst = await probeInstance(45120)
    expect(inst.status).toBe('online')
    expect(typeof inst.latencyMs).toBe('number')
    expect(inst.nameZh).toBe('OmniMux Dev')
    expect(inst.isRecommended).toBe(true)
  })

  it('probeInstance: 有响应但无 wsUrl → unavailable', async () => {
    mockFetchByPort({ 43120: 'forbidden' })
    const inst = await probeInstance(43120)
    expect(inst.status).toBe('unavailable')
    expect(inst.nameZh).toBe('DSH Desktop')
  })

  it('probeInstance: 网络错误 → offline', async () => {
    mockFetchByPort({})
    const inst = await probeInstance(43128)
    expect(inst.status).toBe('offline')
    expect(inst.latencyMs).toBeUndefined()
  })

  it('discoverInstances: 三分支并存且排序 online → unavailable → offline（组内按 KNOWN_PORT_PRIORITY）', async () => {
    mockFetchByPort({ 45120: 'online', 43120: 'forbidden' })
    const list = await discoverInstances()

    const byPort = new Map(list.map((i) => [i.port, i]))
    expect(byPort.get(45120)?.status).toBe('online')
    expect(byPort.get(43120)?.status).toBe('unavailable')
    expect(byPort.get(43128)?.status).toBe('offline')

    // online 在最前，其次 unavailable，offline 排尾
    expect(list[0].status).toBe('online')
    expect(list[0].port).toBe(45120)
    expect(list[1].status).toBe('unavailable')
    expect(list[1].port).toBe(43120)
    // offline 行仅映射表内已知端口渲染：43128 一条；45128 等未命名 DISCOVERY_PORTS 不渲染
    const offlinePorts = list.filter((i) => i.status === 'offline').map((i) => i.port)
    expect(offlinePorts).toEqual([43128])
    expect(byPort.has(45128)).toBe(false)
    // 未知端口不入列表
    expect(list.every((i) => !i.isCustom)).toBe(true)
  })

  it('discoverInstances: 组内按 KNOWN_PORT_PRIORITY 45120→43128→43120，未命名已知端口随后', async () => {
    // 43120 在线、43128 在线、45128 在线：online 组内应为 45120? 不在线
    // 实际顺序：43128（priority 1）先于 43120（priority 2），45128 排三者之后
    mockFetchByPort({ 43128: 'online', 43120: 'online', 45128: 'online', 3080: 'online' })
    const list = await discoverInstances()
    const onlinePorts = list.filter((i) => i.status === 'online').map((i) => i.port)
    expect(onlinePorts).toEqual([43128, 43120, 45128, 3080])
  })

  it('discoverInstances: extraPorts 去重——与已知端口同端口时以已知条目为准', async () => {
    mockFetchByPort({ 45120: 'online' })
    const list = await discoverInstances([45120, 45120])
    expect(list.filter((i) => i.port === 45120).length).toBe(1)
    expect(list.find((i) => i.port === 45120)?.isCustom).toBe(false)
  })

  it('discoverInstances: 未知 extra 端口在线时以本地实例追加在已知端口之后并按端口升序', async () => {
    mockFetchByPort({ 45120: 'online', 62001: 'online', 61000: 'online' })
    const list = await discoverInstances([62001, 61000])
    const customs = list.filter((i) => i.isCustom)
    expect(customs.map((i) => i.port)).toEqual([61000, 62001])
    expect(customs[0].nameZh).toBe('本地实例')
    // 已知 online 排在 custom online 之前
    expect(list[0].port).toBe(45120)
  })

  it('discoverInstances: 未知 extra 端口离线时不展示', async () => {
    mockFetchByPort({})
    const list = await discoverInstances([61000])
    expect(list.some((i) => i.port === 61000)).toBe(false)
  })

  it('discoverInstances: 映射表外端口（未命名 DISCOVERY_PORTS 与未知 extras）离线均不渲染', async () => {
    // 全部离线：列表只剩映射表内 3 个已知端口的离线条目
    mockFetchByPort({})
    const list = await discoverInstances([61000])
    expect(list.map((i) => i.port).sort((a, b) => a - b)).toEqual([43120, 43128, 45120])
    expect(list.every((i) => i.status === 'offline' && !i.isCustom)).toBe(true)
    // 未开放（unavailable）的映射表外端口仍展示为本地实例
    mockFetchByPort({ 3080: 'forbidden', 61000: 'online' })
    const alive = await discoverInstances([61000])
    expect(alive.some((i) => i.port === 3080 && i.status === 'unavailable')).toBe(true)
    expect(alive.some((i) => i.port === 61000 && i.status === 'online')).toBe(true)
  })

  it('状态文案与字典逐字一致（zh / en）', () => {
    const online = { id: 'x', port: 1, nameZh: '', nameEn: '', status: 'online' as const, latencyMs: 42, isRecommended: false, isCustom: false }
    expect(instanceStatusText(online, 'zh')).toBe('在线 · 42ms')
    expect(instanceStatusText(online, 'en')).toBe('Online · 42ms')
    expect(instanceStatusText({ ...online, status: 'unavailable' }, 'zh')).toBe('未开放')
    expect(instanceStatusText({ ...online, status: 'unavailable' }, 'en')).toBe('Unavailable')
    expect(instanceStatusText({ ...online, status: 'offline' }, 'zh')).toBe('离线')
    expect(instanceStatusText({ ...online, status: 'offline' }, 'en')).toBe('Offline')
    expect(INSTANCE_SELECTOR_COPY.zh.recommended).toBe('推荐')
    expect(INSTANCE_SELECTOR_COPY.en.recommended).toBe('Recommended')
    expect(INSTANCE_SELECTOR_COPY.zh.emptyInstances).toBe('未发现可用实例')
    expect(INSTANCE_SELECTOR_COPY.zh.customPort).toBe('自定义端口')
    expect(INSTANCE_SELECTOR_COPY.zh.customConfirm).toBe('确定')
    expect(INSTANCE_SELECTOR_COPY.en.customConfirm).toBe('Add')
    expect(INSTANCE_SELECTOR_COPY.zh.selectInstance).toBe('选择实例')
    expect(INSTANCE_SELECTOR_COPY.zh.customPortPlaceholder).toBe('端口号')
  })
})
