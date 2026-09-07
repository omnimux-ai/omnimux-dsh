import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from './errors.js'
import { parseMediaConfig, resolveMediaAuth, resolveMediaRoute, toMediaWireModelId } from './route.js'
import { mapOmnimuxInput } from './vendors/omnimux.js'

describe('media route', () => {
  it('defaults to the OmniMux openai-media video row', () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('video', {}, media, {})
    assert.equal(route.providerId, 'omnimux')
    assert.equal(route.protocol, 'openai-media')
    assert.equal(route.baseUrl, 'https://api.omnimux.ai/v1')
    assert.equal(route.modelId, 'seedance-2-0-fast')
    assert.deepEqual(route.candidates, ['seedance-2-0-fast', 'seedance-2.0-fast'])
    assert.equal(route.apiKey, '')
    assert.equal(route.authMode, 'auto')
  })

  it('defaults image to gpt-image-2 on the same provider row', () => {
    const route = resolveMediaRoute('image', {}, parseMediaConfig(undefined), {})
    assert.equal(route.providerId, 'omnimux')
    assert.equal(route.protocol, 'openai-media')
    assert.equal(route.modelId, 'gpt-image-2')
  })

  for (const model of [
    'grok-imagine-image-2',
    'grok-imagine-image',
    'grok-imagine-image-2-0',
    'grok-imagine-image-2.0',
  ]) {
    it(`normalizes image request, env and config model ${model} to Grok Image 2`, () => {
      const media = parseMediaConfig(undefined)
      assert.equal(toMediaWireModelId(` ${model} `), 'grok-imagine-image-2')
      assert.equal(resolveMediaRoute('image', { model }, media, {}).modelId, 'grok-imagine-image-2')
      assert.equal(resolveMediaRoute('image', {}, media, { OMNIMUX_IMAGE_MODEL: model }).modelId, 'grok-imagine-image-2')
      media.providers.omnimux.models.image = model
      assert.equal(resolveMediaRoute('image', {}, media, {}).modelId, 'grok-imagine-image-2')
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

  it('测试用例 2：无环境变量但 store.resolve() 返回 PAT 时，成功解析并返回 authType: access-token', async () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('image', {}, media, {})
    const auth = await resolveMediaAuth(route, {
      env: {},
      store: { resolve: async () => 'pat-from-store' },
    })
    assert.deepEqual(auth, { apiKey: 'pat-from-store', authType: 'access-token' })
  })

  it('测试用例 3：无环境变量但 credentials.resolve("OMNIMUX_ACCESS_TOKEN") 返回 PAT 时，成功解析', async () => {
    const media = parseMediaConfig(undefined)
    const route = resolveMediaRoute('image', {}, media, {})
    const auth = await resolveMediaAuth(route, {
      env: {},
      credentials: { resolve: async (ref) => (ref === 'OMNIMUX_ACCESS_TOKEN' ? { value: 'pat-from-cred' } : undefined) },
    })
    assert.deepEqual(auth, { apiKey: 'pat-from-cred', authType: 'access-token' })
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
        assert.match(error.message, /请先在侧边栏登录 OmniMux 账号，或配置 OMNIMUX_API_KEY/)
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
})
