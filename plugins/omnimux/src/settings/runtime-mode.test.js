import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertRuntimeReady,
  mediaReadyFor,
  requiresOfficialSignIn,
  resolveRuntimeChoice,
  resolveMediaProviderChoice,
} from './runtime-mode.js'
import { SETTINGS_DEFAULTS, parseSettingsSection, SettingsConfig } from './schema.js'

describe('resolveRuntimeChoice', () => {
  it('keeps an unset install on the official route', () => {
    assert.deepEqual(resolveRuntimeChoice({}), {
      mode: 'official',
      textReady: true,
      mediaReady: true,
    })
  })

  it('blocks an unverified local agent and never marks media ready', () => {
    const choice = resolveRuntimeChoice({ runtimeMode: 'agent', runtimeAgentId: 'claude' })
    assert.equal(choice.textReady, false)
    assert.equal(choice.mediaReady, false)
    assert.equal(choice.reason, 'unconfigured')
  })

  it('allows only text after a verified local agent', () => {
    const choice = resolveRuntimeChoice({
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
    })
    assert.equal(choice.textReady, true)
    assert.equal(choice.mediaReady, false)
  })

  it('keeps an unfinished custom key unavailable', () => {
    const choice = resolveRuntimeChoice({
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
    })
    assert.equal(choice.textReady, false)
    assert.equal(choice.mediaReady, false)
  })

  it('enables only the media kinds a verified custom key selected', () => {
    const textOnly = resolveRuntimeChoice({
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
      runtimeKeyModel: 'demo',
      runtimeKeyVerified: true,
    })
    assert.equal(textOnly.textReady, true)
    assert.equal(textOnly.mediaReady, false)

    const withImage = resolveRuntimeChoice({
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
      runtimeKeyModel: 'demo',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    })
    assert.equal(withImage.mediaReady, true)
  })

  it('asks for official sign-in only when the action needs the official account', () => {
    const custom = { runtimeMode: 'key', runtimeKeyEndpoint: 'https://example.test/v1', runtimeKeyModel: 'demo', runtimeKeyVerified: true }
    assert.equal(requiresOfficialSignIn(custom, 'generate'), false)
    assert.equal(requiresOfficialSignIn(custom, 'publish'), true)
    assert.equal(requiresOfficialSignIn(custom, 'accounts'), true)
    assert.equal(requiresOfficialSignIn(custom, 'quota'), true)
    assert.equal(requiresOfficialSignIn(custom, 'inspiration'), true)
    // A local agent or custom key never sees the boot-time / unclassified window;
    // only the named account actions open it for them.
    assert.equal(requiresOfficialSignIn(custom, 'something-else'), false)
    assert.equal(requiresOfficialSignIn(custom, undefined), false)
    // Official mode keeps today's rule: everything prompts, unclassified included.
    assert.equal(requiresOfficialSignIn({}, 'generate'), true)
    assert.equal(requiresOfficialSignIn({ runtimeMode: 'official' }, 'something-else'), true)
  })

  it('checks media kinds one by one: an image-only key never lets video through', () => {
    const imageOnly = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
      runtimeKeyModel: 'demo',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    }
    assert.doesNotThrow(() => assertRuntimeReady(imageOnly, 'image'))
    assert.throws(() => assertRuntimeReady(imageOnly, 'video'), /尚未配置/)
    assert.throws(() => assertRuntimeReady(imageOnly, 'audio'), /尚未配置/)
    // The aggregate must not rescue a kind the user never ticked.
    assert.equal(resolveRuntimeChoice(imageOnly).mediaReady, true)
  })

  it('stops an unconfigured media request before it can fall back', () => {
    assert.throws(
      () => assertRuntimeReady({ runtimeMode: 'agent', runtimeAgentId: 'claude', runtimeAgentVerified: true }, 'image'),
      /尚未配置/,
    )
    assert.doesNotThrow(() => assertRuntimeReady({}, 'video'))
  })

  it('allows media in agent mode when media provider is verified and capability is enabled', () => {
    const agentWithMedia = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      runtimeMediaProvider: 'fal',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
    }
    const choice = resolveRuntimeChoice(agentWithMedia)
    assert.equal(choice.textReady, true)
    assert.equal(choice.mediaReady, true)

    assert.equal(mediaReadyFor(choice, agentWithMedia, 'image'), true)
    assert.doesNotThrow(() => assertRuntimeReady(agentWithMedia, 'image'))

    // video 未开启，仍应报错
    assert.equal(mediaReadyFor(choice, agentWithMedia, 'video'), false)
    assert.throws(() => assertRuntimeReady(agentWithMedia, 'video'), /尚未配置/)
  })

  it('allows media when allowOfficialMediaFallback is true even in unconfigured agent mode', () => {
    const agentFallback = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      allowOfficialMediaFallback: true,
    }
    const choice = resolveRuntimeChoice(agentFallback)
    assert.equal(mediaReadyFor(choice, agentFallback, 'image'), true)
    assert.doesNotThrow(() => assertRuntimeReady(agentFallback, 'image'))
  })

  it('blocks allowOfficialMediaFallback when user is unverified and has no official credentials', () => {
    const origKey = process.env.OMNIMUX_API_KEY
    const origToken = process.env.OMNIMUX_TOKEN
    try {
      delete process.env.OMNIMUX_API_KEY
      delete process.env.OMNIMUX_TOKEN

      const unverifiedFallback = {
        runtimeMode: 'key',
        runtimeKeyVerified: false,
        allowOfficialMediaFallback: true,
      }
      const choice = resolveRuntimeChoice(unverifiedFallback)
      assert.equal(mediaReadyFor(choice, unverifiedFallback, 'image'), false)
      assert.throws(() => assertRuntimeReady(unverifiedFallback, 'image'), /尚未配置/)

      // 坚决禁止在 settings 载荷中信任客户端可控的 officialToken / token，即使传入伪造凭据，未验证用户也坚决拦截
      const forgedTokenFallback = {
        runtimeMode: 'key',
        runtimeKeyVerified: false,
        allowOfficialMediaFallback: true,
        officialToken: 'forged-client-token',
        token: 'forged-client-token',
      }
      const choiceForged = resolveRuntimeChoice(forgedTokenFallback)
      assert.equal(mediaReadyFor(choiceForged, forgedTokenFallback, 'image'), false)
      assert.throws(() => assertRuntimeReady(forgedTokenFallback, 'image'), /尚未配置/)
    } finally {
      if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
      if (origToken !== undefined) process.env.OMNIMUX_TOKEN = origToken
    }
  })

  it('narrows triple undefined media capabilities in byokProviders and prevents unauthorized bypass', () => {
    // 1. 三重 undefined 且无专属模型：严禁无条件全开，必须安全收敛为全不开
    const tripleUndefinedSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        { provider: 'openai', verified: true },
      ],
    }
    const choice = resolveRuntimeChoice(tripleUndefinedSettings)
    assert.equal(mediaReadyFor(choice, tripleUndefinedSettings, 'image'), false)
    assert.equal(mediaReadyFor(choice, tripleUndefinedSettings, 'video'), false)
    assert.equal(mediaReadyFor(choice, tripleUndefinedSettings, 'audio'), false)
    assert.throws(() => assertRuntimeReady(tripleUndefinedSettings, 'image'), /尚未配置/)

    // 2. 至少一项显式为 true：仅放行显式开启的能力，杜绝未授权类型越权放行
    const imageOnlySettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        { provider: 'openai', verified: true, image: true },
      ],
    }
    const choiceImage = resolveRuntimeChoice(imageOnlySettings)
    assert.equal(mediaReadyFor(choiceImage, imageOnlySettings, 'image'), true)
    assert.equal(mediaReadyFor(choiceImage, imageOnlySettings, 'video'), false)
    assert.equal(mediaReadyFor(choiceImage, imageOnlySettings, 'audio'), false)

    // 3. 配置了能力的专属模型：安全放行该特定模型对应的能力
    const modelDeclaredSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        { provider: 'fal', verified: true, models: { video: 'fal-ai/kling' } },
      ],
    }
    const choiceModel = resolveRuntimeChoice(modelDeclaredSettings)
    assert.equal(mediaReadyFor(choiceModel, modelDeclaredSettings, 'video'), true)
    assert.equal(mediaReadyFor(choiceModel, modelDeclaredSettings, 'image'), false)

    // 4. 多 Provider 列表：Provider 项未显式开启该能力且未声明专属模型时，显式 continue 跳步，杜绝跨 Provider 串透放行
    const crossProviderLeakageSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        // fal 仅开了 image
        { provider: 'fal', verified: true, image: true },
        // openai 未开任何能力，且无专属模型
        { provider: 'openai', verified: true },
      ],
    }
    const choiceCross = resolveRuntimeChoice(crossProviderLeakageSettings)
    assert.equal(mediaReadyFor(choiceCross, crossProviderLeakageSettings, 'image'), true)
    // video 与 audio 均未开启且无模型，必须严格返回 false
    assert.equal(mediaReadyFor(choiceCross, crossProviderLeakageSettings, 'video'), false)
    assert.equal(mediaReadyFor(choiceCross, crossProviderLeakageSettings, 'audio'), false)
    assert.throws(() => assertRuntimeReady(crossProviderLeakageSettings, 'video'), /尚未配置/)
  })

  it('strictly validates endpoint and model readiness in key mode', () => {
    // 虽已标记验证，但未填写 endpoint 或 model，媒体绝不能被判定为 ready
    const missingEndpointKey = {
      runtimeMode: 'key',
      runtimeKeyVerified: true,
      runtimeKeyEndpoint: '',
      runtimeKeyModel: 'test-model',
      runtimeMediaImage: true,
    }
    const choice1 = resolveRuntimeChoice(missingEndpointKey)
    assert.equal(choice1.textReady, false)
    assert.equal(choice1.mediaReady, false)
    assert.equal(choice1.reason, 'unconfigured')

    const missingModelKey = {
      runtimeMode: 'key',
      runtimeKeyVerified: true,
      runtimeKeyEndpoint: 'https://api.openai.com/v1',
      runtimeKeyModel: '   ',
      runtimeMediaImage: true,
    }
    const choice2 = resolveRuntimeChoice(missingModelKey)
    assert.equal(choice2.textReady, false)
    assert.equal(choice2.mediaReady, false)
    assert.equal(choice2.reason, 'unconfigured')

    // 独立具名 BYOK 媒体提供商（如 fal）在 key 模式下已验证且开启能力时，不受 textReady 限制；任一关键维度未就绪时正确返回 reason: 'unconfigured'
    const namedProviderKeyMode = {
      runtimeMode: 'key',
      runtimeMediaProvider: 'fal',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
      runtimeKeyEndpoint: '',
      runtimeKeyModel: '',
    }
    const choice3 = resolveRuntimeChoice(namedProviderKeyMode)
    assert.equal(choice3.textReady, false)
    assert.equal(choice3.mediaReady, true)
    assert.equal(choice3.reason, 'unconfigured')
    assert.equal(choice3.textReason, 'unconfigured')
    assert.equal(choice3.mediaReason, undefined)
  })

  it('does not falsely block independent verified media providers in agent mode even if agent is unverified', () => {
    const unverifiedAgentWithMedia = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: false,
      runtimeMediaProvider: 'fal',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
      byokProviders: [{ provider: 'fal', verified: true, image: true }],
    }
    const choice = resolveRuntimeChoice(unverifiedAgentWithMedia)
    assert.equal(choice.textReady, false)
    assert.equal(choice.mediaReady, true)
    assert.equal(choice.reason, 'unconfigured')
    assert.equal(choice.textReason, 'unconfigured')
    assert.equal(choice.mediaReason, undefined)
    assert.equal(mediaReadyFor(choice, unverifiedAgentWithMedia, 'image'), true)
  })

  it('supports pure media custom endpoint with endpoint and verified gate without textReady', () => {
    // 纯媒体自建端点：显式配置 runtimeMediaProvider 为 custom
    const pureMediaCustom = {
      runtimeMode: 'key',
      runtimeMediaProvider: 'custom',
      runtimeKeyVerified: true,
      runtimeKeyEndpoint: 'https://my-custom-proxy.internal/v1',
      runtimeKeyModel: '', // 未配置文本模型
      runtimeMediaImage: true,
    }
    const choice = resolveRuntimeChoice(pureMediaCustom)
    assert.equal(choice.textReady, false)
    assert.equal(choice.mediaReady, true)
    assert.equal(choice.reason, 'unconfigured')
    assert.equal(choice.textReason, 'unconfigured')
    assert.equal(choice.mediaReason, undefined)
    assert.equal(mediaReadyFor(choice, pureMediaCustom, 'image'), true)

    // 若 custom 端点为空，坚决拦截
    const emptyEndpointCustom = {
      ...pureMediaCustom,
      runtimeKeyEndpoint: '   ',
    }
    const choiceEmpty = resolveRuntimeChoice(emptyEndpointCustom)
    assert.equal(choiceEmpty.mediaReady, false)
    assert.equal(choiceEmpty.reason, 'unconfigured')
    assert.equal(choiceEmpty.mediaReason, 'unconfigured')
    assert.equal(mediaReadyFor(choiceEmpty, emptyEndpointCustom, 'image'), false)
  })

  it('strictly validates endpoint in byokProviders when provider is custom', () => {
    // 1. byokProviders 中 custom 缺少 endpoint 或为空白字符串，必须跳过
    const emptyEndpointSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        { provider: 'custom', verified: true, endpoint: '  ', image: true },
      ],
    }
    const choice1 = resolveRuntimeChoice(emptyEndpointSettings)
    assert.equal(mediaReadyFor(choice1, emptyEndpointSettings, 'image'), false)
    assert.throws(() => assertRuntimeReady(emptyEndpointSettings, 'image'), /尚未配置/)

    // 2. byokProviders 中 custom 配置了有效 endpoint 且 verified，正常放行
    const validEndpointSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        { provider: 'custom', verified: true, endpoint: 'https://custom-gateway.local/v1', image: true },
      ],
    }
    const choice2 = resolveRuntimeChoice(validEndpointSettings)
    assert.equal(mediaReadyFor(choice2, validEndpointSettings, 'image'), true)
    assert.doesNotThrow(() => assertRuntimeReady(validEndpointSettings, 'image'))
  })

  it('strictly prohibits direct reading of process.env.OMNIMUX_API_KEY in runtime-mode.js', () => {
    const origKey = process.env.OMNIMUX_API_KEY
    try {
      process.env.OMNIMUX_API_KEY = 'sk-leaked-env-token'
      const unverifiedWithEnv = {
        runtimeMode: 'key',
        runtimeKeyVerified: false,
        allowOfficialMediaFallback: true,
      }
      const choice = resolveRuntimeChoice(unverifiedWithEnv)
      // 绝不直接读取 process.env 泄露凭据或偷跑放行，必须返回 false 并抛错
      assert.equal(mediaReadyFor(choice, unverifiedWithEnv, 'image'), false)
      assert.throws(() => assertRuntimeReady(unverifiedWithEnv, 'image'), /尚未配置/)

      // 坚决禁止信任客户端可控的 officialToken / token，未验证时即便传入 officialToken 也坚决拦截
      const unverifiedWithClientToken = {
        ...unverifiedWithEnv,
        officialToken: 'sk-context-token',
      }
      assert.equal(mediaReadyFor(choice, unverifiedWithClientToken, 'image'), false)
      assert.throws(() => assertRuntimeReady(unverifiedWithClientToken, 'image'), /尚未配置/)

      // 仅当用户处于服务端权威验证状态（如 choice.textReady === true 或存在通过验证的 byokProviders）时，才允许官方兜底放行
      // 1. 若仅在 client payload 中传递 runtimeKeyVerified: true 但服务端权威计算 textReady 仍为 false，坚决拦截
      const forgedVerifiedPayload = {
        ...unverifiedWithEnv,
        runtimeKeyVerified: true,
      }
      const choiceForgedPayload = resolveRuntimeChoice(forgedVerifiedPayload)
      assert.equal(choiceForgedPayload.textReady, false)
      assert.equal(mediaReadyFor(choiceForgedPayload, forgedVerifiedPayload, 'image'), false)

      // 2. 仅当服务端权威状态 textReady === true（配置完整并验证通过）时，才安全放行
      const verifiedWithUserStatus = {
        ...unverifiedWithEnv,
        runtimeKeyEndpoint: 'https://example.test/v1',
        runtimeKeyModel: 'demo',
        runtimeKeyVerified: true,
      }
      const choiceVerified = resolveRuntimeChoice(verifiedWithUserStatus)
      assert.equal(choiceVerified.textReady, true)
      assert.equal(mediaReadyFor(choiceVerified, verifiedWithUserStatus, 'image'), true)
    } finally {
      if (origKey !== undefined) process.env.OMNIMUX_API_KEY = origKey
      else delete process.env.OMNIMUX_API_KEY
    }
  })

  it('smoothly defaults to fal in key mode when runtimeMediaProvider is unconfigured', () => {
    const legacyKeyConfig = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://api.openai.com/v1',
      runtimeKeyModel: 'gpt-4o',
      runtimeKeyVerified: true,
      runtimeMediaImage: true,
      // 未配置 runtimeMediaProvider，旧配置平滑兼容
    }
    const choice = resolveRuntimeChoice(legacyKeyConfig)
    assert.equal(choice.textReady, true)
    assert.equal(choice.mediaReady, true)
    assert.equal(mediaReadyFor(choice, legacyKeyConfig, 'image'), true)
  })

  it('prioritizes item.capabilities array in mediaReadyFor and prevents generic model field leakage in hasCapModel', () => {
    // 1. capabilities 数组优先核验：存在且长度 > 0 时，包含能力放行，不包含直接跳过
    const capsSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        {
          provider: 'openai',
          verified: true,
          capabilities: ['image'],
          video: true, // 即使有 video: true，但 capabilities 中没有 video，必须严格判定为不具备 video 能力
        },
      ],
    }
    const choiceCaps = resolveRuntimeChoice(capsSettings)
    assert.equal(mediaReadyFor(choiceCaps, capsSettings, 'image'), true)
    assert.equal(mediaReadyFor(choiceCaps, capsSettings, 'video'), false)

    // 2. 移除通用 model 字符串作为全模态放行的兜底，严格防穿透
    const genericModelSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        {
          provider: 'fal',
          verified: true,
          model: 'fal-ai/flux/dev', // 仅配置通用 model 字段，开关省略
        },
      ],
    }
    const choiceGeneric = resolveRuntimeChoice(genericModelSettings)
    assert.equal(mediaReadyFor(choiceGeneric, genericModelSettings, 'image'), false)
    assert.equal(mediaReadyFor(choiceGeneric, genericModelSettings, 'video'), false)

    // 3. 配置专属模态模型（models.image 或 imageModel）时安全放行
    const modalModelSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
      byokProviders: [
        {
          provider: 'fal',
          verified: true,
          models: { image: 'fal-ai/flux/dev' },
        },
        {
          provider: 'openai',
          verified: true,
          videoModel: 'sora-2',
        },
      ],
    }
    const choiceModal = resolveRuntimeChoice(modalModelSettings)
    assert.equal(mediaReadyFor(choiceModal, modalModelSettings, 'image'), true)
    assert.equal(mediaReadyFor(choiceModal, modalModelSettings, 'video'), true)
    assert.equal(mediaReadyFor(choiceModal, modalModelSettings, 'audio'), false)
  })

  it('restricts allowOfficialMediaFallback to verified providers that support the specific capability', () => {
    // 音频提供商（仅支持 audio）绝不能越权放行生图（image）或视频（video）的官方兜底
    const audioOnlyFallbackSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: false,
      allowOfficialMediaFallback: true,
      byokProviders: [
        {
          provider: 'custom',
          endpoint: 'https://audio.example.test/v1',
          verified: true,
          capabilities: ['audio'],
        },
      ],
    }
    const choice = resolveRuntimeChoice(audioOnlyFallbackSettings)
    // 请求 audio：放行
    assert.equal(mediaReadyFor(choice, audioOnlyFallbackSettings, 'audio'), true)
    // 请求 image 或 video：坚决杜绝越权放行
    assert.equal(mediaReadyFor(choice, audioOnlyFallbackSettings, 'image'), false)
    assert.equal(mediaReadyFor(choice, audioOnlyFallbackSettings, 'video'), false)
    assert.throws(() => assertRuntimeReady(audioOnlyFallbackSettings, 'image'), /尚未配置/)
    assert.throws(() => assertRuntimeReady(audioOnlyFallbackSettings, 'video'), /尚未配置/)
  })

  it('strictly defines allowOfficialMediaFallback in schema and sanitizes boolean types', () => {
    assert.equal(SETTINGS_DEFAULTS.allowOfficialMediaFallback, false)
    assert.equal(SettingsConfig.dict.allowOfficialMediaFallback.type, 'boolean')
    assert.equal(SettingsConfig.dict.allowOfficialMediaFallback.default, false)

    // 非布尔类型严格归一化为 fallback (false)
    const parsedString = parseSettingsSection({ allowOfficialMediaFallback: 'true' })
    assert.equal(parsedString.allowOfficialMediaFallback, false)
    const parsedNumber = parseSettingsSection({ allowOfficialMediaFallback: 1 })
    assert.equal(parsedNumber.allowOfficialMediaFallback, false)
    const parsedNull = parseSettingsSection({ allowOfficialMediaFallback: null })
    assert.equal(parsedNull.allowOfficialMediaFallback, false)

    // 合法布尔类型正常保留
    const parsedTrue = parseSettingsSection({ allowOfficialMediaFallback: true })
    assert.equal(parsedTrue.allowOfficialMediaFallback, true)
    const parsedFalse = parseSettingsSection({ allowOfficialMediaFallback: false })
    assert.equal(parsedFalse.allowOfficialMediaFallback, false)
  })

  it('strictly handles whitespace-only runtimeMediaProvider as unconfigured in key mode', () => {
    // runtimeMediaProvider 为纯空白字符串时，正确归类为未配置统一 key 模式，必须要求文本模型就绪
    const whitespaceProviderSettings = {
      runtimeMode: 'key',
      runtimeMediaProvider: '   ',
      runtimeKeyVerified: true,
      runtimeKeyEndpoint: 'https://api.openai.com/v1',
      runtimeKeyModel: '', // 未配置文本模型
      runtimeMediaImage: true,
    }
    const choice = resolveRuntimeChoice(whitespaceProviderSettings)
    assert.equal(choice.textReady, false)
    assert.equal(mediaReadyFor(choice, whitespaceProviderSettings, 'image'), false)
  })

  it('strictly validates MEDIA_PROVIDERS whitelist in byokProviders', () => {
    const unknownProviderSettings = {
      runtimeMode: 'agent',
      byokProviders: [
        {
          provider: 'unknown-evil-service',
          verified: true,
          image: true,
        },
      ],
    }
    const choice = resolveRuntimeChoice(unknownProviderSettings)
    assert.equal(mediaReadyFor(choice, unknownProviderSettings, 'image'), false)
  })

  it('strictly validates custom endpoint protocol requiring http or https', () => {
    // 1. resolveMediaProviderChoice: custom provider 端点必须以 http:// 或 https:// 开头
    const ftpCustomSettings = {
      runtimeMediaProvider: 'custom',
      runtimeKeyVerified: true,
      runtimeKeyEndpoint: 'ftp://custom-api.com',
      runtimeMediaImage: true,
    }
    const mediaChoiceFtp = resolveMediaProviderChoice(ftpCustomSettings, 'image')
    assert.equal(mediaChoiceFtp.ready, false)

    const httpCustomSettings = {
      runtimeMediaProvider: 'custom',
      runtimeKeyVerified: true,
      runtimeKeyEndpoint: 'http://localhost:8000/v1',
      runtimeMediaImage: true,
    }
    const mediaChoiceHttp = resolveMediaProviderChoice(httpCustomSettings, 'image')
    assert.equal(mediaChoiceHttp.ready, true)

    // 2. byokProviders 中的 custom endpoint 协议校验
    const byokFtpSettings = {
      runtimeMode: 'agent',
      byokProviders: [
        {
          provider: 'custom',
          verified: true,
          endpoint: 'ftp://invalid-byok.com',
          image: true,
        },
      ],
    }
    const choiceByokFtp = resolveRuntimeChoice(byokFtpSettings)
    assert.equal(mediaReadyFor(choiceByokFtp, byokFtpSettings, 'image'), false)

    const byokHttpsSettings = {
      runtimeMode: 'agent',
      byokProviders: [
        {
          provider: 'custom',
          verified: true,
          endpoint: 'https://valid-byok.com',
          image: true,
        },
      ],
    }
    const choiceByokHttps = resolveRuntimeChoice(byokHttpsSettings)
    assert.equal(mediaReadyFor(choiceByokHttps, byokHttpsSettings, 'image'), true)
  })
})
