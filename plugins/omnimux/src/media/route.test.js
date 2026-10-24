import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from './errors.js'
import { gatewayCandidates, parseMediaConfig, resolveMediaAuth, resolveMediaRoute, toMediaWireModelId } from './route.js'
import { mapOmnimuxInput } from './vendors/omnimux.js'
import { resetTestNetworkAttempts, testNetworkAttempts } from '../../scripts/test-network-guard.mjs'

describe('media route', () => {
  it('defaults to the OmniMux openai-media video row', () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('video', {}, media, {})
    assert.equal(route.providerId, 'omnimux')
    assert.equal(route.protocol, 'openai-media')
    assert.equal(route.baseUrl, 'https://api.omnimux.ai/v1')
    assert.equal(route.modelId, 'seedance-2-5')
    // 2026-10-21 网关对账 #3516 评审修正：默认档位是 720p 标准版（default:true），
    // 空意图请求自动钉住该默认线路（不再返回裸候选）。
    assert.equal(route.group, 'desktop-720p')
    assert.deepEqual(route.candidates, ['seedance-2-5@desktop-720p'])
    assert.equal(route.apiKey, '')
    assert.equal(route.authMode, 'auto')
  })

  it('pins the seedance-2-5 line by the requested resolution before the default tier', () => {
    // 2026-10-21 评审修正（#3516）：seedance-2-5 的 480p/720p 是两条带固定分辨率约束的线路，
    // 无显式分组的请求必须按 resolution 参数选线，否则默认 720p 档会在传输前拒绝 480p。
    const media = parseMediaConfig(undefined)
    const economy = resolveMediaRoute('video', { model: 'seedance-2-5', resolution: '480p' }, media, {})
    assert.equal(economy.group, 'desktop-480p')
    assert.deepEqual(economy.candidates, ['seedance-2-5@desktop-480p'])
    for (const request of [{ model: 'seedance-2-5', resolution: '720p' }, { model: 'seedance-2-5' }]) {
      const route = resolveMediaRoute('video', request, media, {})
      assert.equal(route.group, 'desktop-720p')
      assert.deepEqual(route.candidates, ['seedance-2-5@desktop-720p'])
    }
    // 显式分组始终优先于参数派生线路。
    const explicit = resolveMediaRoute('video', { model: 'seedance-2-5', group: '720p', resolution: '480p' }, media, {})
    assert.equal(explicit.group, '720p')
    assert.deepEqual(explicit.candidates, ['seedance-2-5@desktop-720p'])
  })

  it('defaults image to gpt-image-2.5 on the same provider row', () => {
    const route = resolveMediaRoute('image', {}, parseMediaConfig(undefined), {})
    assert.equal(route.providerId, 'omnimux')
    assert.equal(route.protocol, 'openai-media')
    assert.equal(route.modelId, 'gpt-image-2.5')
  })

  for (const model of [
    'grok-imagine-image-2',
    'grok-imagine-image',
    'grok-imagine-image-2-0',
    'grok-imagine-image-2.0',
  ]) {
    it('normalizes each registered image alias in request, env and config to Grok Image 2', () => {
      const media = parseMediaConfig(undefined)
      assert.equal(toMediaWireModelId(` ${model} `), 'grok-imagine-image-2-0')
      assert.equal(resolveMediaRoute('image', { model }, media, {}).modelId, 'grok-imagine-image-2-0')
      assert.equal(resolveMediaRoute('image', {}, media, { OMNIMUX_IMAGE_MODEL: model }).modelId, 'grok-imagine-image-2-0')
      media.providers.omnimux.models.image = model
      assert.equal(resolveMediaRoute('image', {}, media, {}).modelId, 'grok-imagine-image-2-0')
    })
  }

  it('does not rewrite other Grok image variants', () => {
    assert.equal(toMediaWireModelId('grok-imagine-image-quality'), 'grok-imagine-image-quality')
    assert.equal(toMediaWireModelId('grok-imagine-image-3'), 'grok-imagine-image-3')
  })

  it('overlays OmniMux env on the omnimux row', () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('video', {}, media, {
      OMNIMUX_BASE_URL: 'https://compat.example/v1/',
      OMNIMUX_VIDEO_MODEL: 'seedance-2-5',
      OMNIMUX_API_KEY: 'sk-a',
    })
    assert.equal(route.baseUrl, 'https://compat.example/v1')
    assert.equal(route.modelId, 'seedance-2-5')
    assert.equal(route.apiKey, 'sk-a')
  })

  it('pins provider and model from the request', () => {
    const media = parseMediaConfig({
      defaultProvider: 'omnimux',
      providers: {
        omnimux: {
          protocol: 'openai-media',
          baseUrl: 'https://api.omnimux.ai/v1',
          apiKeyEnv: 'OMNIMUX_API_KEY',
          models: { video: 'seedance-2-0-fast' },
        },
        other: {
          protocol: 'openai-media',
          baseUrl: 'https://other.example/v1',
          apiKeyEnv: 'OTHER_KEY',
          models: { video: 'other-video' },
        },
      },
    })
    const route = resolveMediaRoute('video', { provider: 'other', model: 'pinned' }, media, {
      OTHER_KEY: 'sk-b',
    })
    assert.equal(route.providerId, 'other')
    assert.equal(route.modelId, 'pinned')
    assert.deepEqual(route.candidates, ['pinned'])
    assert.equal(route.baseUrl, 'https://other.example/v1')
    assert.equal(route.apiKey, 'sk-b')
  })

  it('maps catalog grok-imagine-video-1-5 to grok-imagine-video-1-5', () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('video', { model: 'grok-imagine-video-1-5' }, media, {})
    assert.equal(route.modelId, 'grok-imagine-video-1-5')
  })

  it('does not guess a version for the obsolete generic Grok id', () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('video', { model: 'grok-imagine-video' }, media, {})
    assert.equal(route.modelId, 'grok-imagine-video')
  })

  it('maps dotted grok-imagine-video-1.5 to grok-imagine-video-1-5', () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('video', { model: 'grok-imagine-video-1.5' }, media, {})
    assert.equal(route.modelId, 'grok-imagine-video-1-5')
  })

  it('toMediaWireModelId normalizes only documented Grok 1.5 aliases', () => {
    assert.equal(toMediaWireModelId('grok-imagine-video-1-5'), 'grok-imagine-video-1-5')
    assert.equal(toMediaWireModelId('grok-imagine-video'), 'grok-imagine-video')
    assert.equal(toMediaWireModelId('grok-imagine-video-1.5'), 'grok-imagine-video-1-5')
    assert.equal(toMediaWireModelId('grok-imagine-video.1.5'), 'grok-imagine-video.1.5')
    assert.equal(toMediaWireModelId('seedance-2-0-fast'), 'seedance-2-0-fast')
    assert.equal(toMediaWireModelId(''), '')
  })

  it('rejects an unknown provider at resolve', () => {
    const media = parseMediaConfig(undefined)
    assert.throws(
      () => resolveMediaRoute('video', { provider: 'runway' }, media, {}),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-provider',
    )
  })

  it('rejects an unknown protocol at parse', () => {
    assert.throws(
      () => parseMediaConfig({
        providers: {
          omnimux: { protocol: 'kling-native', baseUrl: 'https://x', apiKeyEnv: 'K' },
        },
      }),
      /protocol must be one of/,
    )
  })

  it('validates authMode at parse', () => {
    const valid = parseMediaConfig({ authMode: 'token' })
    assert.equal(valid.authMode, 'token')

    assert.throws(
      () => parseMediaConfig({ authMode: 'invalid-mode' }),
      /media\.authMode must be one of/,
    )
  })

  it('supports inline apiKey in provider definition', () => {
    const media = parseMediaConfig({
      providers: {
        custom: {
          protocol: 'openai-media',
          baseUrl: 'https://custom.local/v1',
          apiKey: 'none',
          models: { image: 'custom-img' },
        },
      },
      defaultProvider: 'custom',
    })
    assert.equal(media.providers.custom.apiKey, 'none')
    const route = resolveMediaRoute('image', {}, media, {})
    assert.equal(route.providerId, 'custom')
    assert.equal(route.apiKey, 'none')
  })

  it('leaves t2v clean and omits talking-head metadata on video (#432)', () => {
    assert.deepEqual(mapOmnimuxInput('video', { prompt: 'a street at night' }), { prompt: 'a street at night' })
    assert.deepEqual(
      mapOmnimuxInput('video', { prompt: 'talk', image: 'https://face', speech: 'hello', audio: 'https://a.wav' }),
      {
        prompt: 'talk',
        image: 'https://face',
      },
    )
  })

  it('rejects a defaultProvider missing from the table', () => {
    assert.throws(
      () => parseMediaConfig({ defaultProvider: 'missing', providers: {} }),
      /defaultProvider 'missing'/,
    )
  })
})

describe('resolveMediaAuth (dual-track auth)', () => {
  it('测试用例 1：优先读取环境变量 OMNIMUX_API_KEY', async () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('image', {}, media, { OMNIMUX_API_KEY: 'sk-env-key' })
    const auth = await resolveMediaAuth(route, {
      env: { OMNIMUX_API_KEY: 'sk-env-key' },
      store: { resolve: async () => 'pat-token' },
      credentials: { resolve: async () => ({ value: 'cred-token' }) },
    })
    assert.deepEqual(auth, { apiKey: 'sk-env-key', authType: 'api-key' })
  })

  it('仅登录 store PAT 时明确拒绝，不读取 store 或发送网络请求', async () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('image', {}, media, {})
    let storeCalls = 0
    resetTestNetworkAttempts()
    await assert.rejects(() => resolveMediaAuth(route, {
      env: {},
      store: { resolve: async () => { storeCalls += 1; return 'pat-from-store' } },
    }), { code: 'needs-omnimux', message: '生成服务需要 API 密钥，请在当前凭证中配置 OMNIMUX_API_KEY；登录凭证不能用于生成' })
    assert.equal(storeCalls, 0)
    assert.deepEqual(testNetworkAttempts(), [])
  })

  it('仅登录 credentials PAT 时明确拒绝，不读取登录引用或 store，不发送网络请求', async () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('image', {}, media, {})
    const refs = []
    let storeCalls = 0
    resetTestNetworkAttempts()
    await assert.rejects(() => resolveMediaAuth(route, {
      env: {},
      store: { resolve: async () => { storeCalls += 1; return 'pat-from-store' } },
      credentials: { resolve: async (ref) => {
        refs.push(ref)
        return ref === 'OMNIMUX_ACCESS_TOKEN' ? { value: 'pat-from-cred' } : undefined
      } },
    }), { code: 'needs-omnimux', message: '生成服务需要 API 密钥，请在当前凭证中配置 OMNIMUX_API_KEY；登录凭证不能用于生成' })
    assert.deepEqual(refs, ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN'])
    assert.equal(storeCalls, 0)
    assert.deepEqual(testNetworkAttempts(), [])
  })

  it('credentials OMNIMUX_API_KEY 优先于登录 PAT，避免 PAT 401 /v1/images/generations', async () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('image', {}, media, {})
    const seen = []
    const auth = await resolveMediaAuth(route, {
      env: {},
      store: { resolve: async () => 'pat-from-store' },
      credentials: {
        async resolve(ref) {
          seen.push(ref)
          if (ref === 'OMNIMUX_API_KEY') return { value: 'sk-from-yaml' }
          if (ref === 'OMNIMUX_ACCESS_TOKEN') return { value: 'pat-from-cred' }
          return undefined
        },
      },
    })
    assert.deepEqual(auth, { apiKey: 'sk-from-yaml', authType: 'api-key' })
    assert.deepEqual(seen, ['OMNIMUX_API_KEY'])
  })

  it('测试用例 4：自定义 provider 且 apiKey: "none" 时，返回 authType: "none" 且不抛错', async () => {
    const media = parseMediaConfig({
      providers: {
        custom: {
          protocol: 'openai-media',
          baseUrl: 'https://comfy.internal/v1',
          apiKey: 'none',
          models: { image: 'sdxl' },
        },
      },
      defaultProvider: 'custom',
    })
    const route = resolveMediaRoute('image', {}, media, {})
    const auth = await resolveMediaAuth(route, { env: {} })
    assert.deepEqual(auth, { apiKey: '', authType: 'none' })
  })

  it('测试用例 5：均无凭证时，omnimux 供应商抛出 needs-omnimux', async () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('image', {}, media, {})
    await assert.rejects(
      () => resolveMediaAuth(route, { env: {} }),
      (error) => {
        assert(error instanceof OmnimuxError)
        assert.equal(error.code, 'needs-omnimux')
        assert.equal(error.message, '生成服务需要 API 密钥，请在当前凭证中配置 OMNIMUX_API_KEY；登录凭证不能用于生成')
        return true
      },
    )
  })

  it('未配置凭证的第三方 provider 抛出 omnimux-unconfigured', async () => {
    const media = parseMediaConfig({
      providers: {
        thirdparty: {
          protocol: 'openai-media',
          baseUrl: 'https://thirdparty.ai/v1',
          apiKeyEnv: 'THIRDPARTY_KEY',
          models: { image: 'tp-1' },
        },
      },
      defaultProvider: 'thirdparty',
    })
    const route = resolveMediaRoute('image', {}, media, {})
    await assert.rejects(
      () => resolveMediaAuth(route, { env: {} }),
      (error) => {
        assert(error instanceof OmnimuxError)
        assert.equal(error.code, 'omnimux-unconfigured')
        assert.match(error.message, /media provider 'thirdparty' has no apiKey configured/)
        return true
      },
    )
  })

  it('resolves channel candidates by cost_first and stability_first strategy', () => {
    const media = parseMediaConfig(undefined)
    // #3516：seedance-2-5 是现役唯一多线路模型：480p (21 积分) / 720p (29 积分)。
    const costRoute = resolveMediaRoute('video', { model: 'seedance-2-5', strategy: 'cost_first' }, media)
    assert.equal(costRoute.strategy, 'cost_first')
    assert.deepEqual(costRoute.candidates, [
      'seedance-2-5@desktop-480p',
      'seedance-2-5@desktop-720p',
    ])
    assert.equal(costRoute.candidates[0], 'seedance-2-5@desktop-480p')

    const stabRoute = resolveMediaRoute('video', { model: 'seedance-2-5', strategy: 'stability_first' }, media)
    assert.equal(stabRoute.strategy, 'stability_first')
    // 两档 24h 稳定性同为 100%，排序由平均等待时间决定（480p 60s < 720p 70s）。
    assert.equal(stabRoute.candidates[0], 'seedance-2-5@desktop-480p')
    // 只剩单条线路的 seedance-2-0 在任何策略下都只有 default 一条。
    assert.deepEqual(
      resolveMediaRoute('video', { model: 'seedance-2-0', strategy: 'cost_first' }, media).candidates,
      ['seedance-2-0@default'],
    )
  })

  it('resolves explicit group from model@group or request.group', () => {
    const media = parseMediaConfig(undefined)
    const inlineRoute = resolveMediaRoute('video', { model: 'seedance-2-0@standard' }, media)
    assert.equal(inlineRoute.modelId, 'seedance-2-0')
    assert.equal(inlineRoute.group, 'standard')
    assert.equal(inlineRoute.candidates[0], 'seedance-2-0@default')

    const fieldRoute = resolveMediaRoute('video', { model: 'seedance-2-0', group: 'standard' }, media)
    assert.equal(fieldRoute.group, 'standard')
    assert.equal(fieldRoute.candidates[0], 'seedance-2-0@default')
    // #3516：旧 pro 分组已随上游对账退场，显式点名必须 fail-closed。
    assert.throws(
      () => resolveMediaRoute('video', { model: 'seedance-2-0', group: 'pro' }, media),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-group' && /pro/.test(error.message),
    )
  })

  it('reports no strategy only when no default line can be auto-pinned', () => {
    const media = parseMediaConfig(undefined)
    const legacy = resolveMediaRoute('video', { model: 'seedance-2-0' }, media)
    // #3516：seedance-2-0 声明 default 分组 → 空意图自动钉住默认线路，策略记为 auto。
    assert.equal(legacy.strategy, 'auto')
    assert.deepEqual(legacy.unresolvedGroups, [])
    assert.deepEqual(legacy.candidates, ['seedance-2-0@default'])
    // 无 default 分组、无分组表的型号保持未设置策略。
    const bare = resolveMediaRoute('image', { model: 'nano-banana-2' }, media)
    assert.equal(bare.strategy, undefined)
    assert.deepEqual(bare.unresolvedGroups, [])
    assert.ok(bare.candidates.every((id) => !id.includes('@')))
  })

  it('refuses a routing request whose pool matches no configured channel', () => {
    const media = parseMediaConfig(undefined)
    // Widening this into the full channel set would silently escalate cost.
    assert.throws(
      () => resolveMediaRoute('video', { model: 'seedance-2-0', allowedGroups: ['premium-v9'] }, media),
      (error) => error instanceof OmnimuxError
        && error.code === 'unknown-group'
        && /premium-v9/.test(error.message),
    )
  })

  it('rejects unusable channel intent on a model without a channel pool', () => {
    const media = parseMediaConfig(undefined)
    assert.throws(
      () => resolveMediaRoute('image', { model: 'grok-imagine-image-2', allowedGroups: ['standard'] }, media, {}),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-group' && /standard/.test(error.message),
    )
    assert.deepEqual(resolveMediaRoute('image', { model: 'grok-imagine-image-2' }, media, {}).candidates, [
      'grok-imagine-image-2-0', 'grok-imagine-image-2', 'grok-imagine-image', 'grok-imagine-image-2.0',
    ])
  })

  it('auto-pins the default line when a model declares one and the caller gave no intent', () => {
    const media = parseMediaConfig(undefined)
    const imageRoute = resolveMediaRoute('image', { model: 'gpt-image-2.5' }, media)
    // 默认分组的 wireGroup 是 `default`（分组 id 为 standard）。
    assert.equal(imageRoute.group, 'default')
    // Pool is locked to the single default line so it never fails over into a different price tier.
    assert.deepEqual(imageRoute.candidates, ['gpt-image-2.5@default'])

    // 显式选择非默认线路仍只锁定该线路。
    const economyRoute = resolveMediaRoute('image', { model: 'gpt-image-2.5', group: 'economy' }, media)
    assert.equal(economyRoute.group, 'economy')
    assert.deepEqual(economyRoute.candidates, ['gpt-image-2.5@gpt-image-2.5-economy'])

    // #3516：flare / sunburst 的分组表已移除（仅登记不上架），空意图保留裸候选而不钉线路。
    const flareRoute = resolveMediaRoute('image', { model: 'gpt-image-2.5-flare' }, media)
    assert.equal(flareRoute.modelId, 'gpt-image-2.5-flare')
    assert.equal(flareRoute.group, undefined)
    assert.deepEqual(flareRoute.candidates, ['gpt-image-2.5-flare'])
  })

  it('rejects an unregistered explicit line and honors a registered default override', () => {
    const media = parseMediaConfig(undefined)
    assert.throws(
      () => resolveMediaRoute('image', { model: 'gpt-image-2.5-flare', group: 'pro' }, media, {}),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-group',
    )
    // #3516：旧 pro 线路已退场，显式点名同样 fail-closed。
    assert.throws(
      () => resolveMediaRoute('image', { model: 'gpt-image-2.5', group: 'pro' }, media, {}),
      (error) => error instanceof OmnimuxError && error.code === 'unknown-group',
    )
    // 已登记的 economy 线路可被显式选择。
    const explicit = resolveMediaRoute('image', { model: 'gpt-image-2.5', group: 'economy' }, media, {})
    assert.equal(explicit.group, 'economy')
    assert.deepEqual(explicit.candidates, ['gpt-image-2.5@gpt-image-2.5-economy'])
  })

  it('models without a pinned default line retain legacy bare candidates under empty intent', () => {
    const media = parseMediaConfig(undefined)
    // nano-banana-2 has channel groups but none flagged `default: true`, so an
    // empty intent must keep the legacy bare candidate list instead of pinning.
    const baseRoute = resolveMediaRoute('image', { model: 'nano-banana-2' }, media)
    assert.equal(baseRoute.group, undefined)
    assert.deepEqual(baseRoute.candidates, gatewayCandidates('nano-banana-2'))
    assert.ok(baseRoute.candidates.every((candidate) => !candidate.includes('@')))
  })
})

