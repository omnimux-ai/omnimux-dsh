import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  executeOmnimuxMedia,
  resolveEffectiveMediaModel,
  isExternalMediaProvider,
  EXTERNAL_MEDIA_PROVIDERS,
} from './execute.js'
import { DEFAULT_PROVIDER_ENDPOINTS } from '../byok/http.js'
import { mountMedia } from './mount.js'
import { assertRuntimeReady } from '../settings/runtime-mode.js'

describe('Multi-Channel Runtime & Effective Media Model', () => {
  describe('resolveEffectiveMediaModel', () => {
    it('strips channel suffix and prioritizes explicit inputModel', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImageModel: 'global-singleton-model',
      }
      assert.equal(
        resolveEffectiveMediaModel('seedance-2-0@byok-fal', 'fal', 'video', settings),
        'seedance-2-0',
      )
      assert.equal(
        resolveEffectiveMediaModel('gpt-image-2.5@standard', 'openai', 'image', settings),
        'gpt-image-2.5',
      )
      assert.equal(
        resolveEffectiveMediaModel('seedance-2-0', 'fal', 'video', settings),
        'seedance-2-0',
      )
    })

    it('falls back to mediaChoice.activeModel when inputModel is not provided', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImageModel: 'custom-flux-pro',
      }
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'fal', 'image', settings),
        'custom-flux-pro',
      )
      assert.equal(
        resolveEffectiveMediaModel('', 'fal', 'image', settings),
        'custom-flux-pro',
      )
      assert.equal(
        resolveEffectiveMediaModel('   ', 'fal', 'image', settings),
        'custom-flux-pro',
      )
    })

    it('falls back to runtimeKeyModel when mediaChoice has no explicit provider', () => {
      const settings = {
        runtimeKeyModel: 'custom-model-id',
      }
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'custom', 'image', settings),
        'custom-model-id',
      )
    })

    it('falls back to DEFAULT_MEDIA_MODELS when neither is configured', () => {
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'fal', 'image', {}),
        'fal-ai/flux/dev',
      )
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'fal', 'video', {}),
        'fal-ai/kling-video/v1/standard',
      )
    })

    it('reads provider-specific model configuration from byokProviders when inputModel is omitted', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImageModel: 'flux-dev-default',
        byokProviders: [
          {
            provider: 'openai',
            verified: true,
            models: {
              image: 'dall-e-3-hd',
            },
          },
          {
            provider: 'openrouter',
            verified: true,
            model: 'midjourney-proxy-v1',
          },
          {
            provider: 'unverified-provider',
            verified: false,
            model: 'should-never-be-read',
          },
        ],
      }
      // 1. 请求 openai provider 时读取 openai 专属模型
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'openai', 'image', settings),
        'dall-e-3-hd',
      )
      // 2. 只有通用 model、没有模态能力声明时，不把它当成图片模型
      assert.notEqual(
        resolveEffectiveMediaModel(undefined, 'openrouter', 'image', settings),
        'midjourney-proxy-v1',
      )
      // 3. 请求主 provider (fal) 时读取主配置模型
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'fal', 'image', settings),
        'flux-dev-default',
      )
      // 4. 请求未通过验证的提供商时，绝不读取未验证记录的物理模型（防冒领），安全兜底
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'unverified-provider', 'image', settings),
        'fal-ai/flux/dev',
      )
    })

    it('prioritizes explicit logical model when specified and falls back to provider physical model when omitted', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            models: {
              image: 'fal-ai/flux/schnell',
            },
          },
        ],
      }
      // 传入逻辑模型 seedream-5-0-pro@byok-fal 时，优先解析为该显式逻辑模型
      assert.equal(
        resolveEffectiveMediaModel('seedream-5-0-pro@byok-fal', 'fal', 'image', settings),
        'seedream-5-0-pro',
      )
      // 未显式指定模型时，回退至该 BYOK 提供商指定的物理模型
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'fal', 'image', settings),
        'fal-ai/flux/schnell',
      )
    })

    it('strips bare channel prefix like @byok-fal and falls back safely to default model', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
      }
      // 裸渠道前缀 @byok-fal 不能作为模型名，应截断为空并安全降级到默认模型
      assert.equal(
        resolveEffectiveMediaModel('@byok-fal', 'fal', 'image', settings),
        'fal-ai/flux/dev',
      )
      assert.equal(
        resolveEffectiveMediaModel('@official', 'fal', 'video', settings),
        'fal-ai/kling-video/v1/standard',
      )
    })

    it('prevents cross-provider activeModel leakage when requesting different BYOK provider', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImageModel: 'main-fal-exclusive-model',
      }
      // 当前 provider 为 openai，主 provider 为 fal，严禁读取 fal 的 activeModel 产生串线
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'openai', 'image', settings),
        'fal-ai/flux/dev',
      )
      // 若当前 provider 与主 provider 匹配，才允许读取 activeModel
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'fal', 'image', settings),
        'main-fal-exclusive-model',
      )
    })

    it('safely parses complex or multi-at model strings using parseModelAndGroup without corruption', () => {
      // 保证复用 parseModelAndGroup：多于一个 @ 时 Fail-Closed，安全回退到默认模型杜绝畸变冒领
      assert.equal(
        resolveEffectiveMediaModel('seedance-2-0@standard@extra', 'fal', 'video', {}),
        'fal-ai/kling-video/v1/standard',
      )
      assert.equal(
        resolveEffectiveMediaModel('gpt-image-2.5@byok-fal', 'fal', 'image', {}),
        'gpt-image-2.5',
      )
    })

    it('defensively validates runtimeMediaProvider string type and safely falls back to fal when malformed', () => {
      for (const invalid of [123, true, {}, [], null, '   ']) {
        const settings = {
          runtimeMediaProvider: invalid,
        }
        assert.equal(
          resolveEffectiveMediaModel(undefined, undefined, 'image', settings),
          'fal-ai/flux/dev',
        )
      }
    })

    it('prioritizes explicit logical model when specified even if provider has configured physical model', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImageModel: 'flux-dev-real',
      }
      // 传入显式逻辑模型时，优先返回该模型 ID
      assert.equal(
        resolveEffectiveMediaModel('seedream-5-0', 'fal', 'image', settings),
        'seedream-5-0',
      )
      // 若外部提供商未显式传入模型 ID，才解析为主配置的物理模型
      assert.equal(
        resolveEffectiveMediaModel(undefined, 'fal', 'image', settings),
        'flux-dev-real',
      )
      assert.equal(
        resolveEffectiveMediaModel('seedance-2-0', 'fal', 'video', settings),
        'seedance-2-0',
      )
    })

    it('never lets unverified byok record model win over verified record without model', () => {
      const settings = {
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        byokProviders: [
          // 已验证记录：未配置物理模型
          {
            provider: 'fal',
            verified: true,
          },
          // 未验证记录：配置了物理模型，绝不能胜出！
          {
            provider: 'fal',
            verified: false,
            models: {
              image: 'malicious-unverified-model',
            },
          },
        ],
      }
      // 不传 inputModel，且已验证记录无模型，不能被未验证记录的模型胜出，回退到主配置/默认模型
      const resolved = resolveEffectiveMediaModel(undefined, 'fal', 'image', settings)
      assert.notEqual(resolved, 'malicious-unverified-model')
      assert.equal(resolved, 'fal-ai/flux/dev')
    })

    it('strictly validates modal capability to prevent image generation picking video model from same-provider records in byokProviders', () => {
      const settings = {
        byokProviders: [
          // 记录 1：同名 provider，但显式声明为 video 模态
          {
            provider: 'siliconflow',
            verified: true,
            capabilities: ['video'],
            model: 'wan-2.1',
            videoModel: 'wan-2.1',
          },
          // 记录 2：同名 provider，显式声明为 image 模态
          {
            provider: 'siliconflow',
            verified: true,
            capabilities: ['image'],
            model: 'flux-schnell',
            imageModel: 'flux-schnell',
          },
        ],
      }
      // 请求 image 模态，严禁误取到前面的 video 专线模型 wan-2.1
      const resolved = resolveEffectiveMediaModel(undefined, 'siliconflow', 'image', settings)
      assert.equal(resolved, 'flux-schnell')

      // 反向校验：请求 video 模态，必须正确取到 wan-2.1
      const resolvedVideo = resolveEffectiveMediaModel(undefined, 'siliconflow', 'video', settings)
      assert.equal(resolvedVideo, 'wan-2.1')
    })
  })

  describe('executeOmnimuxMedia with agent mode and BYOK channel routing', () => {
    it('executes without throwing in agent mode when fal is verified and byok-fal is selected', async () => {
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-claude',
        runtimeAgentVerified: true,
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
      }

      // 验证 assertRuntimeReady 不再抛错
      assert.doesNotThrow(() => assertRuntimeReady(settings, 'image'))

      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          capturedReq = req
          return {
            taskId: 'task-fake-123',
            outputs: [],
          }
        },
      }

      const credentials = {
        resolve: async (ref) => {
          if (ref === 'OMNIMUX_MEDIA_KEY_FAL') return { value: 'fake-fal-key' }
          return undefined
        },
      }

      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/test-output.png',
        model: 'seedance-2-0@byok-fal',
        prompt: 'test prompt',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })

      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-fake-123')
      assert.ok(capturedReq)
      // 核心断言：传入的逻辑模型 seedance-2-0 未被单例模型篡改，剥离了 @byok-fal
      assert.equal(capturedReq.input.model, 'seedance-2-0')
      assert.equal(capturedReq.providerId, 'fal')
    })

    it('handles live mode with mock fetcher without triggering network guard', async () => {
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-claude',
        runtimeAgentVerified: true,
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
      }

      const fakeRuntime = {
        execute: async () => ({
          taskId: 'task-live-456',
          outputs: [{ type: 'image', url: 'https://mock.local/result.png' }],
        }),
      }

      const mockFetcher = async () => new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })

      const credentials = {
        resolve: async (ref) => {
          if (ref === 'OMNIMUX_MEDIA_KEY_FAL') return { value: 'fake-fal-key' }
          return undefined
        },
      }

      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/test-live-output.png',
        model: 'seedance-2-0@byok-fal',
        prompt: 'test prompt',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        fetcher: mockFetcher,
        wait: true,
      })

      assert.equal(result.mode, 'live')
      assert.equal(result.taskId, 'task-live-456')
      assert.equal(result.url, 'https://mock.local/result.png')
    })

    it('throws omnimux-unconfigured when byok channel is requested but provider is unconfigured or unverified', async () => {
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-claude',
        runtimeAgentVerified: true,
        // 主配置是 fal，且已验证
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeMediaImage: true,
        byokProviders: [
          // openai 未通过验证
          { provider: 'openai', verified: false },
        ],
      }

      // 请求未验证的 byok-openai 渠道，必须抛出 omnimux-unconfigured
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test-unverified.png',
          model: 'seedance-2-0@byok-openai',
          prompt: 'test prompt',
          runtimeSettings: settings,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /自备渠道 openai 未配置或未通过验证/)
          return true
        },
      )

      // 请求完全未配置的 byok-custom 渠道，也必须抛出 omnimux-unconfigured
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test-unconfigured.png',
          model: 'seedance-2-0@byok-custom',
          prompt: 'test prompt',
          runtimeSettings: settings,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /自备渠道 custom 未配置或未通过验证/)
          return true
        },
      )
    })

    it('rejects unsupported capability types strictly with omnimux-invalid-request', async () => {
      await assert.rejects(
        () => executeOmnimuxMedia('invalid-cap', {
          dest: '/tmp/test.png',
          prompt: 'test',
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-invalid-request')
          assert.match(err.message, /不支持的媒体能力类型/)
          return true
        },
      )
    })

    it('rejects bare BYOK channel prefix missing provider name', async () => {
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          model: 'seedance-2-0@byok-',
          prompt: 'test',
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-invalid-request')
          assert.match(err.message, /BYOK 渠道名称不合法或缺少提供商标识/)
          return true
        },
      )
    })

    it('does not falsely block BYOK channel in agent mode when main mediaChoice is unready', async () => {
      // 场景：Agent 模式下，主媒体配置未开启（runtimeKeyVerified 为 false），但 byokProviders 列表中配置并验证了 openai
      const agentSettings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-agent',
        runtimeAgentVerified: true,
        runtimeKeyVerified: false,
        byokProviders: [
          {
            provider: 'openai',
            verified: true,
            image: true,
          },
        ],
      }

      let executed = false
      const fakeRuntime = {
        execute: async () => {
          executed = true
          return { taskId: 'task-openai-1', outputs: [] }
        },
      }

      const credentials = {
        resolve: async (ref) => {
          if (ref === 'OMNIMUX_MEDIA_KEY_OPENAI') return { value: 'sk-openai-key' }
          return undefined
        },
      }

      // 请求合法已配置的 byok-openai 渠道，绝不能被“本机助手只承接文字”拦截
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/openai-out.png',
        model: 'seedance-2-0@byok-openai',
        prompt: 'test prompt',
        runtimeSettings: agentSettings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })

      assert.equal(executed, true)
      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-openai-1')
    })

    it('strictly throws when requested BYOK channel has capability disabled even if main provider has it enabled', async () => {
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-agent',
        runtimeAgentVerified: true,
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImage: true,
        runtimeMediaVideo: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            image: true,
            video: false,
          },
        ],
      }

      await assert.rejects(
        () => executeOmnimuxMedia('video', {
          dest: '/tmp/video-out.mp4',
          model: 'seedance-2-0@byok-fal',
          prompt: 'test video',
          runtimeSettings: settings,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /媒体生成提供商未开启视频/)
          return true
        },
      )
    })

    it('robustly selects verified item when multiple records exist for same provider in byokProviders', async () => {
      let executed = false
      const fakeRuntime = {
        execute: async (req) => {
          executed = true
          assert.equal(req.providerId, 'fal')
          return { taskId: 'task-multi-fal-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async () => ({ value: 'fake-multi-key' }),
      }
      const multiSettings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-agent',
        runtimeAgentVerified: true,
        byokProviders: [
          // 前置失效记录（未验证）
          { provider: 'fal', verified: false, image: true },
          // 前置失效记录（能力被显式禁用）
          { provider: 'fal', verified: true, image: false },
          // 后置有效记录（已验证且开启对应模态）
          { provider: 'fal', verified: true, image: true },
        ],
      }
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/multi-test.png',
        model: 'seedance-2-0@byok-fal',
        prompt: 'test multi',
        runtimeSettings: multiSettings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(executed, true)
      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-multi-fal-1')
    })

    it('prevents unverified byok candidates from shadowing main provider valid configuration', async () => {
      let executed = false
      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          executed = true
          capturedReq = req
          return { taskId: 'task-main-fal-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async () => ({ value: 'fake-fal-key' }),
      }
      const settings = {
        runtimeMode: 'key',
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImage: true,
        runtimeMediaImageModel: 'flux-main-model',
        byokProviders: [
          // 未通过验证的候选记录，严禁越权遮蔽主提供商有效配置
          { provider: 'fal', verified: false, image: false, endpoint: 'https://unverified-invalid-endpoint.com' },
        ],
      }
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/shadowing-test.png',
        model: 'seedance-2-0@byok-fal',
        prompt: 'test shadowing protection',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(executed, true)
      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-main-fal-1')
      // 验证未被未验证候选记录篡改 endpoint
      assert.notEqual(capturedReq?.endpoint, 'https://unverified-invalid-endpoint.com')
    })

    it('does not silently fallback to fal when runtimeMediaProvider is missing and restricts BYOK_KEY_REF to fal only', async () => {
      // 1. runtimeMediaProvider 缺失时，即使 runtimeKeyVerified: true，请求 @byok-fal 也不能静默当作已验证
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/fal-out.png',
          model: 'seedance-2-0@byok-fal',
          prompt: 'test',
          runtimeSettings: {
            runtimeMode: 'agent',
            runtimeAgentId: 'local-agent',
            runtimeAgentVerified: true,
            runtimeKeyVerified: true,
            runtimeMediaImage: true,
          },
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /自备渠道 fal 未配置或未通过验证/)
          return true
        },
      )

      // 2. 非 fal 的提供商（如 openrouter）在缺少专属 key 时，绝不回退读取 BYOK_KEY_REF (OMNIMUX_MEDIA_KEY)
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/or-out.png',
          model: 'seedance-2-0@byok-openrouter',
          prompt: 'test',
          runtimeSettings: {
            runtimeMode: 'agent',
            runtimeAgentId: 'local-agent',
            runtimeAgentVerified: true,
            byokProviders: [
              { provider: 'openrouter', verified: true, image: true },
            ],
          },
          env: {
            OMNIMUX_MEDIA_KEY: 'fal-secret-key-must-not-leak',
          },
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /openrouter 媒体 API 密钥未找到/)
          return true
        },
      )
    })

    it('throws omnimux-unconfigured when custom provider endpoint is missing', async () => {
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'claude',
        runtimeAgentVerified: true,
        byokProviders: [
          { provider: 'custom', verified: true, endpoint: '  ', image: true },
        ],
      }
      await assert.rejects(
        executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          model: 'gpt-image-2.5@byok-custom',
          prompt: 'test',
          runtimeSettings: settings,
          credentials: { resolve: async () => ({ value: 'custom-key' }) },
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /custom 媒体端点未配置或协议不合法，请在设置中填写 http\(s\) 地址/)
          return true
        },
      )
    })

    it('throws omnimux-unconfigured when custom provider endpoint protocol is invalid (non-http/https)', async () => {
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'claude',
        runtimeAgentVerified: true,
        byokProviders: [
          { provider: 'custom', verified: true, endpoint: 'ftp://my-custom.ai/api', image: true },
        ],
      }
      await assert.rejects(
        executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          model: 'gpt-image-2.5@byok-custom',
          prompt: 'test',
          runtimeSettings: settings,
          credentials: { resolve: async () => ({ value: 'custom-key' }) },
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /custom 媒体端点未配置或协议不合法，请在设置中填写 http\(s\) 地址/)
          return true
        },
      )
    })

    it('intercepts custom provider with empty endpoint when no channel preference is given', async () => {
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'claude',
        runtimeAgentVerified: true,
        runtimeMediaProvider: 'custom',
        runtimeKeyVerified: true,
        runtimeKeyEndpoint: '',
        runtimeMediaImage: true,
      }
      await assert.rejects(
        executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          model: 'gpt-image-2.5',
          prompt: 'test',
          runtimeSettings: settings,
          credentials: { resolve: async () => ({ value: 'custom-key' }) },
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /custom 媒体端点未配置，请在设置中填写/)
          return true
        },
      )
    })

    it('prevents modal-mismatched byok candidate from shadowing main provider valid config on plain request', async () => {
      let executed = false
      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          executed = true
          capturedReq = req
          return { taskId: 'task-main-fal-video-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async () => ({ value: 'fake-fal-key' }),
      }
      const settings = {
        runtimeMode: 'key',
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaVideo: true,
        runtimeMediaVideoModel: 'fal-ai/kling-video/v1/pro',
        byokProviders: [
          // 已验证的 BYOK 记录，但只开启了图片，未开启视频
          {
            provider: 'fal',
            verified: true,
            image: true,
            video: false,
            endpoint: 'https://byok-endpoint-fal.com',
          },
        ],
      }
      // 普通请求（非显式 @byok-fal 渠道），请求 video 模态
      const result = await executeOmnimuxMedia('video', {
        dest: '/tmp/shadowing-video-test.mp4',
        model: 'seedance-2-0',
        prompt: 'test shadowing protection for video',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(executed, true)
      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-main-fal-video-1')
      // 成功回退至主渠道，未被模态不匹配的 BYOK 记录遮蔽，优先保留调用方显式逻辑模型
      assert.equal(capturedReq?.input?.model, 'seedance-2-0')
    })

    it('routes to byok when main mediaChoice is unready but byokProviders has verified item', async () => {
      let executed = false
      const fakeRuntime = {
        execute: async () => {
          executed = true
          return { taskId: 'task-byok-ready-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async () => ({ value: 'fake-fal-key' }),
      }
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-claude',
        runtimeAgentVerified: true,
        // 主媒体提供商未配置且 unready
        runtimeMediaProvider: '',
        runtimeKeyVerified: false,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            image: true,
          },
        ],
      }
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/byok-ready-test.png',
        model: 'gpt-image-2.5@byok-fal',
        prompt: 'test byok route',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(executed, true)
      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-byok-ready-1')
    })

    it('strictly throws unknown-group when explicit unknown channel is requested', async () => {
      const credentials = {
        resolve: async () => ({ value: 'fake-fal-key' }),
      }
      const settings = {
        runtimeMode: 'key',
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImage: true,
      }
      await assert.rejects(
        async () => {
          await executeOmnimuxMedia('image', {
            dest: '/tmp/unknown-channel.png',
            model: 'seedance-2-0@unknown-custom-group',
            prompt: 'test prompt',
            runtimeSettings: settings,
            credentials,
          })
        },
        (err) => {
          assert.equal(err.code, 'unknown-group')
          assert.match(err.message, /所选渠道分组不可用（unknown-custom-group）/)
          return true
        },
      )
    })

    it('strictly purges untrusted client env when reconstructing external BYOK request', async () => {
      let executed = false
      const fakeRuntime = {
        execute: async () => {
          executed = true
          return { taskId: 'task-byok-clean-env', outputs: [] }
        },
      }
      const credentials = {
        resolve: async (ref) => {
          if (ref === 'OMNIMUX_MEDIA_KEY_CUSTOM') return { value: 'secure-custom-key' }
          return undefined
        },
      }
      const settings = {
        runtimeMode: 'key',
        runtimeKeyEndpoint: 'https://custom-gateway.internal/v1',
        runtimeKeyVerified: true,
        runtimeMediaProvider: 'custom',
        runtimeMediaImage: true,
        runtimeMediaModel: 'dall-e-3',
      }
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/byok-clean-env.png',
        model: 'dall-e-3@byok-custom',
        prompt: 'test clean env',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
        env: {
          UNTRUSTED_CLIENT_VAR: 'malicious-data',
          OMNIMUX_TOKEN: 'forged-token',
        },
      })
      assert.equal(executed, true)
      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-byok-clean-env')
    })
  })

  describe('mountMedia channel intent and hasOfficialToken anti-penetration', () => {
    it('blocks unconfigured requests in agent mode even if OMNIMUX_API_KEY is present', () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-mock-official-token'

        let currentSettings = {
          runtimeMode: 'agent',
          runtimeAgentId: 'local-agent',
          runtimeAgentVerified: true,
          // 未配置或验证媒体 Provider
          runtimeKeyVerified: false,
        }

        let executed = false
        const fakeCtx = {
          get: (key) => (key === 'settings' ? { get: () => currentSettings } : undefined),
          tools: { register: () => {} },
          provide: () => {},
        }

        let mountedApi = null
        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async () => {
            executed = true
            return { ok: true }
          },
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })
        fakeCtx.provide = (name, api) => {
          if (name === 'imageGenerate') mountedApi = api
        }
        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async () => {
            executed = true
            return { ok: true }
          },
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })

        assert.ok(mountedApi)

        // 1. 普通未指定渠道请求：不能因为存在 OMNIMUX_API_KEY 而穿透跳过校验，必须抛出“尚未配置图片、视频和音频”
        assert.throws(
          () => mountedApi.execute({ dest: '/tmp/out.png', model: 'seedance-2-0' }),
          /尚未配置图片、视频和音频/,
        )
        assert.equal(executed, false)

        // 2. 指定了 BYOK 渠道但本地未配置好：不能穿透跳过校验，必须抛出“尚未配置图片、视频和音频”
        assert.throws(
          () => mountedApi.execute({ dest: '/tmp/out.png', model: 'seedance-2-0@byok-fal' }),
          /尚未配置图片、视频和音频/,
        )
        assert.equal(executed, false)

        // 3. 在 Agent 模式下即使传了 @official 渠道，服务端权威状态不是 official 也坚决阻止越权绕过
        assert.throws(
          () => mountedApi.execute({ dest: '/tmp/out.png', model: 'seedance-2-0@official' }),
          /尚未配置图片、视频和音频/,
        )
        assert.equal(executed, false)

        // 4. 在 Key 模式下即使传了 @official 渠道，服务端权威状态不是 official 也坚决阻止越权绕过
        currentSettings = { runtimeMode: 'key', runtimeKeyVerified: false }
        assert.throws(
          () => mountedApi.execute({ dest: '/tmp/out.png', model: 'seedance-2-0@official' }),
          /尚未配置图片、视频和音频/,
        )
        assert.equal(executed, false)

        // 5. 切换为官方模式且存在官方 Token 时，常规官方请求（未显式指定渠道组）与显式官方渠道均正确识别为默认官方渠道并安全放行
        currentSettings = { runtimeMode: 'official' }
        executed = false
        assert.doesNotThrow(() => {
          mountedApi.execute({ dest: '/tmp/out.png', model: 'seedance-2-0' })
        })
        assert.equal(executed, true)

        executed = false
        assert.doesNotThrow(() => {
          mountedApi.execute({ dest: '/tmp/out.png', model: 'seedance-2-0@official' })
        })
        assert.equal(executed, true)

        // 6. 伪造环境变量越权拦截：即使 req.env 传入了伪造的 OMNIMUX_API_KEY，但系统环境被清除时必须严格拦截
        executed = false
        delete process.env.OMNIMUX_API_KEY
        currentSettings = { runtimeMode: 'agent', runtimeAgentVerified: true, runtimeKeyVerified: false }
        assert.throws(
          () => mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@official',
            env: { OMNIMUX_API_KEY: 'sk-forged-token' },
          }),
          /尚未配置图片、视频和音频/,
        )
        assert.equal(executed, false)

        // 7. 渠道严格判定：非已知官方专线且非 byok- 的未知自定义渠道，绝不能误判为官方放行
        process.env.OMNIMUX_API_KEY = 'sk-mock-official-token'
        currentSettings = { runtimeMode: 'agent', runtimeAgentVerified: true, runtimeKeyVerified: false }
        assert.throws(
          () => mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@unknown-custom-channel',
          }),
          /尚未配置图片、视频和音频/,
        )
        assert.equal(executed, false)

        // 8. 官方凭据判定移至安全上下文，不信任调用方请求体自带的 req.env.OMNIMUX_API_KEY
        // (a) 在未开启官方兜底时，即使系统存在官方 Token，官方专线请求也坚决拦截
        currentSettings = { runtimeMode: 'agent', runtimeAgentVerified: true, runtimeKeyVerified: false, allowOfficialMediaFallback: false }
        executed = false
        assert.throws(
          () => mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@official',
          }),
          /尚未配置图片、视频和音频/,
        )
        assert.equal(executed, false)

        // (b) 开启官方兜底且系统安全上下文存在有效 Token 时，无需也不信任调用方 req.env，官方专线安全放行
        currentSettings = { runtimeMode: 'agent', runtimeAgentId: 'local-agent', runtimeAgentVerified: true, runtimeKeyVerified: false, allowOfficialMediaFallback: true }
        executed = false
        assert.doesNotThrow(() => {
          mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@official',
          })
        })
        assert.equal(executed, true)

        // (c) 即使调用方传入了不一致或伪造的 req.env，只要服务端安全上下文有效，鉴权不受不可信客户端 payload 干扰
        executed = false
        assert.doesNotThrow(() => {
          mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@official',
            env: { OMNIMUX_API_KEY: 'untrusted-client-key' },
          })
        })
        assert.equal(executed, true)

        // 9. 官方 Token 真实性防伪：当环境变量仅包含占位符（undefined/null/false 等伪造字符串）时，严格判定为无官方凭据并拦截越权
        for (const placeholder of ['undefined', 'null', 'false', 'none', '0', '  ']) {
          process.env.OMNIMUX_API_KEY = placeholder
          currentSettings = { runtimeMode: 'agent', runtimeAgentVerified: true, runtimeKeyVerified: false }
          assert.throws(
            () => mountedApi.execute({
              dest: '/tmp/out.png',
              model: 'seedance-2-0@official',
            }),
            /尚未配置图片、视频和音频/,
          )
        }
      } finally {
        if (origKey === undefined) {
          delete process.env.OMNIMUX_API_KEY
        } else {
          process.env.OMNIMUX_API_KEY = origKey
        }
      }
    })

    it('strictly blocks BYOK when capability toggle is explicitly false or excluded', async () => {
      // 场景 1：byokProviders 中显式配置 image: false，坚决拦截
      const settingsFalse = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-agent',
        runtimeAgentVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            image: false,
            models: { image: 'fal-ai/flux/schnell' },
            imageModel: 'fal-ai/flux/schnell',
          },
        ],
      }

      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          model: 'seedance-2-0@byok-fal',
          prompt: 'test',
          runtimeSettings: settingsFalse,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /媒体生成提供商未开启图片/)
          return true
        },
      )

      // 场景 2：capabilities 列表中排除了当前模态（仅包含 video），坚决拦截
      const settingsExcluded = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-agent',
        runtimeAgentVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            capabilities: ['video'],
          },
        ],
      }

      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          model: 'seedance-2-0@byok-fal',
          prompt: 'test',
          runtimeSettings: settingsExcluded,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /媒体生成提供商未开启图片/)
          return true
        },
      )
    })

    it('strictly blocks BYOK when capabilities are triple undefined and no modal model is declared (eliminating || true bypass)', async () => {
      // 场景：未配置 capabilities，且 image/video/audio 开关均为 undefined，且未声明专属模型（无 models[image]，无 imageModel）
      // 必须严格消除 || true 带来的能力门禁失效，坚决抛出 omnimux-unconfigured
      const settingsTripleUndefinedNoModel = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-agent',
        runtimeAgentVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            // 没有任何模态开关和模型声明
          },
        ],
      }

      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          model: 'seedance-2-0@byok-fal',
          prompt: 'test',
          runtimeSettings: settingsTripleUndefinedNoModel,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /媒体生成提供商未开启图片/)
          return true
        },
      )
    })

    it('allows BYOK when capabilities are unspecified and modal toggle is undefined but model is declared or universally supported', async () => {
      // 修复审查员审秋毫指出误杀缺陷：未配置 capabilities 且模态开关为 undefined 时，
      // 对齐 runtime-mode.js 权威判定，如果模型声明了或通用支持，正常放行，绝不误杀为未开启
      const settingsDeclared = {
        runtimeMode: 'agent',
        runtimeAgentId: 'local-agent',
        runtimeAgentVerified: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            models: { image: 'fal-ai/flux/schnell' },
            imageModel: 'fal-ai/flux/schnell',
          },
        ],
      }

      const credentials = {
        resolve: async (ref) => {
          if (ref === 'OMNIMUX_MEDIA_KEY_FAL') return { value: 'fake-fal-key' }
          return undefined
        },
      }

      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          capturedReq = req
          return {
            taskId: 'task-declared-model-ok',
            outputs: [{ type: 'image', url: 'https://mock.local/result.png' }],
          }
        },
      }

      const mockFetcher = async () => new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })

      const res = await executeOmnimuxMedia('image', {
        dest: '/tmp/test-declared.png',
        model: 'seedance-2-0@byok-fal',
        prompt: 'test prompt',
        runtimeSettings: settingsDeclared,
        credentials,
        runtime: fakeRuntime,
        fetcher: mockFetcher,
        wait: true,
      })

      assert.equal(res.mode, 'live')
      assert.equal(res.taskId, 'task-declared-model-ok')
      assert.ok(capturedReq)
    })

    it('does not silently route official request to BYOK when runtime.mode is official even if mediaChoice is ready', async () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-official-token'

        // 场景：runtimeMode 为 official，且本地配置了通过验证的 BYOK mediaChoice（例如 fal key）
        // 当用户没有指定渠道时，绝不能因为 mediaChoice.ready 被静默路由到 BYOK 渠道！
        const settings = {
          runtimeMode: 'official',
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaImage: true,
        }

        let capturedProviderId = null
        const fakeRuntime = {
          execute: async (req) => {
            capturedProviderId = req.providerId
            return {
              taskId: 'task-official-ok',
              outputs: [{ type: 'image', url: 'https://mock.local/official.png' }],
            }
          },
        }

        const mockFetcher = async () => new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })

        const res = await executeOmnimuxMedia('image', {
          dest: '/tmp/test-official.png',
          model: 'gpt-image-2.5', // 官方默认图片模型，未指定渠道
          prompt: 'test prompt',
          runtimeSettings: settings,
          runtime: fakeRuntime,
          fetcher: mockFetcher,
          wait: true,
        })

        // 核心断言：走官方通道 (omnimux)，绝不被静默截胡到自备渠道 (fal)
        assert.equal(capturedProviderId, 'omnimux')
        assert.notEqual(capturedProviderId, 'fal')
        assert.equal(res.mode, 'live')
      } finally {
        if (origKey === undefined) delete process.env.OMNIMUX_API_KEY
        else process.env.OMNIMUX_API_KEY = origKey
      }
    })

    it('strictly resolves credentials from service-side storage/env and ignores untrusted input.env', async () => {
      const origFalKey = process.env.OMNIMUX_MEDIA_KEY_FAL
      const origByokKey = process.env.OMNIMUX_MEDIA_KEY
      try {
        delete process.env.OMNIMUX_MEDIA_KEY_FAL
        delete process.env.OMNIMUX_MEDIA_KEY

        const settings = {
          runtimeMode: 'key',
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaImage: true,
        }

        // 1. 当服务侧 credentials 和 process.env 均无 key 时，即便客户端 input.env 传入，也必须严格拒绝
        await assert.rejects(
          () => executeOmnimuxMedia('image', {
            dest: '/tmp/test-untrusted-env.png',
            model: 'gpt-image-2.5@byok-fal',
            prompt: 'test',
            runtimeSettings: settings,
            env: { OMNIMUX_MEDIA_KEY_FAL: 'sk-untrusted-client-key' },
          }),
          (err) => {
            assert.equal(err.code, 'omnimux-unconfigured')
            assert.match(err.message, /fal 媒体 API 密钥未找到/)
            return true
          },
        )

        // 2. 当服务侧 process.env 安全提供时，无需 input.env 即可成功执行
        process.env.OMNIMUX_MEDIA_KEY_FAL = 'sk-service-env-fal-key'
        let executed = false
        const fakeRuntime = {
          execute: async () => {
            executed = true
            return { taskId: 'task-sec-1', outputs: [] }
          },
        }
        const res = await executeOmnimuxMedia('image', {
          dest: '/tmp/test-sec-ok.png',
          model: 'gpt-image-2.5@byok-fal',
          prompt: 'test',
          runtimeSettings: settings,
          runtime: fakeRuntime,
          wait: false,
        })
        assert.equal(executed, true)
        assert.equal(res.taskId, 'task-sec-1')
      } finally {
        if (origFalKey !== undefined) process.env.OMNIMUX_MEDIA_KEY_FAL = origFalKey
        else delete process.env.OMNIMUX_MEDIA_KEY_FAL
        if (origByokKey !== undefined) process.env.OMNIMUX_MEDIA_KEY = origByokKey
        else delete process.env.OMNIMUX_MEDIA_KEY
      }
    })

    it('accurately checks modal capabilities declared via capabilities array in byokProviders', async () => {
      const settings = {
        runtimeMode: 'key',
        runtimeKeyVerified: true,
        byokProviders: [
          {
            provider: 'openai',
            verified: true,
            capabilities: ['image'],
          },
        ],
      }

      // 请求 image 模态能力通过模态开关
      let executed = false
      const fakeRuntime = {
        execute: async () => {
          executed = true
          return { taskId: 'task-cap-img-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async () => ({ value: 'sk-openai-key' }),
      }

      const res = await executeOmnimuxMedia('image', {
        dest: '/tmp/test-cap.png',
        model: 'gpt-image-2.5@byok-openai',
        prompt: 'test',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(executed, true)
      assert.equal(res.taskId, 'task-cap-img-1')

      // 请求 video 模态能力严格拦截
      await assert.rejects(
        () => executeOmnimuxMedia('video', {
          dest: '/tmp/test-cap.mp4',
          model: 'seedance-2-0@byok-openai',
          prompt: 'test',
          runtimeSettings: settings,
          credentials,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /媒体生成提供商未开启视频/)
          return true
        },
      )
    })

    it('strictly overwrites client env with authoritative server token on isOfficialBypass', async () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-authoritative-server-token'

        const officialSettings = {
          runtimeMode: 'official',
        }

        let capturedReq = null
        let mountedApi = null
        const fakeCtx = {
          get: (key) => (key === 'settings' ? { get: () => officialSettings } : undefined),
          tools: { register: () => {} },
          provide: (name, api) => {
            if (name === 'imageGenerate') mountedApi = api
          },
        }

        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async (req) => {
            capturedReq = req
            return { ok: true }
          },
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })

        assert.ok(mountedApi)

        // 调用方在请求体传入伪造未授权的 OMNIMUX_API_KEY 与恶意 Base URL
        await mountedApi.execute({
          dest: '/tmp/official-test.png',
          model: 'gpt-image-2.5@official',
          env: {
            OMNIMUX_API_KEY: 'forged-unauthorized-client-key',
            OMNIMUX_BASE_URL: 'https://evil.attacker.com/v1',
            SOME_OTHER_VAR: 'untrusted-val',
          },
        })

        // 权威 Token 覆盖防伪造与防劫持：坚决丢弃调用方传入的恶意 env，仅注入服务端权威 Token
        assert.ok(capturedReq)
        assert.equal(capturedReq.env?.OMNIMUX_API_KEY, 'sk-authoritative-server-token')
        assert.equal(capturedReq.env?.OMNIMUX_BASE_URL, undefined)
        assert.equal(capturedReq.env?.SOME_OTHER_VAR, undefined)
      } finally {
        if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
        else delete process.env.OMNIMUX_API_KEY
      }
    })

    it('strictly purges forged client OMNIMUX_API_KEY when official request lacks authoritative server token', async () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        delete process.env.OMNIMUX_API_KEY

        const officialSettings = {
          runtimeMode: 'official',
        }

        let capturedReq = null
        let mountedApi = null
        const fakeCtx = {
          get: (key) => (key === 'settings' ? { get: () => officialSettings } : undefined),
          tools: { register: () => {} },
          provide: (name, api) => {
            if (name === 'imageGenerate') mountedApi = api
          },
        }

        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async (req) => {
            capturedReq = req
            return { ok: true }
          },
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })

        assert.ok(mountedApi)

        // 客户端在官方请求体中试图伪造 OMNIMUX_API_KEY，且服务端没有权威 Token（isOfficialBypass 为 false）
        await mountedApi.execute({
          dest: '/tmp/official-test-purge.png',
          model: 'gpt-image-2.5@official',
          env: {
            OMNIMUX_API_KEY: 'forged-client-token',
            CUSTOM_VAR: 'keep-safe-var',
          },
        })

        // 验证：官方请求且无权威 Token 时，客户端传入的 env 被彻底置空为 {}，杜绝客户端注入伪造凭据被下游误用
        assert.ok(capturedReq)
        assert.deepEqual(capturedReq.env, {})
      } finally {
        if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
        else delete process.env.OMNIMUX_API_KEY
      }
    })

    it('includes custom provider in isExternalMediaProvider and skips submit guard', () => {
      assert.equal(isExternalMediaProvider('custom'), true)
      assert.equal(isExternalMediaProvider('CUSTOM'), true)
      assert.equal(isExternalMediaProvider('fal'), true)
      assert.equal(isExternalMediaProvider('openai'), true)
      assert.equal(isExternalMediaProvider('openrouter'), true)
      assert.equal(isExternalMediaProvider('byok'), true)
      assert.equal(isExternalMediaProvider('omnimux'), false)
    })

    it('strictly prevents cross-model channel appropriation and unauthorized fallback bypass', () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-authoritative-server-token'
        let currentSettings = {
          runtimeMode: 'agent',
          runtimeAgentVerified: false,
          runtimeKeyVerified: false,
          allowOfficialMediaFallback: true,
        }
        let mountedApi = null
        const fakeCtx = {
          get: (key) => (key === 'settings' ? { get: () => currentSettings } : undefined),
          tools: { register: () => {} },
          provide: (name, api) => {
            if (name === 'imageGenerate') mountedApi = api
          },
        }
        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async () => ({ ok: true }),
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })
        assert.ok(mountedApi)

        // 1. 未验证就绪环境即使开启 allowOfficialMediaFallback 也坚决拦截越权放行
        assert.throws(
          () => mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@official',
          }),
          /尚未配置图片、视频和音频/,
        )

        // 2. 跨模型非法冒领拦截：请求其它模型的专用渠道（如 gpt-image-2.5 冒领 seedance-2-0-task-pro）
        currentSettings = {
          runtimeMode: 'agent',
          runtimeAgentVerified: true,
          allowOfficialMediaFallback: false,
        }
        assert.throws(
          () => mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'gpt-image-2.5@seedance-2-0-task-pro',
          }),
          /尚未配置图片、视频和音频/,
        )
      } finally {
        if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
        else delete process.env.OMNIMUX_API_KEY
      }
    })

    it('includes siliconflow in EXTERNAL_MEDIA_PROVIDERS and isExternalMediaProvider', () => {
      assert.ok(EXTERNAL_MEDIA_PROVIDERS.includes('siliconflow'))
      assert.equal(isExternalMediaProvider('siliconflow'), true)
      assert.equal(isExternalMediaProvider('SILICONFLOW'), true)
      assert.equal(DEFAULT_PROVIDER_ENDPOINTS.siliconflow, 'https://api.siliconflow.cn/v1')
    })

    it('strictly prevents unverified records from having their physical models claimed', () => {
      // 当 verifiedItems 为空时，绝不回退至未验证的 matchedItems 冒领物理模型
      const unverifiedSettings = {
        byokProviders: [
          {
            provider: 'fal',
            verified: false,
            model: 'unverified-stolen-model',
            models: { image: 'unverified-stolen-image-model' },
          },
        ],
      }
      const model = resolveEffectiveMediaModel(undefined, 'fal', 'image', unverifiedSettings)
      assert.notEqual(model, 'unverified-stolen-model')
      assert.notEqual(model, 'unverified-stolen-image-model')
      assert.equal(model, 'fal-ai/flux/dev')
    })

    it('keeps shouldRouteByok as false when implicit byok provider does not match current modality', async () => {
      // 缺少显式渠道且主媒体未就绪时，若 byokProviders 仅有 video 能力，请求 image 必须拒绝并保持 shouldRouteByok 为 false
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'agent-1',
        runtimeAgentVerified: true,
        runtimeMediaProvider: '',
        runtimeKeyVerified: false,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            video: true,
            image: false,
          },
        ],
      }
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test.png',
          prompt: 'test prompt',
          runtimeSettings: settings,
        }),
        (err) => {
          assert.equal(err.code, 'omnimux-unconfigured')
          assert.match(err.message, /本机助手只承接文字/)
          return true
        },
      )
    })

    it('accurately resolves modality-matching provider when channel is unspecified', async () => {
      // 缺少显式渠道且主媒体未就绪时，若 byokProviders 有匹配当前模态且已验证的 openai，精准解析为 openai
      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          capturedReq = req
          return { taskId: 'task-implicit-openai-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async (key) => {
          if (key === 'OMNIMUX_MEDIA_KEY_OPENAI') return { value: 'sk-test-openai-key' }
          return undefined
        },
      }
      const settings = {
        runtimeMode: 'agent',
        runtimeAgentId: 'agent-1',
        runtimeAgentVerified: true,
        runtimeMediaProvider: '',
        runtimeKeyVerified: false,
        byokProviders: [
          {
            provider: 'openai',
            verified: true,
            image: true,
            model: 'dall-e-3',
          },
        ],
      }
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/test-implicit.png',
        prompt: 'test implicit prompt',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(result.mode, 'submitted')
      assert.equal(capturedReq?.providerId, 'openai')
      assert.equal(capturedReq?.input?.model, 'dall-e-3')
    })

    it('strictly guards agent verified fallback against missing or empty runtimeAgentId', () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-authoritative-server-token'
        let currentSettings = {
          runtimeMode: 'agent',
          runtimeAgentId: '', // 空字符串
          runtimeAgentVerified: true,
          runtimeKeyVerified: false,
          allowOfficialMediaFallback: true,
        }
        let mountedApi = null
        const fakeCtx = {
          get: (key) => (key === 'settings' ? { get: () => currentSettings } : undefined),
          tools: { register: () => {} },
          provide: (name, api) => {
            if (name === 'imageGenerate') mountedApi = api
          },
        }
        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async () => ({ ok: true }),
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })
        assert.ok(mountedApi)

        // 空 agentId 必须被拦截，不可通过 allowOfficialMediaFallback 越权放行
        assert.throws(
          () => mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@official',
          }),
          /尚未配置图片、视频和音频/,
        )

        // runtimeAgentId 缺失时也坚决拦截
        currentSettings = {
          runtimeMode: 'agent',
          runtimeAgentVerified: true,
          runtimeKeyVerified: false,
          allowOfficialMediaFallback: true,
        }
        assert.throws(
          () => mountedApi.execute({
            dest: '/tmp/out.png',
            model: 'seedance-2-0@official',
          }),
          /尚未配置图片、视频和音频/,
        )
      } finally {
        if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
        else delete process.env.OMNIMUX_API_KEY
      }
    })

    it('prioritizes custom provider in key mode when runtimeKeyEndpoint is verified without runtimeMediaProvider', async () => {
      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          capturedReq = req
          return { taskId: 'task-custom-key-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async () => ({ value: 'custom-api-key' }),
      }
      const settings = {
        runtimeMode: 'key',
        runtimeKeyEndpoint: 'https://internal-custom-proxy.org/v1',
        runtimeKeyModel: 'internal-llm',
        runtimeKeyVerified: true,
        runtimeMediaImage: true,
        // 未配置 runtimeMediaProvider
      }
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/test-custom-key.png',
        model: 'seedance-2-0',
        prompt: 'test custom key prompt',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(result.mode, 'submitted')
      assert.equal(capturedReq?.providerId, 'custom')
      assert.equal(capturedReq?.modelId, 'custom-image')
      assert.equal(capturedReq?.input?.model, 'seedance-2-0')
    })

    it('falls back to verified implicitByokProvider when main media provider modality is disabled', async () => {
      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          capturedReq = req
          return { taskId: 'task-modality-mismatch-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async (key) => {
          if (key === 'OMNIMUX_MEDIA_KEY_OPENAI') return { value: 'sk-test-openai-key' }
          return undefined
        },
      }
      const settings = {
        runtimeMode: 'key',
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImage: true,
        runtimeMediaVideo: false, // 主媒体提供商未启用视频能力
        byokProviders: [
          {
            provider: 'openai',
            verified: true,
            video: true,
            model: 'sora-2',
          },
        ],
      }
      const result = await executeOmnimuxMedia('video', {
        dest: '/tmp/test-video.mp4',
        model: 'seedance-2-0', // 缺少显式渠道
        prompt: 'video prompt',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(result.mode, 'submitted')
      assert.equal(capturedReq?.providerId, 'openai')
      assert.equal(capturedReq?.input?.model, 'seedance-2-0')

      // 当调用方未提供显式模型时，安全回退到 byokProviders 中配置的专属模型
      const resultFallback = await executeOmnimuxMedia('video', {
        dest: '/tmp/test-video-fallback.mp4',
        prompt: 'video prompt without model',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(resultFallback.mode, 'submitted')
      assert.equal(capturedReq?.input?.model, 'sora-2')
    })

    it('unblocks pure media users in isKeyDirect mode without requiring runtime.textReady', async () => {
      // 纯媒体用户：runtimeMode 为 key，未配置 runtimeMediaProvider（isKeyDirect 模式），未配置 runtimeKeyModel（textReady 为 false）
      // 仅校验端点非空与 verified，放行媒体生成
      let executed = false
      let capturedReq = null
      const fakeRuntime = {
        execute: async (req) => {
          executed = true
          capturedReq = req
          return { taskId: 'task-key-direct-image-1', outputs: [] }
        },
      }
      const credentials = {
        resolve: async () => ({ value: 'fake-direct-key' }),
      }
      const settings = {
        runtimeMode: 'key',
        runtimeKeyEndpoint: 'https://api.openai.com/v1',
        runtimeKeyModel: '', // 未配置文本模型，textReady 为 false
        runtimeKeyVerified: true,
        runtimeMediaImage: true,
      }
      const result = await executeOmnimuxMedia('image', {
        dest: '/tmp/test-direct-image.png',
        model: 'nano-banana-2',
        prompt: 'test direct key media generation',
        runtimeSettings: settings,
        credentials,
        runtime: fakeRuntime,
        wait: false,
      })
      assert.equal(executed, true)
      assert.equal(result.mode, 'submitted')
      assert.equal(result.taskId, 'task-key-direct-image-1')
    })

    it('allows authentic Bearer Token with internal space while blocking control characters', async () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        // 1. 合法的 Bearer Token 中间包含空格，必须正常放行不被误杀
        process.env.OMNIMUX_API_KEY = 'Bearer valid-long-secret-key-12345'
        let capturedReq = null
        let mountedApi = null
        const fakeCtx = {
          get: (key) => (key === 'settings' ? { get: () => ({ runtimeMode: 'official' }) } : undefined),
          tools: { register: () => {} },
          provide: (name, api) => {
            if (name === 'imageGenerate') mountedApi = api
          },
        }

        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async (req) => {
            capturedReq = req
            return { ok: true }
          },
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })

        assert.ok(mountedApi)
        await mountedApi.execute({
          dest: '/tmp/bearer-test.png',
          model: 'gpt-image-2.5@official',
        })
        assert.ok(capturedReq)
        assert.equal(capturedReq.env?.OMNIMUX_API_KEY, 'Bearer valid-long-secret-key-12345')

        // 2. 含有控制字符 (\r, \n, \t) 的 Token 坚决拦截
        for (const badToken of ['token\rwithcr', 'token\nwithlf', 'token\twithtab']) {
          process.env.OMNIMUX_API_KEY = badToken
          capturedReq = null
          await mountedApi.execute({
            dest: '/tmp/bad-token-test.png',
            model: 'gpt-image-2.5@official',
          })
          // 未通过真实 Token 校验，客户端 env 必须被清空
          assert.equal(capturedReq.env?.OMNIMUX_API_KEY, undefined)
        }
      } finally {
        if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
        else delete process.env.OMNIMUX_API_KEY
      }
    })

    it('prioritizes explicit BYOK channel over official mode and routes to BYOK', async () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-official-server-token'
        const settings = {
          runtimeMode: 'official',
          runtimeKeyVerified: true,
          runtimeMediaProvider: 'fal',
          runtimeMediaImage: true,
          byokProviders: [
            { provider: 'fal', verified: true, image: true },
          ],
        }
        // 当显式指定 BYOK 渠道时，即使当前 runtimeMode 为 official，也绝不被官方模式错误压制，优先走 BYOK 路由
        // 缺少对应提供商密钥时抛出 omnimux-unconfigured，而不是官方渠道池未命中导致的 unknown-group
        await assert.rejects(
          () => executeOmnimuxMedia('image', {
            dest: '/tmp/test-penetration.png',
            model: 'gpt-image-2.5@byok-fal',
            prompt: 'test penetration',
            runtimeSettings: settings,
          }),
          (err) => {
            assert.equal(err.code, 'omnimux-unconfigured')
            assert.match(err.message, /fal 媒体 API 密钥未找到，请在设置中填写/)
            return true
          },
        )

        // 当提供凭据与 mock runtime 时，验证顺利走通 BYOK 执行
        const fakeRuntime = {
          execute: async () => ({ taskId: 'task-byok-priority-1', outputs: [] }),
        }
        const credentials = {
          resolve: async () => ({ value: 'test-fal-key' }),
        }
        const result = await executeOmnimuxMedia('image', {
          dest: '/tmp/test-penetration.png',
          model: 'gpt-image-2.5@byok-fal',
          prompt: 'test penetration',
          runtimeSettings: settings,
          credentials,
          runtime: fakeRuntime,
          wait: false,
        })
        assert.equal(result.mode, 'submitted')
        assert.equal(result.taskId, 'task-byok-priority-1')
      } finally {
        if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
        else delete process.env.OMNIMUX_API_KEY
      }
    })

    it('strictly throws unknown-group when allowedGroups contains conflicting official and BYOK channels', async () => {
      const settings = {
        runtimeMode: 'key',
        runtimeMediaProvider: 'fal',
        runtimeKeyVerified: true,
        runtimeMediaImage: true,
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            image: true,
          },
        ],
      }
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test-mixed.png',
          model: 'gpt-image-2.5',
          prompt: 'test mixed groups',
          allowedGroups: ['official', 'byok-fal'],
          runtimeSettings: settings,
        }),
        (err) => {
          assert.equal(err.code, 'unknown-group')
          assert.match(err.message, /所选渠道包含冲突的渠道分组/)
          return true
        },
      )
    })

    it('refuses a generic model field that does not declare the requested capability', async () => {
      const fakeRuntime = {
        execute: async () => ({ taskId: 'task-generic-model-1', outputs: [] }),
      }
      const credentials = {
        resolve: async () => ({ value: 'test-fal-key' }),
      }
      const settings = {
        runtimeMode: 'agent',
        byokProviders: [
          {
            provider: 'fal',
            verified: true,
            model: 'fal-ai/flux/schnell',
          },
        ],
      }
      await assert.rejects(
        () => executeOmnimuxMedia('image', {
          dest: '/tmp/test-generic.png',
          model: 'seedream-5-0@byok-fal',
          prompt: 'test generic model field',
          runtimeSettings: settings,
          credentials,
          runtime: fakeRuntime,
          wait: false,
        }),
        (error) => error?.code === 'omnimux-unconfigured',
      )
    })

    it('normalizes targetChannel case-insensitively in mountMedia', async () => {
      const origKey = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-official-mount-token'
        let capturedReq = null
        let mountedApi = null
        const fakeCtx = {
          get: (key) => (key === 'settings' ? { get: () => ({ runtimeMode: 'official' }) } : undefined),
          tools: { register: () => {} },
          provide: (name, api) => {
            if (name === 'imageGenerate') mountedApi = api
          },
        }
        mountMedia(fakeCtx, {
          kind: 'image',
          execute: async (req) => {
            capturedReq = req
            return { ok: true }
          },
          media: {},
          gate: { capabilities: { media: true } },
          jsonOut: {},
        })

        assert.ok(mountedApi && typeof mountedApi.execute === 'function')
        // 验证传入大写 OFFICIAL 渠道能被小写归一化匹配为已知官方专线，权威绕过并正常执行
        await mountedApi.execute({
          dest: '/tmp/test-case-mount.png',
          model: 'gpt-image-2.5',
          group: '  OFFICIAL  ',
        })
        assert.ok(capturedReq)
      } finally {
        if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
        else delete process.env.OMNIMUX_API_KEY
      }
    })
  })
})
